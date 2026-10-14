import { expect, type Page } from '@playwright/test';
import { submitDevCommand, type DevCommand } from './mission-observations.ts';

// P3-09 subtask 22 (docs/plan/p3/09/spec.md, AC-12): observations of the strategic map and Warp in the real mission.
// Core's facts come from the development panel (its refreshed state and event log); the session bridge's facts come
// from the mission's UI store, which the bridge writes and the mission screen's component holds. Nothing here writes
// application state or the store: page functions only read, and the run advances only through trusted input and the
// panel's own command editor.

declare global {
  interface Window {
    osrPointerLockChanges?: number;
    osrWarpResume?: { click: number | null; frame: number | null; ticks: { tick: number; time: number }[]; observer: MutationObserver };
  }
}

/**
 * Page function, before a resume click (as e2e/native-lifecycle.spec.ts): records by the page's clock the next trusted
 * click, the animation frame requested from it (the session's first frame after the resume arrives in that frame) and
 * every tick the mission screen shows afterwards.
 */
export function watchResume(): void {
  const screen = document.querySelector('[data-testid="mission-screen"]');
  if (!screen) throw new Error('No mission screen to watch');
  const record: NonNullable<Window['osrWarpResume']> = {
    click: null, frame: null, ticks: [],
    observer: new MutationObserver(() => { record.ticks.push({ tick: Number(screen.getAttribute('data-tick')), time: performance.now() }); }),
  };
  window.osrWarpResume = record;
  document.addEventListener('click', () => {
    record.click = performance.now();
    requestAnimationFrame(time => { record.frame = time; });
  }, { capture: true, once: true });
  record.observer.observe(screen, { attributes: true, attributeFilter: ['data-tick'] });
}

/** Page function: ends `watchResume` and returns what it recorded. */
export function stopWatchingResume() {
  const record = window.osrWarpResume;
  if (!record) throw new Error('watchResume was not installed');
  record.observer.disconnect();
  delete window.osrWarpResume;
  return { click: record.click, frame: record.frame, ticks: record.ticks };
}

/** Serialized before navigation: counts the document's `pointerlockchange` events. */
export function countPointerLockChanges(): void {
  window.osrPointerLockChanges = 0;
  document.addEventListener('pointerlockchange', () => { window.osrPointerLockChanges! += 1; });
}

/** The `pointerlockchange` events `countPointerLockChanges` counted, and whether anything holds the lock now. */
export const pointerLockChanges = (page: Page) =>
  page.evaluate(() => ({ changes: window.osrPointerLockChanges, locked: document.pointerLockElement !== null }));

/** The view modes of flight (the cockpit), the Warp and the map. */
export const [FLIGHT_VIEW, WARP_VIEW, MAP_VIEW] = [0x0c, 0x01, 0x08];

/** A position as Core reports it. */
export interface Position {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** What the mission's UI store shows of the run, as the session bridge last published it. */
export interface BridgeView {
  readonly phase: string | null;
  readonly runId: number | null;
  readonly tick: number | null;
  readonly viewMode: number | null;
  readonly context: string | null;
  /** The map partition's player state: null when not ready or without a player. */
  readonly map: {
    readonly state: 'open' | 'closed';
    readonly destination: Position | null;
    readonly markerEntityId: number | null;
    /** `accepted` or the gate's reason. */
    readonly warpRequest: string;
    /** The open map's readout for the stored destination; null when closed or without one. */
    readonly destinationCost: { readonly cost: number; readonly energy: number; readonly percent: number | null } | null;
  } | null;
  /** The player's current energy reading; null without a player. */
  readonly energy: number | null;
  /** The player's position in the motion group; null without a player. */
  readonly position: Position | null;
  /** The cockpit's Warp page completion in view mode 1; null in every other view. */
  readonly warpCompletion: number | null;
  /** The recent command results, oldest first. */
  readonly results: readonly { readonly commandId: number; readonly commandType: string; readonly outcome: string; readonly reason: string | null }[];
}

/**
 * Page function: the bridge's store as the mission screen's component holds it (its `game` prop, reached through the
 * React fiber of the screen element), or null without a mission screen. It only calls the store's `getState`.
 */
export function readBridgeView(): BridgeView | null {
  interface Fiber { readonly memoizedProps?: { readonly game?: { getState(): unknown } } | null; readonly return: Fiber | null }
  const screen = document.querySelector('[data-testid="mission-screen"]');
  if (!screen) return null;
  const key = Object.keys(screen).find(name => name.startsWith('__reactFiber$'));
  let fiber = key ? (screen as unknown as Record<string, Fiber>)[key] : null;
  while (fiber && typeof fiber.memoizedProps?.game?.getState !== 'function') fiber = fiber.return;
  if (!fiber) return null;
  // The store's shapes, as far as read here (src/ui/game/game-store.ts, src/core/projections/projection.ts).
  type Reading = { cost: number; energy: number; percent: number | null };
  type MapPlayer = { state: 'open' | 'closed'; destination: unknown; markerEntityId: number | null; warpRequest: { accepted: boolean; reason?: string } };
  const state = fiber.memoizedProps!.game!.getState() as {
    status: { phase: string; runId: number | null } | null;
    projection: {
      clock: { tick: number };
      player: { viewMode: number; interactionContext: string };
      map: { readiness: string; player?: MapPlayer | null };
      flight: {
        motion: { readiness: string; player?: { position: Position } | null };
        combat: { readiness: string; player?: { resources: { energy: { current: number } }; warp: { page: { completion: number } | null } } | null };
      };
    } | null;
    recentResults: readonly { commandId: number; commandType: string; outcome: string; reason: string | null }[];
  };
  const projection = state.projection;
  const player = projection?.map.readiness === 'ready' ? projection.map.player ?? null : null;
  const combat = projection?.flight.combat.readiness === 'ready' ? projection.flight.combat.player ?? null : null;
  const xyz = (value: unknown): Position | null => {
    if (value === null || typeof value !== 'object') return null;
    const { x, y, z } = value as Position;
    return { x, y, z };
  };
  const destination = player === null ? null : player.state === 'open'
    ? (player.destination as { position: Position; cost: Reading } | null)
    : null;
  return {
    phase: state.status?.phase ?? null,
    runId: state.status?.runId ?? null,
    tick: projection?.clock.tick ?? null,
    viewMode: projection?.player.viewMode ?? null,
    context: projection?.player.interactionContext ?? null,
    map: player === null ? null : {
      state: player.state,
      destination: player.state === 'open' ? xyz(destination?.position ?? null) : xyz(player.destination),
      markerEntityId: player.markerEntityId,
      warpRequest: player.warpRequest.accepted ? 'accepted' : player.warpRequest.reason ?? '',
      destinationCost: destination === null ? null : { cost: destination.cost.cost, energy: destination.cost.energy, percent: destination.cost.percent },
    },
    energy: combat?.resources.energy.current ?? null,
    position: projection?.flight.motion.readiness === 'ready' ? xyz(projection.flight.motion.player?.position ?? null) : null,
    warpCompletion: combat?.warp.page?.completion ?? null,
    results: state.recentResults.map(({ commandId, commandType, outcome, reason }) => ({ commandId, commandType, outcome, reason })),
  };
}

/** One state the bridge published, as `watchStore` recorded it. */
export interface PublishedState {
  readonly tick: number | null;
  readonly viewMode: number | null;
  readonly energy: number | null;
  readonly position: Position | null;
}

declare global {
  interface Window {
    osrStoreWatch?: { readonly states: PublishedState[]; readonly stop: () => void };
  }
}

/**
 * Page function: records every state the bridge publishes to the mission's UI store from now on, through the store's
 * own `subscribe`, until `stopWatchingStore`. It reads the store as `readBridgeView` does and writes nothing to it.
 */
export function watchStore(): void {
  interface Fiber { readonly memoizedProps?: { readonly game?: { subscribe(listener: (state: unknown) => void): () => void } } | null; readonly return: Fiber | null }
  const screen = document.querySelector('[data-testid="mission-screen"]');
  const key = screen ? Object.keys(screen).find(name => name.startsWith('__reactFiber$')) : undefined;
  let fiber = screen && key ? (screen as unknown as Record<string, Fiber>)[key] : null;
  while (fiber && typeof fiber.memoizedProps?.game?.subscribe !== 'function') fiber = fiber.return;
  if (!fiber) throw new Error('No mission UI store to watch');
  type Position = { x: number; y: number; z: number };
  const states: PublishedState[] = [];
  const stop = fiber.memoizedProps!.game!.subscribe(value => {
    const projection = (value as { projection: {
      clock: { tick: number }; player: { viewMode: number };
      flight: { motion: { player?: { position: Position } | null }; combat: { player?: { resources: { energy: { current: number } } } | null } };
    } | null }).projection;
    const position = projection?.flight.motion.player?.position ?? null;
    states.push({
      tick: projection?.clock.tick ?? null, viewMode: projection?.player.viewMode ?? null,
      energy: projection?.flight.combat.player?.resources.energy.current ?? null,
      position: position && { x: position.x, y: position.y, z: position.z },
    });
  });
  window.osrStoreWatch?.stop();
  window.osrStoreWatch = { states, stop };
}

/** Page function: ends `watchStore` and returns the states it recorded. */
export function stopWatchingStore(): PublishedState[] {
  const watch = window.osrStoreWatch;
  if (!watch) throw new Error('watchStore was not installed');
  watch.stop();
  delete window.osrStoreWatch;
  return watch.states;
}

/**
 * Expects the state the bridge published at the completion's own tick (the completion changes the view, a key fact
 * published at once) to show Core's charged energy and the arrival: energy and movement run before the completion in a
 * tick, so the frame's projection holds both exactly.
 */
export function expectCompletionPublished(states: readonly PublishedState[], completion: LogEntry): void {
  const published = states.find(state => state.tick === completion.tick);
  expect(published, `No state published at the completion's tick ${completion.tick}: ${JSON.stringify(states.slice(-5))}`).toBeDefined();
  expect(published).toEqual({
    tick: completion.tick, viewMode: Number(completion.fields.viewMode), energy: Number(completion.fields.energyAfter), position: loggedPosition(completion.fields),
  });
}

/** The bridge's view of the page's current mission; fails without one. */
export async function bridgeView(page: Page): Promise<BridgeView> {
  const view = await page.evaluate(readBridgeView);
  if (view === null) throw new Error('No mission UI store to read');
  return view;
}

/** Polls the bridge's view until `accept` holds, and resolves to it. */
export async function waitForBridge(page: Page, accept: (view: BridgeView) => boolean, what: string, timeout = 10_000): Promise<BridgeView> {
  let last: BridgeView | null = null;
  try {
    await expect.poll(async () => accept(last = await bridgeView(page)), { timeout }).toBe(true);
  } catch (cause) {
    throw new Error(`${what}; last ${JSON.stringify(last)}`, { cause });
  }
  return last!;
}

/** One event of the development event log, its fields as the panel writes them. */
export interface LogEntry {
  readonly tick: number;
  readonly type: string;
  readonly commandId: number | null;
  readonly fields: Readonly<Record<string, string>>;
}

/** Page function: the event log's entries of `types`, oldest first. */
export function readLog(types: readonly string[]): LogEntry[] {
  return [...document.querySelectorAll<HTMLElement>('[data-testid="dev-log"] li')]
    .filter(item => types.includes(item.dataset.type ?? ''))
    .map(item => {
      const parts = (item.textContent ?? '').split(' · ');
      const fields: Record<string, string> = {};
      for (const part of parts.slice(2)) {
        const at = part.indexOf('=');
        if (at > 0) fields[part.slice(0, at)] = part.slice(at + 1);
      }
      const commandId = item.dataset.commandId;
      return { tick: Number(parts[0].replace(/^tick /, '')), type: item.dataset.type ?? '', commandId: commandId === undefined ? null : Number(commandId), fields };
    });
}

/** The P3-09 events the map and Warp checks read. */
export const MAP_WARP_EVENTS = Object.freeze(['map-toggled', 'warp-destination-set', 'warp-started', 'warp-completed']);

export const mapWarpLog = (page: Page): Promise<LogEntry[]> => page.evaluate(readLog, MAP_WARP_EVENTS);

/** Polls the map and Warp events until `count` of them are logged (the log follows the panel's sampling); resolves to them. */
export async function waitForMapWarpLog(page: Page, count: number, timeout = 5_000): Promise<LogEntry[]> {
  let last: LogEntry[] = [];
  await expect.poll(async () => (last = await mapWarpLog(page)).length, { timeout, message: `${count} map and Warp events` }).toBeGreaterThanOrEqual(count);
  return last;
}

/** A logged position field set: `x`, `y`, `z`, or with a prefix such as `origin`. */
export function loggedPosition(fields: Readonly<Record<string, string>>, prefix = ''): Position {
  const name = (axis: string) => (prefix === '' ? axis : `${prefix}${axis.toUpperCase()}`);
  return { x: Number(fields[name('x')]), y: Number(fields[name('y')]), z: Number(fields[name('z')]) };
}

/** Page function: the refreshed panel's entity row `id`: its kind bit and name reference, or null without one. */
export function readDevEntity(id: number): { readonly kindBit: number; readonly name: string } | null {
  const row = document.querySelector<HTMLTableRowElement>(`[data-testid="dev-entity"][data-entity-id="${id}"]`);
  return row ? { kindBit: Number(row.dataset.kindBit), name: row.cells[3]?.textContent ?? '' } : null;
}

/**
 * Drafts `type` with `values` in the panel's command editor, by its own controls, and submits it through the run's
 * queue; resolves to its logged result (development builds).
 */
export async function submitEditorCommand(page: Page, type: string, values: Readonly<Record<string, string>> = {}): Promise<DevCommand> {
  await page.getByTestId('dev-command-type').selectOption(type);
  const panel = page.getByTestId('mission-dev-panel');
  for (const [field, value] of Object.entries(values)) {
    const control = panel.locator(`[data-field="${field}"]`);
    if (await control.evaluate(element => element instanceof HTMLSelectElement)) await control.selectOption(value);
    else await control.fill(value);
  }
  await expect(page.getByTestId('dev-command-invalid')).toHaveCount(0);
  return submitDevCommand(page);
}

/**
 * The completion's charge (docs/plan/p3/02/spec.md, MW-08 step 4): E′ = max(trunc(E − (c + c × s × 0.5)), 0) from the
 * logged cost, energy and error.
 */
export function expectedCharge(fields: Readonly<Record<string, string>>): number {
  const [cost, before, error] = [Number(fields.chargeCost), Number(fields.energyBefore), Number(fields.error)];
  return Math.max(Math.trunc(before - (cost + cost * error * 0.5)), 0);
}
