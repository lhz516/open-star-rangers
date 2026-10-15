import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { ruleDataInputs, runModelInputs, type PackageGroup } from '../../src/app/resources/mission-input.ts';
import { validateGroup, validatePackage } from '../../src/content/completeness.ts';
import type { MissionContent } from '../../src/content/logic/logic-content.ts';
import { decodeLogicPayload } from '../../src/content/logic/logic-payload.ts';
import { readGroupManifest } from '../../src/content/manifest.ts';
import { readPayloadRecords } from '../../src/content/payload.ts';
import { decodeRuleDataPayload } from '../../src/content/rule-data/rule-data-payload.ts';
import { CLASSIC_P2_SLICE } from '../../src/content/slice-definition.ts';
import type { DomainEvent } from '../../src/core/contracts/domain-events.ts';
import type { CommunicationsPlayer } from '../../src/core/projections/projection.ts';
import type { Recording } from '../../src/core/replay/recording.ts';
import { createWorld, type CreateWorldInput } from '../../src/core/world/create-world.ts';
import { basePageView } from '../../src/ui/mission/base-page.ts';
import { scenarioGroups } from '../../src/workers/import-scenarios.test-support.ts';

// P3-10 subtask 23 (docs/plan/p3/10/spec.md, AC-14): observations of the G-05 base page and the development event log
// for the browser docking flow on the synthetic `mission-docking` disc, and the Core read model a Node replay of the
// run's exported recording gives. Reads go through page evaluations only; nothing here writes application state.

/** What the base page shows, read from its DOM attributes and text. */
export interface ShownBase {
  readonly cursor: number;
  readonly rows: readonly { readonly row: number; readonly record: number; readonly selector: number; readonly state: number; readonly inService: boolean; readonly selected: boolean }[];
  readonly flags: { readonly repairsComplete: boolean; readonly energyAndMissilesFull: boolean; readonly hullFull: boolean };
  readonly readings: { readonly energy: string; readonly hull: string; readonly missiles: string };
  readonly lastCommand: string;
}

/** The base page's state, or null while it is not shown. */
export function shownBase(page: Page): Promise<ShownBase | null> {
  return page.evaluate(() => {
    const base = document.querySelector<HTMLElement>('[data-testid="base-page"]');
    if (!base) return null;
    const reading = (name: string) => base.querySelector(`[data-reading="${name}"] dd`)?.textContent ?? '';
    const flag = (name: string) => base.querySelector<HTMLElement>(`[data-flag="${name}"]`)?.dataset.set === 'true';
    return {
      cursor: Number(base.dataset.cursor),
      rows: [...base.querySelectorAll<HTMLElement>('.base-service-row')].map(row => ({
        row: Number(row.dataset.row), record: Number(row.dataset.record), selector: Number(row.dataset.selector), state: Number(row.dataset.state),
        inService: row.dataset.inService === 'true', selected: row.dataset.selected === 'true',
      })),
      flags: { repairsComplete: flag('repairsComplete'), energyAndMissilesFull: flag('energyAndMissilesFull'), hullFull: flag('hullFull') },
      readings: { energy: reading('energy'), hull: reading('hull'), missiles: reading('missiles') },
      lastCommand: base.querySelector('[data-testid="base-last-command"]')?.textContent ?? '',
    };
  });
}

declare global {
  interface Window {
    osrService?: { readonly log: ServiceReading[]; readonly observer: MutationObserver };
  }
}

/** A base page reading of the service: the missiles, the energy-and-missiles mark and row 0's state, as text. */
export interface ServiceReading {
  readonly missiles: string;
  readonly full: string;
  readonly row0: string;
}

/**
 * Starts logging every distinct service reading of the base page as the DOM commits it, so the readings of its first
 * render are kept however soon the service changes them. Install it before the base page shows; `serviceLog` ends it.
 */
export function watchService(page: Page): Promise<void> {
  return page.evaluate(() => {
    window.osrService?.observer.disconnect();
    const log: { missiles: string; full: string; row0: string }[] = [];
    let last = '';
    const record = (): void => {
      const base = document.querySelector('[data-testid="base-page"]');
      if (!base) return;
      const entry = {
        missiles: base.querySelector('[data-reading="missiles"] dd')?.textContent ?? '',
        full: base.querySelector('[data-flag="energyAndMissilesFull"]')?.getAttribute('data-set') ?? '',
        row0: base.querySelector('.base-service-row[data-row="0"]')?.getAttribute('data-state') ?? '',
      };
      const key = JSON.stringify(entry);
      if (key === last) return;
      last = key;
      log.push(entry);
    };
    const observer = new MutationObserver(record);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
    window.osrService = { log, observer };
  });
}

/** Ends the service watch and resolves to its log, oldest first. */
export function serviceLog(page: Page): Promise<ServiceReading[]> {
  return page.evaluate(() => {
    window.osrService?.observer.disconnect();
    const log = window.osrService?.log ?? [];
    delete window.osrService;
    return log;
  });
}

/** One development event log entry: its type and its `name=value` fields. */
export interface LoggedEvent {
  readonly type: string;
  readonly text: string;
}

/** The development event log's entries, oldest first (empty after a clear). */
export function loggedEvents(page: Page): Promise<LoggedEvent[]> {
  return page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[data-testid="dev-log"] li')]
    .map(item => ({ type: item.dataset.type ?? '', text: item.textContent ?? '' })));
}

/** The logged events of `types`, in order. */
export const eventsOf = (events: readonly LoggedEvent[], ...types: string[]): LoggedEvent[] => events.filter(({ type }) => types.includes(type));

/**
 * Clears the development event log, so later counts start from none. The click moves focus to the panel's button; when
 * the game input zone had focus, it is given back.
 */
export async function clearLog(page: Page): Promise<void> {
  const zone = page.getByTestId('game-input-zone');
  const zoneFocused = await zone.count() === 1 && await zone.evaluate(element => element === document.activeElement);
  const clear = page.getByRole('button', { name: 'Clear log', exact: true });
  if (await clear.isEnabled()) await clear.click();
  await page.waitForFunction(() => document.querySelector('[data-testid="dev-log"]') === null);
  if (zoneFocused) await zone.focus();
}

/** The communications reading after a tick whose input held a communications or number command. */
export interface MenuStep {
  readonly tick: number;
  readonly commands: readonly string[];
  readonly menu: CommunicationsPlayer['menu'];
  readonly docking: CommunicationsPlayer['docking'];
}

/** What a Node world replaying a recording gives: its final tick, every event, the menu steps and the base page's view at the end. */
export interface ReplayedRun {
  readonly finalTick: number;
  readonly events: readonly DomainEvent[];
  readonly menuSteps: readonly MenuStep[];
  readonly view: ReturnType<typeof basePageView>;
}

/**
 * Replays the exported recording at `path` on the `mission-docking` package in a Node world: the test read model of the
 * communications menu, which the build shows on no production screen yet (P3-13), and of the base page's projection.
 */
export async function replayedRun(path: string): Promise<ReplayedRun> {
  const recording = JSON.parse(await readFile(path, 'utf8')) as Recording;
  const sent = await scenarioGroups('mission-docking');
  const held = sent.filter(input => validateGroup(CLASSIC_P2_SLICE, input).status === 'group-complete');
  const validation = validatePackage(CLASSIC_P2_SLICE, held);
  if (validation.status !== 'complete') throw new Error('The docking package is not complete');
  const groups: PackageGroup[] = held.map(({ group, manifest, payloads }) => ({ group, manifest, payloads }));
  const logic = held.find(({ group }) => group === 'logic')!;
  const { assets } = readGroupManifest(logic.manifest);
  const payloads = readPayloadRecords(logic.payloads);
  const decode = (descriptor: (typeof assets)[number] | undefined, decoder: typeof decodeLogicPayload | typeof decodeRuleDataPayload = decodeLogicPayload) => {
    if (!descriptor) throw new Error('The logic group lacks an Asset');
    return { id: descriptor.id, content: decoder(payloads.find(({ id }) => id === descriptor.id)!.bytes, descriptor).content };
  };
  const mission = decode(assets.find(({ role }) => role === 'mission'));
  const { references } = mission.content as MissionContent;
  const craftTypes = decode(assets.find(({ id }) => id === references.craftTypes));
  const wingmanRoster = decode(assets.find(({ id }) => id === references.wingmanRoster));
  const { identity } = validation;
  const { run } = recording.record;
  const world = createWorld({
    mission, craftTypes, wingmanRoster, craftInfo: decode(assets.find(({ role }) => role === 'craft-info'), decodeRuleDataPayload),
    ...ruleDataInputs(groups),
    models: runModelInputs(groups, { mission, craftTypes, wingmanRoster, identity, run } as Parameters<typeof runModelInputs>[1]),
    identity, run,
  } as CreateWorldInput);
  const events: DomainEvent[] = [];
  const menuSteps: MenuStep[] = [];
  for (const input of recording.record.ticks) {
    events.push(...world.step(input));
    const commands = input.commands.filter(({ type }) => type === 'communications' || type === 'select-number');
    if (commands.length === 0) continue;
    const { communications, clock } = world.projection();
    if (communications.readiness !== 'ready' || communications.player === null) throw new Error('No communications reading');
    menuSteps.push({ tick: clock.tick, commands: commands.map(command => JSON.stringify(command)), menu: communications.player.menu, docking: communications.player.docking });
  }
  return { finalTick: world.projection().clock.tick, events, menuSteps, view: basePageView(world.projection()) };
}
