/**
 * The Warp effect's 50 ring templates `0x1aa030` (docs/original/formats/executable.md, WT2; docs/plan/p3/12/spec.md,
 * Warp 隧道效果, Q-11): start-up entry 17 (`0x4ff70(120.0)`) builds them before the program seeds its generator, from
 * draws 1129–3128 of the C library's default sequence, so they are the same in every run. A static code rule: no
 * presentation draw is taken. Each template is a ring of 20 points of radius 120 about the ring's z axis, the angle
 * jittered about steps of 2π/20 and z jittered in [−15, +5).
 *
 * The original computes in double precision and stores f32 where noted; FSIN/FCOS are the host's double sin and cos in
 * the baseline (executable.md, baseline emulator arithmetic).
 */
import type { Vec3 } from '../../../core/contracts/domain-events.ts';
import type { RandSource } from '../../../core/rules/original-random.ts';
import { DefaultSeedRand } from '../../../core/rules/startup-rotations.ts';

export const WARP_TEMPLATE_COUNT = 50;
export const WARP_RING_POINTS = 20;

/** The draws of start-up entries 15 (the star field, 1000) and 16 (the start-up rotations, 128) before this table. */
const DRAWS_BEFORE_TEMPLATES = 1128;
const RADIUS = 120;
/** rand % 20000 (signed `IDIV`; rand is never negative). */
const DRAW_RANGE = 20000;
const DRAW_SCALE = 1e-4;
const ANGLE_JITTER = 0.12;
const DEPTH_JITTER = 10;
const DEPTH_OFFSET = -5;
/** The running angle's step (f64 `0x171f44`), a decimal approximation of 2π/20. */
const ANGLE_STEP = 0.31415927;

/** One template: for each point r₁ then r₂; θ := ((r₁ × 1e-4 − 1) × 0.12) + a, and a := F(a + step) after the point. */
function template(rand: RandSource): readonly Vec3[] {
  const points: Vec3[] = [];
  let angle = 0;
  for (let point = 0; point < WARP_RING_POINTS; point++) {
    const theta = ((rand.next() % DRAW_RANGE) * DRAW_SCALE + -1) * ANGLE_JITTER + angle;
    const x = Math.fround(Math.cos(theta) * RADIUS);
    const y = Math.fround(Math.sin(theta) * RADIUS);
    const z = Math.fround(((rand.next() % DRAW_RANGE) * DRAW_SCALE + -1) * DEPTH_JITTER + DEPTH_OFFSET);
    points.push(Object.freeze({ x, y, z }));
    angle = Math.fround(angle + ANGLE_STEP);
  }
  return Object.freeze(points);
}

/** `0x1aa030`: template t's point j is WARP_TEMPLATES[t][j], in the ring's own frame (x along R0, y R1, z R2). */
export const WARP_TEMPLATES: readonly (readonly Vec3[])[] = (() => {
  const rand = new DefaultSeedRand();
  for (let draw = 0; draw < DRAWS_BEFORE_TEMPLATES; draw++) rand.next();
  return Object.freeze(Array.from({ length: WARP_TEMPLATE_COUNT }, () => template(rand)));
})();
