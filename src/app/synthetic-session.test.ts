import { describe, expect, it } from 'vitest';
import type { SessionHost } from './session-host.ts';
import type { SyntheticRuntimeOptions } from './synthetic-runtime.ts';
import { createSyntheticSession, type SessionControl, type SessionRun } from './synthetic-session.ts';
import { ControlledHost } from './synthetic-session.test-support.ts';

const options: SyntheticRuntimeOptions = { scene: { seed: 0, tickRateHz: 50 }, recording: { checkpointInterval: 1 } };
function setup(visibility: 'visible' | 'hidden' = 'visible') {
  const host = new ControlledHost(); host.visibility = visibility;
  const errors: unknown[] = [];
  const session = createSyntheticSession(options, host, error => { errors.push(error); });
  return { host, session, errors };
}
function current(session: ReturnType<typeof createSyntheticSession>): SessionRun {
  const run = session.currentRun();
  if (!run) throw new Error('Expected current run');
  return run;
}

describe('session creation and controls', () => {
  it('is idle with one host subscription, no world or request, frozen status', () => {
    const { host, session } = setup();
    expect(session.status()).toEqual({ phase: 'idle', runId: null, environmentVisible: true, pauseReason: null, cleanupFailed: false, error: null });
    expect(Object.isFrozen(session.status())).toBe(true);
    expect(session.currentRun()).toBeNull();
    expect(host.listeners.size).toBe(1); expect(host.pending.size).toBe(0);
    session.control({ type: 'dispose' }); session.control({ type: 'dispose' });
    expect(host.listeners.size).toBe(0); expect(host.unsubscribed).toBe(1);
  });

  it.each<[unknown, string]>([
    [null, 'runtimeOptions'], [{}, 'runtimeOptions.scene'], [{ scene: { seed: -1 } }, 'runtimeOptions.scene.seed'],
    [{ scene: { seed: 0 }, extra: 1 }, 'runtimeOptions.extra'],
    [{ scene: { seed: 0 }, recording: null }, 'runtimeOptions.recording'],
  ])('rejects configuration %j before subscription', (value, path) => {
    const host = new ControlledHost();
    expect(() => createSyntheticSession(value as SyntheticRuntimeOptions, host, () => undefined)).toThrowError(expect.objectContaining({ kind: 'invalid-argument', path }));
    expect(host.listeners.size).toBe(0); expect(host.pending.size).toBe(0);
  });

  it('validates the host and required error outlet', () => {
    expect(() => createSyntheticSession(options, {} as SessionHost, () => undefined)).toThrowError(expect.objectContaining({ path: 'host.requestFrame' }));
    expect(() => createSyntheticSession(options, new ControlledHost(), undefined!)).toThrowError(expect.objectContaining({ path: 'onError' }));
  });

  it('reports failed host initialization without unowned requests or listeners', () => {
    const host = new ControlledHost(), cause = new Error('subscribe');
    host.subscribeFailure = cause;
    expect(() => createSyntheticSession(options, host, () => undefined)).toThrowError(expect.objectContaining({
      kind: 'operation-failed', failures: [{ phase: 'scheduler', cause }],
    }));
    expect(host.listeners.size).toBe(0); expect(host.pending.size).toBe(0);
  });

  it('rejects malformed game input with original cause, keeping the run healthy', () => {
    const { host, session } = setup(); session.control({ type: 'start' });
    const run = current(session);
    expect(() => run.setInput({ moveX: NaN })).toThrowError(expect.objectContaining({ kind: 'invalid-argument', path: 'input.moveX', cause: expect.any(Error) }));
    expect(run.submitCommand({ type: 'add-marker' })).toBe(1);
    expect(() => run.onFrame(undefined!)).toThrowError(expect.objectContaining({ kind: 'invalid-argument' }));
    expect(() => run.onAny(undefined!)).toThrowError(expect.objectContaining({ kind: 'invalid-argument' }));
    expect(session.status().phase).toBe('running'); expect(host.pending.size).toBe(1);
  });

  it('copies every config getter once and restarts from the original values', () => {
    let seeds = 0, rates = 0, configs = 0, caps = 0, records = 0, intervals = 0;
    const scene = { get seed() { return seeds++ === 0 ? 0 : -1; }, get tickRateHz() { return rates++ === 0 ? 50 : 0; } };
    const recording = { get checkpointInterval() { return intervals++ === 0 ? 4 : 0; } };
    const config = { get scene() { configs++; return scene; }, get maxTicksPerFrame() { caps++; return 3; }, get recording() { records++; return recording; } };
    const host = new ControlledHost();
    const session = createSyntheticSession(config, host, () => undefined);
    session.control({ type: 'start' }); host.deliver(0); host.deliver(1000);
    expect(current(session).uiProjection().tick).toBe(3);
    session.control({ type: 'restart' });
    expect(current(session).exportRecording()?.record.config).toEqual({ seed: 0, tickRateHz: 50 });
    expect(current(session).exportRecording()?.record.checkpointInterval).toBe(4);
    expect([seeds, rates, configs, caps, records, intervals]).toEqual([1, 1, 1, 1, 1, 1]);
    expect(Object.isFrozen(scene)).toBe(false);
  });

  it('uses independent worlds, monotonic run IDs and reset command IDs', () => {
    const { host, session } = setup(), other = setup();
    session.control({ type: 'start' }); other.session.control({ type: 'start' });
    const old = current(session); expect(old.runId).toBe(1); expect(Object.isFrozen(old)).toBe(true);
    expect(old.submitCommand({ type: 'add-marker' })).toBe(1);
    host.deliver(0); host.deliver(20);
    const initial = current(other.session).uiProjection();
    session.control({ type: 'restart' }); const next = current(session);
    expect(next.runId).toBe(2); expect(next.uiProjection()).toEqual(initial);
    expect(next.submitCommand({ type: 'add-marker' })).toBe(1);
    for (const action of [() => old.uiProjection(), () => old.renderFrame(), () => old.exportRecording(), () => old.setInput({ moveX: 0 }), () => old.submitCommand({ type: 'remove-marker' }), () => old.onAny(() => undefined), () => old.onFrame(() => undefined)]) {
      expect(action).toThrowError(expect.objectContaining({ kind: 'invalid-state' }));
    }
    session.control({ type: 'exit' }); session.control({ type: 'start' });
    expect(current(session).runId).toBe(3);
  });

  it.each(['pause', 'resume', 'restart'] as const)('rejects idle %s explicitly', type => {
    const { session } = setup();
    expect(() => session.control({ type })).toThrowError(expect.objectContaining({ kind: 'invalid-state', operation: type, phase: 'idle', runId: null }));
  });

  it.each([null, { type: 'bad' }, { type: 'start', extra: true }, [], 'start'])('rejects control shape %j', value => {
    const { session } = setup();
    expect(() => session.control(value as SessionControl)).toThrowError(expect.objectContaining({ kind: 'invalid-argument' }));
  });

  it('applies idempotent transitions without extra requests/statuses', () => {
    const { host, session } = setup(); const phases: string[] = [];
    session.onStatus(status => { phases.push(status.phase); });
    session.control({ type: 'exit' }); session.control({ type: 'start' });
    session.control({ type: 'start' }); session.control({ type: 'resume' });
    expect(host.pending.size).toBe(1);
    session.control({ type: 'pause' }); session.control({ type: 'pause' }); session.control({ type: 'start' });
    expect(host.pending.size).toBe(0);
    session.control({ type: 'resume' }); session.control({ type: 'exit' }); session.control({ type: 'exit' });
    session.control({ type: 'dispose' }); session.control({ type: 'dispose' });
    expect(phases).toEqual(['running', 'paused', 'running', 'idle', 'disposed']);
    expect(() => session.control({ type: 'start' })).toThrowError(expect.objectContaining({ kind: 'invalid-state' }));
    expect(() => session.onStatus(() => undefined)).toThrowError(expect.objectContaining({ kind: 'invalid-state' }));
  });
});

describe('unique session scheduling and visibility', () => {
  it.each([100000, -100])('implements the exact pause/resume sequence with new anchor %s', anchor => {
    const { host, session } = setup(); session.control({ type: 'start' }); const run = current(session);
    const frames: unknown[] = []; run.onFrame(frame => { frames.push(frame); });
    run.setInput({ moveX: 1 }); for (const now of [1000, 1020, 1040, 1050]) host.deliver(now);
    const before = run.renderFrame();
    expect(before).toMatchObject({ previous: { tick: 1 }, current: { tick: 2 }, alpha: 0.5 });
    run.submitCommand({ type: 'add-marker' }); session.control({ type: 'pause' });
    expect(host.pending.size).toBe(0);
    expect(run.renderFrame()).toMatchObject({ previous: { tick: 2 }, current: { tick: 2 }, alpha: 0 });
    expect(frames.at(-1)).toMatchObject({ runId: 1, phase: 'paused', report: null });
    expect(() => run.setInput({ moveX: 0 })).toThrowError(expect.objectContaining({ kind: 'invalid-state' }));
    expect(() => run.submitCommand({ type: 'add-marker' })).toThrowError(expect.objectContaining({ kind: 'invalid-state' }));
    session.control({ type: 'resume' }); host.deliver(anchor);
    expect(run.renderFrame()).toMatchObject({ previous: { tick: 2 }, current: { tick: 2 }, alpha: 0 });
    host.deliver(anchor + 20);
    expect(run.renderFrame()).toMatchObject({ previous: { tick: 2 }, current: { tick: 3 }, alpha: 0 });
    expect(run.uiProjection().mover.position.x).toBe(0.04);
    expect(run.uiProjection().marker).toBeNull();
    expect(run.exportRecording()?.record.ticks).toHaveLength(3);
    expect(run.submitCommand({ type: 'add-marker' })).toBe(2);
    expect(before).toMatchObject({ previous: { tick: 1 }, current: { tick: 2 }, alpha: 0.5 });
    expect(frames).toHaveLength(7);
  });

  it('rejects zero-handle stale, duplicate and reused request callbacks', () => {
    const { host, session } = setup(); host.reusedHandle = 0;
    session.control({ type: 'start' }); const first = host.callbacks[0];
    host.deliver(0); first(20);
    expect(current(session).uiProjection().tick).toBe(0); expect(host.pending.size).toBe(1);
    session.control({ type: 'pause' }); expect(host.cancelled).toEqual([0]);
    session.control({ type: 'resume' }); first(1000);
    host.deliver(1000); host.deliver(1020);
    expect(current(session).uiProjection().tick).toBe(1);
    const old = host.callbacks.at(-1)!; session.control({ type: 'restart' }); old(2000);
    expect(current(session).uiProjection().tick).toBe(0); expect(host.pending.size).toBe(1);
    session.control({ type: 'exit' }); session.control({ type: 'start' }); old(3000);
    expect(host.pending.size).toBe(1);
    session.control({ type: 'dispose' }); old(4000); expect(host.pending.size).toBe(0);
  });

  it('automatically pauses hidden/late-hidden and never auto-resumes', () => {
    const { host, session } = setup(); session.control({ type: 'start' });
    host.deliver(0); host.visibility = 'hidden'; host.deliver(20);
    expect(session.status()).toMatchObject({ phase: 'paused', pauseReason: 'hidden', environmentVisible: false });
    expect(current(session).uiProjection().tick).toBe(0);
    host.emit({ type: 'visibility', visibility: 'hidden' });
    expect(() => session.control({ type: 'resume' })).toThrowError(expect.objectContaining({ kind: 'invalid-state' }));
    host.emit({ type: 'visibility', visibility: 'visible' }); expect(host.pending.size).toBe(0);
    session.control({ type: 'resume' }); expect(host.pending.size).toBe(1);
    host.emit({ type: 'pagehide' }); expect(session.status().environmentVisible).toBe(false);
    host.emit({ type: 'visibility', visibility: 'visible' });
    expect(() => session.control({ type: 'resume' })).toThrowError(expect.objectContaining({ kind: 'invalid-state' }));
    host.emit({ type: 'pageshow', visibility: 'visible' }); expect(host.pending.size).toBe(0);
    session.control({ type: 'resume' }); session.control({ type: 'pause' });
    host.emit({ type: 'visibility', visibility: 'hidden' });
    expect(session.status().pauseReason).toBe('user');
  });

  it('starts hidden without a request', () => {
    const { host, session } = setup('hidden'); session.control({ type: 'start' });
    expect(session.status()).toMatchObject({ phase: 'paused', pauseReason: 'hidden' }); expect(host.pending.size).toBe(0);
  });

  it('keeps first request failure readable, explicitly throws and allows safe restart', () => {
    const { host, session, errors } = setup(); const cause = new Error('request'); host.requestFailure = cause;
    expect(() => session.control({ type: 'start' })).toThrowError(expect.objectContaining({ kind: 'operation-failed', failures: [{ phase: 'scheduler', cause }] }));
    expect(session.status().phase).toBe('faulted'); expect(current(session).uiProjection().tick).toBe(0);
    expect(host.listeners.size).toBe(1); expect(host.pending.size).toBe(0); expect(errors).toEqual([]);
    host.requestFailure = undefined; session.control({ type: 'restart' });
    expect(session.status()).toMatchObject({ phase: 'running', runId: 2, error: null }); expect(host.pending.size).toBe(1);
  });
});

function checkTypes(run: SessionRun) {
  // @ts-expect-error No manual simulation capability escapes.
  run.frame(0);
  // @ts-expect-error Core state is not public.
  void run.world;
  // @ts-expect-error Consumers cannot publish events.
  run.dispatch([]);
  // @ts-expect-error Frame notifications are synchronous.
  run.onFrame(async () => undefined);
}
void checkTypes;
