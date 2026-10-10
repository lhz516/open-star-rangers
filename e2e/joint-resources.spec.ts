import type { Page } from '@playwright/test';
import { button } from './support/app-entry.ts';
import { test, expect } from './support/browser-test.ts';
import {
  chooseWingman, endPlaceholder, enterMission, expectAdvancingTick, expectStableTick, frameWindow, missionEntry, waitForFrame,
} from './support/mission-observations.ts';
import { missionPackage, seedProductionCache } from './support/production-cache.ts';
import { ResourceBalance, settleTooling } from './support/resource-balance.ts';

// P3-04 subtask 11 (docs/plan/p3/04/spec.md: 消费者接线与释放; AC-09 and AC-14): three menu → mission → menu round trips
// in both builds, each with a restart, from the startable synthetic mission package seeded under the production
// identity and restored through the real menu. While the mission shows, the owner holds the session's three lifecycle
// listeners, the placeholders' one-shot timer, the leave guard while a run exists, and at most one animation frame
// while the run is running, none while held, paused, in the mission menu or before a run. Back at the menu everything
// is at the document's baseline. The mission screen has no canvas, input source or audio yet (P3-05, P3-12 to P3-14).

test.describe.configure({ timeout: 180_000 });

const RESTORED = ['Complete resources, viewable', /^Saved in this browser \(restored and verified in \d+(?: ms|\.\d\d s)\)$/, 'Mission loads into Core'];
/** The wingman confirmed on each visit: the first option, none, the last option. */
const WINGMEN = [0, null, 4] as const;

/** The owner's resources the probes show over one window of `frameWindow`. */
async function ownerResources(page: Page) {
  const snapshot = await frameWindow(page);
  const active = (group: string) => snapshot.listeners.filter(entry => entry.active && entry.group === group);
  return {
    snapshot,
    session: active('session').map(({ type }) => type).sort(),
    sessionIdentity: active('session').map(({ target, type, id, capture }) => `${target}:${type}:${id}:${capture}`).sort(),
    input: [...active('keyboard'), ...active('render')].map(({ group, type }) => `${group}:${type}`),
    leaveGuards: active('other').filter(({ type }) => type === 'beforeunload').length,
    timers: snapshot.timers.pending.length,
    frames: snapshot.frames,
  };
}
type OwnerResources = Awaited<ReturnType<typeof ownerResources>>;

const SESSION = ['pagehide', 'pageshow', 'visibilitychange'];
const IDLE = { pending: 0, maximum: 0, requested: 0 };

/** Without a running run: the session's listeners, no game frame, `timers` pending and `leaveGuards` guards. */
function expectHeld(resources: OwnerResources, timers: number, leaveGuards: number, what: string): void {
  expect(resources.session, `${what}: session listeners`).toEqual(SESSION);
  expect(resources.input, `${what}: input and render listeners`).toEqual([]);
  expect(resources.frames, `${what}: game frames`).toMatchObject(IDLE);
  expect(resources.timers, `${what}: pending timers`).toBe(timers);
  expect(resources.leaveGuards, `${what}: leave guards`).toBe(leaveGuards);
}

/** A running run: at most one game frame in flight and delivered frames, no timer, one leave guard. */
function expectRunning(resources: OwnerResources, what: string): void {
  expect(resources.session, `${what}: session listeners`).toEqual(SESSION);
  expect(resources.input, `${what}: input and render listeners`).toEqual([]);
  expect(resources.frames.maximum, `${what}: game frames in flight`).toBeLessThanOrEqual(1);
  expect(resources.frames.delivered, `${what}: delivered game frames`).toBeGreaterThan(0);
  expect(resources.timers, `${what}: pending timers`).toBe(0);
  expect(resources.leaveGuards, `${what}: leave guards`).toBe(1);
}

const status = (page: Page) => page.getByTestId('mission-status');

/** From the start page: starts, ends the departure by its skip button and waits for the running run. */
async function fly(page: Page, run: number): Promise<{ departure: OwnerResources; flight: OwnerResources }> {
  await button(page, 'Start').click();
  await waitForFrame(page, frame => frame.position === 'departure' && frame.run === run && frame.tick === 0);
  const departure = await ownerResources(page);
  expectHeld(departure, 1, 1, `run ${run} departure`);
  await endPlaceholder(page, 'G-02/2', 'button');
  await expect(status(page)).toHaveAttribute('data-phase', 'running');
  const flight = await ownerResources(page);
  expectRunning(flight, `run ${run} flight`);
  await expectAdvancingTick(page);
  return { departure, flight };
}

test('three menu → mission → menu round trips with a restart each release the owner\'s listeners, timers, leave guard and frames', async ({ page }, testInfo) => {
  const mission = missionPackage();
  await page.goto('/');
  await expect(page.getByTestId('original-data-status')).toHaveText('Original game data: None in this browser.');
  await seedProductionCache(page, await mission);
  await page.reload();
  await button(page, 'Open saved resources').click();
  await expect(page.getByTestId('resource-statuses').locator('li')).toHaveText(RESTORED, { timeout: 30_000 });
  await expect(missionEntry(page)).toHaveAttribute('data-eligibility', 'eligible');
  // `chooseWingman` checks its radio through Playwright's main-world script, whose own listeners come first.
  await settleTooling(page);
  const balance = await ResourceBalance.start(page, testInfo, { audio: false });
  const visits = [];
  let previousRelease = 0;
  let previousOwner = 0;
  for (const [index, wingman] of WINGMEN.entries()) {
    const visit = index + 1;
    // A new owner with its own session listeners, holding the introduction's timer before any run.
    const { owner } = await enterMission(page);
    expect(owner!).toBeGreaterThan(previousOwner);
    previousOwner = owner!;
    const intro = await ownerResources(page);
    expectHeld(intro, 1, 0, `visit ${visit} introduction`);
    const added = intro.snapshot.listeners.filter(entry => entry.active && entry.group === 'session').map(entry => entry.addedAt);
    expect(Math.min(...added), 'registered after the previous owner released its own').toBeGreaterThan(previousRelease);
    await endPlaceholder(page, 'G-02/1', 'button');
    const config = await ownerResources(page);
    expectHeld(config, 0, 0, `visit ${visit} start page`);
    await chooseWingman(page, wingman);
    const first = await fly(page, 1);

    // Paused and in the mission menu the run keeps its leave guard but requests no frame.
    await button(page, 'Pause').click();
    await expect(status(page)).toHaveAttribute('data-phase', 'paused');
    const paused = await ownerResources(page);
    expectHeld(paused, 0, 1, `visit ${visit} paused`);
    await expectStableTick(page);
    await button(page, 'Resume').click();
    await expect(status(page)).toHaveAttribute('data-phase', 'running');
    await button(page, 'Mission menu').click();
    await expect(page.getByTestId('mission-menu')).toBeVisible();
    const menu = await ownerResources(page);
    expectHeld(menu, 0, 1, `visit ${visit} mission menu`);
    await expectStableTick(page);

    // A restart ends the run and its guard; the owner keeps its session listeners for the next run.
    await button(page, 'Restart mission').click();
    await waitForFrame(page, frame => frame.owner === owner && frame.position === 'intro' && frame.run === null);
    const restarted = await ownerResources(page);
    expectHeld(restarted, 1, 0, `visit ${visit} restarted introduction`);
    expect(restarted.sessionIdentity).toEqual(intro.sessionIdentity);
    await endPlaceholder(page, 'G-02/1', 'button');
    const second = await fly(page, 2);
    expect(second.flight.sessionIdentity).toEqual(intro.sessionIdentity);

    await button(page, 'Mission menu').click();
    await button(page, 'Return to main menu').click();
    await expect(missionEntry(page)).toBeFocused();
    const released = await balance.check(`visit ${visit}`);
    const ended = released.snapshot.probe.listeners.filter(entry => added.includes(entry.addedAt));
    expect(ended.map(({ active, removedAt }) => !active && removedAt !== null), 'the owner\'s session listeners were removed').toEqual([true, true, true]);
    previousRelease = Math.max(...ended.map(entry => entry.removedAt!));
    console.info(`${testInfo.project.name} visit ${visit}: owner ${owner}, session 3, flight frames max ${first.flight.frames.maximum}/${second.flight.frames.maximum}, `
      + `timers intro 1 / flight 0, leave guards 1 per run, menu balanced`);
    const summary = ({ session, input, leaveGuards, timers, frames }: OwnerResources) => ({ session, input, leaveGuards, timers, frames });
    visits.push({
      visit, wingman, owner,
      positions: Object.fromEntries(Object.entries({
        intro, config, departure: first.departure, flight: first.flight, paused, menu, restarted, departure2: second.departure, flight2: second.flight,
      }).map(([position, resources]) => [position, summary(resources)])),
    });
  }
  // The balance reports keep the menu snapshots; the visits keep what each position held.
  await balance.attach();
  await testInfo.attach('joint-resource-round-trips', { body: JSON.stringify({ visits }), contentType: 'application/json' });
});
