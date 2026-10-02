import { describe, expect, it } from 'vitest';
import { CoreInputError } from '../core/errors.ts';
import { GameRuntimeError } from './runtime-errors.ts';

describe('GameRuntimeError', () => {
  it('preserves input diagnostics and the original Core cause', () => {
    const cause = new CoreInputError('config.seed', 'must be uint32');
    const error = new GameRuntimeError({ kind: 'invalid-argument', path: 'options.scene.seed', reason: cause.reason, cause });
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(GameRuntimeError);
    expect(error.name).toBe('GameRuntimeError');
    expect(error.kind).toBe('invalid-argument');
    expect(error.path).toBe('options.scene.seed');
    expect(error.reason).toBe(cause.reason);
    expect(error.message).toBe('options.scene.seed must be uint32');
    expect(error.cause).toBe(cause);
  });

  it('also supports Runtime validation without a Core cause', () => {
    const error = new GameRuntimeError({ kind: 'invalid-argument', path: 'nowMs', reason: 'must be finite' });
    expect(error.cause).toBeUndefined();
    expect(error.message).toContain('nowMs');
  });

  it('represents reentry without inventing input or listener diagnostics', () => {
    const error = new GameRuntimeError({ kind: 'reentrant-call' });
    expect(error.kind).toBe('reentrant-call');
    expect(error.message).toContain('frame');
    expect(error.path).toBeUndefined();
    expect('path' in error).toBe(false);
    expect(error.errors).toBeUndefined();
  });

  it('copies and freezes the failure list but leaves thrown values untouched', () => {
    const cause = new Error('consumer');
    const errors: unknown[] = [cause, 'failure', null, undefined];
    const error = new GameRuntimeError({ kind: 'listener-failed', errors });
    errors.length = 0;
    expect(error.errors).toEqual([cause, 'failure', null, undefined]);
    expect(error.errors?.[0]).toBe(cause);
    expect(Object.isFrozen(error.errors)).toBe(true);
    expect(Object.isFrozen(cause)).toBe(false);
    expect(error.message).toContain('4');
  });

  it.each([new RangeError('IDs exhausted'), 'failure', undefined])('preserves a fault cause: %s', (cause) => {
    const error = new GameRuntimeError({ kind: 'faulted', cause });
    expect(error.kind).toBe('faulted');
    expect(error.cause).toBe(cause);
    expect(error.message).toContain('create a new session');
  });
});

function checkTypes() {
  // @ts-expect-error Invalid arguments require a location and reason.
  new GameRuntimeError({ kind: 'invalid-argument' });
  // @ts-expect-error Listener failures require the original thrown values.
  new GameRuntimeError({ kind: 'listener-failed' });
  // @ts-expect-error Faults require an explicit cause, even when it is undefined.
  new GameRuntimeError({ kind: 'faulted' });
  const error = new GameRuntimeError({ kind: 'reentrant-call' });
  // @ts-expect-error The discriminator is read-only.
  error.kind = 'faulted';
}
void checkTypes;
