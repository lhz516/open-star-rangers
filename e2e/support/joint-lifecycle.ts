import { expect, type Page, type TestInfo } from '@playwright/test';
import type { TickInput } from '../../src/core/contracts/tick-input.ts';
import { scenarioEntryProfile } from '../../src/workers/import-scenarios.test-support.ts';
import { seedTestEntryPackage } from './ai-wingman.ts';
import { button, openTestEntry } from './app-entry.ts';
import type { AudioContextRecord } from './audio-playback.ts';
import type { ProbeSnapshot } from './browser-probes.ts';
import {
  afterTicks, awaitPlaceholder, holdEnded, holdGun, JOINT_KINDS, jointLoopPackage, openLockedMap, pressInZone, requestDocking, resultPage, selectContact,
  type JointLoopVariant,
} from './joint-loop.ts';
import { readBridgeView, readLog } from './map-warp.ts';
import type { MapView } from './map-picture.ts';
import type { ShownResult } from './mission-result.ts';
import { FLIGHT_SURFACE_LISTENERS, missionEntry } from './mission-observations.ts';
import { compareBalance, type BalanceProblem, type BalanceSnapshot } from './resource-balance.ts';
import type { NativeTarget } from './native-lifecycle.ts';

// P3-15 subtask 03 (docs/plan/p3/15/spec.md, S-03; AC-03, AC-04): observations for the joint loop's lifecycle. The
// runs use the joint loop's variant packages (e2e/support/joint-loop.ts) and its trusted-input helpers; this module adds
// what one reading of the mission owner holds (its listeners by group, frames, the loops since the previous reading,
// timers, leave guard, WebGL canvases and audio), as a page function a Playwright page and a native CDP target both
// evaluate, the expectations for each position, the timing of an explicit resume, and the native target's resource
// balance at the menu through `compareBalance`. Nothing here writes application state.

export const PROFILE = scenarioEntryProfile('mission-startable')!;
const RESTORED = ['Complete resources, viewable', /^Saved in this browser \(restored and verified in \d+(?: ms|\.\d\d s)\)$/, 'Mission loads into Core'];

/** One tick of the formal Runtime's default step, 64 ÷ 2 = 32 Hz. */
const TICK_MS = 1000 / 32;

/**
 * Opens the test entry with an empty cache and `seeds`, seeds the joint loop's `variant` under the entry's profile,
 * reloads and restores it through the main menu until the mission entry admits it.
 */
export async function restoreJointVariant(page: Page, variant: JointLoopVariant, seeds: readonly number[]): Promise<void> {
  await openTestEntry(page, { worker: 'mission-startable', seeds: seeds.join(',') });
  await expect(page.getByTestId('original-data-status')).toHaveText('Original game data: None in this browser.');
  await seedTestEntryPackage(page, await jointLoopPackage(variant));
  await page.reload();
  await expect(page.getByTestId('original-data-status')).toContainText('not yet verified');
  await button(page, 'Open saved resources').click();
  await expect(page.getByTestId('resource-statuses').locator('li')).toHaveText(RESTORED, { timeout: 30_000 });
  await expect(missionEntry(page)).toHaveAttribute('data-eligibility', 'eligible');
}

// Owner readings

/** What one reading shows of the page, its mission owner's resources and its audio. */
export interface OwnerReading {
  readonly visibility: DocumentVisibilityState;
  readonly owner: number | null;
  readonly run: number | null;
  readonly tick: number | null;
  readonly position: string | null;
  readonly phase: string | null;
  readonly pause: string | null;
  /** The most owned animation frames pending at once since the previous reading reset the count: the game loops. */
  readonly loops: number;
  /** Owned frames over the reading's own window: pending at its end, most at once, requested and delivered in it. */
  readonly frames: { readonly pending: number; readonly maximum: number; readonly requested: number; readonly delivered: number };
  readonly timers: number;
  /** One-shot timers the application has scheduled since the document loaded. */
  readonly scheduled: number;
  /** The application's `beforeunload` registrations, the owner's leave guard. */
  readonly leaveGuards: number;
  /** Active application listeners of the owner's groups, by type (sorted), each with duplicates. */
  readonly listeners: { readonly [group in 'session' | 'audio' | 'keyboard' | 'fullscreen' | 'pointer-lock' | 'render']: readonly string[] };
  /** The session's three lifecycle listeners as target:type:callback:capture, to tell one owner's from another's. */
  readonly sessionIdentity: readonly string[];
  /** Connected WebGL canvases: whether each has `WEBGL_lose_context` and lost its context. */
  readonly canvases: readonly { readonly extension: boolean; readonly lost: boolean }[];
  readonly pointerLocked: boolean;
  readonly audio: {
    /** Each context in creation order as `state:close outcomes`. */
    readonly contexts: readonly string[];
    /** Sources started so far, the indices of those still connected, and application nodes connected to a destination. */
    readonly started: number;
    readonly live: readonly number[];
    readonly routed: number;
  };
}

/**
 * Page function: reads the loops since the previous reading, then resets the frame count and reads the owner's resources
 * after `duration` ms. With 0 it uses no page timer, which a hidden page throttles: the window is then the time since the
 * previous reset (`frameMark`), and the count is reset after it. Self-contained, so a native CDP target evaluates it too;
 * the page needs the browser and audio probes.
 */
export async function ownerProbe(duration: number): Promise<OwnerReading> {
  const probe = window.osrProbe;
  const loops = probe.snapshot().frames.maximum;
  if (duration > 0) {
    probe.resetFrames();
    await new Promise(resolve => setTimeout(resolve, duration));
  }
  const snapshot = probe.snapshot();
  if (duration === 0) probe.resetFrames();
  const screen = document.querySelector<HTMLElement>('[data-testid="mission-screen"]');
  const status = document.querySelector<HTMLElement>('[data-testid="mission-status"]');
  const number = (value: string | undefined): number | null => (value === undefined || value === '' ? null : Number(value));
  const active = snapshot.listeners.filter(entry => entry.active);
  const of = (group: string) => active.filter(entry => entry.group === group).map(({ type }) => type).sort();
  const sounds = window.osrAudioProbe;
  const sources = sounds.sources();
  const { pending, maximum, requested, delivered } = snapshot.frames;
  return {
    visibility: document.visibilityState,
    owner: number(screen?.dataset.owner), run: number(screen?.dataset.run), tick: number(screen?.dataset.tick), position: screen?.dataset.position ?? null,
    phase: status?.dataset.phase ?? null, pause: status?.dataset.pause ?? null,
    loops, frames: { pending, maximum, requested, delivered },
    timers: snapshot.timers.pending.length,
    scheduled: snapshot.timers.scheduled,
    leaveGuards: active.filter(({ group, type }) => group === 'other' && type === 'beforeunload').length,
    listeners: {
      session: of('session'), audio: of('audio'), keyboard: of('keyboard'), fullscreen: of('fullscreen'), 'pointer-lock': of('pointer-lock'), render: of('render'),
    },
    sessionIdentity: active.filter(({ group }) => group === 'session').map(({ target, type, id, capture }) => `${target}:${type}:${id}:${capture}`).sort(),
    canvases: snapshot.canvases.filter(({ connected }) => connected).map(({ extension, lost }) => ({ extension, lost })),
    pointerLocked: document.pointerLockElement !== null,
    audio: {
      contexts: sounds.records().map(({ state, closes }) => `${state}:${closes.join(',')}`),
      started: sources.length,
      live: sources.flatMap(({ end }, index) => (end === null ? [index] : [])),
      routed: sounds.routed(),
    },
  };
}

/** The owner's resources a position holds besides its constant listeners. */
export interface OwnerExpectation {
  /** Pending one-shot timers: a placeholder's. */
  readonly timers: number;
  /** 1 while a run exists, from its Start to its exit (a restart or the return). */
  readonly leaveGuards: number;
  /**
   * Whether the game input zone is mounted, whose keyboard listeners join the window's five; the flight area with the
   * flight surface's one WebGL canvas shows with it.
   */
  readonly zone: boolean;
  /** Whether the run is running, so its one loop delivers frames; otherwise no frame is requested at all. */
  readonly running: boolean;
}

const SESSION = ['pagehide', 'pageshow', 'visibilitychange'];

/** Each position of the owner, as P3-04 (e2e/joint-resources.spec.ts) and this subtask's readings show it. */
export const OWNER = Object.freeze({
  intro: { timers: 1, leaveGuards: 0, zone: false, running: false },
  config: { timers: 0, leaveGuards: 0, zone: false, running: false },
  departure: { timers: 1, leaveGuards: 1, zone: false, running: false },
  running: { timers: 0, leaveGuards: 1, zone: true, running: true },
  paused: { timers: 0, leaveGuards: 1, zone: true, running: false },
  hold: { timers: 1, leaveGuards: 1, zone: false, running: false },
  result: { timers: 0, leaveGuards: 1, zone: false, running: false },
} satisfies Record<string, OwnerExpectation>);

/**
 * The owner's constant listeners (session, audio controller, keyboard source, full screen, Pointer Lock and the flight
 * surface), the flight canvas while the input zone shows, at most one loop since the previous reading, and `expected`'s timers, leave guard,
 * input zone and frames.
 */
export function expectOwner(reading: OwnerReading, expected: OwnerExpectation, label: string): void {
  const { listeners } = reading;
  expect(listeners.session, `${label}: session listeners`).toEqual(SESSION);
  expect(listeners.audio, `${label}: audio controller listeners`).toEqual(SESSION);
  expect(listeners.keyboard, `${label}: keyboard listeners`).toHaveLength(expected.zone ? 9 : 5);
  expect(listeners.fullscreen, `${label}: full-screen listeners`).toEqual(['fullscreenchange', 'fullscreenerror']);
  expect(listeners['pointer-lock'], `${label}: Pointer Lock listeners`).toHaveLength(5);
  expect(listeners.render, `${label}: render listeners`).toEqual([...FLIGHT_SURFACE_LISTENERS].sort());
  expect(reading.canvases, `${label}: the flight area's one WebGL canvas`).toEqual(expected.zone ? [{ extension: true, lost: false }] : []);
  expect(reading.loops, `${label}: game loops since the previous reading`).toBeLessThanOrEqual(1);
  if (expected.running) {
    expect(reading.frames.maximum, `${label}: game frames in flight`).toBeLessThanOrEqual(1);
    expect(reading.frames.delivered, `${label}: delivered game frames`).toBeGreaterThan(0);
  } else {
    expect(reading.frames, `${label}: no game frame`).toMatchObject({ pending: 0, maximum: 0, requested: 0 });
  }
  expect(reading.timers, `${label}: pending timers`).toBe(expected.timers);
  expect(reading.leaveGuards, `${label}: leave guards`).toBe(expected.leaveGuards);
}

/** Page function: the most owned frames pending at once since the previous reset, which it then resets. */
export function frameMark(): number {
  const { maximum } = window.osrProbe.snapshot().frames;
  window.osrProbe.resetFrames();
  return maximum;
}

/** How a case reads its page: `ownerProbe` and `frameMark`, in a Playwright page or a native target. */
export interface OwnerReader {
  owner(duration: number): Promise<OwnerReading>;
  mark(): Promise<number>;
}

/**
 * The readings of a case, each with its position's expectation, kept for the evidence attachment; the resource balance
 * keeps its own baselines and reports.
 */
export class Checkpoints {
  readonly #entries: { label: string; expected: OwnerExpectation | 'menu' | 'mark'; reading: OwnerReading | { loops: number } }[] = [];
  readonly #read: OwnerReader;

  constructor(read: OwnerReader) {
    this.#read = read;
  }

  /**
   * Reads the owner now, checks it against `expected`, and keeps both. The window is the reading's own `duration` ms,
   * or with 0 the time since the previous `mark`.
   */
  async check(label: string, expected: OwnerExpectation, duration = 400): Promise<OwnerReading> {
    const reading = await this.#read.owner(duration);
    this.#entries.push({ label, expected, reading });
    expectOwner(reading, expected, label);
    return reading;
  }

  /** Starts a window for a reading with duration 0, checking that at most one loop ran since the previous reading. */
  async mark(label: string): Promise<void> {
    const loops = await this.#read.mark();
    this.#entries.push({ label, expected: 'mark', reading: { loops } });
    expect(loops, `${label}: game loops since the previous reading`).toBeLessThanOrEqual(1);
  }

  /**
   * At the menu after the mission screen unmounted: no owner listener of any group, no frame, timer or leave guard,
   * and no loop since the previous reading; the resource balance then compares the whole document with its baseline.
   */
  async menu(label: string): Promise<OwnerReading> {
    const reading = await this.#read.owner(400);
    this.#entries.push({ label, expected: 'menu', reading });
    expect(reading.position, `${label}: the mission screen unmounted`).toBeNull();
    expect(Object.values(reading.listeners).flat(), `${label}: owner listeners`).toEqual([]);
    expect(reading.loops, `${label}: game loops since the previous reading`).toBeLessThanOrEqual(1);
    expect(reading.frames, `${label}: no game frame`).toMatchObject({ pending: 0, maximum: 0, requested: 0 });
    expect(reading, `${label}: timers and leave guard`).toMatchObject({ timers: 0, leaveGuards: 0, canvases: [] });
    return reading;
  }

  async attach(testInfo: TestInfo, name: string): Promise<void> {
    await testInfo.attach(name, { body: JSON.stringify(this.#entries, null, 1), contentType: 'application/json' });
  }
}

// Resume timing

declare global {
  interface Window {
    osrJointResume?: { event: number | null; frame: number | null; ticks: { tick: number; time: number }[]; observer: MutationObserver };
  }
}

/**
 * Page function, before an explicit resume by `type` (a trusted click or `p`): records by the page's clock that event,
 * the animation frame requested from it (the session's first frame after the resume arrives in it, as
 * e2e/native-lifecycle.spec.ts measures) and every tick the mission screen shows afterwards.
 */
export function watchResume(type: 'click' | 'keydown'): void {
  const screen = document.querySelector('[data-testid="mission-screen"]');
  if (!screen) throw new Error('No mission screen to watch');
  const record: NonNullable<Window['osrJointResume']> = {
    event: null, frame: null, ticks: [],
    observer: new MutationObserver(() => { record.ticks.push({ tick: Number(screen.getAttribute('data-tick')), time: performance.now() }); }),
  };
  window.osrJointResume = record;
  document.addEventListener(type, () => {
    record.event = performance.now();
    requestAnimationFrame(time => { record.frame = time; });
  }, { capture: true, once: true });
  record.observer.observe(screen, { attributes: true, attributeFilter: ['data-tick'] });
}

/** Page function: ends `watchResume` and returns what it recorded. */
export function stopWatchingResume() {
  const record = window.osrJointResume;
  if (!record) throw new Error('watchResume was not installed');
  record.observer.disconnect();
  delete window.osrJointResume;
  return { event: record.event, frame: record.frame, ticks: record.ticks };
}

export type ResumeTiming = ReturnType<typeof stopWatchingResume>;

/**
 * No catch-up: the resume's first frame only anchors the clock, so every tick shown afterwards is within the time since
 * that frame at 32 Hz; catching up the time spent paused or hidden would add up to five ticks (the per-frame cap) at once.
 */
export function expectNoCatchUp(timing: ResumeTiming, from: number, label: string): void {
  if (timing.event === null || timing.frame === null) throw new Error(`${label}: the resume or its frame was not recorded: ${JSON.stringify(timing)}`);
  const shown = timing.ticks.filter(({ tick }) => tick > from);
  expect(shown.length, `${label}: ticks shown after the resume`).toBeGreaterThan(0);
  for (const { tick, time } of shown) {
    expect(tick - from, `${label}: ticks shown ${(time - timing.frame).toFixed(1)} ms after the resume's first frame`)
      .toBeLessThanOrEqual(Math.floor((time - timing.frame) / TICK_MS) + 1);
  }
}

/**
 * The held key's axis in the recording: it steered before `cleared` (the tick a pause or hide stopped the run at) and
 * not from there on, though no key-up came until after the explicit resume.
 */
export function expectClearedAxis(ticks: readonly TickInput[], axis: keyof TickInput['axes'], pressed: number, cleared: number, label: string): void {
  expect(ticks.slice(pressed, cleared).some(({ axes }) => axes[axis] !== 0), `${label}: the held key steered before`).toBe(true);
  expect(ticks.length, `${label}: the recording goes on after the resume`).toBeGreaterThan(cleared + 8);
  expect(ticks.slice(cleared).map(({ axes }) => axes[axis]).filter(value => value !== 0), `${label}: the held key after the resume`).toEqual([]);
}

// The joint loop's runs

/** The development event log's entries of `types`. */
const logged = (page: Page, types: readonly string[]) => page.evaluate(readLog, [...types]);

/** Waits until the event log shows `kind` destroyed `count` times in all. */
async function destroyed(page: Page, kind: number, what: string): Promise<void> {
  await expect.poll(async () => (await logged(page, ['object-destroyed'])).some(({ fields }) => fields.kindBit === String(kind)), { message: what, timeout: 10_000 })
    .toBe(true);
}

/** Hooks a success run calls at its lifecycle points. */
export interface SuccessHooks {
  /** After the first kill, with `]` (pitch) held down; returns once it ends that hold. */
  readonly pitchHeld?: () => Promise<void>;
  /** With the map open and locked, before the base is selected. */
  readonly mapOpen?: (view: MapView) => Promise<void>;
  /** In the G-02/3 docking hold. */
  readonly hold?: () => Promise<void>;
}

/**
 * A success run after takeoff, the joint loop's inputs in its order (e2e/joint-loop.development.spec.ts asserts each
 * step): full speed, a friendly then the enemy targeted, the craft ahead shot down, a pitch, the map and the base,
 * the Warp, a stop, docking, the hold, the base page, the launch and its hold, the craft by the base shot down, G-02/8
 * and the result page.
 */
export async function flySuccess(page: Page, hooks: SuccessHooks = {}): Promise<ShownResult> {
  await pressInZone(page, 'Backspace');
  await afterTicks(page, 16);
  await pressInZone(page, 'f');
  await pressInZone(page, 't');
  await holdGun(page);
  await destroyed(page, JOINT_KINDS.ahead, 'The craft ahead destroyed');
  await page.keyboard.down(']');
  try {
    await afterTicks(page, 8);
    await hooks.pitchHeld?.();
  } finally {
    await page.keyboard.up(']');
  }
  const view = await openLockedMap(page);
  await hooks.mapOpen?.(view);
  await selectContact(page, JOINT_KINDS.base);
  await expect.poll(async () => (await page.evaluate(readBridgeView))?.map?.warpRequest, { message: 'The Warp gate accepted' }).toBe('accepted');
  await page.keyboard.press('w');
  await waitForBridgeContext(page, 'warp');
  await waitForBridgeContext(page, 'flight', 30_000);
  await pressInZone(page, 'Backslash', 40);
  await requestDocking(page);
  await awaitPlaceholder(page, 'G-02/3', 30_000);
  await hooks.hold?.();
  await holdEnded(page);
  await expect(page.getByTestId('base-page')).toBeVisible();
  await page.keyboard.press('l');
  await awaitPlaceholder(page, 'G-02/4', 15_000);
  await holdEnded(page);
  await expect(page.getByTestId('game-input-zone')).toBeFocused();
  await holdGun(page);
  await awaitPlaceholder(page, 'G-02/8');
  return resultPage(page);
}

/**
 * A failure run after takeoff (e2e/joint-loop.development.spec.ts asserts each step): the friendly destroys the player
 * at once (G-02/5), the rescued player at full speed runs dry (G-02/6), and again into the third loss (G-02/7) and the
 * result page. `hold` is called in the first hold.
 */
export async function flyFailure(page: Page, hold?: () => Promise<void>): Promise<ShownResult> {
  await awaitPlaceholder(page, 'G-02/5');
  await hold?.();
  await holdEnded(page);
  await page.getByTestId('game-input-zone').click();
  await pressInZone(page, 'Backspace');
  await awaitPlaceholder(page, 'G-02/6');
  await holdEnded(page);
  await page.getByTestId('game-input-zone').click();
  await pressInZone(page, 'Backspace');
  await awaitPlaceholder(page, 'G-02/7');
  return resultPage(page);
}

async function waitForBridgeContext(page: Page, context: string, timeout = 10_000): Promise<void> {
  await expect.poll(async () => (await page.evaluate(readBridgeView))?.context, { message: `The bridge reports ${context}`, timeout }).toBe(context);
}

// Native targets

/** The keys the native case presses: code, key and Windows virtual key code. */
const KEYS = Object.freeze({ ']': ['BracketRight', ']', 221], m: ['KeyM', 'm', 77], p: ['KeyP', 'p', 80] } as const);
type NativeKey = keyof typeof KEYS;

/** A trusted key-down or key-up by CDP input. */
export async function nativeKey(target: NativeTarget, type: 'keyDown' | 'keyUp', key: NativeKey): Promise<void> {
  const [code, name, windowsVirtualKeyCode] = KEYS[key];
  await target.command('Input.dispatchKeyEvent', { type, code, key: name, windowsVirtualKeyCode });
}

/** A trusted key press (down, then up) by CDP input. */
export async function nativePress(target: NativeTarget, key: NativeKey): Promise<void> {
  await nativeKey(target, 'keyDown', key);
  await nativeKey(target, 'keyUp', key);
}

/** Page function: the browser probes after a `duration` ms idle window, and the audio probe's contexts and routing. */
export async function balanceProbe(duration: number): Promise<Pick<BalanceSnapshot, 'probe' | 'audio'>> {
  window.osrProbe.resetFrames();
  await new Promise(resolve => setTimeout(resolve, duration));
  const probe: ProbeSnapshot = window.osrProbe.snapshot();
  const contexts: AudioContextRecord[] = window.osrAudioProbe.records();
  return { probe, audio: { contexts, routed: window.osrAudioProbe.routed() } };
}

/** A native target's menu baseline, compared as `ResourceBalance` compares a page (which needs a Playwright page). */
export class NativeBalance {
  readonly #target: NativeTarget;
  readonly baseline: BalanceSnapshot;
  readonly reports: { label: string; problems: readonly BalanceProblem[]; snapshot: BalanceSnapshot }[] = [];

  private constructor(target: NativeTarget, baseline: BalanceSnapshot) {
    this.#target = target;
    this.baseline = baseline;
  }

  static async start(target: NativeTarget): Promise<NativeBalance> {
    return new NativeBalance(target, { label: 'baseline', ...await target.evaluate(balanceProbe, 400), cache: null });
  }

  /** Waits up to 5 s for the document to show no difference from its baseline, then expects none. */
  async check(label: string): Promise<void> {
    const deadline = Date.now() + 5_000;
    let report;
    do {
      const snapshot: BalanceSnapshot = { label, ...await this.#target.evaluate(balanceProbe, 400), cache: null };
      report = { label, problems: compareBalance(this.baseline, snapshot).problems, snapshot };
    } while (report.problems.length > 0 && Date.now() < deadline);
    this.reports.push(report);
    expect(report.problems, `${label}: resource balance`).toEqual([]);
  }
}
