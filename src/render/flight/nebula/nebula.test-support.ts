import type { Matrix3 } from '../../../core/world/entity-table.ts';

// Synthetic camera rows for the nebula tests.

export type Vec = readonly [number, number, number];

const cross = ([ax, ay, az]: Vec, [bx, by, bz]: Vec): Vec => [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];

/** Rows (R0, R1, R2) with R2 = `dir`, R1 = `up` and R0 = R1 × R2, as drawn poses keep them. */
export const cameraRows = (up: Vec, dir: Vec): Matrix3 => [...cross(up, dir), ...up, ...dir] as unknown as Matrix3;

/** The identity turned by `angle` about y (positive turns the view axis towards +x). */
export const yaw = (angle: number): Matrix3 => cameraRows([0, 1, 0], [Math.sin(angle), 0, Math.cos(angle)]);

/** The identity turned by `angle` about x (positive turns the view axis towards −y, so +z appears higher). */
export const pitch = (angle: number): Matrix3 => cameraRows([0, Math.cos(angle), Math.sin(angle)], [0, -Math.sin(angle), Math.cos(angle)]);
