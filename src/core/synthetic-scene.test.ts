import { describe, expect, it } from 'vitest';
import { CoreInputError } from './errors.ts';
import { createSyntheticScene, type SyntheticSceneConfig } from './synthetic-scene.ts';

const origin = { x: 0, y: 0, z: 0 };

describe('createSyntheticScene initial state', () => {
  it('starts at tick 0 with the mover at the origin, no marker, and the RNG state equal to the seed', () => {
    const scene = createSyntheticScene({ seed: 0 });
    expect(scene.inspect()).toEqual({
      scenario: 'synthetic',
      tick: 0,
      tickRateHz: 60,
      seed: 0,
      rngState: 0,
      nextEntityId: 2,
      mover: { id: 1, position: origin },
      marker: null,
    });
    expect(scene.uiProjection()).toEqual({
      scenario: 'synthetic',
      tick: 0,
      tickRateHz: 60,
      mover: { id: 1, position: origin },
      marker: null,
    });
    expect(scene.renderState()).toEqual({ tick: 0, entities: [{ id: 1, kind: 'mover', position: origin }] });
  });

  it('accepts an explicit tick rate and the largest seed', () => {
    const state = createSyntheticScene({ seed: 4294967295, tickRateHz: 120 }).inspect();
    expect(state).toMatchObject({ tickRateHz: 120, seed: 4294967295, rngState: 4294967295 });
  });

  it('treats an explicit undefined tick rate as omitted and normalises seed -0 to 0', () => {
    const state = createSyntheticScene({ seed: -0, tickRateHz: undefined }).inspect();
    expect(state.tickRateHz).toBe(60);
    expect(Object.is(state.seed, 0)).toBe(true);
    expect(Object.is(state.rngState, 0)).toBe(true);
  });

  it('gives identical initial state for identical configs', () => {
    expect(createSyntheticScene({ seed: 7, tickRateHz: 30 }).inspect()).toEqual(createSyntheticScene({ seed: 7, tickRateHz: 30 }).inspect());
  });

  it('keeps its own copy of the config', () => {
    const config = { seed: 5, tickRateHz: 30 };
    const scene = createSyntheticScene(config);
    config.seed = 9;
    config.tickRateHz = 90;
    expect(scene.inspect()).toMatchObject({ seed: 5, rngState: 5, tickRateHz: 30 });
  });
});

describe('createSyntheticScene config validation', () => {
  const invalid: [string, unknown, string][] = [
    ['undefined config', undefined, 'config'],
    ['null config', null, 'config'],
    ['array config', [], 'config'],
    ['string config', 'seed', 'config'],
    ['missing seed', {}, 'config.seed'],
    ['negative seed', { seed: -1 }, 'config.seed'],
    ['fractional seed', { seed: 1.5 }, 'config.seed'],
    ['seed above uint32', { seed: 2 ** 32 }, 'config.seed'],
    ['NaN seed', { seed: Number.NaN }, 'config.seed'],
    ['string seed', { seed: '1' }, 'config.seed'],
    ['zero tick rate', { seed: 0, tickRateHz: 0 }, 'config.tickRateHz'],
    ['negative tick rate', { seed: 0, tickRateHz: -60 }, 'config.tickRateHz'],
    ['infinite tick rate', { seed: 0, tickRateHz: Number.POSITIVE_INFINITY }, 'config.tickRateHz'],
    ['NaN tick rate', { seed: 0, tickRateHz: Number.NaN }, 'config.tickRateHz'],
    ['string tick rate', { seed: 0, tickRateHz: '60' }, 'config.tickRateHz'],
    ['tick rate with an infinite reciprocal', { seed: 0, tickRateHz: 1e-320 }, 'config.tickRateHz'],
    ['unknown field', { seed: 0, extra: 1 }, 'config.extra'],
  ];

  it.each(invalid)('rejects %s with CoreInputError at the right path', (_name, config, path) => {
    let thrown: unknown;
    try {
      createSyntheticScene(config as SyntheticSceneConfig);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(CoreInputError);
    expect((thrown as CoreInputError).path).toBe(path);
  });
});

describe('read-only outputs', () => {
  it('returns new, deeply frozen objects that reject writes', () => {
    const scene = createSyntheticScene({ seed: 3 });
    const state = scene.inspect();
    const ui = scene.uiProjection();
    const render = scene.renderState();
    expect(() => {
      (state as { tick: number }).tick = 99;
    }).toThrow(TypeError);
    expect(() => {
      (ui.mover.position as { x: number }).x = 99;
    }).toThrow(TypeError);
    expect(() => {
      (render.entities as unknown[]).push({});
    }).toThrow(TypeError);
    expect(scene.inspect()).toEqual(createSyntheticScene({ seed: 3 }).inspect());
  });

  it('returns equal results for repeated reads of unchanged state', () => {
    const scene = createSyntheticScene({ seed: 3 });
    expect(scene.inspect()).toEqual(scene.inspect());
    expect(scene.uiProjection()).toEqual(scene.uiProjection());
    expect(scene.renderState()).toEqual(scene.renderState());
  });

  it('does not change state or the RNG when read', () => {
    const scene = createSyntheticScene({ seed: 11 });
    const before = scene.inspect();
    for (let i = 0; i < 5; i++) {
      scene.uiProjection();
      scene.renderState();
      scene.inspect();
    }
    expect(scene.inspect()).toEqual(before);
  });

  it('keeps the UI projection and Render State consistent with the inspected state', () => {
    const scene = createSyntheticScene({ seed: 11 });
    const { tick, mover, marker } = scene.inspect();
    expect(scene.uiProjection()).toMatchObject({ tick, mover, marker });
    expect(scene.renderState()).toEqual({ tick, entities: [{ ...mover, kind: 'mover' }] });
  });

  it('produces plain data that survives a JSON round trip', () => {
    const scene = createSyntheticScene({ seed: 11 });
    for (const output of [scene.inspect(), scene.uiProjection(), scene.renderState()]) {
      expect(JSON.parse(JSON.stringify(output))).toEqual(output);
    }
  });
});
