import type { Page } from '@playwright/test';
import { RESULT_PAGE } from '../src/ui/mission/slice-gaps-copy.ts';
import { button } from './support/app-entry.ts';
import { installAudioProbe } from './support/audio-playback.ts';
import { test, expect } from './support/browser-test.ts';
import { audioReading, closedContexts as closed } from './support/flight-audio.ts';
import {
  chooseWingman, endPlaceholder, enterMission, expectAdvancingTick, expectStableTick, FLIGHT_SURFACE_LISTENERS, frameWindow, missionEntry, waitForFrame,
} from './support/mission-observations.ts';
import { tabTo } from './support/keyboard-input.ts';
import { endingPackage } from './support/mission-result.ts';
import { missionPackage, seedProductionCache } from './support/production-cache.ts';
import { ResourceBalance, settleTooling } from './support/resource-balance.ts';

// P3-04 subtask 11 (docs/plan/p3/04/spec.md: 消费者接线与释放; AC-09 and AC-14): three menu → mission → menu round trips
// in both builds, each with a restart, from the startable synthetic mission package seeded under the production
// identity and restored through the real menu. While the mission shows, the owner holds the session's three lifecycle
// listeners, the placeholders' one-shot timer, the leave guard while a run exists, and at most one animation frame
// while the run is running, none while held, paused, in the mission menu or before a run. Back at the menu everything
// is at the document's baseline. The owner's flight surface (P3-12) holds its render listeners while the owner exists and
// draws no frame of its own. P3-14 subtask 23 (spec 模式与生命周期; AC-10, AC-12): the owner's flight sound controller
// holds its three lifecycle listeners from its close barrier to its release, and creates its one audio context in the
// first trusted Start; a restart keeps that context and ends the old run's voices before the new run's start, and a
// result page ends every voice before its return. Silence is judged by the contexts' state and close outcomes and the
// sources still connected, never by an analyser, which keeps its last frame once a context stops rendering.

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
    audio: active('audio').map(({ type }) => type).sort(),
    sessionIdentity: active('session').map(({ target, type, id, capture }) => `${target}:${type}:${id}:${capture}`).sort(),
    keyboard: active('keyboard').map(({ type }) => type).sort(),
    fullscreen: active('fullscreen').map(({ type }) => type).sort(),
    pointerLock: active('pointer-lock').map(({ type }) => type).sort(),
    render: active('render').map(({ type }) => type).sort(),
    leaveGuards: active('other').filter(({ type }) => type === 'beforeunload').length,
    timers: snapshot.timers.pending.length,
    frames: snapshot.frames,
  };
}
type OwnerResources = Awaited<ReturnType<typeof ownerResources>>;

const SESSION = ['pagehide', 'pageshow', 'visibilitychange'];
const IDLE = { pending: 0, maximum: 0, requested: 0 };

/** Without a running run: the session's listeners, no game frame, `timers` pending and `leaveGuards` guards. */
function expectHeld(resources: OwnerResources, timers: number, leaveGuards: number, what: string, zoneBound = false): void {
  expect(resources.session, `${what}: session listeners`).toEqual(SESSION);
  expect(resources.audio, `${what}: audio controller listeners`).toEqual(SESSION);
  expect(resources.keyboard, `${what}: keyboard listener count`).toHaveLength(zoneBound ? 9 : 5);
  expect(resources.fullscreen, `${what}: full-screen listeners`).toEqual(['fullscreenchange', 'fullscreenerror']);
  expect(resources.pointerLock, `${what}: Pointer Lock listeners`).toHaveLength(5);
  expect(resources.render, `${what}: render listeners`).toEqual(FLIGHT_SURFACE_LISTENERS);
  expect(resources.frames, `${what}: game frames`).toMatchObject(IDLE);
  expect(resources.timers, `${what}: pending timers`).toBe(timers);
  expect(resources.leaveGuards, `${what}: leave guards`).toBe(leaveGuards);
}

/** A running run: at most one game frame in flight and delivered frames, no timer, one leave guard. */
function expectRunning(resources: OwnerResources, what: string): void {
  expect(resources.session, `${what}: session listeners`).toEqual(SESSION);
  expect(resources.audio, `${what}: audio controller listeners`).toEqual(SESSION);
  expect(resources.keyboard, `${what}: keyboard listeners`).toHaveLength(9);
  expect(resources.fullscreen, `${what}: full-screen listeners`).toEqual(['fullscreenchange', 'fullscreenerror']);
  expect(resources.pointerLock, `${what}: Pointer Lock listeners`).toHaveLength(5);
  expect(resources.render, `${what}: render listeners`).toEqual(FLIGHT_SURFACE_LISTENERS);
  expect(resources.frames.maximum, `${what}: game frames in flight`).toBeLessThanOrEqual(1);
  expect(resources.frames.delivered, `${what}: delivered game frames`).toBeGreaterThan(0);
  expect(resources.timers, `${what}: pending timers`).toBe(0);
  expect(resources.leaveGuards, `${what}: leave guards`).toBe(1);
}

const status = (page: Page) => page.getByTestId('mission-status');

/** The page's audio contexts, sources and voice graphs, without the clock, which runs on between reads. */
const audio = async (page: Page) => {
  const { contexts, started, live, routed } = await page.evaluate(audioReading);
  return { contexts, started, live, routed };
};

/** Restores the seeded package through the real menu until the mission entry admits it. */
async function restore(page: Page): Promise<void> {
  await page.reload();
  await button(page, 'Open saved resources').click();
  await expect(page.getByTestId('resource-statuses').locator('li')).toHaveText(RESTORED, { timeout: 30_000 });
  await expect(missionEntry(page)).toHaveAttribute('data-eligibility', 'eligible');
}

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

test('three menu → mission → menu round trips with a restart each release the owner\'s listeners, audio, timers, leave guard and frames', async ({ page }, testInfo) => {
  const mission = missionPackage();
  await page.addInitScript(installAudioProbe);
  await page.goto('/');
  await expect(page.getByTestId('original-data-status')).toHaveText('Original game data: None in this browser.');
  await seedProductionCache(page, await mission);
  await restore(page);
  // `chooseWingman` checks its radio through Playwright's main-world script, whose own listeners come first.
  await settleTooling(page);
  const balance = await ResourceBalance.start(page, testInfo);
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
    // Each earlier visit's context is closed; this owner has none before its Start.
    expect(await audio(page), `visit ${visit} introduction: audio`).toMatchObject({ contexts: closed(index), live: [], routed: 0 });
    await endPlaceholder(page, 'G-02/1', 'button');
    const config = await ownerResources(page);
    expectHeld(config, 0, 0, `visit ${visit} start page`);
    await chooseWingman(page, wingman);
    const first = await fly(page, 1);
    // The trusted Start created the owner's one context, and the run sounds.
    const sounding = await audio(page);
    expect(sounding.contexts, `visit ${visit} run 1: audio contexts`).toEqual([...closed(index), 'running:']);
    expect(sounding.live.length, `visit ${visit} run 1: sounding voices`).toBeGreaterThan(0);
    expect(sounding.routed, `visit ${visit} run 1: their graphs`).toBeGreaterThan(0);

    // Paused and in the mission menu the run keeps its leave guard but requests no frame.
    await button(page, 'Pause').click();
    await expect(status(page)).toHaveAttribute('data-phase', 'paused');
    const paused = await ownerResources(page);
    expectHeld(paused, 0, 1, `visit ${visit} paused`, true);
    await expectStableTick(page);
    await expect(button(page, 'Resume')).toBeFocused();
    await page.keyboard.press('Space');
    await expect(status(page)).toHaveAttribute('data-phase', 'running');
    await button(page, 'Mission menu').click();
    await expect(page.getByTestId('mission-menu')).toBeVisible();
    const menu = await ownerResources(page);
    expectHeld(menu, 0, 1, `visit ${visit} mission menu`);
    await expectStableTick(page);

    // A restart ends the run and its guard; the owner keeps its session listeners for the next run.
    await expect(page.getByRole('heading', { name: 'Mission menu', exact: true })).toBeFocused();
    await tabTo(page, button(page, 'Restart mission'));
    await page.keyboard.press('Enter');
    await waitForFrame(page, frame => frame.owner === owner && frame.position === 'intro' && frame.run === null);
    const restarted = await ownerResources(page);
    expectHeld(restarted, 1, 0, `visit ${visit} restarted introduction`);
    expect(restarted.sessionIdentity).toEqual(intro.sessionIdentity);
    // The restart ended run 1's voices and kept the owner's context; nothing sounds before run 2.
    const between = await audio(page);
    expect(between.contexts, `visit ${visit} restarted: the same context, open`).toEqual([...closed(index), expect.stringMatching(/^(?:running|suspended):$/)]);
    expect(between, `visit ${visit} restarted: run 1's voices and their graphs`).toMatchObject({ live: [], routed: 0 });
    await endPlaceholder(page, 'G-02/1', 'button');
    const second = await fly(page, 2);
    expect(second.flight.sessionIdentity).toEqual(intro.sessionIdentity);
    // Run 2 sounds in the same context with voices of its own only, started after the restart.
    const resounding = await audio(page);
    expect(resounding.contexts, `visit ${visit} run 2: the same context`).toEqual([...closed(index), 'running:']);
    expect(resounding.routed, `visit ${visit} run 2: its voices' graphs`).toBeGreaterThan(0);
    expect(resounding.live.length, `visit ${visit} run 2: sounding voices`).toBeGreaterThan(0);
    expect(resounding.live.every(source => source >= between.started), `visit ${visit} run 2: only its own voices`).toBe(true);

    await button(page, 'Mission menu').click();
    await tabTo(page, button(page, 'Return to main menu'));
    await page.keyboard.press('Space');
    await expect(missionEntry(page)).toBeFocused();
    const released = await balance.check(`visit ${visit}`);
    expect((await audio(page)).contexts, `visit ${visit}: every context closed`).toEqual(closed(index + 1));
    const ended = released.snapshot.probe.listeners.filter(entry => added.includes(entry.addedAt));
    expect(ended.map(({ active, removedAt }) => !active && removedAt !== null), 'the owner\'s session listeners were removed').toEqual([true, true, true]);
    previousRelease = Math.max(...ended.map(entry => entry.removedAt!));
    console.info(`${testInfo.project.name} visit ${visit}: owner ${owner}, session 3, flight frames max ${first.flight.frames.maximum}/${second.flight.frames.maximum}, `
      + `timers intro 1 / flight 0, leave guards 1 per run, menu balanced`);
    const summary = ({ session, audio: controller, keyboard, fullscreen, pointerLock, render, leaveGuards, timers, frames }: OwnerResources) =>
      ({ session, audio: controller, keyboard, fullscreen, pointerLock, render, leaveGuards, timers, frames });
    visits.push({
      visit, wingman, owner, audio: { run1: sounding, restarted: between, run2: resounding },
      positions: Object.fromEntries(Object.entries({
        intro, config, departure: first.departure, flight: first.flight, paused, menu, restarted, departure2: second.departure, flight2: second.flight,
      }).map(([position, resources]) => [position, summary(resources)])),
    });
  }
  // The balance reports keep the menu snapshots; the visits keep what each position held.
  await balance.attach();
  await testInfo.attach('joint-resource-round-trips', { body: JSON.stringify({ visits }), contentType: 'application/json' });
});

test('a result page ends every voice of the run before its return, which closes the owner\'s one context and balances the menu', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await page.addInitScript(installAudioProbe);
  await page.goto('/');
  await expect(page.getByTestId('original-data-status')).toHaveText('Original game data: None in this browser.');
  // The startable mission whose all-clear ends it by its own rules, whatever the seed and input (support/mission-result.ts).
  await seedProductionCache(page, await endingPackage('success'));
  await restore(page);
  await settleTooling(page);
  const balance = await ResourceBalance.start(page, testInfo);
  try {
    await enterMission(page);
    await endPlaceholder(page, 'G-02/1', 'button');
    await chooseWingman(page, null);
    await button(page, 'Start').click();
    await waitForFrame(page, frame => frame.position === 'departure' && frame.run === 1);
    await endPlaceholder(page, 'G-02/2', 'button');
    await expect(status(page)).toHaveAttribute('data-phase', 'running');
    await expect.poll(async () => (await audio(page)).live.length, { message: 'the run sounds' }).toBeGreaterThan(0);
    const flying = await audio(page);
    expect(flying.contexts).toEqual(['running:']);

    // The ending placeholder follows the latched result, which ended the run's sound (DW-11): no voice is connected and
    // none starts while it shows, or on the result page; the owner keeps its context until it is released.
    const placeholder = page.getByTestId('mission-placeholder');
    await expect(placeholder).toHaveAttribute('data-gap', 'G-02/8', { timeout: 60_000 });
    await expect(placeholder).toHaveAttribute('data-status', 'timing');
    const ending = await audio(page);
    expect(ending, 'the ending placeholder: connected voices and graphs').toMatchObject({ live: [], routed: 0 });
    await expect(button(page, 'Skip')).toBeFocused();
    await button(page, 'Skip').click();
    await waitForFrame(page, frame => frame.position === 'result');
    await expect(page.getByTestId('mission-result')).toBeVisible();
    await expectStableTick(page, 400);
    const result = await audio(page);
    expect(result, 'the result page: no voice, nothing started').toEqual({ ...ending, contexts: [expect.stringMatching(/^(?:running|suspended):$/)] });

    await button(page, RESULT_PAGE.return).click();
    await expect(missionEntry(page)).toBeFocused();
    await balance.check('after the result page\'s return');
    expect(await audio(page)).toEqual({ ...result, contexts: closed(1) });
    await testInfo.attach('result-audio', { body: JSON.stringify({ flying, ending, result }), contentType: 'application/json' });
  } finally {
    await balance.attach();
  }
});
