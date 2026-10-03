import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as SceneModule from '../../core/synthetic/synthetic-scene.ts';
import { createSyntheticScene, type SyntheticSceneConfig, type TickInput } from '../../core/synthetic/synthetic-scene.ts';
import { RollbackError } from '../../app/session/rollback-error.ts';
import { GameSessionError } from '../../app/session/session-errors.ts';
import type { SessionStatus, SyntheticSession } from '../../app/session/synthetic-session.ts';
import {
  normalizeKeyboardInput, type KeyboardInput, type KeyboardSignal, type KeyboardSink, type KeyboardSource,
} from '../../platform/input/keyboard-input.ts';
import {
  createKeyboardSource, type KeyboardFacts, type KeyboardHost, type KeyboardLifecycleType,
} from '../../platform/input/keyboard-source.ts';
import { createSyntheticGameControls } from './synthetic-game-controls.ts';
import {
  createSyntheticKeyboardInput, SYNTHETIC_KEYBOARD_BINDINGS, type SyntheticKeyboardOptions,
} from './synthetic-keyboard-input.ts';
import { setupCommandFeedback } from './synthetic-ui.test-support.ts';

const injection = vi.hoisted(() => ({ failOn: 0, calls: 0, cause: new Error('Core injection') }));
vi.mock('../../core/synthetic/synthetic-scene.ts', async importOriginal => {
  const original = await importOriginal<typeof SceneModule>();
  return {
    ...original,
    createSyntheticScene(config: SyntheticSceneConfig) {
      const scene = original.createSyntheticScene(config);
      return {
        inspect: () => scene.inspect(), uiProjection: () => scene.uiProjection(), renderState: () => scene.renderState(),
        step(input: TickInput) {
          injection.calls++;
          if (injection.calls === injection.failOn) throw injection.cause;
          return scene.step(input);
        },
      };
    },
  };
});

const cleanups: (() => void)[] = [];
beforeEach(() => { injection.calls = 0; });
afterEach(() => {
  injection.failOn = 0;
  vi.restoreAllMocks();
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});

function event(code: string, patch: Partial<KeyboardInput> & { shiftKey?: boolean } = {}): KeyboardInput {
  return normalizeKeyboardInput({
    type: 'keydown', code, repeat: false, ctrlKey: false, altKey: false, metaKey: false, isComposing: false, ...patch,
  });
}

class Source implements KeyboardSource {
  sink: KeyboardSink | null = null;
  eligible = true;
  releases = 0;
  failure: unknown;
  onRelease: () => void = () => {};
  connect(sink: KeyboardSink): () => void {
    this.sink = sink;
    sink.signal({ type: 'initial', eligible: this.eligible });
    if (this.failure !== undefined) throw this.failure;
    return () => { this.releases++; this.onRelease(); };
  }
  key(code: string, patch: Partial<KeyboardInput> & { shiftKey?: boolean } = {}): boolean {
    if (!this.sink) throw new Error('Source has not connected');
    return this.sink.key(event(code, patch), this.eligible);
  }
  signal(type: KeyboardSignal['type'], eligible: boolean): void {
    this.eligible = eligible;
    this.sink?.signal({ type, eligible });
  }
}

function setup(source = new Source(), options?: SyntheticKeyboardOptions) {
  const context = setupCommandFeedback({ scene: { seed: 0, tickRateHz: 50 }, recording: { checkpointInterval: 2 } });
  let inStatus = false;
  const statusCallbacks: ((status: SessionStatus) => undefined)[] = [];
  const releaseOrder: string[] = [];
  const session: SyntheticSession = {
    ...context.observedSession,
    onStatus: listener => {
      statusCallbacks.push(listener);
      const stop = context.observedSession.onStatus(status => {
        inStatus = true;
        try { return listener(status); } finally { inStatus = false; }
      });
      return () => { releaseOrder.push('status'); stop(); };
    },
  };
  const realControls = createSyntheticGameControls(context.writer, session);
  const controlCalls: string[] = [];
  const keyboard = createSyntheticKeyboardInput({
    store: context.writer, session, bridge: context.bridge, feedback: context.feedback,
    controls: { control: type => { expect(inStatus).toBe(false); controlCalls.push(type); realControls.control(type); } },
  }, options ?? { source });
  cleanups.push(() => { keyboard.dispose(); context.bridge.unbind(); context.session.control({ type: 'dispose' }); });
  const start = () => {
    context.session.control({ type: 'start' });
    const binding = context.bridge.currentRun();
    if (!binding) throw new Error('Missing binding');
    const setInput = binding.setInput.bind(binding);
    vi.spyOn(binding, 'setInput').mockImplementation(input => { expect(inStatus).toBe(false); setInput(input); });
    context.host.deliver(0);
  };
  const tick = (now: number) => { context.clock.now = now; context.host.deliver(now); };
  const axes = () => context.recorded.inputs.map(({ runId, input }) => [runId, input.moveX]);
  return { ...context, keyboard, source, sessionFacade: session, start, tick, axes, controlCalls, statusCallbacks, releaseOrder };
}

type Context = ReturnType<typeof setup>;
const outcomes = (context: Context) => context.reader.getState().recentResults.map(result => [
  result.commandType, result.outcome, 'reason' in result ? result.reason : result.event.type,
]);

describe('synthetic keyboard mapping and continuous input', () => {
  it('has exactly the five approved mappings and freezes the table and records', () => {
    expect(SYNTHETIC_KEYBOARD_BINDINGS).toEqual({
      ArrowLeft: { type: 'axis', axis: 'moveX', value: -1 },
      ArrowRight: { type: 'axis', axis: 'moveX', value: 1 },
      KeyN: { type: 'command', command: 'add-marker' },
      KeyX: { type: 'command', command: 'remove-marker' },
      KeyP: { type: 'control', control: 'toggle-pause' },
    });
    expect(Object.isFrozen(SYNTHETIC_KEYBOARD_BINDINGS)).toBe(true);
    expect(Object.values(SYNTHETIC_KEYBOARD_BINDINGS).every(Object.isFrozen)).toBe(true);
  });

  it('matches reference Core bit-for-bit at every tick and sends only actual axis changes', () => {
    const s = setup();
    s.start();
    const reference = createSyntheticScene({ seed: 0, tickRateHz: 50 });
    const sequence = [
      ['ArrowRight', 'keydown', 1], ['ArrowLeft', 'keydown', 0], ['ArrowRight', 'keyup', -1],
      ['ArrowRight', 'keydown', 0], ['ArrowLeft', 'keyup', 1], ['ArrowRight', 'keyup', 0],
      ['ArrowLeft', 'keydown', -1], ['ArrowRight', 'keydown', 0], ['ArrowLeft', 'keyup', 1], ['ArrowRight', 'keyup', 0],
    ] as const;
    sequence.forEach(([code, type, moveX], index) => {
      expect(s.source.key(code, { type })).toBe(true);
      const count = s.recorded.inputs.length;
      expect(s.source.key(code, { repeat: true })).toBe(true);
      expect(s.recorded.inputs).toHaveLength(count);
      s.tick((index + 1) * 20);
      reference.step({ input: { moveX }, commands: [] });
      expect(s.currentRun().uiProjection()).toEqual(reference.uiProjection());
      if ((index + 1) % 5 === 0) expect(s.reader.getState().projection).toEqual(reference.uiProjection());
    });
    expect(s.axes()).toEqual(sequence.map(([, , value]) => [1, value]));
    expect(s.currentRun().exportRecording()?.record.ticks.map(input => input.input.moveX))
      .toEqual(sequence.map(([, , value]) => value));
    expect(s.reader.getState().actionError).toBeNull();
  });

  it.each(['ctrlKey', 'altKey', 'metaKey', 'isComposing'] as const)(
    'releases a registered axis on %s keyup without intercepting it', modifier => {
      const s = setup();
      s.start();
      s.source.key('ArrowRight');
      expect(s.source.key('ArrowRight', { type: 'keyup', [modifier]: true })).toBe(false);
      expect(s.axes()).toEqual([[1, 1], [1, 0]]);
      s.tick(20);
      expect(s.currentRun().uiProjection().mover.position.x).toBe(0);
    },
  );

  it('releases on an ineligible keyup and permits Shift without reading character keys', () => {
    const s = setup();
    s.start();
    expect(s.source.key('ArrowLeft', { shiftKey: true })).toBe(true);
    s.source.eligible = false;
    expect(s.source.key('ArrowLeft', { type: 'keyup' })).toBe(false);
    expect(s.axes()).toEqual([[1, -1], [1, 0]]);
  });

  it('ignores unknown, modified, composing and ineligible presses without clearing existing errors', () => {
    const s = setup();
    s.start();
    s.writer.commit({ actionError: { operation: 'input', cause: new Error('keep') } });
    const before = s.reader.getState();
    for (const code of ['Tab', 'Escape', 'Space', 'Enter', 'AltLeft', 'F5', 'constructor', '__proto__']) {
      expect(s.source.key(code)).toBe(false);
    }
    for (const modifier of ['ctrlKey', 'altKey', 'metaKey', 'isComposing'] as const) {
      for (const code of Object.keys(SYNTHETIC_KEYBOARD_BINDINGS)) {
        expect(s.source.key(code, { [modifier]: true })).toBe(false);
      }
    }
    s.source.eligible = false;
    for (const code of Object.keys(SYNTHETIC_KEYBOARD_BINDINGS)) expect(s.source.key(code)).toBe(false);
    expect(s.axes()).toEqual([]);
    expect(s.controlCalls).toEqual([]);
    expect(s.reader.getState()).toBe(before);
  });
});

describe('synthetic keyboard commands and controls', () => {
  it('shares pending/accepted/rejected feedback and does not withdraw commands on focus loss', () => {
    const s = setup();
    s.start();
    for (const code of ['KeyX', 'KeyN', 'KeyX']) {
      expect(s.source.key(code)).toBe(true);
      expect(s.reader.getState().pendingCommands).toHaveLength(1);
      expect(s.source.key(code, { repeat: true })).toBe(true);
      expect(s.source.key(code, { type: 'keyup' })).toBe(true);
      expect(s.reader.getState().pendingCommands).toHaveLength(1);
      s.source.signal('focusout', false);
      expect(s.reader.getState().pendingCommands).toHaveLength(1);
      s.source.signal('focusin', true);
      s.tick((s.currentRun().uiProjection().tick + 1) * 20);
    }
    expect(outcomes(s)).toEqual([
      ['remove-marker', 'rejected', 'command-rejected'], ['add-marker', 'accepted', 'marker-added'],
      ['remove-marker', 'accepted', 'marker-removed'],
    ]);
    expect(s.reader.getState().pendingCommands).toEqual([]);
  });

  it('P pauses/resumes once, clears both axes, and never restores old repeats or paused presses', () => {
    const s = setup();
    s.start();
    s.source.key('ArrowRight');
    s.tick(20);
    const x = s.currentRun().uiProjection().mover.position.x;
    s.source.key('KeyP');
    expect(s.session.status()).toMatchObject({ phase: 'paused', pauseReason: 'user' });
    expect(s.keyboard.reader.getSnapshot()).toEqual({ state: 'active' });
    for (const code of ['ArrowLeft', 'ArrowRight', 'KeyN', 'KeyX']) expect(s.source.key(code)).toBe(true);
    s.source.key('KeyP', { repeat: true });
    s.source.key('KeyP', { type: 'keyup' });
    expect(s.controlCalls).toEqual(['pause']);
    expect(s.axes()).toEqual([[1, 1]]);
    s.source.key('KeyP');
    s.source.key('ArrowRight', { repeat: true });
    s.source.key('ArrowLeft', { repeat: true });
    s.tick(1000); s.tick(1020);
    expect(s.currentRun().uiProjection().mover.position.x).toBe(x);
    expect(s.axes()).toEqual([[1, 1]]);
    s.source.key('ArrowLeft');
    s.tick(1040);
    expect(s.currentRun().uiProjection().mover.position.x).toBeLessThan(x);
    expect(s.controlCalls).toEqual(['pause', 'resume']);
    expect(s.reader.getState().actionError).toBeNull();
  });

  it('uses current Session status rather than a stale store for axes, commands and P', () => {
    const s = setup();
    s.start();
    const running = s.session.status();
    s.session.control({ type: 'pause' });
    s.writer.commit({ status: running });
    s.source.key('KeyN'); s.source.key('ArrowRight');
    expect(s.reader.getState().pendingCommands).toEqual([]);
    expect(s.axes()).toEqual([]);
    s.source.key('KeyP');
    expect(s.controlCalls).toEqual(['resume']);
    s.writer.commit({ status: { ...running, phase: 'idle', runId: null } });
    s.source.key('KeyN'); s.source.key('ArrowRight'); s.source.key('KeyP');
    expect(s.controlCalls).toEqual(['resume', 'pause']);
    expect(outcomes(s)).toEqual([['add-marker', 'cancelled', 'user-pause']]);
    expect(s.axes()).toEqual([[1, 1]]);
  });

  it('ignores eligible bindings in idle/faulted/disposed without false errors or extra controls', () => {
    const s = setup();
    const ignored = () => {
      const before = s.reader.getState();
      for (const code of Object.keys(SYNTHETIC_KEYBOARD_BINDINGS)) expect(s.source.key(code)).toBe(true);
      expect(s.reader.getState()).toBe(before);
    };
    ignored();
    s.start();
    s.currentRun().onFrame(() => { throw new Error('consumer'); });
    s.tick(5);
    expect(s.session.status().phase).toBe('faulted');
    ignored();
    s.session.control({ type: 'dispose' });
    ignored();
    expect(s.axes()).toEqual([]);
    expect(s.controlCalls).toEqual([]);
  });

  it('does not resume hidden or pagehide-blocked sessions, even if source qualification is stale', () => {
    const s = setup();
    s.start();
    s.host.emit({ type: 'visibility', visibility: 'hidden' });
    s.source.key('KeyP');
    expect(s.controlCalls).toEqual([]);
    s.host.emit({ type: 'visibility', visibility: 'visible' });
    s.source.key('KeyP');
    expect(s.session.status().phase).toBe('running');
    s.host.emit({ type: 'pagehide' });
    s.host.emit({ type: 'visibility', visibility: 'visible' });
    s.source.key('KeyP');
    expect(s.controlCalls).toEqual(['resume']);
    s.host.emit({ type: 'pageshow', visibility: 'visible' });
    expect(s.session.status().phase).toBe('paused');
    s.source.key('KeyP');
    expect(s.controlCalls).toEqual(['resume', 'resume']);
  });

  it.each(['pause', 'resume'] as const)('keeps the original %s failure from the real controls path', operation => {
    const s = setup();
    s.start();
    if (operation === 'resume') s.session.control({ type: 'pause' });
    const cause = new Error(operation);
    vi.spyOn(s.sessionFacade, 'control').mockImplementationOnce(() => { throw cause; });
    s.source.key('KeyP');
    expect(s.reader.getState().actionError).toEqual({ operation, cause });
    expect(s.reader.getState().actionError?.cause).toBe(cause);
    s.source.key('KeyP', { repeat: true });
    expect(s.reader.getState().actionError?.cause).toBe(cause);
  });

  it('reports real pause cancellation failure and resume visibility races without optimistic state', () => {
    const s = setup();
    s.start();
    const cause = new Error('frame cancellation');
    s.host.cancelFailure = cause;
    s.source.key('KeyP');
    const pauseError = s.reader.getState().actionError;
    expect(pauseError).toMatchObject({ operation: 'pause', cause: { kind: 'operation-failed', failures: [{ phase: 'scheduler', cause }] } });
    expect(pauseError?.cause).toBe(s.session.status().error);
    s.host.cancelFailure = undefined;
    expect(s.session.status().phase).toBe('faulted');
    const resume = setup();
    resume.start();
    resume.session.control({ type: 'pause' });
    resume.host.visibility = 'hidden';
    resume.source.key('KeyP');
    expect(resume.reader.getState().actionError).toMatchObject({
      operation: 'resume', cause: { kind: 'invalid-state', phase: 'paused', reason: 'resume requires a visible paused run' },
    });
    expect(resume.session.status().phase).toBe('paused');
    const before = resume.reader.getState().actionError;
    resume.source.key('KeyP');
    expect(resume.reader.getState().actionError).toBe(before);
  });

  it('retains command submission failures from the shared feedback without a pending ID', () => {
    const s = setup();
    s.start();
    const binding = s.bridge.currentRun();
    if (!binding) throw new Error('Missing binding');
    const cause = new Error('submit');
    vi.spyOn(binding, 'submitCommand').mockImplementationOnce(() => { throw cause; });
    s.source.key('KeyN');
    expect(s.reader.getState().actionError).toEqual({ operation: 'add-marker', cause });
    expect(s.reader.getState().pendingCommands).toEqual([]);
  });

  it.each(['user-pause', 'hidden'] as const)('preserves %s cancellation and never resubmits', reason => {
    const s = setup();
    s.start();
    s.source.key('KeyN'); s.source.key('KeyX'); s.source.key('ArrowRight');
    if (reason === 'user-pause') s.source.key('KeyP');
    else s.host.emit({ type: 'visibility', visibility: 'hidden' });
    expect(outcomes(s)).toEqual([['add-marker', 'cancelled', reason], ['remove-marker', 'cancelled', reason]]);
    if (reason === 'hidden') s.host.emit({ type: 'visibility', visibility: 'visible' });
    s.source.key('KeyP');
    s.source.key('KeyN', { repeat: true }); s.source.key('KeyX', { repeat: true });
    s.tick(1000); s.tick(1020);
    expect(s.currentRun().uiProjection()).toMatchObject({ marker: null, mover: { position: { x: 0 } } });
    expect(s.reader.getState().pendingCommands).toEqual([]);
    expect(s.axes()).toEqual([[1, 1]]);
  });

  it.each([1, 2])('does not retry commands after a Core fault on tick %i', failOn => {
    const s = setup();
    s.start();
    s.source.key('KeyN'); s.source.key('ArrowRight');
    injection.failOn = injection.calls + failOn;
    s.tick(40);
    expect(s.session.status().phase).toBe('faulted');
    expect(outcomes(s)).toEqual([['add-marker', failOn === 1 ? 'cancelled' : 'unconfirmed', failOn === 1 ? 'failure' : 'session-failed']]);
    expect(s.reader.getState().sessionError).toBe(s.errors[0]);
    expect(s.reader.getState().projection?.tick).toBe(failOn - 1);
    const inputs = s.axes();
    s.source.key('KeyP'); s.source.key('KeyN'); s.source.signal('blur', false);
    expect(s.axes()).toEqual(inputs);
    injection.failOn = 0;
    s.session.control({ type: 'restart' });
    s.source.signal('focus', true);
    s.source.key('ArrowRight', { repeat: true }); s.source.key('KeyN', { repeat: true });
    s.tick(1000); s.tick(1020);
    expect(s.currentRun().uiProjection()).toMatchObject({ marker: null, mover: { position: { x: 0 } } });
    expect(s.reader.getState().actionError).toBeNull();
  });
});

describe('synthetic keyboard clearing, identity and errors', () => {
  it.each(['focusout', 'blur', 'visibilitychange', 'pagehide'] as const)(
    'clears on %s while running and resumes qualification without restoring held keys', signal => {
      const s = setup();
      s.start();
      s.source.key('ArrowRight');
      s.source.signal(signal, false);
      expect(s.axes()).toEqual([[1, 1], [1, 0]]);
      expect(s.session.status().phase).toBe('running');
      s.source.signal(signal === 'pagehide' ? 'pageshow' : 'focus', true);
      expect(s.keyboard.reader.getSnapshot()).toEqual({ state: 'active' });
      s.source.key('ArrowRight', { repeat: true });
      s.tick(20);
      expect(s.currentRun().uiProjection().mover.position.x).toBe(0);
      s.source.key('ArrowRight');
      expect(s.axes()).toEqual([[1, 1], [1, 0], [1, 1]]);
    },
  );

  it.each(['source-first', 'session-first'] as const)('handles hidden/pagehide in %s order without input in status callbacks', order => {
    const s = setup();
    s.start();
    for (const type of ['visibilitychange', 'pagehide'] as const) {
      s.source.key('ArrowRight');
      const lose = () => { s.source.signal(type, false); };
      const pause = () => {
        if (type === 'pagehide') s.host.emit({ type: 'pagehide' });
        else s.host.emit({ type: 'visibility', visibility: 'hidden' });
      };
      if (order === 'source-first') { lose(); pause(); } else { pause(); lose(); }
      expect(s.axes().at(-1)).toEqual([1, order === 'source-first' ? 0 : 1]);
      if (type === 'pagehide') s.host.emit({ type: 'pageshow', visibility: 'visible' });
      else s.host.emit({ type: 'visibility', visibility: 'visible' });
      s.source.signal(type === 'pagehide' ? 'pageshow' : 'focus', true);
      s.source.key('KeyP');
      s.source.key('ArrowRight', { repeat: true });
      s.tick(type === 'pagehide' ? 2000 : 1000); s.tick(type === 'pagehide' ? 2020 : 1020);
      expect(s.currentRun().uiProjection().mover.position.x).toBe(0);
    }
    expect(s.reader.getState().actionError).toBeNull();
  });

  it('clears both opposing held keys on panel pause and on restart/exit/start without attach input', () => {
    const s = setup();
    s.start();
    s.source.key('ArrowLeft'); s.source.key('ArrowRight');
    s.session.control({ type: 'pause' }); s.session.control({ type: 'resume' });
    s.source.key('ArrowLeft', { type: 'keyup' });
    s.source.key('ArrowRight', { repeat: true });
    expect(s.axes()).toEqual([[1, -1], [1, 0]]);
    s.source.key('ArrowRight');
    s.session.control({ type: 'restart' });
    s.source.key('ArrowRight', { repeat: true });
    s.source.key('ArrowRight', { type: 'keyup' });
    s.tick(1000); s.tick(1020);
    expect(s.currentRun().uiProjection().mover.position.x).toBe(0);
    s.source.key('ArrowLeft');
    s.statusCallbacks[0]({ ...s.session.status(), phase: 'paused', runId: 1 });
    s.source.key('ArrowLeft', { type: 'keyup' });
    expect(s.axes().slice(-2)).toEqual([[2, -1], [2, 0]]);
    s.session.control({ type: 'exit' });
    s.source.key('ArrowRight');
    s.session.control({ type: 'start' });
    s.source.key('ArrowRight', { repeat: true });
    s.tick(2000); s.tick(2020);
    expect(s.currentRun().uiProjection().mover.position.x).toBe(0);
    expect(s.reader.getState().actionError).toBeNull();
  });

  it('does not act through a bridge that unbound while the Session is still running', () => {
    const s = setup();
    s.start();
    const binding = s.bridge.currentRun();
    s.bridge.unbind();
    const before = s.reader.getState();
    expect(() => binding?.setInput({ moveX: 1 })).toThrow('no longer controls');
    for (const code of Object.keys(SYNTHETIC_KEYBOARD_BINDINGS)) s.source.key(code);
    expect(s.axes()).toEqual([]);
    expect(s.controlCalls).toEqual([]);
    expect(s.reader.getState()).toBe(before);
  });

  it('preserves setInput cause, leaves no-op errors intact, and clears only input errors after success', () => {
    const s = setup();
    s.start();
    const binding = s.bridge.currentRun();
    if (!binding) throw new Error('Missing binding');
    const cause = new Error('input');
    vi.spyOn(binding, 'setInput').mockImplementationOnce(() => { throw cause; });
    s.source.key('ArrowRight');
    expect(s.reader.getState().actionError).toEqual({ operation: 'input', cause });
    expect(s.reader.getState().actionError?.cause).toBe(cause);
    const before = s.reader.getState();
    s.source.key('ArrowRight'); s.source.key('ArrowRight', { repeat: true }); s.source.key('KeyN', { type: 'keyup' });
    expect(s.reader.getState()).toBe(before);
    s.source.key('ArrowRight', { type: 'keyup' });
    expect(s.reader.getState().actionError).toBeNull();
    const independent = new Error('independent');
    const sessionError = new GameSessionError({ kind: 'operation-failed', failures: [{ phase: 'consumer', cause: independent }] });
    s.writer.commit({ actionError: { operation: 'pause', cause: independent }, sessionError });
    s.source.key('ArrowLeft');
    expect(s.reader.getState().actionError?.cause).toBe(independent);
    expect(s.reader.getState().sessionError).toBe(sessionError);
    const inputError = { operation: 'input' as const, cause };
    s.writer.commit({ actionError: inputError });
    s.session.control({ type: 'pause' });
    const pausedError = s.reader.getState().actionError;
    s.source.key('ArrowLeft'); s.source.signal('blur', false);
    expect(s.reader.getState().actionError).toBe(pausedError);
  });

  it('preserves failure from a running loss signal and clears zero-valued opposing keys without sending', () => {
    const s = setup();
    s.start();
    const binding = s.bridge.currentRun();
    if (!binding) throw new Error('Missing binding');
    s.source.key('ArrowRight');
    const cause = new Error('zero failed');
    vi.spyOn(binding, 'setInput').mockImplementationOnce(() => { throw cause; });
    s.source.signal('focusout', false);
    expect(s.reader.getState().actionError).toEqual({ operation: 'input', cause });
    const before = s.reader.getState();
    s.source.signal('focusout', false);
    s.source.signal('focusin', true);
    s.source.key('ArrowRight', { repeat: true });
    expect(s.reader.getState()).toBe(before);
    s.source.key('ArrowLeft'); s.source.key('ArrowRight');
    const count = s.recorded.inputs.length;
    s.writer.commit({ actionError: { operation: 'input', cause } });
    s.source.signal('blur', false);
    s.source.signal('focus', true);
    s.source.key('ArrowLeft', { type: 'keyup' });
    s.source.key('ArrowRight', { repeat: true });
    expect(s.recorded.inputs).toHaveLength(count);
    expect(s.reader.getState().actionError?.cause).toBe(cause);
  });

  it('records a real stale-phase failure after the availability check rather than success', () => {
    const s = setup();
    s.start();
    const binding = s.bridge.currentRun();
    if (!binding) throw new Error('Missing binding');
    const original = binding.setInput.bind(binding);
    vi.spyOn(binding, 'setInput').mockImplementationOnce(input => {
      s.session.control({ type: 'pause' });
      original(input);
    });
    s.source.key('ArrowRight');
    expect(s.reader.getState().actionError).toMatchObject({ operation: 'input', cause: { kind: 'invalid-state', phase: 'paused' } });
    s.session.control({ type: 'resume' });
    s.source.key('ArrowRight', { repeat: true });
    s.tick(1000); s.tick(1020);
    expect(s.currentRun().uiProjection().mover.position.x).toBe(0);
  });
});

describe('synthetic keyboard state and lifetime', () => {
  it('exposes a frozen reader with stable snapshots, independent of ticks and Session phase', () => {
    const source = new Source();
    source.eligible = false;
    const s = setup(source);
    const reader = s.keyboard.reader;
    expect(Object.keys(reader).sort()).toEqual(['getSnapshot', 'subscribe']);
    expect(Object.isFrozen(reader)).toBe(true);
    const inactive = reader.getSnapshot();
    expect(inactive).toEqual({ state: 'inactive' });
    expect(Object.isFrozen(inactive)).toBe(true);
    const states: string[] = [];
    const stop = reader.subscribe(() => { states.push(reader.getSnapshot().state); });
    source.signal('focus', true);
    const active = reader.getSnapshot();
    expect(Object.isFrozen(active)).toBe(true);
    source.signal('focus', true); source.signal('pageshow', true);
    s.start(); s.tick(20); s.tick(40);
    s.session.control({ type: 'pause' }); s.session.control({ type: 'resume' });
    expect(reader.getSnapshot()).toBe(active);
    expect(states).toEqual(['active']);
    source.signal('blur', false);
    expect(reader.getSnapshot()).toBe(inactive);
    stop(); stop();
    source.signal('focus', true);
    expect(states).toEqual(['active', 'inactive']);
  });

  it('invalidates before source release, releases before status cancellation, and is idempotent', () => {
    const s = setup();
    s.start();
    s.source.key('ArrowRight');
    const before = s.reader.getState();
    const status = s.session.status();
    const notify = vi.fn();
    s.keyboard.reader.subscribe(notify);
    s.source.onRelease = () => {
      s.releaseOrder.push('source');
      expect(s.keyboard.reader.getSnapshot()).toEqual({ state: 'inactive' });
      expect(s.source.key('KeyN')).toBe(false);
      expect(s.source.key('KeyP')).toBe(false);
      s.source.signal('focus', true);
      s.statusCallbacks[0](status);
    };
    s.keyboard.dispose(); s.keyboard.dispose();
    expect(s.releaseOrder).toEqual(['source', 'status']);
    expect(s.source.releases).toBe(1);
    expect(s.reader.getState()).toBe(before);
    expect(s.axes()).toEqual([[1, 1]]);
    expect(s.controlCalls).toEqual([]);
    expect(notify).not.toHaveBeenCalled();
    s.session.control({ type: 'dispose' });
    expect(s.source.key('ArrowRight')).toBe(false);
    expect(s.keyboard.reader.getSnapshot()).toEqual({ state: 'inactive' });
  });

  it('continues status cancellation when source release throws, with cause retained', () => {
    const s = setup();
    const cause = new Error('release');
    s.source.onRelease = () => { s.releaseOrder.push('source'); throw cause; };
    expect(() => s.keyboard.dispose()).toThrowError(expect.objectContaining({ errors: [cause] }));
    expect(s.releaseOrder).toEqual(['source', 'status']);
    expect(s.source.key('ArrowRight')).toBe(false);
    expect(s.keyboard.reader.getSnapshot()).toEqual({ state: 'inactive' });
    s.keyboard.dispose();
  });

  it('rejects synchronous setup key delivery and aggregates all independently failing releases', () => {
    const s = setup();
    const releaseFailure = new Error('source release'), statusFailure = new Error('status release');
    const source: KeyboardSource = {
      connect: sink => {
        sink.signal({ type: 'initial', eligible: true });
        expect(sink.key(event('ArrowRight'), true)).toBe(false);
        expect(sink.key(event('KeyP'), true)).toBe(false);
        return () => { throw releaseFailure; };
      },
    };
    const session: SyntheticSession = {
      ...s.sessionFacade,
      onStatus: listener => {
        const stop = s.session.onStatus(listener);
        return () => { stop(); throw statusFailure; };
      },
    };
    s.start();
    const keyboard = createSyntheticKeyboardInput({
      store: s.writer, session, bridge: s.bridge, feedback: s.feedback, controls: createSyntheticGameControls(s.writer, session),
    }, { source });
    expect(s.axes()).toEqual([]);
    expect(() => keyboard.dispose()).toThrowError(expect.objectContaining({ errors: [releaseFailure, statusFailure] }));
    expect(keyboard.reader.getSnapshot()).toEqual({ state: 'inactive' });
    keyboard.dispose();
  });

  it('does not acquire a source if the status subscription cannot be acquired', () => {
    const s = setup();
    const source = new Source(), cause = new Error('status registration');
    const session: SyntheticSession = { ...s.sessionFacade, onStatus: () => { throw cause; } };
    expect(() => createSyntheticKeyboardInput({
      store: s.writer, session, bridge: s.bridge, feedback: s.feedback, controls: createSyntheticGameControls(s.writer, session),
    }, { source })).toThrow(cause);
    expect(source.sink).toBeNull();
  });

  it('keeps normal source failure unavailable with raw cause and rejects its stale callbacks', () => {
    const source = new Source();
    source.failure = new AggregateError([new Error('register')], 'registration failed, rollback succeeded');
    const s = setup(source);
    const snapshot = s.keyboard.reader.getSnapshot();
    expect(snapshot).toEqual({ state: 'unavailable', error: source.failure });
    expect('error' in snapshot && snapshot.error).toBe(source.failure);
    expect(Object.isFrozen(snapshot)).toBe(true);
    s.start();
    expect(source.key('ArrowRight')).toBe(false);
    source.signal('focus', true);
    expect(s.keyboard.reader.getSnapshot()).toBe(snapshot);
    expect(s.axes()).toEqual([]);
    expect(s.reader.getState().actionError).toBeNull();
  });

  it('accepts an unavailable cause without connecting a source', () => {
    const cause = new Error('no source');
    const s = setup(new Source(), { unavailable: cause });
    expect(s.keyboard.reader.getSnapshot()).toEqual({ state: 'unavailable', error: cause });
    expect(s.source.sink).toBeNull();
    s.start();
    s.keyboard.dispose();
    expect(s.keyboard.reader.getSnapshot()).toEqual({ state: 'inactive' });
  });

  it.each(['source', 'unavailable'] as const)('keeps a %s RollbackError fatal and rolls back acquired status observation', kind => {
    const s = setup();
    const cause = new Error('registration'), removal = new Error('removal');
    const failure = new RollbackError(cause, [removal], 'source rollback');
    const source = new Source();
    source.failure = failure;
    const stops = vi.fn();
    const session: SyntheticSession = {
      ...s.sessionFacade,
      onStatus: listener => {
        const stop = s.session.onStatus(listener);
        return () => { stops(); stop(); };
      },
    };
    expect(() => createSyntheticKeyboardInput({
      store: s.writer, session, bridge: s.bridge, feedback: s.feedback, controls: createSyntheticGameControls(s.writer, session),
    }, kind === 'source' ? { source } : { unavailable: failure })).toThrow(failure);
    expect(stops).toHaveBeenCalledTimes(kind === 'source' ? 1 : 0);
    expect(source.sink?.key(event('KeyN'), true) ?? false).toBe(false);
    s.session.control({ type: 'start' });
    expect(s.reader.getState().pendingCommands).toEqual([]);
  });

  it('preserves every rollback failure and attempts status cancellation even when that fails', () => {
    const s = setup();
    const cause = new RollbackError(new Error('register'), [new Error('remove')], 'source rollback');
    const statusFailure = new Error('status release');
    const source = new Source(); source.failure = cause;
    const session: SyntheticSession = {
      ...s.sessionFacade,
      onStatus: listener => {
        const stop = s.session.onStatus(listener);
        return () => { stop(); throw statusFailure; };
      },
    };
    expect(() => createSyntheticKeyboardInput({
      store: s.writer, session, bridge: s.bridge, feedback: s.feedback, controls: createSyntheticGameControls(s.writer, session),
    }, { source })).toThrowError(expect.objectContaining({
      name: 'RollbackError', cause, errors: [cause, expect.objectContaining({ errors: [statusFailure] })],
    }));
    expect(source.key('KeyP')).toBe(false);
  });
});

class InputHost implements KeyboardHost {
  facts: KeyboardFacts = { elementFocused: true, windowFocused: true, visible: true };
  readonly keys = new Map<KeyboardInput['type'], (input: KeyboardInput, prevent: () => void) => void>();
  readonly signals = new Map<KeyboardLifecycleType, () => void>();
  adds = 0;
  removals = 0;
  failAt = -1;
  failRemove = false;
  readonly failure = new Error('host registration');
  readFacts = () => this.facts;
  listenKey(type: KeyboardInput['type'], listener: (input: KeyboardInput, prevent: () => void) => void) {
    return this.register(() => this.keys.set(type, listener));
  }
  listenSignal(type: KeyboardLifecycleType, listener: () => void) {
    return this.register(() => this.signals.set(type, listener));
  }
  register(save: () => void): () => void {
    if (this.adds++ === this.failAt) throw this.failure;
    save();
    return () => { this.removals++; if (this.failRemove) throw this.failure; };
  }
  key(code: string, patch: Partial<KeyboardInput> = {}): boolean {
    let prevented = false;
    const input = event(code, patch);
    this.keys.get(input.type)?.(input, () => { prevented = true; });
    return prevented;
  }
}

describe('production source connected to the real Session consumer', () => {
  it('rechecks actual facts on window focus and pageshow without new focusin or movement', () => {
    const host = new InputHost();
    const s = setup(new Source(), { source: createKeyboardSource(host) });
    s.start();
    expect(host.adds).toBe(9);
    expect(host.key('ArrowRight')).toBe(true);
    host.facts = { ...host.facts, windowFocused: false };
    host.signals.get('blur')?.();
    expect(s.axes()).toEqual([[1, 1], [1, 0]]);
    host.facts = { ...host.facts, windowFocused: true };
    host.signals.get('focus')?.();
    expect(s.keyboard.reader.getSnapshot()).toEqual({ state: 'active' });
    host.key('ArrowRight', { repeat: true });
    host.signals.get('pagehide')?.();
    expect(host.key('KeyP')).toBe(false);
    host.signals.get('pageshow')?.();
    expect(s.keyboard.reader.getSnapshot()).toEqual({ state: 'active' });
    s.tick(20);
    expect(s.currentRun().uiProjection().mover.position.x).toBe(0);
    s.keyboard.dispose();
    expect(host.removals).toBe(9);
    expect(host.key('KeyN')).toBe(false);
  });

  it('exposes actual production registration failure as unavailable after successful rollback', () => {
    const host = new InputHost(); host.failAt = 4;
    const s = setup(new Source(), { source: createKeyboardSource(host) });
    expect(host.removals).toBe(4);
    expect(s.keyboard.reader.getSnapshot()).toEqual({ state: 'unavailable', error: host.failure });
    expect(host.key('KeyN')).toBe(false);
    s.start();
    expect(s.reader.getState().actionError).toBeNull();
  });

  it('propagates actual production rollback failure and cancels status observation', () => {
    const s = setup();
    const host = new InputHost(); host.failAt = 4; host.failRemove = true;
    const stopStatus = vi.fn();
    const session: SyntheticSession = {
      ...s.sessionFacade,
      onStatus: listener => {
        const stop = s.session.onStatus(listener);
        return () => { stopStatus(); stop(); };
      },
    };
    expect(() => createSyntheticKeyboardInput({
      store: s.writer, session, bridge: s.bridge, feedback: s.feedback, controls: createSyntheticGameControls(s.writer, session),
    }, { source: createKeyboardSource(host) })).toThrowError(RollbackError);
    expect(host.removals).toBe(4);
    expect(stopStatus).toHaveBeenCalledOnce();
    expect(host.key('KeyP')).toBe(false);
  });
});
