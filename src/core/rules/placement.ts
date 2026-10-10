/**
 * Placement service: the original placement routine `0x68398` for one spawn (docs/original/formats/executable.md,
 * placement mappings and section-5 dispatch, P3-02/02; scenario.md, spawn placement order; Q-02). World creation and
 * instantiation (subtask 07) and the rescue placement (P3-11) use it with runtime-unit inputs from coordinates.ts and
 * rand values from the world RNG (original-random.ts).
 *
 * Route selection, in order: grid (+0x40 non-zero; Core rejects it at world creation, so meeting it here is a fault),
 * anchor (+0x48), stored position (any component non-zero once the sign is ignored), rectangle (+0x44), path (+0x4C,
 * which the content cannot express) and the whole-world default. After the route the point gets the world check once,
 * then the initial attitude. The per-sector resource test that follows the world check in `0x68398` draws nothing and
 * belongs to instantiation; fixed-height kinds (mask 0x87c) are rejected at world creation.
 */
import type { SpawnRegion, Vector3 } from '../../content/logic/logic-content.ts';
import { CoreFaultError } from '../errors.ts';
import { RUNTIME_SCALE, type WorldFrame } from './coordinates.ts';
import { anchorOffset, rectangleCoordinate, worldCoordinate, type RandSource } from './original-random.ts';

/** Distance from the world edge of the band in which a placed point is pulled toward the origin. */
const WORLD_EDGE_BAND = 200;
/** How far the world check moves a point in the band toward the origin, once. */
const WORLD_EDGE_PULL = 300;
/** The float32 0.70710677 (bits 0x3F3504F3) that normalising (±1, ±1, 0) to f32 gives under either rounding mode. */
export const INITIAL_DIAGONAL = 0.7071067690849304;

/** An attitude as three rows (object +0x48, +0x54, +0x60); movement advances along the third. */
export type AttitudeRows = readonly [Vector3, Vector3, Vector3];

/** The route a placement took; an anchor whose object does not exist takes `world`. */
export type PlacementRoute = 'anchor' | 'stored' | 'region' | 'world';

/** The routing fields of the record being placed, in runtime units. */
export interface PlacementRecord {
  /** +0x40; anything but 0 selects the grid route, which Core does not implement. */
  readonly gridSpacing: number;
  /**
   * +0x48: null when the record has no anchor. Otherwise `target` is the position, at this moment, of the anchored
   * object: the oldest entity in the list of the anchor record's kind whose source record is the anchor record,
   * whatever its state; null when there is none, which is always the case for an anchor record of kind 0.
   */
  readonly anchor: { readonly target: Vector3 | null } | null;
  /** +0x24–+0x2C, float32 values. */
  readonly position: Vector3;
  /** +0x44 rectangle, or null. */
  readonly region: SpawnRegion | null;
}

export interface Placement {
  readonly route: PlacementRoute;
  readonly position: Vector3;
  readonly attitude: AttitudeRows;
}

const vector = (x: number, y: number, z: number): Vector3 => Object.freeze({ x, y, z });

interface RoutedPoint {
  readonly route: PlacementRoute;
  readonly point: Vector3;
}

/**
 * The whole-world default point `0x68c98`: x then y from one draw each, z = +0. Placement takes it for a record without
 * another route; instantiation's `0x68050` takes it as an AI goal point, without the world check.
 */
export function worldDefaultPoint({ sectors }: WorldFrame, rand: RandSource): Vector3 {
  const extent = RUNTIME_SCALE * sectors;
  const x = worldCoordinate(extent, rand.next());
  return vector(x, worldCoordinate(extent, rand.next()), 0);
}

function worldDefault(world: WorldFrame, rand: RandSource): RoutedPoint {
  return { route: 'world', point: worldDefaultPoint(world, rand) };
}

function routePoint(record: PlacementRecord, world: WorldFrame, rand: RandSource): RoutedPoint {
  if (record.gridSpacing !== 0) throw new CoreFaultError('invariant-violated', 'placement.grid');
  if (record.anchor) {
    const { target } = record.anchor;
    if (!target) return worldDefault(world, rand);
    const axis = (value: number): number => {
      const sign = rand.next();
      return Math.fround(value + anchorOffset(sign, rand.next()));
    };
    const x = axis(target.x);
    const y = axis(target.y);
    return { route: 'anchor', point: vector(x, y, axis(target.z)) };
  }
  const { x, y, z } = record.position;
  // `-0 !== 0` is false, so the test ignores the sign as the original's masked comparison does; the copy keeps it.
  if (x !== 0 || y !== 0 || z !== 0) return { route: 'stored', point: vector(x, y, z) };
  if (record.region) {
    const { x0, y0, x1, y1 } = record.region;
    const regionX = rectangleCoordinate(x0, x1, rand.next());
    return { route: 'region', point: vector(regionX, rectangleCoordinate(y0, y1, rand.next()), 0) };
  }
  return worldDefault(world, rand);
}

/**
 * The world check: a point inside the world rectangle ±7500 × n inset by WORLD_EDGE_BAND (bounds included) is
 * unchanged; otherwise x and y move once WORLD_EDGE_PULL toward the origin, without clamping or a second check, and z
 * is kept.
 */
function worldChecked(point: Vector3, { sectors }: WorldFrame): Vector3 {
  const limit = (RUNTIME_SCALE / 2) * sectors - WORLD_EDGE_BAND;
  const inside = (value: number): boolean => -limit <= value && value <= limit;
  if (inside(point.x) && inside(point.y)) return point;
  const inverseLength = 1 / Math.sqrt(point.x * point.x + point.y * point.y);
  const pulled = (value: number): number => Math.fround(value + Math.fround(value * inverseLength * -WORLD_EDGE_PULL));
  return vector(pulled(point.x), pulled(point.y), point.z);
}

/**
 * The initial attitude: facing away from the world centre along the diagonal of the point's quadrant (−0 counts as
 * positive). The original's first row can carry −0 in z; Core writes +0 there, which canonical text cannot tell apart.
 */
function initialAttitude({ x, y }: Vector3): AttitudeRows {
  const forwardX = x >= 0 ? INITIAL_DIAGONAL : -INITIAL_DIAGONAL;
  const forwardY = y >= 0 ? INITIAL_DIAGONAL : -INITIAL_DIAGONAL;
  return Object.freeze([vector(-forwardY, forwardX, 0), vector(0, 0, 1), vector(forwardX, forwardY, 0)] as const);
}

/**
 * Places one record: route, world check and initial attitude. Draws from `rand` in the original's order: anchor x sign,
 * x size, y sign, y size, z sign, z size; rectangle and world default x then y; a stored position draws nothing. The
 * result is frozen and detached from the inputs.
 */
export function placeRecord(record: PlacementRecord, world: WorldFrame, rand: RandSource): Placement {
  const { route, point } = routePoint(record, world, rand);
  const position = worldChecked(point, world);
  return Object.freeze({ route, position, attitude: initialAttitude(position) });
}

/**
 * Position of a section-5 member: f32(A + l) per axis for the layout cycle's anchor A and the member's layout offset l,
 * rounded to nearest. Members are not converted, not checked against the world and take the anchor's attitude.
 */
export function memberPosition(anchor: Vector3, offset: Vector3): Vector3 {
  return vector(Math.fround(anchor.x + offset.x), Math.fround(anchor.y + offset.y), Math.fround(anchor.z + offset.z));
}
