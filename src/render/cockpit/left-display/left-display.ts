/**
 * The left display, instrument type 6 (docs/plan/p3/13/spec.md, 左显示屏 and D-01 定稿 DC-06/DC-10/DC-11;
 * docs/original/formats/hud.md §4.4, SNIP 10487; docs/original/formats/executable.md T8/D15): the page dispatcher
 * `0x4ce30` with its interference gates, and pages 0 (status) and 1 (energy). Pages 2–5 (communications, subtask 18;
 * `communicationPageDrawers`) and 6 (Warp, subtask 19) are injected drawers; the page refresh and the
 * interference stay here. Core owns the page number (`leftPage`); this module only draws.
 *
 * - **Page table:** seven entries, each with its own interference gate and next refresh: subsystem fields 10, 11, 13,
 *   13, 13, 13 and none; refresh periods 0, 0, 0x40, 0x10, 0x40, 0 and 0x10.
 * - **Each type-6 call** (every logical display of slot 0, since its interval is 0), for the current page: with the
 *   page's field non-zero and the sample strictly past the next toggle, state 2 switches on (start recorded when off)
 *   and any other state toggles with one rand (as the original's branch does; 3 has no writer); either sets the next
 *   refresh to 0. State 0 (also without a player or a field) switches off. A pending clear fills the rectangle with
 *   index 0. When forced (directory +0x0C) or the sample is strictly past the next refresh: with interference on, the
 *   SNIP frame (`0x4d010`) and next refresh 0; otherwise the page, then, unless forced, next refresh := sample +
 *   period. A page without a drawer draws nothing; whether a drawer drew does not change the refresh.
 * - **Page changes and rebuilds:** every `left-page-changed` event sets the new page's next refresh to 0 (`0x4cdf0`);
 *   a `view-switched` from or to the base view 6 is the rebuild `0x4cd68`: it releases both DIAG lines and sets the
 *   next refresh of page 0 and of the current page to 0. An `incoming-started` that page 5 shows (view not 1) is the
 *   message start `0x4e418`, whose `0x4ce18` makes the next call fill the rectangle with 0 first. Page handlers never
 *   change the page here (Core does), so the original's "handler changed the page" flag `0x1a9dc4` never suppresses a
 *   refresh.
 * - **Random draws (Q-13):** one per state-1 toggle and one per lower DIAG message while start-up messages exist; none
 *   elsewhere. Every timer is a u32 clock comparison; 0-tick frames call nothing.
 * - **Per run (Δ-04):** the gates, refreshes, cycle indices and the energy page's last view start from the original's
 *   initial values with each run instead of carrying over from earlier missions.
 */
import type { InstrumentRecord } from '../../../content/hud/instruments-payload.ts';
import type { DomainEvent } from '../../../core/contracts/domain-events.ts';
import type { Projection } from '../../../core/projections/projection.ts';
import type { LeftPage } from '../../../core/world/player-state.ts';
import {
  createInterferenceGate, holdInterference, toggleInterference, type DisplayInterference, type InterferenceGate,
} from '../interference/display-interference.ts';
import type { CommunicationPages } from '../communications/communication-pages.ts';
import type { CockpitDrawContext, CockpitModule, CockpitTickContext } from '../presentation/cockpit-contract.ts';
import { COCKPIT_LIMITS, PresentationError } from '../presentation/cockpit-limits.ts';
import { fillRect } from '../raster/indexed-surface.ts';
import { EnergyPage, type EnergyPageState } from './energy-page.ts';
import { prepareLeftDisplayContent, type LeftDisplayContent } from './left-display-content.ts';
import { StatusPage, type StatusPageState } from './status-page.ts';

/**
 * A drawer of pages 2–6 (`0x4da28`, `0x4dc50`, `0x4dcec`), called with the type-6 record when its page is due and not
 * in interference. It publishes the rectangle itself unless the slot is always redrawn (directory +0x0C) and returns
 * whether it drew.
 */
export type LeftPageDrawer = (context: CockpitDrawContext, record: InstrumentRecord) => boolean;

export type InjectedLeftPage = Exclude<LeftPage, 0 | 1>;

export type LeftPageDrawers = { readonly [Page in InjectedLeftPage]?: LeftPageDrawer };

/** Subtask 18's pages as drawers: 2–4 the menu page `0x4da28`, 5 the incoming page `0x4dc50`. */
export function communicationPageDrawers(pages: CommunicationPages): Required<Pick<LeftPageDrawers, 2 | 3 | 4 | 5>> {
  const menu: LeftPageDrawer = (context, record) => pages.drawMenuPage(context, record);
  return Object.freeze({ 2: menu, 3: menu, 4: menu, 5: (context: CockpitDrawContext, record: InstrumentRecord) => pages.drawIncomingPage(context, record) });
}

export interface LeftDisplayOptions {
  readonly content: LeftDisplayContent;
  /** The run's interference picture, shared with the right display. */
  readonly interference: DisplayInterference;
  /** Pages 2–5 (`communicationPageDrawers`) and 6 (subtask 19); the app composition (subtask 24) wires them. */
  readonly pages?: LeftPageDrawers;
  /** The run's tick-0 projection: its `blink` is the phase of a write in tick 1 (DC-06). */
  readonly initial: Projection;
}

export interface LeftPageEntryState {
  readonly on: boolean;
  readonly start: number;
  readonly nextToggle: number;
  readonly nextRefresh: number;
}

export interface LeftDisplayState {
  readonly page: LeftPage;
  readonly clearPending: boolean;
  readonly entries: readonly LeftPageEntryState[];
  readonly status: StatusPageState;
  readonly energy: EnergyPageState;
}

/** A cockpit module handling type 6, with a read-only query. */
export interface LeftDisplayModule extends CockpitModule {
  state(): LeftDisplayState;
}

/** The page table `0x175c7c`: each page's subsystem field (null: none) and refresh period in clock units. */
export const LEFT_PAGE_TABLE: readonly { readonly field: number | null; readonly period: number }[] = Object.freeze([
  { field: 10, period: 0 },
  { field: 11, period: 0 },
  { field: 13, period: 0x40 },
  { field: 13, period: 0x10 },
  { field: 13, period: 0x40 },
  { field: 13, period: 0 },
  { field: null, period: 0x10 },
].map((entry) => Object.freeze(entry)));

const BASE_VIEW = 0x06;
const INJECTED_PAGES: readonly string[] = ['2', '3', '4', '5', '6'];

interface PageEntry {
  readonly gate: InterferenceGate;
  nextRefresh: number;
}

class LeftDisplay implements LeftDisplayModule {
  readonly name = 'left-display';
  readonly instruments = Object.freeze({ 6: Object.freeze({ draw: (context: CockpitDrawContext, record: InstrumentRecord) => this.#draw(context, record) }) });
  readonly #interference: DisplayInterference;
  readonly #pages: LeftPageDrawers;
  readonly #status: StatusPage;
  readonly #energy: EnergyPage;
  readonly #entries: PageEntry[];
  #page: LeftPage = 0;
  #clear = false;

  constructor({ content, interference, pages = {}, initial }: LeftDisplayOptions) {
    for (const [page, drawer] of Object.entries(pages)) {
      if (!INJECTED_PAGES.includes(page) || (drawer !== undefined && typeof drawer !== 'function')) {
        throw new PresentationError('invalid-input', `leftDisplay.pages.${page}`, 'must be a drawer of a page from 2 to 6');
      }
    }
    const assets = prepareLeftDisplayContent(content);
    this.#interference = interference;
    this.#pages = Object.freeze({ ...pages });
    this.#status = new StatusPage(assets, initial);
    this.#energy = new EnergyPage(assets);
    this.#entries = Array.from({ length: COCKPIT_LIMITS.leftPages }, () => ({ gate: createInterferenceGate(), nextRefresh: 0 }));
  }

  beforeDraw(_context: CockpitTickContext, event: DomainEvent): void {
    if (event.type === 'left-page-changed') {
      this.#page = event.page;
      this.#entries[event.page].nextRefresh = 0;
    } else if (event.type === 'view-switched' && (event.fromViewMode === BASE_VIEW || event.viewMode === BASE_VIEW)) {
      this.#status.releaseLines();
      this.#entries[0].nextRefresh = 0;
      this.#entries[this.#page].nextRefresh = 0;
    } else if (event.type === 'incoming-started' && event.shown) this.#clear = true;
  }

  prepare(context: CockpitTickContext): void {
    this.#status.observe(context.projection.flight.combat.player);
  }

  state(): LeftDisplayState {
    return Object.freeze({
      page: this.#page,
      clearPending: this.#clear,
      entries: Object.freeze(this.#entries.map(({ gate: { on, start, nextToggle }, nextRefresh }) => Object.freeze({ on, start, nextToggle, nextRefresh }))),
      status: this.#status.state(),
      energy: this.#energy.state(),
    });
  }

  /** `0x4ce30`. */
  #draw(context: CockpitDrawContext, record: InstrumentRecord): void {
    const player = context.projection.flight.combat.player;
    if (player !== null) this.#page = player.leftPage;
    const page = this.#page;
    const entry = this.#entries[page];
    const { field, period } = LEFT_PAGE_TABLE[page];
    const sample = context.clock >>> 0;
    const state = player === null || field === null ? 0 : player.subsystems[field];
    if (state !== 0 && sample > entry.gate.nextToggle) {
      if (state === 2) holdInterference(entry.gate, sample);
      else toggleInterference(entry.gate, sample, context.random);
      entry.nextRefresh = 0;
    } else if (state === 0) entry.gate.on = false;
    const { rectangle } = record;
    if (this.#clear) {
      fillRect(context.back, rectangle.x0, rectangle.y0, rectangle.x1, rectangle.y1, 0);
      this.#clear = false;
    }
    const forced = context.layout.slot?.alwaysRedraw === true;
    if (!forced && !(sample > entry.nextRefresh)) return;
    if (entry.gate.on) {
      this.#interference.draw(context, rectangle, entry.gate.start, forced);
      entry.nextRefresh = 0;
      return;
    }
    if (page === 0) this.#status.draw(context, rectangle, forced);
    else if (page === 1) this.#energy.draw(context, rectangle, forced);
    else this.#pages[page]?.(context, record);
    if (!forced) entry.nextRefresh = (sample + period) >>> 0;
  }
}

/** The left display of one run; its content is checked before anything else (a `ContentContractError`). */
export function createLeftDisplay(options: LeftDisplayOptions): LeftDisplayModule {
  return new LeftDisplay(options);
}
