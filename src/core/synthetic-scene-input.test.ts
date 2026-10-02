import { describe, expect, it } from 'vitest';
import { CoreInputError } from './errors.ts';
import { createSyntheticScene, type Command, type SyntheticScene, type TickInput } from './synthetic-scene.ts';

const add: Command = { type: 'add-marker' };

function tick(moveX: number, ...commands: Command[]): TickInput {
  return { input: { moveX }, commands };
}

function errorFrom(run: () => unknown): CoreInputError {
  try {
    run();
  } catch (error) {
    if (error instanceof CoreInputError) return error;
    throw error;
  }
  throw new Error('expected a CoreInputError, but nothing was thrown');
}

function stepUnchecked(scene: SyntheticScene, tickInput: unknown): void {
  scene.step(tickInput as TickInput);
}

const sparse: unknown[] = [];
sparse[1] = add;

const invalid: [string, unknown, string][] = [
  ['undefined tick input', undefined, 'tickInput'],
  ['null tick input', null, 'tickInput'],
  ['array tick input', [], 'tickInput'],
  ['extra tick input field', { input: { moveX: 0 }, commands: [], dt: 1 }, 'tickInput.dt'],
  ['missing input', { commands: [] }, 'tickInput.input'],
  ['null input', { input: null, commands: [] }, 'tickInput.input'],
  ['extra input field', { input: { moveX: 0, moveY: 0 }, commands: [] }, 'tickInput.input.moveY'],
  ['missing moveX', { input: {}, commands: [] }, 'tickInput.input.moveX'],
  ['NaN moveX', { input: { moveX: Number.NaN }, commands: [] }, 'tickInput.input.moveX'],
  ['Infinity moveX', { input: { moveX: Number.POSITIVE_INFINITY }, commands: [] }, 'tickInput.input.moveX'],
  ['-Infinity moveX', { input: { moveX: Number.NEGATIVE_INFINITY }, commands: [] }, 'tickInput.input.moveX'],
  ['moveX just above 1', { input: { moveX: 1.0000001 }, commands: [] }, 'tickInput.input.moveX'],
  ['moveX below -1', { input: { moveX: -1.5 }, commands: [] }, 'tickInput.input.moveX'],
  ['string moveX', { input: { moveX: '1' }, commands: [] }, 'tickInput.input.moveX'],
  ['missing commands', { input: { moveX: 0 } }, 'tickInput.commands'],
  ['non-array commands', { input: { moveX: 0 }, commands: {} }, 'tickInput.commands'],
  ['null command', { input: { moveX: 0 }, commands: [null] }, 'tickInput.commands[0]'],
  ['string command', { input: { moveX: 0 }, commands: ['add-marker'] }, 'tickInput.commands[0]'],
  ['hole in commands', { input: { moveX: 0 }, commands: sparse }, 'tickInput.commands[0]'],
  ['missing command type', { input: { moveX: 0 }, commands: [{}] }, 'tickInput.commands[0].type'],
  ['unknown command type', { input: { moveX: 0 }, commands: [{ type: 'pause' }] }, 'tickInput.commands[0].type'],
  ['extra command field', { input: { moveX: 0 }, commands: [{ type: 'add-marker', position: { x: 0, y: 0, z: 0 } }] }, 'tickInput.commands[0].position'],
];

describe('step input validation (AC-06)', () => {
  it.each(invalid)('rejects %s at the right path without changing the scene', (_name, tickInput, path) => {
    const scene = createSyntheticScene({ seed: 4 });
    scene.step(tick(1, add));
    const before = scene.inspect();
    expect(errorFrom(() => stepUnchecked(scene, tickInput)).path).toBe(path);
    expect(scene.inspect()).toEqual(before);
  });

  it('runs nothing from a batch when a later command is invalid', () => {
    const scene = createSyntheticScene({ seed: 4 });
    const before = scene.inspect();
    const error = errorFrom(() => stepUnchecked(scene, { input: { moveX: 1 }, commands: [add, add, { type: 'bogus' }] }));
    expect(error.path).toBe('tickInput.commands[2].type');
    expect(scene.inspect()).toEqual(before);
  });

  it('runs nothing from a batch when moveX is invalid', () => {
    const scene = createSyntheticScene({ seed: 4 });
    const before = scene.inspect();
    expect(errorFrom(() => stepUnchecked(scene, { input: { moveX: 2 }, commands: [add] })).path).toBe('tickInput.input.moveX');
    expect(scene.inspect()).toEqual(before);
  });

  it('continues after an error exactly as if the invalid call never happened', () => {
    const recovered = createSyntheticScene({ seed: 4 });
    const control = createSyntheticScene({ seed: 4 });
    errorFrom(() => stepUnchecked(recovered, { input: { moveX: 1 }, commands: [add, { type: 'bogus' }] }));
    for (const input of [tick(1, add), tick(-0.5), tick(0, add, { type: 'remove-marker' }, add)]) {
      expect(recovered.step(input)).toEqual(control.step(input));
      expect(recovered.inspect()).toEqual(control.inspect());
    }
  });

  it('accepts the boundary values -1, 1 and -0, and frozen input objects', () => {
    const scene = createSyntheticScene({ seed: 4 });
    for (const moveX of [-1, 1, -0]) expect(scene.step(tick(moveX))).toEqual([]);
    expect(scene.step(Object.freeze({ input: Object.freeze({ moveX: 0 }), commands: Object.freeze([add]) }))).toHaveLength(1);
  });
});

describe('step numeric guards (AC-06)', () => {
  it.each([1, -1])('rejects a tick whose movement would overflow, moveX=%i, without changing the scene', (moveX) => {
    const scene = createSyntheticScene({ seed: 4, tickRateHz: 1e-308 });
    scene.step(tick(moveX));
    expect(scene.inspect().mover.position.x).toBe(moveX * 1e308);
    const before = scene.inspect();
    const error = errorFrom(() => scene.step(tick(moveX, add)));
    expect(error.path).toBe('tickInput.input.moveX');
    expect(scene.inspect()).toEqual(before);
  });
});
