import { syntheticGroup } from '../synthetic-content.test-support.ts';
import type { FlightDataPayload, FlightDataRole } from './flight-data-content.ts';
import { encodeFlightDataPayload, flightDataDependencies } from './flight-data-payload.ts';

// Code-generated synthetic flight data for tests; it never holds original data. Builders return fresh mutable plain
// data that a test may corrupt. Numbers are arbitrary synthetic values chosen to exercise each type's edges.

const image = (id: string) => ({ id, kind: 'image' });
const entry = (sound: string, animation: string) => ({ sound: { id: sound, kind: 'sound' }, animation: { id: animation, kind: 'data' } });

/** Distinct f32 values, including a denormal and a value that needs 9 significant digits. */
export const syntheticSceneSettings = () => ({
  lightType3Colour: [Math.fround(0.3), 2 ** -149, -1.5],
  lightType0Colour: [Math.fround(1 / 3), 0, Math.fround(16_777_217)],
  deviceByte: 0xc7,
  deviceValues: { base: 1250.5, kinds1c7c: Math.fround(3.4028234663852886e38), kindsF8000: -(2 ** -126) },
  screenFlashes: [
    { randomMask: 0xffff_ffff, duration: 0.75, drawIntervalTicks: 17, level: -0x8000_0000 },
    { randomMask: 0x0000_8001, duration: Math.fround(2.1), drawIntervalTicks: 0, level: 0x7fff_ffff },
    { randomMask: 0, duration: 64, drawIntervalTicks: 0xffff_fffe, level: 0 },
  ],
});

/** Three lists of 3, 2 and 1 entries; the first and last list share an entry and the second lists one sound twice. */
export const syntheticExplosionTable = () => ({
  lists: [
    [entry('sound/synthetic/boom-b', 'data/synthetic-animation/03'), entry('sound/synthetic/boom-a', 'data/synthetic-animation/01'), entry('sound/synthetic/boom-a', 'data/synthetic-animation/02')],
    [entry('sound/synthetic/boom-c', 'data/synthetic-animation/04'), entry('sound/synthetic/boom-c', 'data/synthetic-animation/05')],
    [entry('sound/synthetic/boom-b', 'data/synthetic-animation/03')],
  ],
});

export const syntheticExplosionAnimation = () => ({
  frames: [image('image/synthetic-frame/02'), image('image/synthetic-frame/01'), image('image/synthetic-frame/03')],
});

export const syntheticNebulaBackgrounds = () => ({
  images: [image('image/synthetic-nebula/b'), image('image/synthetic-nebula/a'), image('image/synthetic-nebula/c'), image('image/synthetic-nebula/a')],
});

const CONTENT: Readonly<Record<FlightDataRole, () => unknown>> = {
  'scene-settings': syntheticSceneSettings,
  'explosion-table': syntheticExplosionTable,
  'explosion-animation': syntheticExplosionAnimation,
  'nebula-backgrounds': syntheticNebulaBackgrounds,
};

const IDS: Readonly<Record<FlightDataRole, string>> = {
  'scene-settings': 'data/scene-settings',
  'explosion-table': 'data/explosions',
  'explosion-animation': 'data/synthetic-animation/01',
  'nebula-backgrounds': 'data/nebula-backgrounds',
};

/** Synthetic content of `role` as a payload, for the typed encoders. */
export const syntheticFlightPayload = (role: FlightDataRole, content: unknown = CONTENT[role]()) => ({ role, content }) as FlightDataPayload;

/** The canonical bytes and a matching mutable descriptor for one role's synthetic content. */
export function syntheticFlightAsset(role: FlightDataRole, content: unknown = CONTENT[role]()) {
  const payload = syntheticFlightPayload(role, content);
  const bytes = encodeFlightDataPayload(payload);
  const dependencies = flightDataDependencies(payload).map(({ id }) => id);
  const [descriptor] = syntheticGroup('models', [{ id: IDS[role], role, dependencies, bytes }]).manifest.assets;
  return { bytes, descriptor };
}
