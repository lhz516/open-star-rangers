vi.mock('../../core/replay/recording.ts', async (importOriginal) => {
  const original = await importOriginal<typeof RecordingModule>();
  return {
    ...original,
    createRecordingSession: (input: CreateWorldInput, options: RecordingOptions) => capacity.wrap(original.createRecordingSession(input, options)),
  };
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { CoreInputError } from '../../core/errors.ts';
import type * as RecordingModule from '../../core/replay/recording.ts';
import type { RecordingOptions, RecordingSession } from '../../core/replay/recording.ts';
import type { CreateWorldInput } from '../../core/world/create-world.ts';
import { NEUTRAL_AXES, TICK_MS } from '../runtime/game-runtime.test-support.ts';
import type { ClearInputReason, GameCommandsCancelled } from '../session/game-session.ts';
import { GameSessionError } from '../session/session-errors.ts';
import {
  developmentRecording, type MissionInputContext, type MissionInputControl, type MissionOwnerConsumer, type MissionOwnerSetup, type MissionRunInputControl,
} from './mission-owner.ts';
import { inputProbe, openMission, ownerSetup, skip, testPorts, TestConsumer, TestTimer, toDeparture, toFlight } from './mission.test-support.ts';

// P3-05 S-07, S-10 and S-14 with AC-09, AC-13 and AC-16, the owner part (Node): the mission owner's input control port
// (docs/plan/p3/05/spec.md: 生命周期与资源, 会话控制键, 清键与恢复; docs/plan/p3/04/spec.md: 消费者接线与释放). A
// recording that refuses a tick reaches the stopped phase, injected as in mission-owner-stopped.test.ts.

const capacity = vi.hoisted(() => ({
  /** The step that the recording refuses, counted per recording; null refuses none. */
  refuseAt: null as number | null,
  wrap(session: RecordingSession): RecordingSession {
    let steps = 0;
    const refuseAt = this.refuseAt;
    return new Proxy(session, {
      get(target, key) {
        const value = Reflect.get(target, key, target) as unknown;
        if (key !== 'step' || typeof value !== 'function') return typeof value === 'function' ? value.bind(target) : value;
        return (...args: unknown[]) => {
          steps += 1;
          if (steps === refuseAt) throw new CoreInputError('recording', 'would exceed the recorded tick limit');
          return (value as (...input: unknown[]) => unknown).apply(target, args);
        };
      },
    });
  },
}));

afterEach(() => { capacity.refuseAt = null; });

const RELEASED = 'the mission owner is released';
const ENDED = "requires the session's current run";
const BUSY = 'unavailable during a session notification or another intent';
/** The session's own refusal of a control in a status or cancellation notification. */
const IN_NOTIFICATION = 'control is forbidden in this notification';

const refused = (operation: string, reason: string) => expect.objectContaining({ kind: 'invalid-state', operation, reason });

const OPERATIONS = ['clearInput', 'togglePause', 'openMenu'] as const;

/** A run port's three calls, `clearInput` with `focus-loss`. */
const calls = (port: MissionRunInputControl) => OPERATIONS.map((operation) => [
  operation, () => (operation === 'clearInput' ? port.clearInput('focus-loss') : port[operation]()),
] as const);

/** Each call's outcome: `returned`, or the reason of the GameSessionError it threw. */
const outcomes = (port: MissionRunInputControl): string[] => calls(port).map(([operation, call]) => {
  try {
    call();
    return `${operation}: returned`;
  } catch (error) {
    if (!(error instanceof GameSessionError)) throw error;
    return `${operation}: ${error.reason}`;
  }
});

/** Every call refused with `reason`, as `outcomes` reports it. */
const allRefused = (reason: string): string[] => OPERATIONS.map((operation) => `${operation}: ${reason}`);

/** A mission whose first consumer is an input probe. */
async function openInput(overrides: Partial<MissionOwnerSetup> = {}) {
  const input = inputProbe();
  const setup = await openMission('mission-startable', { ...overrides, consumers: [input.consumer, ...(overrides.consumers ?? [])] });
  return { ...setup, input };
}

describe('the input control port', () => {
  it('goes to input consumers only, and gives no start, exit or step', async () => {
    const consumers = [new TestConsumer('input', 'A', []), new TestConsumer('ui', 'C', []), new TestConsumer('media', 'E', [])];
    const setup = await openInput({ consumers });
    const [input, ui, media] = consumers.map((consumer) => consumer.contexts[0]!);
    expect(Object.keys(input!).sort()).toEqual(['control', 'ownerId', 'previousClosed', 'session']);
    for (const context of [ui, media]) expect(Object.keys(context!).sort()).toEqual(['ownerId', 'previousClosed', 'session']);
    const { control } = input as MissionInputContext;
    expect(control).toBe(setup.input.control());
    expect(Object.isFrozen(control)).toBe(true);
    expect(Object.keys(control)).toEqual(['forRun']);
    expect(() => control.forRun(1)).toThrowError(refused('forRun', ENDED));

    toDeparture(setup.owner);
    const port = control.forRun(1);
    expect(Object.isFrozen(port)).toBe(true);
    expect(Object.keys(port).sort()).toEqual(['clearInput', 'openMenu', 'togglePause']);
    expect(() => control.forRun(2)).toThrowError(refused('forRun', ENDED));
  });

  it('toggles a flight between running and a user pause; a hidden page keeps it paused until visible', async () => {
    const { owner, host, input } = await openInput();
    toDeparture(owner);
    const departure = owner.getSnapshot();
    input.port().togglePause();
    expect(owner.getSnapshot()).toBe(departure);
    skip(owner);

    input.port().togglePause();
    expect(owner.getSnapshot()).toMatchObject({ flow: { position: 'flight' }, actionError: null, session: { phase: 'paused', pauseReason: 'user' } });
    input.port().togglePause();
    expect(owner.getSnapshot()).toMatchObject({ flow: { position: 'flight' }, actionError: null, session: { phase: 'running', pauseReason: null } });

    for (const pausedBy of ['hidden', 'user'] as const) {
      if (pausedBy === 'user') input.port().togglePause();
      host.emit({ type: 'visibility', visibility: 'hidden' });
      input.port().togglePause();
      expect(owner.getSnapshot(), pausedBy).toMatchObject({
        flow: { position: 'flight' }, actionError: { operation: 'resume', cause: refused('resume', 'resume requires a visible paused run') },
        session: { phase: 'paused', pauseReason: pausedBy },
      });
      host.emit({ type: 'visibility', visibility: 'visible' });
      expect(owner.getSnapshot().session, pausedBy).toMatchObject({ phase: 'paused', pauseReason: pausedBy });
      input.port().togglePause();
      expect(owner.getSnapshot(), pausedBy).toMatchObject({ actionError: null, session: { phase: 'running' } });
    }
  });

  it('resumes a run whose departure the page hid only once the page is visible', async () => {
    const { owner, host, input } = await openInput();
    toDeparture(owner);
    host.emit({ type: 'visibility', visibility: 'hidden' });
    skip(owner);
    expect(owner.getSnapshot()).toMatchObject({ flow: { position: 'flight' }, session: { phase: 'paused', pauseReason: 'hidden', resumeRequired: true } });
    input.port().togglePause();
    expect(owner.getSnapshot()).toMatchObject({ actionError: { operation: 'resume' }, session: { phase: 'paused', resumeRequired: true } });
    host.emit({ type: 'visibility', visibility: 'visible' });
    input.port().togglePause();
    expect(owner.getSnapshot()).toMatchObject({ actionError: null, session: { phase: 'running', resumeRequired: false } });

    // Hidden and visible again within the hold: the run still waits for an explicit resume.
    owner.restart();
    toDeparture(owner);
    host.emit({ type: 'visibility', visibility: 'hidden' });
    host.emit({ type: 'visibility', visibility: 'visible' });
    skip(owner);
    expect(owner.getSnapshot().session).toMatchObject({ phase: 'paused', runId: 2, pauseReason: 'hidden', resumeRequired: true, environmentVisible: true });
    input.port().togglePause();
    expect(owner.getSnapshot()).toMatchObject({ actionError: null, session: { phase: 'running', runId: 2 } });
  });

  it('opens the menu as the owner does, and does nothing more in the menu or the departure', async () => {
    const { owner, host, input } = await openInput();
    toDeparture(owner);
    const departure = owner.getSnapshot();
    input.port().openMenu();
    expect(owner.getSnapshot()).toBe(departure);
    skip(owner);

    input.port().openMenu();
    expect(owner.getSnapshot()).toMatchObject({ flow: { position: 'menu' }, session: { phase: 'paused', pauseReason: 'user' } });
    const menu = owner.getSnapshot();
    input.port().togglePause();
    input.port().openMenu();
    expect(owner.getSnapshot()).toBe(menu);
    owner.continueFromMenu();

    // A hidden pause keeps its reason in the menu, which only Continue leaves.
    host.emit({ type: 'visibility', visibility: 'hidden' });
    input.port().openMenu();
    expect(owner.getSnapshot()).toMatchObject({ flow: { position: 'menu' }, session: { phase: 'paused', pauseReason: 'hidden' } });
    host.emit({ type: 'visibility', visibility: 'visible' });
    const hiddenMenu = owner.getSnapshot();
    input.port().togglePause();
    expect(owner.getSnapshot()).toBe(hiddenMenu);
    owner.continueFromMenu();
    expect(owner.getSnapshot()).toMatchObject({ flow: { position: 'flight' }, session: { phase: 'running' } });
  });

  it.each(['faulted', 'stopped'] as const)('does nothing once the run %s', async (end) => {
    if (end === 'stopped') capacity.refuseAt = 3;
    const { owner, host, input } = await openInput({ recording: developmentRecording('osr-test') });
    toFlight(owner);
    host.deliver(0);
    if (end === 'faulted') host.requestFailure = new Error('no frame');
    host.deliver(5 * TICK_MS);
    expect(owner.getSnapshot()).toMatchObject({ flow: { position: 'ended', ended: end }, session: { phase: end, runId: 1 } });
    const ended = owner.getSnapshot();
    // The session itself refuses clear-input in both phases.
    const port = input.port();
    expect(outcomes(port)).toEqual(['clearInput: returned', 'togglePause: returned', 'openMenu: returned']);
    port.clearInput('pointer-lock-exit');
    expect(owner.getSnapshot()).toBe(ended);
  });
});

describe('clearInput', () => {
  it.each(['focus-loss', 'pointer-lock-exit'] as const)('sends a running run one clear-input for %s, without pausing', async (reason) => {
    const setup = await openInput({ recording: developmentRecording('osr-test') });
    const { owner, host, input } = setup;
    toFlight(owner);
    const run = setup.run()!;
    const notices: GameCommandsCancelled[] = [];
    run.onCommandsCancelled((notice) => { notices.push(notice); });
    host.deliver(0);
    run.setIntent({ axes: { pitch: 1, yaw: 0, roll: 0 }, primaryFire: true });
    run.submitCommand({ type: 'launch' });
    run.submitCommand({ type: 'launch' });
    const flight = owner.getSnapshot();
    input.port().clearInput(reason);
    expect(notices).toEqual([{ runId: 1, commandIds: [1, 2], reason }]);
    expect(owner.getSnapshot()).toBe(flight);
    expect(setup.session().status()).toMatchObject({ phase: 'running', pauseReason: null });
    host.deliver(TICK_MS);
    expect(run.exportRecording()!.record.ticks.at(-1)).toEqual({ axes: NEUTRAL_AXES, commands: [] });
  });

  it('does nothing while held or paused, which cleared the input already, and refuses another reason', async () => {
    const setup = await openInput();
    const { owner, input } = setup;
    toDeparture(owner);
    input.port().clearInput('focus-loss');
    skip(owner);
    const run = setup.run()!;
    const notices: GameCommandsCancelled[] = [];
    run.onCommandsCancelled((notice) => { notices.push(notice); });
    run.submitCommand({ type: 'launch' });
    owner.pause();
    input.port().clearInput('pointer-lock-exit');
    expect(notices).toEqual([{ runId: 1, commandIds: [1], reason: 'user-pause' }]);
    for (const reason of ['blur', 'hidden', undefined]) {
      expect(() => { input.port().clearInput(reason as ClearInputReason); })
        .toThrowError(expect.objectContaining({ kind: 'invalid-argument', path: 'clearInput.reason' }));
    }
  });
});

describe('identity and notification boundaries', () => {
  it('refuses the port of an earlier run or a released owner, so it never reaches a later run', async () => {
    const setup = await openInput();
    const { owner, input, slot, holder } = setup;
    toFlight(owner);
    const first = input.port();
    owner.restart();
    for (const [operation, call] of calls(first)) {
      expect(call).toThrowError(expect.objectContaining({ kind: 'invalid-state', operation, reason: ENDED, phase: 'idle', runId: null }));
    }
    expect(() => input.control().forRun(1)).toThrowError(refused('forRun', ENDED));

    toFlight(owner);
    const flight = owner.getSnapshot();
    expect(outcomes(first)).toEqual(allRefused(ENDED));
    expect(owner.getSnapshot()).toBe(flight);
    const second = input.port();

    // The next owner of the slot releases this one; its session's run 1 is not this owner's run 1.
    const next = inputProbe();
    const nextOwner = slot.open(() => ownerSetup(holder, testPorts(), { consumers: [next.consumer] }))!;
    toFlight(nextOwner);
    const nextFlight = nextOwner.getSnapshot();
    expect(nextFlight.session).toMatchObject({ phase: 'running', runId: 1 });
    for (const port of [first, second]) expect(outcomes(port)).toEqual(allRefused(RELEASED));
    expect(() => input.control().forRun(1)).toThrowError(refused('forRun', RELEASED));
    expect(nextOwner.getSnapshot()).toBe(nextFlight);
  });

  it('refuses the run a restart left ended when its cleanup failed', async () => {
    const consumer = new TestConsumer('ui', 'C', []);
    const { owner, input } = await openInput({ consumers: [consumer] });
    toFlight(owner);
    const port = input.port();
    consumer.runCleanupFailure = new Error('cleanup');
    owner.restart();
    const ended = owner.getSnapshot();
    expect(ended).toMatchObject({ flow: { position: 'ended', ended: 'cleanup-failed', runId: 1 }, session: { phase: 'idle', runId: null } });
    expect(outcomes(port)).toEqual(allRefused(ENDED));
    expect(owner.getSnapshot()).toBe(ended);
  });

  it('refuses intents in a status notification, where a run may still be wired; a clear meets the session boundary', async () => {
    const seen: string[][] = [];
    const listening: MissionOwnerConsumer<'input'> = {
      stage: 'input',
      connect: ({ session, control }) => {
        const stop = session.onStatus((status) => {
          if (status.runId !== null) seen.push([status.phase, ...outcomes(control.forRun(status.runId))]);
          return undefined;
        });
        return { release: stop };
      },
    };
    const setup = await openMission('mission-startable', { consumers: [listening] });
    const { owner, host } = setup;
    toFlight(owner);
    owner.pause();
    owner.resume();
    host.emit({ type: 'visibility', visibility: 'hidden' });
    host.emit({ type: 'visibility', visibility: 'visible' });
    // A running run's clear-input is refused by the session; other phases have nothing to clear.
    expect(seen).toEqual(['transition', 'running', 'paused', 'running', 'paused', 'paused'].map((phase) => [
      phase, `clearInput: ${phase === 'running' ? IN_NOTIFICATION : 'returned'}`, `togglePause: ${BUSY}`, `openMenu: ${BUSY}`,
    ]));
    expect(owner.getSnapshot()).toMatchObject({ flow: { position: 'flight' }, actionError: null, session: { phase: 'paused', pauseReason: 'hidden' } });
    expect(setup.session().status().error).toBeNull();
  });

  it('refuses intents in frame, lifecycle and cancellation callbacks, and clears after a frame once its notification ends', async () => {
    const seen: string[] = [];
    /** Whether the next frame and cancellation callbacks record what the port does. */
    const armed = { frame: false, cancellation: false };
    let port: MissionRunInputControl | null = null;
    const record = (callback: string, clear: boolean) => {
      const results = outcomes(port!);
      seen.push(`${callback}: ${(clear ? results : results.slice(1)).join('; ')}`);
    };
    const listening: MissionOwnerConsumer<'input'> = {
      stage: 'input',
      connect: ({ control }) => ({
        release: () => undefined,
        attachRun: (run, { runId }) => {
          port = control.forRun(runId);
          run.ownCleanup(run.onFrame(({ phase }) => {
            if (armed.frame) record(`${phase} frame`, false);
            return undefined;
          }));
          run.ownCleanup(run.onCommandsCancelled(({ reason }) => {
            if (armed.cancellation) record(`${reason} cancellation`, true);
            return undefined;
          }));
        },
      }),
    };
    const setup = await openMission('mission-startable', { consumers: [listening] });
    const { owner, host } = setup;
    toFlight(owner);
    const run = setup.run()!;
    const notices: GameCommandsCancelled[] = [];
    run.onCommandsCancelled((notice) => { notices.push(notice); });

    // A clear from a frame listener waits for the end of the frame's notification, then cancels what it queued.
    let pending: number | null = null;
    const deferred = run.onFrame(() => {
      run.submitCommand({ type: 'launch' });
      port!.clearInput('focus-loss');
      pending = notices.length;
      return undefined;
    });
    armed.frame = true;
    host.deliver(0);
    deferred();
    expect({ pending, notices }).toEqual({ pending: 0, notices: [{ runId: 1, commandIds: [1], reason: 'focus-loss' }] });

    // The port's own clear, and a hidden page with its still frame.
    run.submitCommand({ type: 'launch' });
    armed.cancellation = true;
    port!.clearInput('pointer-lock-exit');
    run.submitCommand({ type: 'launch' });
    host.emit({ type: 'visibility', visibility: 'hidden' });
    expect(seen).toEqual([
      `running frame: togglePause: ${BUSY}; openMenu: ${BUSY}`,
      `pointer-lock-exit cancellation: clearInput: ${IN_NOTIFICATION}; togglePause: ${BUSY}; openMenu: ${BUSY}`,
      `hidden cancellation: clearInput: returned; togglePause: ${BUSY}; openMenu: ${BUSY}`,
      `paused frame: togglePause: ${BUSY}; openMenu: ${BUSY}`,
    ]);
    expect(notices.map(({ commandIds, reason }) => [commandIds, reason])).toEqual([[[1], 'focus-loss'], [[2], 'pointer-lock-exit'], [[3], 'hidden']]);
    expect(owner.getSnapshot()).toMatchObject({ flow: { position: 'flight' }, actionError: null, session: { phase: 'paused', pauseReason: 'hidden', error: null } });
  });

  it('fails before the first release step, while the run still runs, and stays failed through the release', async () => {
    const log: string[] = [];
    let recording = false;
    let port: MissionRunInputControl | null = null;
    let control: MissionInputControl | null = null;
    const record = (step: string) => {
      if (recording) log.push(`${step} (${setup.session().status().phase}): ${outcomes(port!).join('; ')}`);
    };
    const input: MissionOwnerConsumer<'input'> = {
      stage: 'input',
      connect: (context) => {
        control = context.control;
        return {
          release: () => { record('input release'); },
          attachRun: (run, { runId }) => {
            port = context.control.forRun(runId);
            run.ownCleanup(() => {
              record('run cleanup');
              return undefined;
            });
          },
        };
      },
    };
    const ui: MissionOwnerConsumer = { stage: 'ui', connect: () => ({ release: () => { record('ui release'); } }) };
    const timer = new TestTimer();
    const setup = await openMission('mission-startable', {
      consumers: [input, ui],
      timer: {
        schedule: (callback, delayMs) => timer.schedule(callback, delayMs),
        cancel: (handle) => {
          record('timer cancel');
          return timer.cancel(handle);
        },
      },
    });
    // Released during the departure, whose placeholder timer is the second release step, after the holder's.
    toDeparture(setup.owner);
    recording = true;
    setup.slot.release();
    const released = allRefused(RELEASED).join('; ');
    expect(log).toEqual([
      `timer cancel (transition): ${released}`, `input release (transition): ${released}`, `run cleanup (transition): ${released}`,
      `ui release (disposed): ${released}`,
    ]);
    expect(() => control!.forRun(1)).toThrowError(refused('forRun', RELEASED));
    expect(setup.owner.getSnapshot()).toMatchObject({ released: true, session: { phase: 'disposed' } });
  });
});
