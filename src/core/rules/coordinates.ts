/**
 * Mission coordinates in the original's runtime units (docs/original/formats/executable.md, runtime scale and load
 * conversion, P3-02/02; Q-03). Missions store reference units; at load the original multiplies each section-1 record
 * and each section-3 rectangle exactly once by q = f32(15000 ÷ referenceScale). Records reachable only through section
 * 5, `SCCT` wingman records and group layout offsets are already runtime units (the content layer applied the layout
 * load transform) and are never converted.
 *
 * World creation (subtask 07) converts with these functions; values outside the supported domain are CoreInputError at
 * the caller's path, so it rejects them before a world exists. The domain keeps runtime coordinates below 2^22 in
 * magnitude, which makes every conversion and random placement intermediate exact in double precision (the shipped
 * worlds reach 105,000).
 */
import type { MissionCoordinates, MissionDeclaration, SpawnRegion, StrategicMapFrame, Vector3 } from '../../content/logic/logic-content.ts';
import { CoreInputError } from '../errors.ts';
import { FLOAT32_MAX, isFiniteFloat32 } from './float32.ts';

/** The runtime world scale the mission builder passes at `0x66d3e`: one sector is 15000 runtime units. */
export const RUNTIME_SCALE = 15000;

/** Exclusive bound on the magnitude of a runtime coordinate. */
export const COORDINATE_LIMIT = 2 ** 22;

/** The most sectors per side for which the world extent 15000 × n stays below 2^23 (default placement stays exact). */
export const MAX_WORLD_SECTORS = 559;

// i32 inputs below 2^29 times a 24-bit factor are exact in double precision.
const EXACT_INTEGER_INPUT = 2 ** 29;

export interface WorldFrame {
  /**
   * n: the world is n × n sectors of RUNTIME_SCALE units centred on the origin, so the world rectangle `0x3a41c`
   * returns is ±7500 × n on x and y, and default placement spans the extent 15000 × n.
   */
  readonly sectors: number;
}

export interface RuntimeFrame extends WorldFrame {
  /** q = f32(15000 ÷ referenceScale), rounded to nearest. */
  readonly scaleFactor: number;
}

const OUTSIDE = 'is outside the supported coordinate range in runtime units';

function requireCoordinate(value: number, path: string): number {
  if (!(Math.abs(value) < COORDINATE_LIMIT)) throw new CoreInputError(path, OUTSIDE);
  return value;
}

function requireFloat32(value: number, path: string): number {
  if (!isFiniteFloat32(value)) throw new CoreInputError(path, 'must be a float32 value');
  return value;
}

function mapVector(vector: Vector3, path: string, map: (value: number, path: string) => number): Vector3 {
  return Object.freeze({ x: map(vector.x, `${path}.x`), y: map(vector.y, `${path}.y`), z: map(vector.z, `${path}.z`) });
}

/**
 * The scale factor and world of a mission. Only the slice's map frame is accepted: x to the right, y downwards, centred
 * on the origin, with a whole number of sectors; the world rectangle comes from that sector count, as `0x3a41c` derives
 * it from SCEN header 0x00/0x04 (`StrategicMapFrame.halfExtent` is n × referenceScale ÷ 2). Errors are at
 * `${path}.coordinates.*` and `${path}.mapFrame.*`.
 */
export function runtimeFrame(
  { coordinates, mapFrame }: { readonly coordinates: MissionCoordinates; readonly mapFrame: StrategicMapFrame },
  path: string,
): RuntimeFrame {
  const { referenceScale } = coordinates;
  // A finite float32 reference scale gives a normal factor whenever the quotient is within the float32 range.
  if (!(referenceScale > 0) || !isFiniteFloat32(referenceScale) || !(RUNTIME_SCALE / referenceScale <= FLOAT32_MAX)) {
    throw new CoreInputError(`${path}.coordinates.referenceScale`, 'must be a positive float32 whose runtime factor is a finite float32');
  }
  const at = `${path}.mapFrame`;
  if (mapFrame.rightAxis !== '+x') throw new CoreInputError(`${at}.rightAxis`, 'must be +x');
  if (mapFrame.upAxis !== '-y') throw new CoreInputError(`${at}.upAxis`, 'must be -y');
  if (mapFrame.center.right !== 0 || mapFrame.center.up !== 0) throw new CoreInputError(`${at}.center`, 'must be the origin');
  const sectors = (2 * mapFrame.halfExtent) / referenceScale;
  if (!Number.isInteger(sectors) || sectors < 1 || sectors > MAX_WORLD_SECTORS) {
    throw new CoreInputError(`${at}.halfExtent`, `must span a whole number of sectors from 1 to ${MAX_WORLD_SECTORS}`);
  }
  return Object.freeze({
    sectors,
    scaleFactor: Math.fround(RUNTIME_SCALE / referenceScale),
  });
}

/**
 * A declaration's stored position in runtime units. With origin `object` it is a section-1 record, converted once to
 * f32(p × q) per axis however many groups also reference it; otherwise (only `group-template`/`group-member`, or
 * `wingman-option`) the stored value is already runtime units and is returned unchanged. Errors are at
 * `${path}.position.*`.
 */
export function runtimePosition(
  { origins, position }: Pick<MissionDeclaration, 'origins' | 'position'>,
  scaleFactor: number,
  path: string,
): Vector3 {
  if (!origins.includes('object')) return runtimeVector(position, `${path}.position`);
  // The product of two float32 values is exact in double precision, so this is a single rounding.
  return mapVector(position, `${path}.position`, (value, at) => requireCoordinate(Math.fround(requireFloat32(value, at) * scaleFactor), at));
}

/**
 * A section-3 rectangle in runtime units: trunc(v × q) for each i32 value, as `0x74518` truncates toward zero. Placement
 * spans each axis upwards from x0 (y0) by |x1 − x0| (|y1 − y0|), so that far end must stay in the coordinate range too.
 */
export function runtimeRegion(region: SpawnRegion, scaleFactor: number, path: string): SpawnRegion {
  const convert = (value: number, at: string): number => {
    if (!Number.isInteger(value) || !(Math.abs(value) < EXACT_INTEGER_INPUT)) throw new CoreInputError(at, OUTSIDE);
    // `+ 0` turns the -0 of a small negative product into the integer 0.
    return requireCoordinate(Math.trunc(value * scaleFactor) + 0, at);
  };
  const axis = (from: number, to: number, fromPath: string, toPath: string): readonly [number, number] => {
    const start = convert(from, fromPath);
    const end = convert(to, toPath);
    requireCoordinate(start + Math.abs(end - start), toPath);
    return [start, end];
  };
  const [x0, x1] = axis(region.x0, region.x1, `${path}.x0`, `${path}.x1`);
  const [y0, y1] = axis(region.y0, region.y1, `${path}.y0`, `${path}.y1`);
  return Object.freeze({ x0, y0, x1, y1 });
}

/**
 * Checks a vector that is already in runtime units, such as a group layout offset, and returns it unchanged: every
 * component must be a float32 value within the supported coordinate range.
 */
export function runtimeVector(vector: Vector3, path: string): Vector3 {
  return mapVector(vector, path, (value, at) => requireCoordinate(requireFloat32(value, at), at));
}
