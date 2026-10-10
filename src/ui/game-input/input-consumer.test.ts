import { describe, expect, it } from 'vitest';
import { developmentRecording, type MissionOwnerConsumer, type MissionRunInputControl } from '../../app/mission/mission-owner.ts';
import { inputProbe, openMission, toDeparture, toFlight } from '../../app/mission/mission.test-support.ts';
import type { GameEventListener } from '../../app/runtime/game-event-bus.ts';
import type { GameIntent } from '../../app/runtime/game-runtime.ts';
import { NEUTRAL_AXES, TICK_MS } from '../../app/runtime/game-runtime.test-support.ts';
import type { GameCommandsCancelled, GameSessionRun } from '../../app/session/game-session.ts';
import { RollbackError } from '../../app/session/rollback-error.ts';
import type { DomainEvent } from '../../core/contracts/domain-events.ts';
import type { Command, TickAxes, TickInput } from '../../core/contracts/tick-input.ts';
import type { Projection } from '../../core/projections/projection.ts';
import type { KeyboardInput, KeyboardSignal, KeyboardSink, KeyboardSource, KeyboardZoneBinding } from '../../platform/input/keyboard-input.ts';
import { createKeyboardSource, type KeyboardHost, type KeyboardPageEventType, type KeyboardZoneEventType } from '../../platform/input/keyboard-source.ts';
import { createGameCommandFeedback, type GameCommandFeedback } from '../game/game-command-feedback.ts';
import { createGameSessionBridge } from '../game/game-session-bridge.ts';
import { createGameStore, type GameStoreWriter } from '../game/game-store.ts';
import { down, TEST_BINDINGS, up, type KeyPatch } from './game-input.test-support.ts';
import type { InputContext } from './input-action.ts';
import { createInputConsumer, type GameInputConsumer } from './input-consumer.ts';

// P3-05 subtask 20 (Node): the input consumer on a real mission owner, Session and Runtime driven by a ControlledHost, a
// fake keyboard source, the test binding table and the real command feedback (docs/plan/p3/05/spec.md: 输入上下文,
// 操纵, 开火, 离散命令与重复, 会话控制键, 页面层拦截, 清键与恢复, 生命周期与资源; S-04, S-05, S-07, S-08, S-10, S-14;
// AC-03 to AC-06, AC-09, AC-11 and AC-13, the Node part). Development recording gives each tick's real input. Core
// reports no interaction context but flight yet, so context changes are synthetic: the run handle the consumer gets
// shows `Tools.context` in its projections and frames.

/** A keyboard source the test drives; it hands events and signals to the connected sink as the platform source does. */
class FakeKeyboard implements KeyboardSource, KeyboardZoneBinding<string> {
  sink: KeyboardSink | null = null;
  zone: string | null = null;
  eligible = false;
  connects = 0;
  releases = 0;
  connectFailure: unknown;
  releaseFailure: unknown;
  /** Runs as the release begins, while the listeners still exist, as a browser callback arriving then would. */
  duringRelease: ((sink: KeyboardSink) => void) | null = null;

  readonly bind = (zone: string | null): void => { this.zone = zone; };

  connect(sink: KeyboardSink): () => void {
    this.connects += 1;
    if (this.connectFailure !== undefined) throw this.connectFailure;
    this.sink = sink;
    sink.signal({ type: 'initial', eligible: this.eligible });
    return () => {
      this.releases += 1;
      this.duringRelease?.(sink);
      this.sink = null;
      if (this.releaseFailure !== undefined) throw this.releaseFailure;
    };
  }

  signal(type: KeyboardSignal['type'], eligible: boolean): void {
    this.eligible = eligible;
    this.sink!.signal(Object.freeze({ type, eligible }));
  }

  /** Delivers one event; returns whether its default is prevented. */
  key(event: KeyboardInput): boolean {
    return this.sink!.key(event, this.eligible);
  }

  press(code: string, patch?: KeyPatch): boolean {
    return this.key(down(code, patch));
  }

  lift(code: string, patch?: KeyPatch): boolean {
    return this.key(up(code, patch));
  }
}

/** What the instrumented input consumer sees and does, and the failures a test injects. */
interface Tools {
  /** Each call through a run port, as `<operation>[ <reason>]`. */
  readonly calls: string[];
  /** Each intent the consumer set. */
  readonly intents: GameIntent[];
  /** The interaction context the consumer's run handle shows instead of Core's; null shows Core's. */
  context: InputContext | null;
  setIntentFailure?: unknown;
  portFailure?: unknown;
  /** The 1-based `ownCleanup` call that throws, counted over all runs. */
  ownFailureAt?: number;
  owned: number;
  /** Thrown by the cancellation of the consumer's cancellation subscription. */
  cancelFailure?: unknown;
  /** The consumer's cancellation listeners, so a test can deliver a notice again. */
  readonly cancellations: ((notice: GameCommandsCancelled) => undefined)[];
}

function shown(projection: Projection, { context }: Tools): Projection {
  return context === null ? projection : Object.freeze({ ...projection, player: Object.freeze({ ...projection.player, interactionContext: context }) });
}

function instrumentedRun(run: GameSessionRun, tools: Tools): GameSessionRun {
  return Object.freeze({
    runId: run.runId,
    setIntent: (intent) => {
      tools.intents.push(intent);
      if (tools.setIntentFailure !== undefined) throw tools.setIntentFailure;
      run.setIntent(intent);
    },
    submitCommand: (command) => run.submitCommand(command),
    on<T extends DomainEvent['type']>(type: T, listener: GameEventListener<Extract<DomainEvent, { type: T }>>) {
      return run.on(type, listener);
    },
    onAny: (listener) => run.onAny(listener),
    onFrame: (listener) => run.onFrame((frame) => listener(Object.freeze({ ...frame, projection: shown(frame.projection, tools) }))),
    onCommandsCancelled: (listener) => {
      tools.cancellations.push(listener);
      const cancel = run.onCommandsCancelled(listener);
      const failure = tools.cancelFailure;
      return failure === undefined ? cancel : () => {
        cancel();
        throw failure;
      };
    },
    ownCleanup: (cleanup) => {
      tools.owned += 1;
      if (tools.owned === tools.ownFailureAt) throw new Error('ownCleanup refused');
      return run.ownCleanup(cleanup);
    },
    projection: () => shown(run.projection(), tools),
    renderFrame: () => run.renderFrame(),
    snapshot: () => run.snapshot(),
    exportRecording: () => run.exportRecording(),
  } satisfies GameSessionRun);
}

function instrumentedPort(port: MissionRunInputControl, tools: Tools): MissionRunInputControl {
  const call = (name: string, action: () => void): void => {
    tools.calls.push(name);
    if (tools.portFailure !== undefined) throw tools.portFailure;
    action();
  };
  return {
    clearInput: (reason) => { call(`clear-input ${reason}`, () => { port.clearInput(reason); }); },
    togglePause: () => { call('toggle-pause', () => { port.togglePause(); }); },
    openMenu: () => { call('open-menu', () => { port.openMenu(); }); },
  };
}

/** Connects `consumer` through instrumented run ports and run handles. */
function instrumented(consumer: GameInputConsumer<string>, tools: Tools): MissionOwnerConsumer<'input'> {
  return {
    stage: 'input',
    connect: (context) => {
      const control = { forRun: (runId: number) => instrumentedPort(context.control.forRun(runId), tools) };
      const connection = consumer.connect({ ...context, control });
      return { ...connection, attachRun: (run, runContext) => { connection.attachRun!(instrumentedRun(run, tools), runContext); } };
    },
  };
}

interface Submission {
  /** Null when the feedback refused it. */
  readonly id: number | null;
  readonly type: Command['type'];
  /** The run's `projection.clock.clock` as it was submitted. */
  readonly clock: number;
}

/**
 * An owner with a recording, the input consumer on a fake keyboard and the test bindings, and a `ui` consumer that
 * creates the store, bridge and command feedback as the app's assembly does.
 */
async function setup({ pointerLocked, consumers = [] }: {
  readonly pointerLocked?: () => boolean;
  /** Connected after the input and `ui` consumers. */
  readonly consumers?: readonly MissionOwnerConsumer[];
} = {}) {
  const keyboard = new FakeKeyboard();
  const tools: Tools = { calls: [], intents: [], context: null, owned: 0, cancellations: [] };
  let ui: { readonly store: GameStoreWriter; readonly feedback: GameCommandFeedback } | null = null;
  const uiConsumer: MissionOwnerConsumer = {
    stage: 'ui',
    connect: ({ ownerId, session }) => {
      const store = createGameStore(ownerId);
      const feedback = createGameCommandFeedback(store);
      const bridge = createGameSessionBridge({ store, clock: () => 0, consumers: [feedback] });
      bridge.bind(session);
      ui = { store, feedback };
      return { release: () => { bridge.unbind(); }, onSessionError: bridge.onError };
    },
  };
  const submitted: Submission[] = [];
  const feedback = { connected: true, reads: 0 };
  const consumer = createInputConsumer<string>({
    keyboard: () => keyboard,
    bindings: TEST_BINDINGS,
    feedback: () => {
      feedback.reads += 1;
      const connected = feedback.connected ? ui : null;
      return connected && {
        submit: (command: Command) => {
          const id = connected.feedback.submit(command);
          submitted.push({ id, type: command.type, clock: mission.run()!.projection().clock.clock });
          return id;
        },
      };
    },
    pointerLocked,
  });
  const mission = await openMission('mission-startable', {
    recording: developmentRecording('osr-test'), consumers: [instrumented(consumer, tools), uiConsumer, ...consumers],
  });
  return { ...mission, keyboard, tools, consumer, submitted, feedback, store: () => ui!.store };
}

/** `setup` in flight: the run's first frame anchored at clock 0, and the input zone focused. */
async function flying(options: Parameters<typeof setup>[0] = {}) {
  const context = await setup(options);
  toFlight(context.owner);
  const run = context.run()!;
  /** Every command result: its commandId (null for automatic fire), type and the tick that executed it. */
  const results: { readonly id: number | null; readonly type: Command['type']; readonly tick: number }[] = [];
  run.on('command-result', (event, { commandId }) => {
    results.push({ id: commandId, type: event.commandType, tick: event.tick });
    return undefined;
  });
  const cancelled: GameCommandsCancelled[] = [];
  run.onCommandsCancelled((notice) => {
    cancelled.push(notice);
    return undefined;
  });
  let now = 0;
  context.host.deliver(now);
  context.keyboard.signal('focusin', true);
  return {
    ...context, run, results, cancelled,
    /** Delivers the next frame `ticks` ticks of host time later; after a pause the first one only anchors. */
    frame(ticks = 1) {
      now += ticks * TICK_MS;
      context.host.deliver(now);
    },
    /** The real input of each recorded tick, the first tick first. */
    ticks: (): readonly TickInput[] => run.exportRecording()!.record.ticks,
    clock: () => run.projection().clock.clock,
  };
}

const axes = (pitch: number, yaw: number, roll: number): TickAxes => ({ pitch, yaw, roll });
const intent = (pitch: number, yaw: number, roll: number, primaryFire = false): GameIntent => ({ axes: axes(pitch, yaw, roll), primaryFire });
const PRIMARY: Command = { type: 'fire', channel: 'primary' };
const NEUTRAL: TickInput = { axes: NEUTRAL_AXES, commands: [] };
const tickInput = (tickAxes: TickAxes, ...commands: Command[]): TickInput => ({ axes: tickAxes, commands });

describe('intent', () => {
  it('sets the complete intent only when its value changes, and only while running', async () => {
    const f = await flying();
    const { keyboard, tools } = f;
    keyboard.press('KeyI');
    keyboard.press('KeyI', { repeat: true });
    keyboard.press('ShiftLeft', { shiftKey: true });
    keyboard.press('KeyJ', { shiftKey: true });
    keyboard.press('ControlLeft', { shiftKey: true, ctrlKey: true });
    keyboard.lift('ControlLeft', { shiftKey: true });
    keyboard.press('KeyK', { shiftKey: true });
    expect(tools.intents).toEqual([intent(-1, 0, 0), intent(-1, -1, 0), intent(-1, 0, -1), intent(-1, -1, 0), intent(0, -1, 0)]);
    f.frame();
    expect(f.ticks().at(-1)).toEqual(tickInput(axes(0, -1, 0)));

    // Paused: the session cleared the intent itself, so nothing is set, and no steering key takes hold.
    f.owner.pause();
    keyboard.press('KeyL');
    f.owner.resume();
    f.frame(0);
    f.frame();
    expect(tools.intents).toHaveLength(5);
    expect(f.ticks().at(-1)).toEqual(NEUTRAL);
    expect(tools.calls).toEqual([]);
  });

  it('masks a left Ctrl the AltGr key may have added, and lets Alt fire while steering', async () => {
    const { keyboard, tools } = await flying();
    keyboard.press('KeyJ');
    keyboard.press('ControlLeft', { ctrlKey: true });
    keyboard.press('AltRight', { ctrlKey: true, altKey: true, altGraph: true });
    keyboard.lift('AltRight', { ctrlKey: true });
    keyboard.lift('ControlLeft');
    expect(tools.intents).toEqual([intent(0, -1, 0), intent(0, 0, -1), intent(0, -1, 0, true), intent(0, -1, 0)]);
  });

  it('publishes the neutral intent as a frame shows a new context, and never restores the old keys', async () => {
    const f = await flying();
    const { keyboard, tools } = f;
    keyboard.press('KeyI');
    keyboard.press('AltLeft', { altKey: true });
    f.frame();
    expect(f.ticks().at(-1)).toEqual(tickInput(axes(-1, 0, 0), PRIMARY));

    tools.context = 'map';
    f.frame();
    // The frame's own tick ran before it showed the map; the neutral intent applies from the next tick on.
    expect(tools.intents.at(-1)).toEqual(intent(0, 0, 0));
    f.frame(2);
    expect(f.ticks().slice(-2)).toEqual([NEUTRAL, NEUTRAL]);

    // In the map, the axes stay 0 and fire is off; the map's own command still works.
    const intents = tools.intents.length;
    keyboard.press('KeyK');
    keyboard.press('AltRight', { altKey: true });
    keyboard.press('KeyM', { altKey: true });
    expect(tools.intents).toHaveLength(intents);
    expect(f.submitted.map(({ type }) => type)).toEqual(['toggle-map']);

    // Back in flight, keys held since the map or since the last flight stay neutral until pressed anew.
    tools.context = 'flight';
    f.frame();
    f.frame();
    expect(f.ticks().at(-1)).toEqual(NEUTRAL);
    keyboard.lift('KeyI', { altKey: true });
    keyboard.press('KeyI', { altKey: true });
    f.frame();
    expect(f.ticks().at(-1)).toEqual(tickInput(axes(-1, 0, 0)));

    // Warp steers but does not fire.
    tools.context = 'warp';
    f.frame();
    keyboard.press('KeyJ', { altKey: true });
    keyboard.lift('AltLeft', { altKey: true });
    keyboard.press('AltLeft', { altKey: true });
    f.frame();
    expect(f.ticks().at(-1)).toEqual(tickInput(axes(0, -1, 0)));
    expect(tools.calls).toEqual([]);
  });

  it('shows a failure to set the intent in the input status; only the next new press that goes through clears it', async () => {
    const { keyboard, tools, consumer } = await flying({ pointerLocked: () => true });
    const failure = new Error('intent refused');
    tools.setIntentFailure = failure;
    keyboard.press('KeyI');
    const error = { operation: 'set-intent', cause: failure, serial: 1 };
    expect(consumer.status.getState().error).toEqual(error);
    tools.setIntentFailure = undefined;
    // A release that changes the intent, an OS repeat and an Esc that only Pointer Lock gets are no new press that went through.
    keyboard.lift('KeyI');
    keyboard.press('KeyJ', { repeat: true });
    keyboard.press('Escape');
    expect(consumer.status.getState().error).toEqual(error);
    keyboard.press('KeyJ');
    expect(consumer.status.getState().error).toBeNull();
  });
});

describe('primary and secondary fire', () => {
  it('holds fire while an Alt is held, keeps one tick for a short press, and needs a new press after focus returns', async () => {
    const f = await flying();
    const { keyboard } = f;
    keyboard.press('AltLeft', { altKey: true });
    f.frame(3);
    expect(f.ticks().slice(-3)).toEqual(Array(3).fill(tickInput(NEUTRAL_AXES, PRIMARY)));
    keyboard.lift('AltLeft');
    f.frame();
    expect(f.ticks().at(-1)).toEqual(NEUTRAL);

    // Short presses between two ticks: one tick fires, however many there were.
    keyboard.press('AltLeft', { altKey: true });
    keyboard.lift('AltLeft');
    keyboard.press('AltRight', { altKey: true });
    keyboard.lift('AltRight');
    f.frame(2);
    expect(f.ticks().slice(-2)).toEqual([tickInput(NEUTRAL_AXES, PRIMARY), NEUTRAL]);

    // Both Alts: releasing one keeps the level, releasing both ends it.
    keyboard.press('AltLeft', { altKey: true });
    keyboard.press('AltRight', { altKey: true });
    keyboard.lift('AltLeft', { altKey: true });
    f.frame();
    keyboard.lift('AltRight');
    f.frame();
    expect(f.ticks().slice(-2)).toEqual([tickInput(NEUTRAL_AXES, PRIMARY), NEUTRAL]);

    // Focus loss ends it; neither focus, a repeat nor an Alt flag restores it.
    keyboard.press('AltLeft', { altKey: true });
    keyboard.signal('blur', false);
    keyboard.signal('focus', true);
    keyboard.press('AltLeft', { altKey: true, repeat: true });
    keyboard.press('KeyI', { altKey: true });
    f.frame();
    expect(f.ticks().at(-1)).toEqual(tickInput(axes(-1, 0, 0)));
  });

  it('fires one secondary per new Space press, alongside Alt, steering, a Shift preset and a Ctrl combination', async () => {
    const f = await flying();
    const { keyboard } = f;
    keyboard.press('AltLeft', { altKey: true });
    keyboard.press('KeyI', { altKey: true });
    keyboard.press('Space', { altKey: true });
    keyboard.press('Space', { altKey: true, repeat: true });
    keyboard.press('Digit1', { altKey: true, shiftKey: true });
    keyboard.press('ControlLeft', { altKey: true, ctrlKey: true });
    keyboard.press('Enter', { altKey: true, ctrlKey: true });
    expect(f.submitted).toEqual([
      { id: 1, type: 'fire', clock: 0 }, { id: 2, type: 'speed-preset', clock: 0 }, { id: 3, type: 'speed', clock: 0 },
    ]);
    f.frame();
    expect(f.ticks().at(-1)).toEqual(tickInput(
      axes(-1, 0, 0), PRIMARY, { type: 'fire', channel: 'secondary' }, { type: 'speed-preset', level: 1 }, { type: 'speed', operation: 'toggle-auto-match' },
    ));
  });
});

describe('commands and their repeat', () => {
  it('enqueues at once, repeats at c + 32 and then the observed clock + 16, at most once a frame, and never catches up', async () => {
    const f = await flying();
    const { keyboard } = f;
    f.frame(3);
    keyboard.press('Equal');
    f.frame();
    for (let frame = 0; frame < 14; frame += 1) f.frame();
    expect(f.clock()).toBe(36);
    expect(f.submitted.map(({ clock }) => clock)).toEqual([6]);
    f.frame();
    f.frame(5);
    f.frame(5);
    // No ticks, so the same clock: nothing is due again.
    f.frame(0);
    // A late frame, capped at 5 ticks: one repeat, the next due from the clock it was observed at.
    f.frame(10);
    f.frame(5);
    f.frame(5);
    f.frame(5);
    keyboard.lift('Equal');
    f.frame(5);
    f.frame(5);
    expect(f.submitted).toEqual([6, 38, 58, 78, 98].map((clock, index) => ({ id: index + 1, type: 'speed', clock })));
    // Each runs in the tick after the frame that submitted it, never in the due tick itself.
    expect(f.results).toEqual([4, 20, 30, 40, 50].map((tick, index) => ({ id: index + 1, type: 'speed', tick })));
  });

  it('repeats held keys in first-press order, and stops one whose Shift or Ctrl now selects another action', async () => {
    const f = await flying();
    const { keyboard } = f;
    keyboard.press('KeyS');
    keyboard.press('Equal');
    keyboard.press('Space');
    for (let frame = 0; frame < 16; frame += 1) f.frame();
    expect(f.submitted.slice(3).map(({ type, clock }) => [type, clock])).toEqual([['energy', 32], ['speed', 32], ['fire', 32]]);

    // Shift turns S into the opposite energy step and leaves Space unbound; Equal accepts it. Releasing Shift revives
    // nothing.
    keyboard.press('ShiftLeft', { shiftKey: true });
    keyboard.lift('ShiftLeft');
    for (let frame = 0; frame < 8; frame += 1) f.frame();
    expect(f.submitted.slice(6).map(({ type, clock }) => [type, clock])).toEqual([['speed', 48]]);
    // Ctrl leaves Equal unbound too.
    keyboard.press('ControlLeft', { ctrlKey: true });
    keyboard.lift('ControlLeft');
    for (let frame = 0; frame < 16; frame += 1) f.frame();
    expect(f.submitted).toHaveLength(7);
  });

  it('shows a full queue through the feedback, ends that key\'s repeat and never retries', async () => {
    const f = await flying();
    const { keyboard, run, store } = f;
    for (let command = 0; command < 256; command += 1) run.submitCommand({ type: 'launch' });
    keyboard.press('Space');
    expect(f.submitted).toEqual([{ id: null, type: 'fire', clock: 0 }]);
    expect(store().reader.getState()).toMatchObject({
      actionError: { operation: 'fire', cause: expect.objectContaining({ kind: 'invalid-state', reason: 'command-queue-full' }) },
      pendingCommands: [],
    });
    expect(f.consumer.status.getState().error).toBeNull();

    // Held past its due while the queue drains: no second attempt.
    for (let frame = 0; frame < 8; frame += 1) f.frame(5);
    expect(f.submitted).toHaveLength(1);
    keyboard.lift('Space');
    keyboard.press('Space');
    expect(f.submitted.at(-1)).toEqual({ id: 257, type: 'fire', clock: 80 });
  });

  it('relates each commandId to its result or cancellation through the feedback', async () => {
    const f = await flying();
    const { keyboard, store } = f;
    keyboard.press('KeyT');
    expect(store().reader.getState().pendingCommands).toEqual([{ ownerId: 1, runId: 1, commandId: 1, commandType: 'target' }]);
    f.frame();
    keyboard.lift('KeyT');
    keyboard.press('KeyT');
    keyboard.signal('focusout', false);
    const { pendingCommands, recentResults } = store().reader.getState();
    expect(pendingCommands).toEqual([]);
    expect(f.results).toEqual([{ id: 1, type: 'target', tick: 1 }]);
    expect(recentResults.map(({ commandId, outcome, reason }) => [commandId, outcome, reason])).toEqual([
      [1, 'rejected', 'not-implemented'], [2, 'cancelled', 'focus-loss'],
    ]);
  });

  it('shows a missing feedback in the input status and ends the key\'s repeat', async () => {
    const f = await flying();
    f.feedback.connected = false;
    f.keyboard.press('Space');
    expect(f.consumer.status.getState().error).toMatchObject({ operation: 'submit', cause: new Error('The command feedback is not connected') });
    const reads = f.feedback.reads;
    for (let frame = 0; frame < 4; frame += 1) f.frame(5);
    expect(f.feedback.reads).toBe(reads);
  });

  it('marks a G-item press in the input status without a command, a pause or a held state', async () => {
    const f = await flying();
    const { keyboard, consumer } = f;
    expect(keyboard.press('F2')).toBe(true);
    keyboard.press('F2', { repeat: true });
    expect(consumer.status.getState().gap).toEqual({ gap: 'G-08', serial: 1 });
    keyboard.lift('F2');
    keyboard.press('F2');
    keyboard.press('KeyA');
    keyboard.press('F11');
    expect(consumer.status.getState().gap).toEqual({ gap: 'G-10', serial: 4 });
    f.frame();
    expect(f.submitted).toEqual([]);
    expect(f.ticks().at(-1)).toEqual(NEUTRAL);
    expect(f.session().status().phase).toBe('running');
  });
});

describe('session control keys', () => {
  it('toggles the pause with p, through the owner, in flight and in the map', async () => {
    const f = await flying();
    const { keyboard, owner, tools } = f;
    keyboard.press('KeyP');
    expect(owner.getSnapshot().session).toMatchObject({ phase: 'paused', pauseReason: 'user' });
    keyboard.lift('KeyP');
    keyboard.press('KeyP', { shiftKey: true });
    expect(owner.getSnapshot().session).toMatchObject({ phase: 'running' });
    keyboard.lift('KeyP', { shiftKey: true });
    tools.context = 'map';
    f.frame(0);
    f.frame();
    keyboard.press('KeyP');
    expect(owner.getSnapshot().session).toMatchObject({ phase: 'paused', pauseReason: 'user' });
    expect(tools.calls).toEqual(['toggle-pause', 'toggle-pause', 'toggle-pause']);
  });

  it('opens the menu with an Esc the page received outside Pointer Lock, in flight, Warp and the base but not the map', async () => {
    let locked = true;
    const f = await flying({ pointerLocked: () => locked });
    const { keyboard, owner, tools } = f;
    expect(keyboard.press('Escape')).toBe(false);
    keyboard.lift('Escape');
    expect(owner.getSnapshot().flow.position).toBe('flight');
    locked = false;
    tools.context = 'map';
    f.frame();
    keyboard.press('Escape');
    keyboard.lift('Escape');
    expect(owner.getSnapshot()).toMatchObject({ flow: { position: 'flight' }, session: { phase: 'running' } });
    for (const context of ['flight', 'warp', 'base'] as const) {
      tools.context = context;
      keyboard.press('Escape');
      keyboard.lift('Escape');
      expect(owner.getSnapshot(), context).toMatchObject({ flow: { position: 'menu' }, session: { phase: 'paused', pauseReason: 'user' } });
      // In the menu neither key bypasses it: only Continue leaves it.
      keyboard.press('KeyP');
      keyboard.lift('KeyP');
      expect(owner.getSnapshot(), context).toMatchObject({ flow: { position: 'menu' }, session: { phase: 'paused' } });
      owner.continueFromMenu();
    }
    expect(tools.calls).toEqual(['open-menu', 'toggle-pause', 'open-menu', 'toggle-pause', 'open-menu', 'toggle-pause']);
  });

  it('does nothing during the departure, and resumes a hidden pause once visible', async () => {
    const s = await setup();
    const { keyboard, owner, host } = s;
    toDeparture(owner);
    keyboard.signal('focusin', true);
    const departure = owner.getSnapshot();
    keyboard.press('KeyP');
    keyboard.press('Escape');
    expect(owner.getSnapshot()).toBe(departure);
    expect(s.tools.calls).toEqual(['toggle-pause', 'open-menu']);
    keyboard.lift('KeyP');
    keyboard.lift('Escape');

    owner.skip(owner.getSnapshot().placeholder!.id);
    host.emit({ type: 'visibility', visibility: 'hidden' });
    keyboard.signal('visibilitychange', false);
    host.emit({ type: 'visibility', visibility: 'visible' });
    keyboard.signal('visibilitychange', true);
    expect(owner.getSnapshot().session).toMatchObject({ phase: 'paused', pauseReason: 'hidden' });
    keyboard.press('KeyP');
    expect(owner.getSnapshot().session).toMatchObject({ phase: 'running' });
  });

  it('shows a refused control in the input status, until the next run', async () => {
    const f = await flying();
    const failure = new Error('port refused');
    f.tools.portFailure = failure;
    f.keyboard.press('KeyP');
    expect(f.consumer.status.getState().error).toEqual({ operation: 'toggle-pause', cause: failure, serial: 1 });
    f.owner.restart();
    expect(f.consumer.status.getState().error).not.toBeNull();
    toFlight(f.owner);
    expect(f.consumer.status.getState().error).toBeNull();
  });

  it('keeps a failure the same press reported, even as its intent change went through', async () => {
    const f = await flying();
    f.keyboard.press('KeyI');
    // The next key reads Warp from the run, which clears the held key; its own action then fails.
    f.tools.context = 'warp';
    f.tools.portFailure = new Error('port refused');
    f.keyboard.press('KeyP');
    expect(f.tools.intents.at(-1)).toEqual(intent(0, 0, 0));
    expect(f.consumer.status.getState().error).toMatchObject({ operation: 'toggle-pause', serial: 1 });
  });
});

describe('page interception', () => {
  it('prevents the defaults the page interception decides, only while the zone qualifies', async () => {
    const f = await flying();
    const { keyboard } = f;
    const decisions = Object.fromEntries([
      ['KeyI', () => keyboard.press('KeyI')], ['KeyI up', () => keyboard.lift('KeyI')], ['KeyQ', () => keyboard.press('KeyQ')],
      ['AltLeft', () => keyboard.press('AltLeft', { altKey: true })], ['AltLeft up', () => keyboard.lift('AltLeft')],
      ['Ctrl+KeyQ', () => keyboard.press('KeyQ', { ctrlKey: true })], ['Ctrl+KeyJ', () => keyboard.press('KeyJ', { ctrlKey: true })],
      ['Tab', () => keyboard.press('Tab')], ['F12', () => keyboard.press('F12')], ['Meta+KeyI', () => keyboard.press('KeyI', { metaKey: true })],
    ].map(([name, deliver]) => [name, (deliver as () => boolean)()]));
    expect(decisions).toEqual({
      KeyI: true, 'KeyI up': true, KeyQ: false, AltLeft: true, 'AltLeft up': true, 'Ctrl+KeyQ': false, 'Ctrl+KeyJ': true, Tab: false,
      F12: false, 'Meta+KeyI': false,
    });
    keyboard.signal('focusout', false);
    expect([keyboard.press('KeyI'), keyboard.press('AltLeft', { altKey: true })]).toEqual([false, false]);
  });
});

describe('clearing and recovery', () => {
  it('sends one clear-input per focus loss while running; the session cancels each command once; only a new press restores', async () => {
    const f = await flying();
    const { keyboard, tools } = f;
    keyboard.press('KeyI');
    keyboard.press('AltLeft', { altKey: true });
    keyboard.press('KeyT', { altKey: true });
    keyboard.press('Space', { altKey: true });
    keyboard.signal('focusout', false);
    keyboard.signal('blur', false);
    expect(tools.calls).toEqual(['clear-input focus-loss']);
    expect(f.cancelled).toEqual([{ runId: 1, commandIds: [1, 2], reason: 'focus-loss' }]);
    f.frame(5);
    expect(f.ticks().slice(-5)).toEqual(Array(5).fill(NEUTRAL));

    keyboard.signal('focus', false);
    keyboard.signal('focusin', true);
    keyboard.press('KeyI', { repeat: true });
    keyboard.press('Space', { repeat: true });
    // Past the Space repeat's old due at clock 32.
    for (let frame = 0; frame < 4; frame += 1) f.frame(5);
    expect(f.clock()).toBe(50);
    expect(f.ticks().slice(-20)).toEqual(Array(20).fill(NEUTRAL));
    expect(f.submitted).toHaveLength(2);
    keyboard.lift('KeyI');
    keyboard.press('KeyI');
    f.frame();
    expect(f.ticks().at(-1)).toEqual(tickInput(axes(-1, 0, 0)));

    // An unbound zone loses qualification too, and so does an event that finds the zone no longer qualified; a later
    // clear finds nothing left to cancel.
    keyboard.press('KeyT');
    keyboard.signal('unbind', false);
    keyboard.signal('bind', true);
    keyboard.eligible = false;
    keyboard.press('KeyR');
    f.consumer.clear('pointer-lock-exit');
    expect(tools.calls).toEqual(['clear-input focus-loss', 'clear-input focus-loss', 'clear-input focus-loss', 'clear-input pointer-lock-exit']);
    expect(f.cancelled.map(({ commandIds, reason }) => [commandIds, reason])).toEqual([[[1, 2], 'focus-loss'], [[3], 'focus-loss']]);
  });

  it('follows each cancellation notice once per command, also for a clear sent past it', async () => {
    const other = inputProbe();
    const f = await flying({ consumers: [other.consumer] });
    const { keyboard, tools } = f;
    keyboard.press('KeyJ');
    keyboard.press('Space');
    // The queued Space makes the session report this clear; clears meant for the input go through `clear` instead.
    other.port().clearInput('pointer-lock-exit');
    expect(f.cancelled).toEqual([{ runId: 1, commandIds: [1], reason: 'pointer-lock-exit' }]);
    // Ctrl finds no held J to route to roll, and Space no longer repeats.
    keyboard.press('ControlLeft', { ctrlKey: true });
    keyboard.lift('ControlLeft');
    for (let frame = 0; frame < 4; frame += 1) f.frame(5);
    expect(f.ticks()).toEqual(Array(20).fill(NEUTRAL));
    expect({ intents: tools.intents, submitted: f.submitted.length }).toEqual({ intents: [intent(0, -1, 0)], submitted: 1 });

    // The same notice again does not clear a key pressed since, which would leave the run's intent stuck.
    keyboard.press('KeyI');
    for (const listener of tools.cancellations) listener({ runId: 1, commandIds: [1], reason: 'pointer-lock-exit' });
    keyboard.lift('KeyI');
    f.frame();
    expect(f.ticks().at(-1)).toEqual(NEUTRAL);
    expect(tools.calls).toEqual([]);
  });

  it.each(['the keyboard first', 'the session first'])('clears only the local state on hidden and pagehide, %s', async (order) => {
    const f = await flying();
    const { keyboard, host, tools } = f;
    const hide = [
      () => { keyboard.signal('visibilitychange', false); },
      () => { host.emit({ type: 'visibility', visibility: 'hidden' }); },
    ];
    keyboard.press('KeyI');
    keyboard.press('Space');
    for (const step of order === 'the keyboard first' ? hide : hide.reverse()) step();
    expect(f.session().status()).toMatchObject({ phase: 'paused', pauseReason: 'hidden' });
    expect(f.cancelled).toEqual([{ runId: 1, commandIds: [1], reason: 'hidden' }]);
    host.emit({ type: 'visibility', visibility: 'visible' });
    keyboard.signal('visibilitychange', true);
    keyboard.press('KeyP');

    keyboard.press('KeyI');
    const pagehide = [() => { keyboard.signal('pagehide', false); }, () => { host.emit({ type: 'pagehide' }); }];
    for (const step of order === 'the keyboard first' ? pagehide : pagehide.reverse()) step();
    expect(f.session().status()).toMatchObject({ phase: 'paused', pauseReason: 'hidden' });
    host.emit({ type: 'pageshow', visibility: 'visible' });
    keyboard.signal('pageshow', true);
    keyboard.lift('KeyP');
    keyboard.press('KeyP');
    f.frame(0);
    // Past the Space repeat's old due at clock 32.
    for (let frame = 0; frame < 4; frame += 1) f.frame(5);
    expect(f.clock()).toBe(40);
    expect(f.ticks()).toEqual(Array(20).fill(NEUTRAL));
    expect(f.submitted).toHaveLength(1);
    expect(tools.calls).toEqual(['toggle-pause', 'toggle-pause']);
  });

  it('only clears locally as the status pauses, stops or faults the run, and restores nothing after', async () => {
    const f = await flying();
    const { keyboard, owner, host, tools } = f;
    keyboard.press('KeyI');
    keyboard.press('Space');
    owner.pause();
    owner.resume();
    f.frame(0);
    for (let frame = 0; frame < 8; frame += 1) f.frame(5);
    expect(f.ticks().slice(-40)).toEqual(Array(40).fill(NEUTRAL));
    expect(f.submitted).toHaveLength(1);

    keyboard.lift('KeyI');
    keyboard.press('KeyI');
    host.requestFailure = new Error('no frame');
    f.frame();
    expect(f.session().status().phase).toBe('faulted');
    keyboard.press('KeyT');
    keyboard.signal('blur', false);
    expect({ calls: tools.calls, submitted: f.submitted.length, focusHint: f.consumer.status.getState().focusHint })
      .toEqual({ calls: [], submitted: 1, focusHint: false });
  });

  it('starts each run neutral, on the same keyboard source', async () => {
    const f = await flying();
    const { keyboard, owner, host, tools } = f;
    keyboard.press('KeyI');
    keyboard.press('Space');
    owner.restart();
    toFlight(owner);
    const second = f.session().currentRun()!;
    let now = 1_000;
    host.deliver(now);
    for (let frame = 0; frame < 8; frame += 1) host.deliver(now += 5 * TICK_MS);
    expect(second.exportRecording()!.record.ticks).toEqual(Array(40).fill(NEUTRAL));
    keyboard.press('KeyK');
    host.deliver(now + TICK_MS);
    expect(second.exportRecording()!.record.ticks.at(-1)).toEqual(tickInput(axes(1, 0, 0)));
    expect({ submitted: f.submitted.length, connects: keyboard.connects, releases: keyboard.releases, calls: tools.calls })
      .toEqual({ submitted: 1, connects: 1, releases: 0, calls: [] });
  });

  it('shows the focus hint while a running or paused run lacks a qualified zone', async () => {
    const s = await setup();
    const hint = () => s.consumer.status.getState().focusHint;
    const seen = [hint()];
    toDeparture(s.owner);
    seen.push(hint());
    s.owner.skip(s.owner.getSnapshot().placeholder!.id);
    seen.push(hint());
    s.keyboard.signal('focusin', true);
    seen.push(hint());
    s.owner.pause();
    s.keyboard.signal('focusout', false);
    seen.push(hint());
    s.owner.restart();
    seen.push(hint());
    expect(seen).toEqual([false, false, true, false, true, false]);
  });
});

describe('lifecycle', () => {
  it('binds the zone given before or after connecting, and connects to one owner once', async () => {
    const keyboard = new FakeKeyboard();
    const consumer = createInputConsumer<string>({ keyboard: () => keyboard, bindings: TEST_BINDINGS, feedback: () => null });
    consumer.bindZone('early');
    const { owner } = await openMission('mission-startable', { consumers: [consumer] });
    expect(keyboard.zone).toBe('early');
    consumer.bindZone('late');
    consumer.bindZone(null);
    expect(keyboard.zone).toBeNull();
    expect(() => consumer.connect({} as never)).toThrowError('An input consumer connects to one owner, once');
    expect(keyboard.connects).toBe(1);
    owner.release();
  });

  it('invalidates first on release, so a late callback does nothing, then disconnects', async () => {
    const f = await flying();
    const { keyboard, tools } = f;
    keyboard.press('KeyI');
    const late: boolean[] = [];
    keyboard.duringRelease = (sink) => {
      late.push(sink.key(down('KeyT'), true), sink.key(up('KeyI'), true));
      sink.signal({ type: 'blur', eligible: false });
    };
    const intents = tools.intents.length;
    f.slot.release();
    expect({ late, releases: keyboard.releases, calls: tools.calls, intents: tools.intents.length, submitted: f.submitted })
      .toEqual({ late: [false, false], releases: 1, calls: [], intents, submitted: [] });
    expect(f.onCleanupFailure).not.toHaveBeenCalled();
  });

  it('makes a failed disconnection the owner\'s cleanup failure', async () => {
    const f = await flying();
    const failure = new Error('listener removal failed');
    f.keyboard.releaseFailure = failure;
    f.slot.release();
    expect(f.onCleanupFailure).toHaveBeenCalledWith(failure);
  });

  it('fails the owner\'s creation when the keyboard source cannot connect', async () => {
    const keyboard = new FakeKeyboard();
    const failure = new Error('listener registration failed');
    keyboard.connectFailure = failure;
    const consumer = createInputConsumer<string>({ keyboard: () => keyboard, bindings: TEST_BINDINGS, feedback: () => null });
    await expect(openMission('mission-startable', { consumers: [consumer] })).rejects.toBe(failure);
  });

  it('rolls back a partly wired run: a registration it could not hand over is cancelled, failing as a RollbackError', async () => {
    const s = await setup();
    const { keyboard, owner, tools } = s;
    tools.ownFailureAt = 3;
    const cancelFailure = new Error('cancellation failed');
    tools.cancelFailure = cancelFailure;
    toDeparture(owner);
    const { startFailure } = owner.getSnapshot().flow;
    expect(startFailure).toMatchObject({ kind: 'assembly', stage: 'consumer', rolledBack: true });
    const cause = (startFailure as { readonly cause: unknown }).cause as RollbackError;
    expect(cause).toBeInstanceOf(RollbackError);
    expect(cause.errors).toEqual([new Error('ownCleanup refused'), cancelFailure]);

    // The rollback ended the run, which undid the wiring; the next start wires its run in full.
    keyboard.signal('focusin', true);
    keyboard.press('KeyT');
    expect(s.submitted).toEqual([]);
    tools.cancelFailure = undefined;
    owner.start();
    owner.skip(owner.getSnapshot().placeholder!.id);
    keyboard.press('KeyI');
    expect(tools.intents).toEqual([intent(-1, 0, 0)]);
  });
});

/** A keyboard host whose listeners a test calls, for the platform keyboard source. */
class TestKeyboardHost implements KeyboardHost<string> {
  readonly keys = new Map<string, Set<(input: KeyboardInput, preventDefault: () => void) => void>>();
  readonly others = new Map<string, Set<() => void>>();
  focused: string | null = null;

  readFacts(zone: string) {
    return { elementFocused: this.focused === zone, windowFocused: true, visible: true };
  }

  listenKey(zone: string, type: KeyboardInput['type'], listener: (input: KeyboardInput, preventDefault: () => void) => void): () => void {
    return this.#add(this.keys, `${zone} ${type}`, listener);
  }

  listenZone(zone: string, type: KeyboardZoneEventType, listener: () => void): () => void {
    return this.#add(this.others, `${zone} ${type}`, listener);
  }

  listenPage(type: KeyboardPageEventType, listener: () => void): () => void {
    return this.#add(this.others, type, listener);
  }

  get listeners(): number {
    return [...this.keys.values(), ...this.others.values()].reduce((sum, set) => sum + set.size, 0);
  }

  focus(zone: string | null): void {
    const previous = this.focused;
    this.focused = zone;
    if (previous !== null) for (const listener of [...this.others.get(`${previous} focusout`) ?? []]) listener();
    if (zone !== null) for (const listener of [...this.others.get(`${zone} focusin`) ?? []]) listener();
  }

  /** Dispatches to `zone`; returns whether a listener prevented the default. */
  dispatch(zone: string, input: KeyboardInput): boolean {
    let prevented = false;
    for (const listener of [...this.keys.get(`${zone} ${input.type}`) ?? []]) listener(input, () => { prevented = true; });
    return prevented;
  }

  #add<T>(map: Map<string, Set<T>>, key: string, listener: T): () => void {
    const set = map.get(key) ?? new Set<T>();
    map.set(key, set);
    set.add(listener);
    return () => { set.delete(listener); };
  }
}

describe('on the platform keyboard source', () => {
  it('follows the bound zone, acts on its events and removes every listener on release', async () => {
    const host = new TestKeyboardHost();
    const tools: Tools = { calls: [], intents: [], context: null, owned: 0, cancellations: [] };
    const consumer = createInputConsumer<string>({ keyboard: () => createKeyboardSource(host), bindings: TEST_BINDINGS, feedback: () => null });
    consumer.bindZone('zone');
    const mission = await openMission('mission-startable', { recording: developmentRecording('osr-test'), consumers: [instrumented(consumer, tools)] });
    toFlight(mission.owner);
    mission.host.deliver(0);
    host.focus('zone');
    expect([host.dispatch('zone', down('KeyI')), host.dispatch('zone', down('KeyQ'))]).toEqual([true, false]);
    // A replaced zone's events no longer reach the consumer; focus leaving the bound zone clears.
    consumer.bindZone('other');
    expect(host.dispatch('zone', down('KeyK'))).toBe(false);
    expect(tools.calls).toEqual(['clear-input focus-loss']);
    host.focus('other');
    host.dispatch('other', down('KeyK'));
    mission.host.deliver(TICK_MS);
    expect(mission.run()!.exportRecording()!.record.ticks).toEqual([tickInput(axes(1, 0, 0))]);
    expect(tools.intents).toEqual([intent(-1, 0, 0), intent(1, 0, 0)]);

    mission.slot.release();
    expect(host.listeners).toBe(0);
  });
});
