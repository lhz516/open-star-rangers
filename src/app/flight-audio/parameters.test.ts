import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HitEvent, ShotFiredEvent, Vec3 } from '../../core/contracts/domain-events.ts';
import type { MotionPlayer, MotionReady } from '../../core/projections/projection.ts';
import type { RenderEntity } from '../../core/projections/render-state.ts';
import type { Matrix3 } from '../../core/world/entity-table.ts';
import { defaultVoiceParameters, mergeVoiceParameters } from '../../platform/audio/voice-progress.ts';
import {
  audioListener, engineParameters, entityReading, FlightSoundParameterError, hitReading, nonPlayerParameters, shotReading, START_PARAMETERS,
  type AudioListener, type SourceReading,
} from './parameters.ts';

// Expected values are worked out by hand from docs/original/formats/audio.md (A-04, A-05, A-09), with inputs chosen so
// that every f32 store is exact: volume = trunc(f32(3800 − d) × 0.0334213428695565), rate = trunc((r + 800) × 0.00125
// × 11025) clamped to 0–44,100 and floored at 1, pan = trunc((1 + x) × 0.5 × 127) clamped to 0–127.

const IDENTITY: Matrix3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const ORIGIN: Vec3 = { x: 0, y: 0, z: 0 };
const vec = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

const listenerAt = (playerSpeed: number | null = 0, position: Vec3 = ORIGIN, rows: Matrix3 = IDENTITY): AudioListener => ({ camera: { position, rows }, playerSpeed });
/** A source at `position` whose forward row is perpendicular to the identity camera's, so no rate is computed. */
const sideways = (position: Vec3): SourceReading => ({ position, forward: vec(0, 1, 0), speed: 0 });

function entity(overrides: Partial<RenderEntity> = {}): RenderEntity {
  return {
    id: 7, kindBit: 8, presentation: { type: 'map-marker' }, position: vec(0, 0, 128), orientation: [1, 0, 0, 0, 1, 0, 0, 0, -1],
    placementSerial: 1, hitShimmerStart: null, explosionStart: null, inWarp: false, sourceKindBit: null, display: 'shown',
    state: 'active', speed: 200, ...overrides,
  };
}

const shot = (overrides: Partial<ShotFiredEvent> = {}): ShotFiredEvent => ({
  type: 'shot-fired', tick: 3, shooterEntityId: 7, shooterKindBit: 8, shooterPosition: vec(0, 0, 128), shooterForward: vec(0, 0, 1),
  shooterSpeed: 200, entityId: 40, family: 'gun', weapon: 0, mount: 0, position: vec(0, 0, 130), trigger: { type: 'automatic' }, ...overrides,
});

const hit = (overrides: Partial<HitEvent> = {}): HitEvent => ({
  type: 'hit', tick: 3, victimEntityId: 7, victimKindBit: 8, victimPosition: vec(0, 0, 128), victimForward: vec(0, 0, -1), victimSpeed: 200,
  cause: 'projectile', sourceEntityId: 40, attacker: { type: 'none' }, damage: 1, gated: false, shield: { before: 5, after: 4 },
  hull: { before: 9, after: 9 }, shieldWasEmpty: false, impact: null, projectile: 'removed', ...overrides,
});

const engine = (commandedSpeed: number, recordMaximumSpeed: number): Pick<MotionPlayer, 'commandedSpeed' | 'recordMaximumSpeed'> => ({ commandedSpeed, recordMaximumSpeed });

function failure(run: () => unknown): FlightSoundParameterError {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(FlightSoundParameterError);
    return error as FlightSoundParameterError;
  }
  throw new Error('expected a FlightSoundParameterError');
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('non-player volume (A-04 steps 1–2)', () => {
  it('falls linearly with the Manhattan distance, not the Euclidean one', () => {
    // d = 30 + 40 = 70 → trunc(3730 × k) = 124; the Euclidean 50 would give 125.
    expect(nonPlayerParameters(listenerAt(), sideways(vec(30, 40, 0))).volume).toBe(124);
    expect(nonPlayerParameters(listenerAt(), sideways(vec(-30, 0, 20))).volume).toBe(125);
  });

  it('holds 127 up to d ≈ 0.033 and reaches 1 at d = 3770', () => {
    expect(nonPlayerParameters(listenerAt(), sideways(vec(0, 0, 0.03125))).volume).toBe(127);
    expect(nonPlayerParameters(listenerAt(), sideways(vec(0, 0, 0.0625))).volume).toBe(126);
    expect(nonPlayerParameters(listenerAt(), sideways(vec(3770, 0, 0))).volume).toBe(1);
    // The sum 3770.07898 would give 1; its f32 store 3770.0791015625 gives 0.
    expect(nonPlayerParameters(listenerAt(), sideways(vec(1015.8742065429688, -554.3226928710938, 2199.882080078125))).volume).toBe(0);
  });

  it('sets pan and rate while 3800 − d > 0 even at volume 0, and only volume 0 from d = 3800 on', () => {
    const inRange = { position: vec(0, 0, 3771), forward: vec(0, 0, -1), speed: 0 };
    expect(nonPlayerParameters(listenerAt(), inRange)).toEqual({ volume: 0, rate: 11025, pan: 63 });
    expect(nonPlayerParameters(listenerAt(), { ...inRange, position: vec(0, 0, 3800) })).toEqual({ volume: 0 });
    expect(nonPlayerParameters(listenerAt(), { ...inRange, position: vec(2000, 1000, 1000) })).toEqual({ volume: 0 });
  });

  it('measures from the camera position, not the origin', () => {
    const camera = vec(1000, -500, 250);
    expect(nonPlayerParameters(listenerAt(0, camera), sideways(vec(1030, -460, 250))).volume).toBe(124);
  });
});

describe('non-player rate (A-04 steps 3–4)', () => {
  const ahead = (forward: Vec3, speed: number, position = vec(0, 0, 128)): SourceReading => ({ position, forward, speed });

  it('is 11025 × (1 + r/800) Hz from the radial relative speed, positive when closing, whatever the stored rate', () => {
    // u = (C − P)/d = (0, 0, −1); a source facing the camera at 200 units/s closes at r = 200.
    expect(nonPlayerParameters(listenerAt(0), ahead(vec(0, 0, -1), 200)).rate).toBe(13781);
    expect(nonPlayerParameters(listenerAt(0), ahead(vec(0, 0, 1), 200)).rate).toBe(8268);
    expect(nonPlayerParameters(listenerAt(0), ahead(vec(0, 0, 1), 0)).rate).toBe(11025);
    expect(nonPlayerParameters(listenerAt(100), ahead(vec(0, 0, -1), 200)).rate).toBe(15159);
  });

  it('takes the listener velocity as camera row 2 times the player speed, also for a still source', () => {
    expect(nonPlayerParameters(listenerAt(160), ahead(vec(0, 0, -1), 0)).rate).toBe(13230);
    // A camera looking away (−z) with the player at 160 recedes from the source in front of the craft.
    expect(nonPlayerParameters(listenerAt(160, ORIGIN, [-1, 0, 0, 0, 1, 0, 0, 0, -1]), ahead(vec(0, 0, -1), 0)).rate).toBe(8820);
  });

  it('normalises the offset by the Manhattan distance', () => {
    // d = 256, u = (−0.5, 0, −0.5); V = (0, 0, −400) gives r = 200 (a Euclidean unit would give ≈ 283).
    expect(nonPlayerParameters(listenerAt(0), ahead(vec(0, 0, -1), 400, vec(128, 0, 128))).rate).toBe(13781);
  });

  it('clamps to 0–44,100 Hz and gives a game rate of 0 as 1 Hz', () => {
    expect(nonPlayerParameters(listenerAt(0), ahead(vec(0, 0, -1), 2400)).rate).toBe(44100);
    expect(nonPlayerParameters(listenerAt(0), ahead(vec(0, 0, -1), 3000)).rate).toBe(44100);
    expect(nonPlayerParameters(listenerAt(0), ahead(vec(0, 0, 1), 800)).rate).toBe(1);
    expect(nonPlayerParameters(listenerAt(0), ahead(vec(0, 0, 1), 1000)).rate).toBe(1);
  });

  it('is recomputed only when the forward rows are at least 1e−6 from perpendicular', () => {
    const below = Math.fround(1e-6);
    const words = new Float32Array([1e-6]);
    new Uint32Array(words.buffer)[0] += 1;
    const above = words[0];
    expect(below).toBeLessThan(1e-6);
    expect(above).toBeGreaterThan(1e-6);
    expect(nonPlayerParameters(listenerAt(0), ahead(vec(1, 0, below), 0))).not.toHaveProperty('rate');
    expect(nonPlayerParameters(listenerAt(0), ahead(vec(1, 0, -below), 0))).not.toHaveProperty('rate');
    expect(nonPlayerParameters(listenerAt(0), ahead(vec(1, 0, above), 0)).rate).toBe(11025);
    expect(nonPlayerParameters(listenerAt(0), ahead(vec(1, 0, -above), 0)).rate).toBe(11025);
  });

  it('keeps the rate at the camera position and without a player (D1-06)', () => {
    expect(nonPlayerParameters(listenerAt(0), ahead(vec(0, 0, -1), 200, ORIGIN))).toEqual({ volume: 127, pan: 64 });
    expect(nonPlayerParameters(listenerAt(null), ahead(vec(0, 0, -1), 200))).toEqual({ volume: 122, pan: 63 });
  });

  it('keeps the f32 stores of the relative velocity: the source y product enters unstored', () => {
    // u = (0, −1, 0), so r = −F(fy·ss − F(sp)); storing fy·ss first would give 11294.
    const rows: Matrix3 = [1, 0, 0, 0, 0, 1, 0, 1, 0];
    const source = { position: vec(0, 128, 0), forward: vec(0, 0.7905755639076233, 0), speed: 540.2938842773438 };
    expect(nonPlayerParameters(listenerAt(446.66241455078125, ORIGIN, rows), source).rate).toBe(11293);
  });

  it('matches the original rounding for a general pose', () => {
    // Values with inexact f32 stores; a reading without them gives rate 11431.
    const rows: Matrix3 = [
      -0.9630796313285828, 0, -0.26921674609184265, -0.09759116172790527, -0.9319836497306824, 0.3491166830062866,
      -0.2509056031703949, 0.36250030994415283, 0.8975744247436523,
    ];
    const source = { position: vec(-5278.79150390625, 9665.6982421875, 5845.0498046875), forward: vec(0.5072186589241028, -0.6790047883987427, -0.8978598117828369), speed: -400.5206604003906 };
    expect(nonPlayerParameters(listenerAt(111.86161804199219, vec(-6257.0048828125, 8573.9462890625, 6464.64013671875), rows), source)).toEqual({ volume: 37, rate: 11430, pan: 20 });
  });
});

describe('non-player pan (A-04 step 5)', () => {
  const pan = (position: Vec3, rows: Matrix3 = IDENTITY, camera: Vec3 = ORIGIN): number | undefined =>
    nonPlayerParameters(listenerAt(0, camera, rows), sideways(position)).pan;

  it('follows camera row 0: 127 right, 0 left and 63 for a centred source, front and back alike', () => {
    expect(pan(vec(100, 0, 0))).toBe(127);
    expect(pan(vec(-100, 0, 0))).toBe(0);
    expect(pan(vec(0, 0, 100))).toBe(63);
    expect(pan(vec(0, 0, -100))).toBe(63);
  });

  it('removes the row-1 component and normalises by the Manhattan length in that plane', () => {
    // q = (100, 0, 100), m = 200, x = 0.5 → 95; a 3D Manhattan unit (0.4) would give 88, a Euclidean one 108.
    expect(pan(vec(100, 0, 100))).toBe(95);
    expect(pan(vec(100, 50, 100))).toBe(95);
  });

  it('is 64 when the offset in the plane is within 1e−6 of zero', () => {
    expect(pan(vec(0, 100, 0))).toBe(64);
    expect(pan(vec(0, -3000, 0))).toBe(64);
  });

  it('uses the camera position and rows as given, unnormalised, and clamps to 0–127', () => {
    // Camera row 0 = +z, row 1 = +y, row 2 = −x.
    const turned: Matrix3 = [0, 0, 1, 0, 1, 0, -1, 0, 0];
    const camera = vec(1000, -500, 250);
    expect(pan(vec(1000, -500, 350), turned, camera)).toBe(127);
    expect(pan(vec(900, -500, 250), turned, camera)).toBe(63);
    expect(pan(vec(1000, -400, 250), turned, camera)).toBe(64);
    expect(pan(vec(100, 0, 0), [2, 0, 0, 0, 1, 0, 0, 0, 1])).toBe(127);
    expect(pan(vec(-100, 0, 0), [2, 0, 0, 0, 1, 0, 0, 0, 1])).toBe(0);
  });

  it('matches the original rounding of the in-plane offset for a general pose', () => {
    // A reading without the f32 stores gives pan 82.
    const rows: Matrix3 = [
      -0.9947913885116577, 0, 0.10193177312612534, -0.10182227194309235, -0.04633912816643715, -0.9937227368354797,
      0.0047234296798706055, -0.9989257454872131, 0.0460977666079998,
    ];
    const source = { position: vec(-14861.3974609375, 4883.3955078125, 16829.28515625), forward: vec(-0.45362889766693115, -0.33653703331947327, 0.8029139041900635), speed: -175.8347930908203 };
    expect(nonPlayerParameters(listenerAt(-467.51300048828125, vec(-14445.8447265625, 5902.59326171875, 15875.0791015625), rows), source)).toEqual({ volume: 47, rate: 9482, pan: 83 });
  });

  it('gives 63 and keeps the rate for a degenerate camera of zero rows (DW-05)', () => {
    const zero: Matrix3 = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    expect(nonPlayerParameters(listenerAt(100, ORIGIN, zero), { position: vec(0, 0, 128), forward: vec(0, 0, -1), speed: 200 })).toEqual({ volume: 122, pan: 63 });
  });
});

describe('source readings: the movement block, never a position difference', () => {
  it('reads Render State position, orientation row 2 and speed', () => {
    expect(entityReading(entity())).toEqual({ position: vec(0, 0, 128), forward: vec(0, 0, -1), speed: 200 });
  });

  it('gives the same parameters after a discontinuous move as for a source always there', () => {
    const listener = listenerAt(0);
    const before = entity({ position: vec(0, 0, 128) });
    const moved = entity({ position: vec(0, 0, 256), placementSerial: 2 });
    expect(nonPlayerParameters(listener, entityReading(before)).rate).toBe(13781);
    // The jump of 128 units within a tick changes neither speed nor rate.
    expect(nonPlayerParameters(listener, entityReading(moved))).toEqual(nonPlayerParameters(listener, entityReading({ ...moved, placementSerial: 1 })));
    expect(nonPlayerParameters(listener, entityReading(moved)).rate).toBe(13781);
  });

  it('prefers the listed source over the event snapshot for one-shots (D1-04, DW-05)', () => {
    // The snapshot recedes at 200 (8268 Hz); the listed entity closes at 200 (13781 Hz).
    const listener = listenerAt(0);
    expect(nonPlayerParameters(listener, shotReading(shot(), entity())).rate).toBe(13781);
    expect(nonPlayerParameters(listener, shotReading(shot(), null)).rate).toBe(8268);
    expect(shotReading(shot(), null)).toEqual({ position: vec(0, 0, 128), forward: vec(0, 0, 1), speed: 200 });
    expect(hitReading(hit({ victimSpeed: 0 }), null)).toEqual({ position: vec(0, 0, 128), forward: vec(0, 0, -1), speed: 0 });
    expect(hitReading(hit(), entity({ speed: 5 })).speed).toBe(5);
  });

  it('refuses a snapshot without a speed and a listed entity of another ID', () => {
    expect(failure(() => hitReading(hit({ cause: 'parked', victimSpeed: null }), null))).toMatchObject({ failure: 'missing-field', path: 'hit.victimSpeed' });
    expect(failure(() => shotReading(shot({ shooterSpeed: null }), null))).toMatchObject({ failure: 'missing-field', path: 'shot-fired.shooterSpeed' });
    expect(failure(() => shotReading(shot(), entity({ id: 8 })))).toMatchObject({ failure: 'entity-mismatch', path: 'shot-fired.shooterEntityId' });
  });
});

describe('the listener', () => {
  const camera = { position: vec(1, 2, 3), rows: IDENTITY };
  const player = { speed: 42, commandedSpeed: 99 } as MotionPlayer;

  it('takes the player current speed from the motion group, and null without a player', () => {
    expect(audioListener(camera, { readiness: 'ready', player })).toEqual({ camera, playerSpeed: 42 });
    expect(audioListener(camera, { readiness: 'ready', player: null })).toEqual({ camera, playerSpeed: null });
  });

  it('refuses a motion group that is not implemented, or without its player entry, rather than treating it as no player', () => {
    expect(failure(() => audioListener(camera, { readiness: 'not-implemented' }))).toMatchObject({ failure: 'not-implemented', path: 'projection.flight.motion' });
    expect(failure(() => audioListener(camera, { readiness: 'ready' } as MotionReady))).toMatchObject({ failure: 'missing-field', path: 'projection.flight.motion.player' });
  });
});

describe('player sources and the engine (A-05)', () => {
  it('starts every sound at volume 127 and pan 64 with the stored rate', () => {
    expect(START_PARAMETERS).toEqual({ volume: 127, pan: 64 });
    expect(mergeVoiceParameters(defaultVoiceParameters(9000), START_PARAMETERS)).toEqual({ volume: 127, pan: 64, rate: 9000 });
  });

  it('sets rate trunc(c / M × 16000) + 3000 from the commanded speed and the record maximum', () => {
    expect(engineParameters(engine(100, 100))).toEqual({ volume: 127, rate: 19000 });
    expect(engineParameters(engine(50, 100))).toEqual({ volume: 127, rate: 11000 });
    expect(engineParameters(engine(1, 100))).toEqual({ volume: 127, rate: 3160 });
    expect(engineParameters(engine(2.56, 1))).toEqual({ volume: 127, rate: 43960 });
  });

  it('mutes below 1 unit/s and keeps the rate', () => {
    expect(engineParameters(engine(Math.fround(0.999), 100))).toEqual({ volume: 0 });
    expect(engineParameters(engine(0, 100))).toEqual({ volume: 0 });
    expect(engineParameters(engine(-5, 100))).toEqual({ volume: 0 });
  });

  it('clamps to 0–44,100 Hz with a 1 Hz floor and wraps the 32-bit add', () => {
    expect(engineParameters(engine(3, 1))).toEqual({ volume: 127, rate: 44100 });
    expect(engineParameters(engine(10, -10))).toEqual({ volume: 127, rate: 1 });
    expect(engineParameters(engine(134217.6875, 1))).toEqual({ volume: 127, rate: 1 });
  });

  it('keeps the rate for a zero record maximum (D1-06)', () => {
    expect(engineParameters(engine(100, 0))).toEqual({ volume: 127 });
    expect(engineParameters(engine(100, -0))).toEqual({ volume: 127 });
  });
});

describe('contract checks and purity', () => {
  it('refuses non-finite numbers by input path', () => {
    const source = { position: vec(0, 0, 128), forward: vec(0, 0, -1), speed: 0 };
    expect(failure(() => nonPlayerParameters(listenerAt(Number.NaN), source))).toMatchObject({ failure: 'non-finite', path: 'listener.playerSpeed' });
    expect(failure(() => nonPlayerParameters(listenerAt(0, vec(0, Infinity, 0)), source))).toMatchObject({ path: 'listener.camera.position.y' });
    expect(failure(() => nonPlayerParameters(listenerAt(0, ORIGIN, [1, 0, 0, 0, 1, 0, 0, 0, Number.NaN]), source))).toMatchObject({ path: 'listener.camera.rows[8]' });
    expect(failure(() => nonPlayerParameters(listenerAt(0), { ...source, forward: vec(Number.NaN, 0, 0) }))).toMatchObject({ path: 'source.forward.x' });
    expect(failure(() => nonPlayerParameters(listenerAt(0), { ...source, speed: -Infinity }))).toMatchObject({ path: 'source.speed' });
    expect(failure(() => engineParameters(engine(Number.NaN, 100)))).toMatchObject({ path: 'player.commandedSpeed' });
    expect(failure(() => engineParameters(engine(100, Infinity)))).toMatchObject({ path: 'player.recordMaximumSpeed' });
    expect(failure(() => audioListener({ position: ORIGIN, rows: IDENTITY }, { readiness: 'ready', player: { speed: Number.NaN } as MotionPlayer }))).toMatchObject({ path: 'listener.playerSpeed' });
  });

  it('refuses inputs whose f32 store or integer conversion would trap, outside D1-06', () => {
    const closing = { position: vec(0, 0, 128), forward: vec(0, 0, -1), speed: 2e8 };
    expect(failure(() => nonPlayerParameters(listenerAt(0), closing))).toMatchObject({ failure: 'out-of-range', path: 'rate' });
    expect(failure(() => nonPlayerParameters(listenerAt(0), { ...closing, speed: 3e38, forward: vec(0, 0, -3e38) }))).toMatchObject({ failure: 'out-of-range', path: 'radial' });
    expect(failure(() => nonPlayerParameters(listenerAt(0), sideways(vec(3e38, -3e38, 0))))).toMatchObject({ failure: 'out-of-range', path: 'distance' });
    expect(failure(() => nonPlayerParameters(listenerAt(0, ORIGIN, [1, 0, 0, 1e30, 1e30, 0, 0, 0, 1]), sideways(vec(10, 0, 128))))).toMatchObject({ failure: 'out-of-range', path: 'pan' });
    expect(failure(() => engineParameters(engine(300000, 0.001)))).toMatchObject({ failure: 'out-of-range', path: 'engine rate' });
  });

  it('returns frozen controller parameters for a voice start, reads frozen inputs and draws no random numbers', () => {
    const random = vi.spyOn(Math, 'random');
    const deepFreeze = <T>(value: T): T => {
      if (typeof value === 'object' && value !== null) for (const child of Object.values(value)) deepFreeze(child);
      return Object.freeze(value);
    };
    const listener = deepFreeze(listenerAt(70, vec(5, 6, 7), [0, 0, 1, 0, 1, 0, -1, 0, 0]));
    const results = [
      nonPlayerParameters(listener, deepFreeze(entityReading(entity({ position: vec(300, -40, 900), speed: 950 })))),
      nonPlayerParameters(listener, deepFreeze(shotReading(deepFreeze(shot()), null))),
      engineParameters(deepFreeze(engine(150, 100))),
      engineParameters(engine(0, 100)),
      nonPlayerParameters(listener, sideways(vec(9000, 0, 0))),
    ];
    for (const result of results) {
      expect(Object.isFrozen(result)).toBe(true);
      expect(mergeVoiceParameters(defaultVoiceParameters(22050), result)).not.toBeNull();
    }
    expect(random).not.toHaveBeenCalled();
  });
});
