import { describe, expect, it } from 'vitest';
import { GameSessionError } from './session-errors.ts';
import type { SessionErrorListener, SessionFailure } from './session-errors.ts';
import type { SessionHost, SessionLifecycleEvent } from './session-host.ts';

describe('GameSessionError', () => {
  it('preserves argument diagnostics and explicit cause presence', () => {
    const cause = new Error('config');
    const error = new GameSessionError({ kind: 'invalid-argument', path: 'runtimeOptions.scene', reason: 'invalid', cause });
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('GameSessionError');
    expect(error.path).toBe('runtimeOptions.scene');
    expect(error.reason).toBe('invalid');
    expect(error.cause).toBe(cause);
    expect(error.message).toBe('runtimeOptions.scene invalid');
    expect('failures' in error).toBe(false);
    expect('cause' in new GameSessionError({ kind: 'invalid-argument', path: 'host', reason: 'required' })).toBe(false);
    expect('cause' in new GameSessionError({ kind: 'invalid-argument', path: 'host', reason: 'required', cause: undefined })).toBe(true);
  });

  it('preserves state and identity without inventing cause or argument fields', () => {
    const error = new GameSessionError({ kind: 'invalid-state', operation: 'resume', phase: 'paused', runId: 1, reason: 'hidden' });
    expect(error).toMatchObject({ kind: 'invalid-state', operation: 'resume', phase: 'paused', runId: 1, reason: 'hidden' });
    expect(error.message).toContain('resume');
    expect('path' in error).toBe(false);
    expect('cause' in error).toBe(false);
    expect(new GameSessionError({ kind: 'invalid-state', operation: 'start', phase: 'idle', runId: null, reason: 'exhausted' }).runId).toBeNull();
  });

  it('carries the formal session\'s hold and stop phases', () => {
    for (const phase of ['transition', 'stopped'] as const) {
      const error = new GameSessionError({ kind: 'invalid-state', operation: 'pause', phase, runId: 2, reason: 'not running' });
      expect(error).toMatchObject({ kind: 'invalid-state', operation: 'pause', phase, runId: 2 });
      expect(error.message).toBe(`pause is invalid in ${phase}: not running`);
    }
  });

  it('copies and freezes entries in order without freezing original causes', () => {
    const cause = new Error('runtime');
    const failures: SessionFailure[] = [
      { phase: 'runtime', cause },
      { phase: 'scheduler', cause: 'host' },
      { phase: 'consumer', cause: undefined },
      { phase: 'cleanup', cause: null },
      { phase: 'control', cause: 7 },
    ];
    const error = new GameSessionError({ kind: 'operation-failed', failures });
    failures[0] = { phase: 'control', cause: false };
    failures.length = 0;
    expect(error.failures).toEqual([
      { phase: 'runtime', cause }, { phase: 'scheduler', cause: 'host' },
      { phase: 'consumer', cause: undefined }, { phase: 'cleanup', cause: null }, { phase: 'control', cause: 7 },
    ]);
    expect(Object.isFrozen(error.failures)).toBe(true);
    expect(error.failures?.every(Object.isFrozen)).toBe(true);
    expect(Object.isFrozen(cause)).toBe(false);
    expect(error.message).toContain('5');
  });

  it('accepts a DOM-free host and handle zero', () => {
    const host: SessionHost = {
      requestFrame: () => 0,
      cancelFrame: () => undefined,
      readVisibility: () => 'visible',
      subscribeLifecycle: () => () => undefined,
    };
    expect(host.requestFrame(() => undefined)).toBe(0);
  });
});

function checkTypes() {
  // @ts-expect-error Argument diagnostics are required.
  new GameSessionError({ kind: 'invalid-argument' });
  // @ts-expect-error State errors require phase and identity.
  new GameSessionError({ kind: 'invalid-state', operation: 'start', reason: 'invalid' });
  // @ts-expect-error Only the session phases are permitted.
  new GameSessionError({ kind: 'invalid-state', operation: 'start', phase: 'held', runId: null, reason: 'invalid' });
  // @ts-expect-error Failures require explicit original causes.
  new GameSessionError({ kind: 'operation-failed', failures: [{ phase: 'cleanup' }] });
  // @ts-expect-error Only the five failure phases are permitted.
  new GameSessionError({ kind: 'operation-failed', failures: [{ phase: 'visibility', cause: 0 }] });
  // @ts-expect-error pageshow must include visibility.
  const event: SessionLifecycleEvent = { type: 'pageshow' };
  // @ts-expect-error The error outlet is synchronous.
  const listener: SessionErrorListener = async () => undefined;
  // @ts-expect-error Host frame callbacks are synchronous.
  const callback: Parameters<SessionHost['requestFrame']>[0] = () => Promise.resolve(undefined);
  // @ts-expect-error Subscription cancellation is synchronous.
  const subscribe: SessionHost['subscribeLifecycle'] = () => async () => undefined;
  void [event, listener, callback, subscribe];
}
void checkTypes;
