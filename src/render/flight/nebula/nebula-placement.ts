/**
 * Where the original draws each nebula background (docs/original/formats/executable.md, NB1, NB3; docs/plan/p3/12/
 * spec.md, 星云背景; AC-09). Six slots hold world-fixed directions at infinity: a centre A and two points B, C 0.05 to
 * either side. Only the camera rows are used, never its position.
 *
 * - **Visibility:** zA = F(R2·A); the slot is drawn when zA ≥ K, K = F(cos(√2 · atan 0.5)) ≈ 0.792623 (about 37.57°).
 *   Any two slot directions are 90° or 180° apart, so with orthonormal rows at most one slot is visible.
 * - **Position:** with S = F(sin(atan 0.5)), hw = 320 and hd = 80 (HI), xA = F((R0·A) · (K ÷ zA)) and yA likewise
 *   with R1; sx = chop(hw + xA · (hw ÷ S)), sy = chop((hw − (hw ÷ S) · yA) − hd). This is not the 3D projection: the
 *   scale is about 567.155 in every view, and the centre row is 240, from the screen height, also in F1.
 * - **Angle:** B and C projected without the scale; θ = F(atan2(yB − yC, xB − xC)), y up.
 */
import type { Matrix3 } from '../../../core/world/entity-table.ts';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../composition/logical-screen.ts';

const f32 = Math.fround;

type Direction = readonly [number, number, number];

/** A slot's centre direction A and its offset points B and C, as the f32 values the original stores. */
export interface NebulaSlotDirections {
  readonly a: Direction;
  readonly b: Direction;
  readonly c: Direction;
}

const OFFSET = f32(0.05);

const slot = (a: Direction, b: Direction, c: Direction): NebulaSlotDirections => Object.freeze({
  a: Object.freeze(a), b: Object.freeze(b), c: Object.freeze(c),
});

/** The six slots of NB1, in slot order: +z, −z, +y, −y, +x, −x. */
export const NEBULA_SLOTS: readonly NebulaSlotDirections[] = Object.freeze([
  slot([0, 0, 1], [-OFFSET, 0, 1], [OFFSET, 0, 1]),
  slot([0, 0, -1], [-OFFSET, 0, -1], [OFFSET, 0, -1]),
  slot([0, 1, 0], [OFFSET, 1, 0], [-OFFSET, 1, 0]),
  slot([0, -1, 0], [-OFFSET, -1, 0], [OFFSET, -1, 0]),
  slot([1, 0, 0], [1, 0, -OFFSET], [1, 0, OFFSET]),
  slot([-1, 0, 0], [-1, 0, OFFSET], [-1, 0, -OFFSET]),
]);

const HALF_VIEW_ANGLE = Math.atan(0.5);
/** The cone limit K, cos of the largest angle between the view axis and a drawn direction. */
export const NEBULA_VISIBILITY = f32(Math.cos(Math.SQRT2 * HALF_VIEW_ANGLE));
const SINE = f32(Math.sin(HALF_VIEW_ANGLE));

/** The device's last column and row in HI, W = 639 and H = 479; hw = (W + 1) >> 1 and hd = (W − H) >> 1. */
const LAST_COLUMN = LOGICAL_WIDTH - 1;
const LAST_ROW = LOGICAL_HEIGHT - 1;
const HALF_WIDTH = (LAST_COLUMN + 1) >> 1;
const HEIGHT_OFFSET = (LAST_COLUMN - LAST_ROW) >> 1;
const SCALE = HALF_WIDTH / SINE;

/** A visible slot's blit: centre (sx, sy) on the logical screen and angle θ. */
export interface NebulaPlacement {
  readonly slot: number;
  readonly sx: number;
  readonly sy: number;
  readonly angle: number;
}

const dot = (rows: Matrix3, row: number, [x, y, z]: Direction): number => rows[row * 3] * x + rows[row * 3 + 1] * y + rows[row * 3 + 2] * z;

/** P projected without the screen scale: F((R0·P) · (K ÷ F(R2·P))) and likewise with R1. */
function unscaled(rows: Matrix3, point: Direction): readonly [number, number] {
  const ratio = NEBULA_VISIBILITY / f32(dot(rows, 2, point));
  return [f32(dot(rows, 0, point) * ratio), f32(dot(rows, 1, point) * ratio)];
}

/** Slot `slot`'s blit for camera rows `rows` (R0, R1, R2 row-major), or null when it is not drawn. */
export function nebulaPlacement(rows: Matrix3, slot: number): NebulaPlacement | null {
  const { a, b, c } = NEBULA_SLOTS[slot];
  const z = f32(dot(rows, 2, a));
  if (!(z >= NEBULA_VISIBILITY)) return null;
  const [x, y] = unscaled(rows, a);
  const [xb, yb] = unscaled(rows, b);
  const [xc, yc] = unscaled(rows, c);
  return Object.freeze({
    slot,
    sx: Math.trunc(HALF_WIDTH + x * SCALE),
    sy: Math.trunc(HALF_WIDTH - SCALE * y - HEIGHT_OFFSET),
    angle: f32(Math.atan2(yb - yc, xb - xc)),
  });
}
