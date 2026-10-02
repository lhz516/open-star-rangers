import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as SceneModule from '../../core/synthetic/synthetic-scene.ts';
import type { SyntheticSceneConfig, TickInput } from '../../core/synthetic/synthetic-scene.ts';
import { replaySyntheticRecord } from '../../core/synthetic/synthetic-replay.ts';
import { GameRuntimeError } from '../runtime/runtime-errors.ts';
import type { GameSessionError } from './session-errors.ts';
import { createSyntheticSession } from './synthetic-session.ts';
import { ControlledHost } from './synthetic-session.test-support.ts';

const injection = vi.hoisted(() => ({ failOn: 0, calls: 0, createFailure: false, cause: new Error('Core injection') }));
vi.mock('../../core/synthetic/synthetic-scene.ts', async importOriginal => {
  const original = await importOriginal<typeof SceneModule>();
  return {
    ...original,
    createSyntheticScene(config: SyntheticSceneConfig) {
      if (injection.createFailure) throw injection.cause;
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
beforeEach(() => { injection.calls = 0; });
afterEach(() => { injection.failOn = 0; injection.createFailure = false; });

function setup(outlet?: (error: GameSessionError) => undefined) {
  const host = new ControlledHost(), errors: GameSessionError[] = [];
  const session = createSyntheticSession(
    { scene: { seed: 0, tickRateHz: 50 }, recording: { checkpointInterval: 1 } }, host,
    error => { errors.push(error); outlet?.(error); },
  );
  session.control({ type: 'start' });
  const run = session.currentRun();
  if (!run) throw new Error('Expected run');
  return { host, session, run, errors };
}

describe('session runtime and scheduler faults', () => {
  it.each([1, 2])('keeps the real committed prefix on Core step %s failure', failOn => {
    const { host, session, run, errors } = setup(), frames: unknown[] = [], notices: unknown[] = [];
    run.setInput({ moveX: 1 }); run.submitCommand({ type: 'add-marker' });
    run.onFrame(frame => { frames.push(frame); }); run.onCommandsCancelled(notice => { notices.push(notice); });
    host.deliver(0); host.deliver(10); expect(run.renderFrame().alpha).toBe(0.5);
    injection.failOn = failOn; host.deliver(60);
    expect(frames).toHaveLength(2); expect(host.pending.size).toBe(0);
    expect(session.status().phase).toBe('faulted');
    expect(errors).toHaveLength(1);
    expect(errors[0].failures).toEqual([{ phase: 'runtime', cause: expect.objectContaining({ kind: 'faulted', cause: injection.cause }) }]);
    expect(run.renderFrame()).toMatchObject({ previous: { tick: failOn - 1 }, current: { tick: failOn - 1 }, alpha: 0 });
    expect(notices).toEqual(failOn === 1 ? [{ runId: 1, commandIds: [1], reason: 'failure' }] : []);
    const exported = run.exportRecording(); if (!exported) throw new Error('Expected record');
    expect(exported.record.ticks).toHaveLength(failOn - 1);
    injection.failOn = 0;
    expect(replaySyntheticRecord(JSON.parse(JSON.stringify(exported.record)))).toEqual(exported.result);
    for (const type of ['start', 'pause', 'resume'] as const) expect(() => session.control({ type })).toThrowError(expect.objectContaining({ kind: 'invalid-state' }));
    expect(() => run.setInput({ moveX: 0 })).toThrowError(expect.objectContaining({ kind: 'invalid-state' }));
    session.control({ type: 'restart' }); expect(session.status()).toMatchObject({ phase: 'running', runId: 2, error: null });
  });

  it('treats Runtime listener failure as consumer failure without fabricating a frame', () => {
    const { host, session, run, errors } = setup(), cause = new Error('domain'), log: string[] = [];
    run.onAny(() => { log.push('first'); throw cause; }); run.onAny(() => { log.push('second'); });
    run.onFrame(() => { log.push('frame'); });
    run.submitCommand({ type: 'add-marker' }); host.deliver(0); log.length = 0; host.deliver(20);
    expect(log).toEqual(['first', 'second']); expect(run.uiProjection().tick).toBe(1); expect(session.status().phase).toBe('faulted');
    const error = errors[0].failures?.[0].cause;
    expect(error).toBeInstanceOf(GameRuntimeError);
    expect(error).toMatchObject({ kind: 'listener-failed', errors: [cause] });
    expect(errors[0].failures?.[0].phase).toBe('consumer');
  });

  it.each(['exit', 'restart'] as const)('honors a domain-requested %s even when that listener throws', type => {
    const { host, session, run, errors } = setup(), cause = new Error('domain');
    let cleaned = 0; run.ownCleanup(() => { cleaned++; });
    run.onAny(() => { session.control({ type }); throw cause; });
    run.submitCommand({ type: 'add-marker' }); host.deliver(0); host.deliver(20);
    expect(cleaned).toBe(1); expect(errors).toHaveLength(1);
    expect(session.status().phase).toBe(type === 'exit' ? 'idle' : 'running');
    expect(host.pending.size).toBe(type === 'exit' ? 0 : 1);
    if (type === 'restart') expect(session.currentRun()?.runId).toBe(2);
  });

  it.each([NaN, Infinity, -Infinity, 'bad'])('maps invalid timestamp %s to scheduler', timestamp => {
    const { host, session, run, errors } = setup();
    host.deliver(timestamp as number);
    expect(errors[0].failures).toEqual([{ phase: 'scheduler', cause: expect.objectContaining({ kind: 'invalid-argument', path: 'nowMs' }) }]);
    expect(session.status().phase).toBe('faulted'); expect(run.uiProjection().tick).toBe(0); expect(host.pending.size).toBe(0);
  });

  it.each(['request', 'read'] as const)('maps %s failure to scheduler and stops rather than retrying', operation => {
    const { host, session, run, errors } = setup(), cause = new Error(operation);
    if (operation === 'request') host.requestFailure = cause; else host.readFailure = cause;
    host.deliver(0);
    expect(errors[0].failures).toEqual([{ phase: 'scheduler', cause }]);
    expect(session.status().phase).toBe('faulted'); expect(run.uiProjection().tick).toBe(0); expect(host.pending.size).toBe(0);
  });

  it('rejects an invalid visibility result instead of assuming visible', () => {
    const { host, session, errors } = setup();
    host.readVisibility = () => 'invalid' as never;
    host.deliver(0);
    expect(errors[0].failures?.[0]).toMatchObject({ phase: 'scheduler', cause: expect.any(TypeError) });
    expect(session.status().phase).toBe('faulted');
  });

  it('invalidates the physical callback even if cancellation throws, and blocks restart', () => {
    const { host, session, run, errors } = setup(), cause = new Error('cancel'), late = host.callbacks[0];
    host.cancelFailure = cause;
    host.emit({ type: 'visibility', visibility: 'hidden' });
    expect(errors).toHaveLength(1); expect(errors[0].failures).toEqual([{ phase: 'scheduler', cause }]);
    expect(session.status()).toMatchObject({ phase: 'faulted', cleanupFailed: true });
    expect(host.pending.size).toBe(1);
    late(1000); host.deliver(1020);
    expect(run.uiProjection().tick).toBe(0); expect(host.pending.size).toBe(0);
    expect(() => session.control({ type: 'restart' })).toThrowError(expect.objectContaining({ kind: 'invalid-state' }));
    host.cancelFailure = undefined; session.control({ type: 'dispose' });
    expect(host.listeners.size).toBe(0); expect(host.cancelled).toHaveLength(1);
  });

  it('keeps an allocation failure idle and owned, without a fake world', () => {
    const host = new ControlledHost();
    const session = createSyntheticSession({ scene: { seed: 0 } }, host, () => undefined);
    injection.createFailure = true;
    expect(() => session.control({ type: 'start' })).toThrowError(expect.objectContaining({ failures: [{ phase: 'runtime', cause: injection.cause }] }));
    expect(session.status()).toMatchObject({ phase: 'idle', runId: null }); expect(session.currentRun()).toBeNull();
    expect(host.pending.size).toBe(0); expect(host.listeners.size).toBe(1);
    session.control({ type: 'dispose' }); expect(host.listeners.size).toBe(0);
  });

  it('routes a queued resume request failure through onError, not the direct pause caller', () => {
    const { host, session, run, errors } = setup(), cause = new Error('queued request');
    run.onFrame(frame => { if (frame.phase === 'paused') session.control({ type: 'resume' }); });
    host.requestFailure = cause;
    expect(() => session.control({ type: 'pause' })).not.toThrow();
    expect(errors[0].failures).toEqual([{ phase: 'scheduler', cause }]); expect(session.status().phase).toBe('faulted');
  });
});

describe('failure aggregation and final cleanup', () => {
  it('copies valid inherited configuration getters once without losing effective values', () => {
    const host = new ControlledHost(), reads: string[] = [];
    class Config {
      get seed() { reads.push('seed'); return 0; }
      get tickRateHz() { reads.push('rate'); return 50; }
    }
    class Recording {
      get checkpointInterval() { reads.push('interval'); return 4; }
    }
    class Options {
      get scene() { reads.push('scene'); return new Config(); }
      get recording() { reads.push('recording'); return new Recording(); }
      get maxTicksPerFrame() { reads.push('cap'); return 3; }
    }
    const session = createSyntheticSession(new Options(), host, () => undefined);
    session.control({ type: 'start' }); host.deliver(0); host.deliver(1000); session.control({ type: 'restart' });
    expect(reads).toEqual(['scene', 'recording', 'cap', 'seed', 'rate', 'interval']);
    expect(session.currentRun()?.exportRecording()?.record).toMatchObject({ config: { seed: 0, tickRateHz: 50 }, checkpointInterval: 4 });
  });

  it('preserves consumer, cancellation, cleanup and status causes in one ordered outlet', () => {
    const log: string[] = [], consumer = new Error('frame'), cancel = new Error('notice'), cleanup = new Error('cleanup'), observer = new Error('status');
    const { host, session, run, errors } = setup(() => { log.push('error'); });
    run.onFrame(() => { run.submitCommand({ type: 'add-marker' }); log.push('frame'); throw consumer; });
    run.onCommandsCancelled(() => { log.push('cancel'); throw cancel; });
    run.ownCleanup(() => { log.push('A'); }); run.ownCleanup(() => { log.push('B'); throw cleanup; });
    session.onStatus(() => { log.push('failed-status'); throw observer; });
    session.onStatus(() => { log.push('healthy-status'); });
    host.deliver(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].failures).toEqual([
      { phase: 'consumer', cause: consumer }, { phase: 'consumer', cause: cancel },
      { phase: 'cleanup', cause: cleanup }, { phase: 'consumer', cause: observer },
    ]);
    expect(log).toEqual(['frame', 'cancel', 'B', 'A', 'failed-status', 'healthy-status', 'healthy-status', 'error']);
    expect(session.status()).toMatchObject({ phase: 'faulted', cleanupFailed: true });
    session.control({ type: 'dispose' }); expect(log.filter(value => value === 'B')).toHaveLength(1);
  });

  it('keeps disposed final status and tries both run and host cleanup despite failures', () => {
    const { session, run } = setup(), a = new Error('run'), b = new Error('host');
    run.ownCleanup(() => { throw a; });
    const separateHost = new ControlledHost(), log: string[] = [];
    separateHost.subscribeLifecycle = listener => {
      separateHost.listeners.add(listener);
      return () => { separateHost.listeners.delete(listener); log.push('host'); throw b; };
    };
    const separate = createSyntheticSession({ scene: { seed: 0 } }, separateHost, () => undefined);
    separate.control({ type: 'start' }); separate.currentRun()?.ownCleanup(() => { log.push('run'); throw a; });
    expect(() => separate.control({ type: 'dispose' })).toThrowError(expect.objectContaining({ failures: [{ phase: 'cleanup', cause: a }, { phase: 'cleanup', cause: b }] }));
    expect(log).toEqual(['run', 'host']); expect(separate.status()).toMatchObject({ phase: 'disposed', runId: null, cleanupFailed: true });
    separate.control({ type: 'dispose' }); expect(log).toEqual(['run', 'host']);
    expect(() => session.control({ type: 'exit' })).toThrowError(expect.objectContaining({ failures: [{ phase: 'cleanup', cause: a }] }));
    expect(session.status()).toMatchObject({ phase: 'idle', runId: null, cleanupFailed: true });
  });

  it.each([false, true])('throws both original causes if onError fails (controlOnly=%s)', controlOnly => {
    const outletCause = new Error('outlet'), consumer = new Error('frame');
    const { host, session, run, errors } = setup(() => { throw outletCause; });
    run.onFrame(frame => {
      if (frame.phase !== 'running') return;
      if (controlOnly) { session.control({ type: 'pause' }); session.control({ type: 'exit' }); session.control({ type: 'resume' }); }
      else throw consumer;
    });
    let thrown: unknown;
    try { host.deliver(0); } catch (cause) { thrown = cause; }
    expect(errors).toHaveLength(1); expect(thrown).toBeInstanceOf(AggregateError);
    expect((thrown as AggregateError).errors).toEqual([errors[0], outletCause]);
    expect(host.pending.size).toBe(0);
    expect(session.status().phase).toBe(controlOnly ? 'idle' : 'faulted');
  });

  it('stops a healthy run if the control-only error outlet itself fails', () => {
    const cause = new Error('outlet'), { host, session, run, errors } = setup(() => { throw cause; });
    run.onFrame(frame => {
      if (frame.phase === 'running') { session.control({ type: 'pause' }); session.control({ type: 'restart' }); session.control({ type: 'resume' }); }
    });
    // Make restart invalid without ending the healthy run.
    const release = run.ownCleanup(() => { throw new Error('release'); });
    expect(() => release()).toThrow();
    expect(() => host.deliver(0)).toThrowError(AggregateError);
    expect(errors).toHaveLength(1); expect(session.status().phase).toBe('faulted'); expect(host.pending.size).toBe(0);
  });

  it('retains additional cleanup causes when a failing outlet stops a healthy run', () => {
    const outlet = new Error('outlet'), later = new Error('later cleanup');
    const { host, session, run, errors } = setup(() => { throw outlet; });
    const release = run.ownCleanup(() => { throw new Error('release'); });
    expect(() => release()).toThrow();
    run.ownCleanup(() => { throw later; });
    run.onFrame(() => { session.control({ type: 'restart' }); });
    let thrown: unknown;
    try { host.deliver(0); } catch (cause) { thrown = cause; }
    expect(thrown).toBeInstanceOf(AggregateError);
    expect((thrown as AggregateError).errors).toEqual([errors[0], outlet, later]);
    expect(errors).toHaveLength(1); expect(session.status()).toMatchObject({ phase: 'faulted', cleanupFailed: true });
    expect(host.pending.size).toBe(0);
  });
});
