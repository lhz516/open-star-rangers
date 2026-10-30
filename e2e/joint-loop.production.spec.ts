import type { Page } from '@playwright/test';
import { RESULT_PAGE } from '../src/ui/mission/slice-gaps-copy.ts';
import { PRODUCTION_PACKAGE } from '../src/workers/production-package.ts';
import { PREVIEW_CONTENT_SECURITY_POLICY } from '../tools/preview-csp.ts';
import { button } from './support/app-entry.ts';
import { expect, test } from './support/audited-test.ts';
import { shownBase } from './support/base-interaction.ts';
import {
  awaitPlaceholder, holdEnded, holdGun, JOINT_KINDS, jointLoopPackage, openLockedMap, pressInZone, requestDocking, resultPage, selectContact,
  afterTicks, type JointLoopVariant,
} from './support/joint-loop.ts';
import { FLIGHT_VIEW, MAP_VIEW, WARP_VIEW, waitForBridge, type Position } from './support/map-warp.ts';
import type { ShownResult } from './support/mission-result.ts';
import {
  checkedWingman, chooseWingman, endPlaceholder, enterMission, expectAdvancingTick, expectStableTick, leaveGuards, missionEntry, missionFrame, waitForFrame,
} from './support/mission-observations.ts';
import { seedProductionCache } from './support/production-cache.ts';

// P3-15 subtask 02 (docs/plan/p3/15/spec.md, S-01, S-02; AC-01 production, AC-02 production part): the synthetic joint
// loop of subtask 01 (e2e/support/joint-loop.ts) on the local production preview under its Content Security Policy,
// with the network audit on. Production has no test entry, development panel, event log or recording, so each case
// seeds its own isolated context with the variant package under the production identity and budget
// (`seedProductionCache`), reloads and restores it through the main menu, and runs it with seeds the build chooses
// itself: the variants reach their endings under any seed (joint-loop.ts checks them in Node under many). The runs
// advance only by trusted input on the page's own controls, the game input zone and the map cursor: no forced ending,
// no state write. Each step is asserted from what the build shows: the mission screen's read-only attributes, the
// placeholders, base and result pages, the browser probes, and the mission's UI store (read only, as
// e2e/mission-flow.production.spec.ts reads it for the map), which carries Core's projection and command results.
// Every page of the loop is checked for the absence of development diagnostics and recording export.

test.describe.configure({ timeout: 600_000 });

/** The player's view mode while its destruction sequence runs (src/core/systems/player-loss.ts). */
const DESTRUCTION_VIEW = 0x11;
const RESTORED = ['Complete resources, viewable', /^Saved in this browser \(restored and verified in \d+(?: ms|\.\d\d s)\)$/, 'Mission loads into Core'];

const zone = (page: Page) => page.getByTestId('game-input-zone');
const status = (page: Page) => page.getByTestId('mission-status');
const placeholder = (page: Page) => page.getByTestId('mission-placeholder');

/** What the mission's UI store shows of the run, as the session bridge last published it (production readings only). */
interface RunView {
  readonly runId: number | null;
  readonly tick: number | null;
  readonly mission: { readonly group: number; readonly slot: number; readonly rawDifficulty: number; readonly wingman: number | null; readonly phase: string } | null;
  readonly player: number | null;
  readonly viewMode: number | null;
  readonly context: string | null;
  readonly target: { readonly mode: string; readonly entityId: number | null; readonly kindBit: number | null } | null;
  readonly energy: number | null;
  readonly charge: number | null;
  readonly position: Position | null;
  readonly orientation: readonly number[] | null;
  readonly docking: { readonly docked: boolean; readonly dockingObject: number | null } | null;
  readonly result: {
    readonly outcome: string; readonly reason?: { readonly type: string; readonly loss?: string }; readonly rescuesUsed?: number; readonly playerKills?: number;
    readonly endingGaps?: readonly { readonly gap: string; readonly variant?: string }[]; readonly completedTick?: number;
  } | null;
  /** The recent command results, oldest first. */
  readonly results: readonly { readonly commandId: number; readonly commandType: string; readonly outcome: string }[];
}

/**
 * Page function: the store as the mission screen's component holds it (its `game` prop, reached through the React
 * fiber of the screen element), or null without one. It only calls `getState` and copies plain data out.
 */
function readRunView(): RunView | null {
  interface Fiber { readonly memoizedProps?: { readonly game?: { getState(): unknown } } | null; readonly return: Fiber | null }
  const screen = document.querySelector('[data-testid="mission-screen"]');
  if (!screen) return null;
  const key = Object.keys(screen).find(name => name.startsWith('__reactFiber$'));
  let fiber = key ? (screen as unknown as Record<string, Fiber>)[key] : null;
  while (fiber && typeof fiber.memoizedProps?.game?.getState !== 'function') fiber = fiber.return;
  if (!fiber) return null;
  // The store's shapes, as far as read here (src/ui/game/game-store.ts, src/core/projections/projection.ts).
  type Ready<T> = { readiness: string; player?: T | null };
  const state = fiber.memoizedProps!.game!.getState() as {
    status: { runId: number | null } | null;
    projection: {
      clock: { tick: number };
      mission: NonNullable<RunView['mission']>;
      player: { entityId: number | null; viewMode: number; interactionContext: string };
      flight: {
        motion: Ready<{ position: Position; orientation: readonly number[] }>;
        combat: Ready<{ targetMode: string; target: { entityId: number; kindBit: number } | null; resources: { energy: { current: number }; charge: { current: number } } }>;
      };
      communications: Ready<{ docking: { docked: boolean; dockingObject: number | null } }>;
      result: NonNullable<RunView['result']>;
    } | null;
    recentResults: RunView['results'];
  };
  const projection = state.projection;
  const ready = <T>(partition: Ready<T> | undefined): T | null => (partition?.readiness === 'ready' ? partition.player ?? null : null);
  const motion = ready(projection?.flight.motion);
  const combat = ready(projection?.flight.combat);
  const communications = ready(projection?.communications);
  return JSON.parse(JSON.stringify({
    runId: state.status?.runId ?? null,
    tick: projection?.clock.tick ?? null,
    mission: projection && {
      group: projection.mission.group, slot: projection.mission.slot, rawDifficulty: projection.mission.rawDifficulty,
      wingman: projection.mission.wingman, phase: projection.mission.phase,
    },
    player: projection?.player.entityId ?? null,
    viewMode: projection?.player.viewMode ?? null,
    context: projection?.player.interactionContext ?? null,
    target: combat && { mode: combat.targetMode, entityId: combat.target?.entityId ?? null, kindBit: combat.target?.kindBit ?? null },
    energy: combat?.resources.energy.current ?? null,
    charge: combat?.resources.charge.current ?? null,
    position: motion?.position ?? null,
    orientation: motion?.orientation ?? null,
    docking: communications && { docked: communications.docking.docked, dockingObject: communications.docking.dockingObject },
    result: projection?.result ?? null,
    results: state.recentResults.map(({ commandId, commandType, outcome }) => ({ commandId, commandType, outcome })),
  })) as RunView;
}

/** The store's view of the page's current run; fails without a mission screen. */
async function runView(page: Page): Promise<RunView> {
  const view = await page.evaluate(readRunView);
  if (view === null) throw new Error('No mission UI store to read');
  return view;
}

/** Polls the store until `accept` holds, and resolves to that view; fails with `what` and the last view. */
async function waitForRun(page: Page, accept: (view: RunView) => boolean, what: string, timeout = 10_000): Promise<RunView> {
  let last: RunView | null = null;
  try {
    await expect.poll(async () => accept(last = await runView(page)), { timeout }).toBe(true);
  } catch (cause) {
    throw new Error(`${what}; last ${JSON.stringify(last)}`, { cause });
  }
  return last!;
}

/** The last `count` command results, by type and outcome. */
const lastResults = (view: RunView, count: number): string[] => view.results.slice(-count).map(({ commandType, outcome }) => `${commandType} ${outcome}`);

/** Backspace in the focused input zone: full speed, which Core accepts. Resolves to the view with its result. */
async function fullSpeed(page: Page): Promise<RunView> {
  const last = (await runView(page)).results.at(-1)?.commandId ?? 0;
  await pressInZone(page, 'Backspace');
  const view = await waitForRun(page, current => current.results.some(({ commandId, commandType }) => commandId > last && commandType === 'speed'), 'Backspace had no result');
  expect(lastResults(view, 1)).toEqual(['speed accepted']);
  return view;
}

const distance = (a: Position, b: Position): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** Records every `securitypolicyviolation` the document reports, before any page script runs. */
async function recordViolations(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { osrViolations: string[] }).osrViolations = seen;
    document.addEventListener('securitypolicyviolation', event => { seen.push(`${event.effectiveDirective} ${event.blockedURI}`); });
  });
}

const violations = (page: Page) => page.evaluate(() => (window as unknown as { osrViolations: string[] }).osrViolations);

/**
 * The production build shows no development diagnostics or recording export on the current page: no panel or other
 * `dev-` control (the development recording export is `dev-recording-export`), no download link, and no control named
 * for a recording, an export, a replay or diagnostics.
 */
async function expectNoDevelopmentEntries(page: Page): Promise<void> {
  expect(await page.evaluate(() => ({
    dev: document.querySelectorAll('[data-testid="mission-dev-panel"], [data-testid^="dev-"]').length,
    downloads: document.querySelectorAll('a[download]').length,
    controls: [...document.querySelectorAll('button, a, [role="button"], input, select, textarea')]
      .map(control => `${control.textContent ?? ''} ${control.getAttribute('aria-label') ?? ''} ${control.getAttribute('title') ?? ''}`)
      .filter(name => /record|export|replay|diagnos/i.test(name)),
  }))).toEqual({ dev: 0, downloads: 0, controls: [] });
}

/** One run of a case: its configuration, and the steps it asserted, in order, for the evidence. */
interface RunLog {
  readonly variant: JointLoopVariant;
  readonly wingman: number | null;
  readonly run: number;
  readonly steps: string[];
}

/**
 * Opens the preview with an empty cache, checks its CSP, seeds the variant under the production identity, reloads and
 * restores it through the main menu until the mission entry admits it.
 */
async function restoreVariant(page: Page, variant: JointLoopVariant): Promise<void> {
  const groups = jointLoopPackage(variant);
  await recordViolations(page);
  const response = await page.goto('/');
  expect(response?.headers()['content-security-policy']).toBe(PREVIEW_CONTENT_SECURITY_POLICY);
  await expect(page.getByTestId('original-data-status')).toHaveText('Original game data: None in this browser.');
  await seedProductionCache(page, await groups);
  await page.reload();
  await expect(page.getByTestId('original-data-status')).toContainText('not yet verified');
  await button(page, 'Open saved resources').click();
  await expect(page.getByTestId('resource-statuses').locator('li')).toHaveText(RESTORED, { timeout: 30_000 });
  await expect(missionEntry(page)).toHaveAttribute('data-eligibility', 'eligible');
  await expectNoDevelopmentEntries(page);
}

/**
 * Takeoff from the start page: `wingman` chosen, Start, the departure placeholder over the new run at tick 0, its
 * Skip, and running flight with focus in the input zone. The store names the run, the selected slice's configuration
 * and the player.
 */
async function takeOff(page: Page, run: RunLog): Promise<RunView> {
  await chooseWingman(page, run.wingman);
  await button(page, 'Start').click();
  const departure = await waitForFrame(page, frame => frame.position === 'departure' && frame.run !== null);
  expect(departure).toMatchObject({ run: run.run, tick: 0 });
  await expect(placeholder(page)).toHaveAttribute('data-gap', 'G-02/2');
  await expect(page.getByTestId('mission-placeholder-variant')).toHaveAttribute('data-variant', run.wingman === null ? 'solo' : 'wingman');
  await expectNoDevelopmentEntries(page);
  await endPlaceholder(page, 'G-02/2', 'button');
  await expect(status(page)).toHaveAttribute('data-phase', 'running');
  await expect(zone(page)).toBeFocused();
  await expectAdvancingTick(page);
  const view = await runView(page);
  expect(view).toMatchObject({
    runId: run.run, mission: { group: 0, slot: 1, rawDifficulty: 19, wingman: run.wingman }, result: { outcome: 'in-progress' },
  });
  expect(view.tick, 'A new run from its first ticks').toBeLessThan(300);
  await expectNoDevelopmentEntries(page);
  run.steps.push(`takeoff: G-02/2 over run ${run.run} at tick 0, then running flight; group 0 / slot 1, difficulty 19, wingman ${run.wingman ?? 'none'}, player ${view.player}`);
  return view;
}

/**
 * The success run after takeoff: flight at full speed, a friendly then the enemy targeted, the craft ahead shot down,
 * a pitch, the map with the base selected by the locked cursor, the Warp, a stop, docking through the communications
 * menu, the G-02/3 hold, the base page, the launch and its G-02/4 hold, the craft by the base shot down, the G-02/8
 * ending, to the result page.
 */
async function flySuccess(page: Page, run: RunLog, takeoff: RunView): Promise<ShownResult> {
  // Flight: Backspace is full speed, and the player moves forward.
  expect(takeoff).toMatchObject({ viewMode: FLIGHT_VIEW, context: 'flight' });
  const before = takeoff.position!;
  await fullSpeed(page);
  await afterTicks(page, 16);
  const moved = (await runView(page)).position!;
  expect(moved.z, 'The player flies forward').toBeGreaterThan(before.z);
  run.steps.push(`flight: speed accepted; z ${before.z.toFixed(1)} → ${moved.z.toFixed(1)}`);

  // Targets: f a friendly, t the enemy ahead.
  await pressInZone(page, 'f');
  const friendly = (await waitForRun(page, current => current.target?.mode === 'friendly' && current.target.entityId !== null, 'f selected no friendly')).target!;
  expect([JOINT_KINDS.wingman, JOINT_KINDS.friendly]).toContain(friendly.kindBit);
  await pressInZone(page, 't');
  let view = await waitForRun(page, current => current.target?.mode === 'enemy' && current.target.entityId !== null, 't selected no enemy');
  const enemy = view.target!;
  expect(enemy.kindBit).toBe(JOINT_KINDS.ahead);
  expect(lastResults(view, 2)).toEqual(['target accepted', 'target accepted']);
  run.steps.push(`targets: f → kind ${friendly.kindBit} (entity ${friendly.entityId}), t → kind ${enemy.kindBit} (entity ${enemy.entityId})`);

  // Fire: Alt held; the gun's shots destroy the craft ahead, which leaves the target.
  const charged = view.charge;
  await holdGun(page);
  const fired = (await runView(page)).charge;
  expect(fired, 'The shots drew on the gun charge').toBeLessThan(charged!);
  view = await waitForRun(page, current => current.target?.entityId !== enemy.entityId, 'The craft ahead was not destroyed');
  expect(view.result).toEqual({ readiness: 'ready', outcome: 'in-progress' });
  run.steps.push(`fire: Alt held, charge ${charged} → ${fired}; the target left entity ${enemy.entityId}`);

  // A pitch: ] held for a few ticks turns the player.
  const facing = (await runView(page)).orientation!;
  await page.keyboard.down(']');
  await afterTicks(page, 8);
  await page.keyboard.up(']');
  expect((await runView(page)).orientation, 'The pitch turned the player').not.toEqual(facing);

  // The map: m opens it locked; it shows the craft but not the one shot down; the cursor goes to the base's contact and
  // clicks; w starts the Warp to it, which ends in flight above the base.
  const opened = await openLockedMap(page);
  expect(opened).toMatchObject({ viewMode: MAP_VIEW, context: 'map' });
  const contacts = opened.map!.contacts;
  const kinds = contacts.map(({ kindBit }) => kindBit);
  for (const kind of [JOINT_KINDS.player, JOINT_KINDS.friendly, JOINT_KINDS.base]) expect(kinds).toContain(kind);
  expect(kinds.includes(JOINT_KINDS.wingman), 'The wingman shows on the map').toBe(run.wingman !== null);
  expect(contacts.map(({ entityId }) => entityId), 'The craft shot down is gone').not.toContain(enemy.entityId);
  expect(kinds).not.toContain(JOINT_KINDS.ahead);
  expect(contacts.find(({ kindBit }) => kindBit === JOINT_KINDS.player)?.entityId).toBe(takeoff.player);
  await expectNoDevelopmentEntries(page);
  const base = contacts.find(({ kindBit }) => kindBit === JOINT_KINDS.base)!;
  await selectContact(page, JOINT_KINDS.base);
  const selected = await waitForBridge(page, current => current.map?.warpRequest === 'accepted' && current.map.destination !== null, 'The Warp gate did not accept');
  expect(selected.context).toBe('map');
  expect(selected.results.filter(({ commandType }) => commandType === 'map-point').at(-1)?.outcome).toBe('accepted');
  await page.keyboard.press('w');
  const warp = await waitForBridge(page, current => current.context === 'warp', 'The bridge did not report the Warp');
  expect(warp.viewMode).toBe(WARP_VIEW);
  expect(warp.results.filter(({ commandType }) => commandType === 'request-warp').at(-1)?.outcome).toBe('accepted');
  const arrived = await waitForBridge(page, current => current.context === 'flight' && current.map?.state === 'closed', 'The Warp did not end in flight', 30_000);
  expect(arrived.viewMode).toBe(FLIGHT_VIEW);
  const away = distance(arrived.position!, base.position);
  expect(away, 'The Warp arrives above the base').toBeLessThan(1_000);
  await expect(zone(page)).toBeFocused();
  run.steps.push(`map/Warp: map open (${kinds.length} contacts, no kind ${JOINT_KINDS.ahead}), cursor select on the base (entity ${base.entityId}), request-warp accepted, Warp view, flight ${away.toFixed(0)} units from the base`);

  // Docking: \ stops the player; c, 2, 2 request docking; the player docks at the base into the G-02/3 hold.
  await pressInZone(page, 'Backslash', 40);
  await requestDocking(page);
  view = await waitForRun(page, current => lastResults(current, 4).length === 4 && current.results.at(-1)?.commandType === 'select-number'
    && current.results.filter(({ commandType }) => commandType === 'select-number').length >= 2, 'The docking request had no results');
  expect(lastResults(view, 4)).toEqual(['speed accepted', 'communications accepted', 'select-number accepted', 'select-number accepted']);
  await awaitPlaceholder(page, 'G-02/3', 30_000);
  expect((await runView(page)).docking).toEqual({ docked: true, dockingObject: base.entityId });
  await expectNoDevelopmentEntries(page);
  const held = await expectStableTick(page);
  await holdEnded(page);
  await expect(page.getByTestId('base-page')).toBeVisible();
  await expect(page.getByTestId('base-page')).toHaveAttribute('data-base', String(base.entityId));
  expect((await shownBase(page))!.rows).toHaveLength(11);
  await expect(zone(page)).toBeFocused();
  expect((await expectAdvancingTick(page)).from).toBeGreaterThanOrEqual(held);
  expect(await runView(page)).toMatchObject({ context: 'base', docking: { docked: true, dockingObject: base.entityId } });
  await expectNoDevelopmentEntries(page);
  run.steps.push(`docking: \\ stop, c/2/2 accepted, docked at entity ${base.entityId}, G-02/3 held tick ${held}, base page with 11 rows`);

  // Launch: l leaves the base into the G-02/4 hold, then flight; the craft by the base is the target ahead.
  // The launch's hold stops the ticks at once, so nothing waits for one after l.
  await page.keyboard.press('l');
  await awaitPlaceholder(page, 'G-02/4', 15_000);
  expect(lastResults(await runView(page), 1)).toEqual(['launch accepted']);
  await holdEnded(page);
  await expect(page.getByTestId('base-page')).toHaveCount(0);
  await expect(zone(page)).toBeFocused();
  view = await waitForRun(page, current => current.target?.kindBit === JOINT_KINDS.byBase, 'The craft by the base was not targeted');
  expect(view).toMatchObject({ context: 'flight', docking: { docked: false } });
  const target = view.target!.entityId!;
  run.steps.push(`launch: l accepted, G-02/4, flight; target kind ${JOINT_KINDS.byBase} (entity ${target})`);

  // The last kill: the G-02/8 ending holds the run, and Core's result is the all-clear's success with both kills.
  await holdGun(page);
  const variant = run.wingman === null ? 'solo' : 'wingman';
  expect(await awaitPlaceholder(page, 'G-02/8')).toMatchObject({ variant, index: 0, count: 1 });
  const ending = await expectStableTick(page);
  view = await waitForRun(page, current => current.result?.outcome !== 'in-progress', 'The run did not complete');
  expect(view.result).toMatchObject({
    outcome: 'success', reason: { type: 'all-clear' }, rescuesUsed: 0, playerKills: 2, endingGaps: [{ gap: 'G-02/8', variant }], completedTick: ending,
  });
  expect(view.mission?.phase).toBe('completed');
  await expectNoDevelopmentEntries(page);
  const result = await resultPage(page);
  run.steps.push(`ending: G-02/8 ${variant} held tick ${ending}; result success all-clear, 2 kills, completed at tick ${ending}; result page`);
  return result;
}

/**
 * The failure run after takeoff: the friendly on the player destroys it at once (G-02/5 after the escape pod), the
 * rescued player flies at full speed and runs dry (G-02/6), and the third loss ends the run through G-02/7.
 */
async function flyFailure(page: Page, run: RunLog): Promise<ShownResult> {
  // The collision destroys the player in the first ticks: Core's destruction view and sequence.
  const destroyed = await waitForRun(page, current => current.viewMode === DESTRUCTION_VIEW, 'The player was not destroyed');
  expect(destroyed.mission?.phase).toBe('destruction-sequence');
  expect((await awaitPlaceholder(page, 'G-02/5')).variant).toBeNull();
  const destroyedHold = await expectStableTick(page);
  expect((await runView(page)).result).toEqual({ readiness: 'ready', outcome: 'in-progress' });
  await expectNoDevelopmentEntries(page);
  await holdEnded(page);
  await zone(page).click();
  expect((await expectAdvancingTick(page)).from).toBeGreaterThanOrEqual(destroyedHold);
  run.steps.push(`loss 1: destruction view at tick ${destroyed.tick}, G-02/5 (destroyed, rescued) held tick ${destroyedHold}, back in flight`);

  const energy = (await fullSpeed(page)).energy!;
  await waitForRun(page, current => current.energy !== null && current.energy < energy, 'The energy did not fall');
  expect((await awaitPlaceholder(page, 'G-02/6')).variant).toBeNull();
  const energyHold = await expectStableTick(page);
  await holdEnded(page);
  await zone(page).click();
  run.steps.push(`loss 2: Backspace accepted, energy falling from ${energy}, G-02/6 (energy, rescued) held tick ${energyHold}`);

  await fullSpeed(page);
  expect(await awaitPlaceholder(page, 'G-02/7')).toMatchObject({ variant: 'energy', index: 0, count: 1 });
  const ending = await expectStableTick(page);
  const view = await waitForRun(page, current => current.result?.outcome !== 'in-progress', 'The run did not complete');
  expect(view.result).toMatchObject({
    outcome: 'failure', reason: { type: 'third-loss', loss: 'energy' }, rescuesUsed: 2, playerKills: 0, endingGaps: [{ gap: 'G-02/7', variant: 'energy' }],
    completedTick: ending,
  });
  await expectNoDevelopmentEntries(page);
  const result = await resultPage(page);
  run.steps.push(`loss 3: G-02/7 energy held tick ${ending}; result failure third-loss energy, 2 rescues, completed at tick ${ending}; result page`);
  return result;
}

/**
 * The result page offers only Restart and Return; Restart leads to a new introduction and the start page with the last
 * run's wingman preselected and no run. The next takeoff checks the new run starts from tick 0.
 */
async function restart(page: Page, wingman: number | null): Promise<void> {
  await button(page, RESULT_PAGE.restart).click();
  await waitForFrame(page, frame => frame.position === 'intro');
  await expect(placeholder(page)).toHaveAttribute('data-gap', 'G-02/1');
  await endPlaceholder(page, 'G-02/1', 'button');
  expect(await checkedWingman(page), 'The start page preselects the last run\'s wingman').toBe(wingman);
  expect(await missionFrame(page)).toMatchObject({ run: null, tick: null, position: 'config' });
}

/** How a case's runs end: the variant's flight after takeoff and its result page. */
interface Case {
  readonly variant: JointLoopVariant;
  readonly wingmen: readonly (number | null)[];
  readonly fly: (page: Page, run: RunLog, takeoff: RunView) => Promise<ShownResult>;
  readonly result: ShownResult;
}

/**
 * Restores the case's variant and flies one run per wingman choice, each from takeoff to its result page, whose values
 * and controls it checks; Restart leads from one run to the next and the last returns to the main menu.
 */
async function runCase(page: Page, { variant, wingmen, fly, result }: Case): Promise<void> {
  await restoreVariant(page, variant);
  await enterMission(page);
  await endPlaceholder(page, 'G-02/1', 'button');
  const runs: RunLog[] = [];
  for (const [index, wingman] of wingmen.entries()) {
    const run: RunLog = { variant, wingman, run: index + 1, steps: [] };
    runs.push(run);
    expect(await fly(page, run, await takeOff(page, run))).toEqual(result);
    await expect(page.getByTestId('mission-result').getByRole('button')).toHaveText([RESULT_PAGE.restart, RESULT_PAGE.return]);
    await expectNoDevelopmentEntries(page);
    run.steps.push(`result page: ${result.outcome}, ${result.reason}, summary ${result.summary}, ${result.rescues} rescues, ${result.kills} kills; only Restart and Return`);
    if (index < wingmen.length - 1) {
      await restart(page, wingman);
      run.steps.push(`Restart: G-02/1, the start page with wingman ${wingman ?? 'none'} preselected`);
    }
  }
  await button(page, RESULT_PAGE.return).click();
  await expect(missionEntry(page)).toBeFocused();
  expect(await missionFrame(page)).toBeNull();
  expect(await leaveGuards(page)).toBe(0);
  expect(await violations(page)).toEqual([]);
  await test.info().attach(variant, { contentType: 'application/json', body: JSON.stringify(runs, null, 1) });
}

test('production success with and without a wingman: takeoff, flight, targets, fire, map and Warp, docking and launch, the result and Restart', async ({ page, audit }) => {
  audit.canaries({ name: 'source-fingerprint', value: PRODUCTION_PACKAGE.sourceFingerprint });
  await runCase(page, {
    variant: 'success', wingmen: [0, null], fly: flySuccess,
    result: {
      outcome: 'success', reason: 'all-clear', heading: `${RESULT_PAGE.title}: ✓ Success`, outcomeText: '✓ Success',
      reasonText: `${RESULT_PAGE.reasonLabel}: ${RESULT_PAGE.reason['all-clear']}`, summary: 'empty', summaryText: null, rescues: '0 of 2', kills: '2',
    },
  });
});

test('production failure without and with a wingman: a destroyed and an energy rescue, the third loss, the result and Restart', async ({ page, audit }) => {
  audit.canaries({ name: 'source-fingerprint', value: PRODUCTION_PACKAGE.sourceFingerprint });
  await runCase(page, {
    variant: 'failure', wingmen: [null, 0], fly: flyFailure,
    result: {
      outcome: 'failure', reason: 'third-loss:energy', heading: `${RESULT_PAGE.title}: ✗ Failure`, outcomeText: '✗ Failure',
      reasonText: `${RESULT_PAGE.reasonLabel}: ${RESULT_PAGE.reason['third-loss'].energy}`, summary: 'failure', summaryText: null, rescues: '2 of 2', kills: '0',
    },
  });
});
