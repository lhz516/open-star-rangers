/**
 * The `communications` partition (docs/plan/p3/02/spec.md, CB-14; docs/plan/p3/10/spec.md, 规则输入与读模型边界 and D-01
 * item 2 ⑥): the player's menu, incoming message, docking and base readings, read from the world without changing it
 * or drawing a random number, deeply frozen and detached from it. The partition is ready: without a player entity its
 * player is null; a destroyed player keeps its readings, the gates of its controls being the rules'. The warnings are
 * the partition's own, given with or without a player entity.
 *
 * - **Menu:** shown only while the left display is on pages 2–4 and a menu is built; a dormant menu (under page 5, or
 *   after a page the menu did not write) is not shown, and `menu: null` means closed. `menu.asset` is the commMenus Asset
 *   ID and `table` its table; each option gives its display position (1 first, comm §7.3), its raw key byte and its value
 *   as the menu was built: a category's source item, an object's identity, kind, name and tone taken at that moment, a
 *   command's source item and code, or the exit. The original's menus have no unavailable items.
 * - **Incoming:** while the channel plays: the message's identity and the speaker snapshot taken when it was queued, so
 *   that it resolves after the speaker goes; `frame` is the frame `0x4e5a0` shows at the world's clock (CB-09) and
 *   `shown` whether page 5 shows it now: outside the Warp view (1), and not under a menu opened over it.
 * - **Docking:** the mission sub-state, the docking object and whether the player's activity is docked.
 * - **Base:** while the committed view mode is 6: the docking object, the rows in their one order (both the service
 *   queue and the display order, BS5) with each record's selector and its service state `0x39cb4`, the cursor row and
 *   the three flags. The view always has a base service, as only docking enters it; a missing one is a fault.
 * - **Warnings** (docs/plan/p3/02/spec.md, FA-01): the type-9 instrument's two flags as the tail check last sampled
 *   them, kept between samples and while no player entity exists, for P3-13's lights and P3-14's warning sound.
 *
 * Not shown: the radio queue, the loading message, docking deadlines and countdowns, and the base dues and rates
 * (development diagnostics read them from a snapshot). Resources and ammunition are `flight.combat`'s.
 */
import { CoreFaultError } from '../errors.ts';
import { COMMUNICATIONS_FIELD, INCOMING_PAGE, isMenuPage } from '../rules/displays.ts';
import { BASE_VIEW_MODE, serviceState } from '../rules/docking.ts';
import { elapsedEighths, playbackFrame } from '../rules/radio.ts';
import type { CommunicationsMenu } from '../world/player-state.ts';
import type { IncomingChannel, WorldState } from '../world/world-state.ts';
import type { BaseServiceView, CommunicationsMenuView, CommunicationsPlayer, CommunicationsProjection, IncomingView, ThreatWarnings } from './projection.ts';

/** The Warp view mode, in which page 5 never shows a message (RQ5). */
const WARP_VIEW_MODE = 1;

const fault = (site: string): CoreFaultError => new CoreFaultError('invariant-violated', `communications.${site}`);

/** A deeply frozen copy of plain data, so that no reading shares an object with the world. */
function detached<Value>(value: Value): Value {
  if (typeof value !== 'object' || value === null) return value;
  if (Array.isArray(value)) return Object.freeze(value.map(detached)) as Value;
  const copy: Record<string, unknown> = {};
  for (const [key, member] of Object.entries(value)) copy[key] = detached(member);
  return Object.freeze(copy) as Value;
}

function menuView(world: WorldState, menu: CommunicationsMenu): CommunicationsMenuView {
  return Object.freeze({
    menu: Object.freeze({ asset: world.ruleData.inputs.commMenus.id, table: menu.table }),
    level: menu.level,
    partnerEntityId: world.player.communications.partner,
    options: Object.freeze(menu.items.map(({ key, value }, index) => Object.freeze({ position: index + 1, key, value: detached(value) }))),
  });
}

function incomingView(world: WorldState, channel: Extract<IncomingChannel, { readonly phase: 'playing' }>): IncomingView {
  const { item, startClock, frameDurations } = channel;
  return Object.freeze({
    message: detached(item.message),
    speaker: detached(item.speaker),
    frame: playbackFrame(elapsedEighths(world.clock, startClock), frameDurations),
    frameCount: frameDurations.length,
    shown: world.player.viewMode !== WARP_VIEW_MODE && world.player.leftDisplay.page === INCOMING_PAGE,
  });
}

/** The base page in view 6, which only docking enters and which therefore always has a base service; otherwise null. */
function baseView(world: WorldState, subsystems: readonly number[]): BaseServiceView | null {
  if (world.player.viewMode !== BASE_VIEW_MODE) return null;
  const service = world.baseService;
  if (service === null) throw fault('base');
  const selectors = world.ruleData.communications.serviceSelectors;
  return Object.freeze({
    baseEntityId: world.player.dockingObject,
    rows: Object.freeze(service.rows.map((record) => {
      const selector = selectors[record];
      return Object.freeze({ record, selector, state: serviceState(subsystems, selector) });
    })),
    cursor: service.cursor,
    flags: detached(service.flags),
  });
}

/** The communications partition: ready, with the player's readings or null without a player entity, and the warnings. */
export function projectCommunications(world: WorldState): CommunicationsProjection {
  const { tailCheck } = world.communications;
  const warnings: ThreatWarnings = Object.freeze({ attackerOnTail: tailCheck.attackerOnTail, missileIncoming: tailCheck.missileIncoming });
  return Object.freeze({ readiness: 'ready', player: playerReadings(world), warnings });
}

/** The player's readings, or null without a player entity. */
function playerReadings(world: WorldState): CommunicationsPlayer | null {
  const { player: state, communications } = world;
  if (state.entityId === null) return null;
  const player = world.entities.get(state.entityId);
  if (player === undefined || player.combat.type !== 'craft') throw fault('player');
  const { subsystems } = player.combat;
  const { page } = state.leftDisplay;
  const { menu } = state.communications;
  const { channel } = communications;
  return Object.freeze({
    entityId: player.id,
    page,
    subsystem: subsystems[COMMUNICATIONS_FIELD],
    menu: isMenuPage(page) && menu !== null ? menuView(world, menu) : null,
    incoming: channel.phase === 'playing' ? incomingView(world, channel) : null,
    docking: Object.freeze({ subState: world.flow.subState, dockingObject: state.dockingObject, docked: player.activity === 'docked' }),
    base: baseView(world, subsystems),
  });
}
