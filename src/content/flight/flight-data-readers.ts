import { readAssetReference, type AssetReference } from '../asset-contract.ts';
import type { AssetKind } from '../asset-id.ts';
import { ContentContractError, fail, readArray, readRecord, requireFields } from '../contract-validation.ts';
import {
  FLIGHT_DATA_FORMAT, FLIGHT_DATA_LIMITS,
  type ExplosionAnimation, type ExplosionEntry, type ExplosionTable, type FlightDataPayload, type FlightDataRole,
  type NebulaBackgrounds, type SceneColour, type SceneSettings, type ScreenFlash,
} from './flight-data-content.ts';

// Strict readers for already decoded flight data content. Each returns frozen copies isolated from its input; the Asset
// references a payload makes are checked against its descriptor by flight-data-payload.ts.

function invalid(path: string, reason: string): never {
  return fail('invalid-flight-data-payload', path, reason);
}

/** Runs a reader so that every structural failure, including those of shared base readers, is `invalid-flight-data-payload`. */
function asFlightData<T>(read: () => T): T {
  try {
    return read();
  } catch (error) {
    if (error instanceof ContentContractError && error.code !== 'invalid-flight-data-payload') {
      throw new ContentContractError('invalid-flight-data-payload', error.path, error.reason);
    }
    throw error;
  }
}

function readFields(value: unknown, path: string, fields: readonly string[]): Record<string, unknown> {
  const record = readRecord(value, path);
  requireFields(record, path, fields);
  return record;
}

/** Checks the length before reading any item, so an oversized array is rejected without visiting its elements. */
function readList<T>(value: unknown, path: string, min: number, max: number, readItem: (item: unknown, path: string) => T): readonly T[] {
  const wrongCount = () => invalid(path, `must contain ${min === max ? `exactly ${min}` : `${min} to ${max}`} items`);
  if (Array.isArray(value) && value.length > max) wrongCount();
  const items = readArray(value, path, 'invalid-flight-data-payload', readItem);
  if (items.length < min) wrongCount();
  return items;
}

function readInteger(value: unknown, path: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    invalid(path, `must be an integer from ${min} to ${max}`);
  }
  // Adding 0 turns -0 into 0, the canonical spelling.
  return value + 0;
}

const readU8 = (value: unknown, path: string): number => readInteger(value, path, 0, 0xff);
const readU32 = (value: unknown, path: string): number => readInteger(value, path, 0, 0xffff_ffff);
const readI32 = (value: unknown, path: string): number => readInteger(value, path, -0x8000_0000, 0x7fff_ffff);

/** A finite number that an f32 holds exactly, so the stored bits round-trip. */
function readF32(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.fround(value) !== value) invalid(path, 'must be a finite f32 value');
  return value + 0;
}

function readReference(value: unknown, path: string, kind: AssetKind): AssetReference {
  const reference = readAssetReference(value, path);
  if (reference.kind !== kind) invalid(`${path}.kind`, `must be a ${kind} reference`);
  return reference;
}

const readColour = (value: unknown, path: string): SceneColour =>
  readList(value, path, FLIGHT_DATA_FORMAT.colourComponents, FLIGHT_DATA_FORMAT.colourComponents, readF32) as SceneColour;

function readScreenFlash(value: unknown, path: string): ScreenFlash {
  const record = readFields(value, path, ['randomMask', 'duration', 'drawIntervalTicks', 'level']);
  return Object.freeze({
    randomMask: readU32(record.randomMask, `${path}.randomMask`),
    duration: readF32(record.duration, `${path}.duration`),
    drawIntervalTicks: readU32(record.drawIntervalTicks, `${path}.drawIntervalTicks`),
    level: readI32(record.level, `${path}.level`),
  });
}

/** Reads scene settings (`data/scene-settings`, role `scene-settings`). */
export function readSceneSettings(value: unknown, path = 'sceneSettings'): SceneSettings {
  return asFlightData(() => {
    const record = readFields(value, path, ['lightType3Colour', 'lightType0Colour', 'deviceByte', 'deviceValues', 'screenFlashes']);
    const deviceValues = readFields(record.deviceValues, `${path}.deviceValues`, ['base', 'kinds1c7c', 'kindsF8000']);
    const { screenFlashes } = FLIGHT_DATA_FORMAT;
    return Object.freeze({
      lightType3Colour: readColour(record.lightType3Colour, `${path}.lightType3Colour`),
      lightType0Colour: readColour(record.lightType0Colour, `${path}.lightType0Colour`),
      deviceByte: readU8(record.deviceByte, `${path}.deviceByte`),
      deviceValues: Object.freeze({
        base: readF32(deviceValues.base, `${path}.deviceValues.base`),
        kinds1c7c: readF32(deviceValues.kinds1c7c, `${path}.deviceValues.kinds1c7c`),
        kindsF8000: readF32(deviceValues.kindsF8000, `${path}.deviceValues.kindsF8000`),
      }),
      screenFlashes: readList(record.screenFlashes, `${path}.screenFlashes`, screenFlashes, screenFlashes, readScreenFlash) as SceneSettings['screenFlashes'],
    });
  });
}

function readExplosionEntry(value: unknown, path: string): ExplosionEntry {
  const record = readFields(value, path, ['sound', 'animation']);
  return Object.freeze({
    sound: readReference(record.sound, `${path}.sound`, 'sound'),
    animation: readReference(record.animation, `${path}.animation`, 'data'),
  });
}

/** Reads an explosion table (`data/explosions`, role `explosion-table`). */
export function readExplosionTable(value: unknown, path = 'explosionTable'): ExplosionTable {
  return asFlightData(() => {
    const record = readFields(value, path, ['lists']);
    const { explosionLists } = FLIGHT_DATA_FORMAT;
    const lists = readList(record.lists, `${path}.lists`, explosionLists, explosionLists,
      (list, at) => readList(list, at, 0, FLIGHT_DATA_LIMITS.explosionListItems, readExplosionEntry));
    return Object.freeze({ lists: lists as ExplosionTable['lists'] });
  });
}

const readImage = (value: unknown, path: string): AssetReference => readReference(value, path, 'image');

/** Reads an explosion animation (`data/explosion-animation/…`, role `explosion-animation`). */
export function readExplosionAnimation(value: unknown, path = 'explosionAnimation'): ExplosionAnimation {
  return asFlightData(() => {
    const record = readFields(value, path, ['frames']);
    return Object.freeze({ frames: readList(record.frames, `${path}.frames`, 1, FLIGHT_DATA_LIMITS.animationFrames, readImage) });
  });
}

/** Reads a nebula background list (`data/nebula-backgrounds`, role `nebula-backgrounds`). */
export function readNebulaBackgrounds(value: unknown, path = 'nebulaBackgrounds'): NebulaBackgrounds {
  return asFlightData(() => {
    const record = readFields(value, path, ['images']);
    return Object.freeze({ images: readList(record.images, `${path}.images`, 0, FLIGHT_DATA_LIMITS.nebulaImages, readImage) });
  });
}

/** Reads already decoded content of `role` with the reader for that payload shape. */
export function readFlightDataContent(role: FlightDataRole, value: unknown, path?: string): FlightDataPayload {
  switch (role) {
    case 'scene-settings': return Object.freeze({ role, content: readSceneSettings(value, path) });
    case 'explosion-table': return Object.freeze({ role, content: readExplosionTable(value, path) });
    case 'explosion-animation': return Object.freeze({ role, content: readExplosionAnimation(value, path) });
    case 'nebula-backgrounds': return Object.freeze({ role, content: readNebulaBackgrounds(value, path) });
    default: return invalid(path ?? 'role', 'must be a flight data payload role');
  }
}
