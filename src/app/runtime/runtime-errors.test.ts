import { describe, expect, it } from 'vitest';
import { CoreInputError } from '../../core/errors.ts';
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
    expect('unconfirmed' in error).toBe(false);
  });

  it('copies and freezes the unconfirmed command IDs of a formal Runtime fault', () => {
    const unconfirmed = [3, 4, 5];
    const error = new GameRuntimeError({ kind: 'faulted', cause: null, unconfirmed });
    unconfirmed.length = 0;
    expect(error.unconfirmed).toEqual([3, 4, 5]);
    expect(Object.isFrozen(error.unconfirmed)).toBe(true);
    expect(new GameRuntimeError({ kind: 'faulted', cause: null, unconfirmed: [] }).unconfirmed).toEqual([]);
  });

  it('reports a full command queue without a cause or location', () => {
    const error = new GameRuntimeError({ kind: 'command-queue-full' });
    expect(error.kind).toBe('command-queue-full');
    expect(error.message).toContain('queue is full');
    expect(error.cause).toBeUndefined();
    expect('path' in error || 'unconfirmed' in error).toBe(false);
  });

  it('keeps Core\'s refusal as the cause of a recording-capacity stop', () => {
    const cause = new CoreInputError('recording', 'would exceed 131072 recorded ticks');
    const error = new GameRuntimeError({ kind: 'recording-capacity', cause });
    expect(error.kind).toBe('recording-capacity');
    expect(error.cause).toBe(cause);
    expect(error.message).toContain('recording');
  });
});

function checkTypes() {
  // @ts-expect-error Invalid arguments require a location and reason.
  new GameRuntimeError({ kind: 'invalid-argument' });
  // @ts-expect-error Listener failures require the original thrown values.
  new GameRuntimeError({ kind: 'listener-failed' });
  // @ts-expect-error Faults require an explicit cause, even when it is undefined.
  new GameRuntimeError({ kind: 'faulted' });
  // @ts-expect-error A recording stop keeps Core's refusal.
  new GameRuntimeError({ kind: 'recording-capacity' });
  // @ts-expect-error Only faults list unconfirmed commands.
  new GameRuntimeError({ kind: 'command-queue-full', unconfirmed: [] });
  const error = new GameRuntimeError({ kind: 'reentrant-call' });
  // @ts-expect-error The discriminator is read-only.
  error.kind = 'faulted';
}
void checkTypes;
