/**
 * The random direction `0x56b8c` and its start-up table (docs/original/formats/executable.md, numbers on the movement
 * path, P3-06/01): the module initialiser `0x568b0` fills 19 × 19 unit directions of the first octant, and each call
 * draws one of them and one of the eight sign octants. The table is computed, not stored in the image, so it is a code
 * rule (docs/plan/p3/06/spec.md, 技术决定 11). P3-06's float control path and parked travel use it, and so do P3-07's
 * and P3-08's rules.
 */
import type { Vec3 } from '../contracts/domain-events.ts';
import type { RandSource } from './original-random.ts';

/** The table's angles, in degrees: 0, 5, …, 90 for both. */
const ANGLE_STEP_DEGREES = 5;
const ANGLE_STEPS = 90 / ANGLE_STEP_DEGREES + 1;
/** f64 π × f64 1/180, the original's constants `0x17210c` and `0x172114`, multiplied in that order. */
const radians = (degrees: number): number => degrees * Math.PI * (1 / 180);

/**
 * Entry 19a + b, for azimuth a × 5° and polar angle b × 5°, is (f32(cos a · sin b), f32(sin a · sin b), f32(cos b)):
 * unit length up to rounding, every component non-negative. sin and cos come from Math.sin and Math.cos (spec, 数值).
 */
export const DIRECTION_TABLE: readonly Vec3[] = (() => {
  const table: Vec3[] = [];
  for (let azimuth = 0; azimuth < ANGLE_STEPS; azimuth++) {
    const a = radians(azimuth * ANGLE_STEP_DEGREES);
    for (let polar = 0; polar < ANGLE_STEPS; polar++) {
      const b = radians(polar * ANGLE_STEP_DEGREES);
      table.push(Object.freeze({ x: Math.fround(Math.cos(a) * Math.sin(b)), y: Math.fround(Math.sin(a) * Math.sin(b)), z: Math.fround(Math.cos(b)) }));
    }
  }
  return Object.freeze(table);
})();

/** The components each octant negates (x, y, z), in the order of the original's octant switch. */
const OCTANT_SIGNS: readonly (readonly [boolean, boolean, boolean])[] = Object.freeze([
  [false, false, false],
  [true, false, false],
  [false, true, false],
  [false, false, true],
  [true, true, false],
  [true, false, true],
  [false, true, true],
  [true, true, true],
]);

/** `0x56b8c`: two draws, rand % 361 for the entry, then rand % 8 for the octant whose components it negates. */
export function randomDirection(rand: RandSource): Vec3 {
  const { x, y, z } = DIRECTION_TABLE[rand.next() % DIRECTION_TABLE.length];
  const [negateX, negateY, negateZ] = OCTANT_SIGNS[rand.next() % OCTANT_SIGNS.length];
  return Object.freeze({ x: negateX ? -x : x, y: negateY ? -y : y, z: negateZ ? -z : z });
}
