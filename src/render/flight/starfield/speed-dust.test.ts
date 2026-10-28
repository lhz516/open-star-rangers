import { describe, expect, it } from 'vitest';
import type { DomainEvent, Vec3 } from '../../../core/contracts/domain-events.ts';
import type { RenderState } from '../../../core/projections/render-state.ts';
import { cameraSpeedShare } from '../../../core/projections/speed-share.ts';
import { scriptedRand } from '../../../core/rules/rand.test-support.ts';
import type { Matrix3 } from '../../../core/world/entity-table.ts';
import { pitch, yaw } from '../nebula/nebula.test-support.ts';
import { renderState } from '../presentation/presentation.test-support.ts';
import type { PresentationCamera } from '../presentation/presentation-contract.ts';
import { FlightRenderError } from '../renderer/flight-render-error.ts';
import { IDENTITY_ROWS as IDENTITY } from '../scene/drawn-pose.ts';
import { drawDustLine, DUST_PARTICLE_COUNT, SpeedDust, type DustMark, type SpeedDustTick } from './speed-dust.ts';

// Independent expectations: the rules of P3-12/30 (docs/original/formats/executable.md, SD5; 30's 给 31 的计算步骤)
// transcribed below apart from the module, with scripted rand values. Code-generated inputs only; never original data.

const F1 = 0x0c;
const WARP = 1;
const DESTRUCTION = 0x11;
const vec = (x: number, y = 0, z = 0): Vec3 => Object.freeze({ x, y, z });

const viewportOf = (viewMode: number) => Object.freeze({ left: 0, top: 0, right: 639, bottom: viewMode === DESTRUCTION ? 479 : 315 });

interface TickSpec {
  readonly tick: number;
  readonly viewMode?: number;
  readonly share?: number;
  readonly observed?: boolean;
  readonly position?: Vec3;
  readonly rows?: Matrix3;
  readonly switches?: readonly [from: number, to: number][];
}

function tickOf({ tick, viewMode = F1, share = 100, observed = true, position = vec(0), rows = IDENTITY, switches = [] }: TickSpec): SpeedDustTick {
  const subMode = viewMode === DESTRUCTION ? 8 : 0;
  const render: RenderState = Object.freeze({ ...renderState(tick, { viewMode, subMode, observedEntityId: observed ? 1 : null }), speedShare: share });
  const events = switches.map(([fromViewMode, to]) => Object.freeze({
    event: Object.freeze({ type: 'view-switched', tick, fromViewMode, fromSubMode: 0, viewMode: to, subMode: to === DESTRUCTION ? 8 : 0, stage: 'frame-end', player: null }) as unknown as DomainEvent,
  }));
  const camera: PresentationCamera = Object.freeze({ tick, position, rows, viewMode, subMode, viewport: viewportOf(viewMode) });
  return { render, events, camera };
}

/** A deterministic rand sequence for the tests: an LCG's bits 16–30. */
function randSequence(count: number, seed = 12345): number[] {
  let state = seed >>> 0;
  return Array.from({ length: count }, () => {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0;
    return (state >>> 16) & 0x7fff;
  });
}

// --- The reference: SD5 written out again, without the module ---

interface RefParticle { p: [number, number, number]; sx: number; sy: number; drawn: boolean }

function referenceDust(next: () => number) {
  const f = Math.fround;
  const c = f(1 / 32767);
  const particles: RefParticle[] = Array.from({ length: 50 }, () => ({ p: [0, 0, 0], sx: -1, sy: 0, drawn: false }));
  let initialised = false;
  const place = (rows: Matrix3, cam: Vec3, x: number, y: number, z: number): [number, number, number] => [
    f(cam.x + f(y * rows[3] + x * rows[0] + z * rows[6])),
    f(cam.y + f(y * rows[4] + x * rows[1] + z * rows[7])),
    f(cam.z + f(y * rows[5] + x * rows[2] + z * rows[8])),
  ];
  const step = ({ render, events, camera }: SpeedDustTick): DustMark[] => {
    const mode = render.viewMode;
    for (const { event } of events) {
      if (event.type === 'view-switched' && (event.viewMode !== event.fromViewMode || event.viewMode === 0x11)) {
        initialised = false;
        particles.forEach((particle) => { particle.drawn = false; });
      }
    }
    if (!(mode === 1 || (mode >= 0xc && mode <= 0x12)) || render.observedEntityId === null) return [];
    const h = mode === 1 ? 100 : 30;
    const limit = mode === 1 ? 1000 : 300;
    const near = mode === 1 ? 250 : 75;
    const { rows, position: cam } = camera;
    if (!initialised) {
      for (const particle of particles) {
        const x = f(next() * c * f(2 * h) - h);
        const y = f(next() * c * f(2 * h) - h);
        const z = f(next() * c * limit);
        particle.p = place(rows, cam, x, y, z);
        particle.sx = -1;
        particle.drawn = false;
      }
      initialised = true;
    }
    if (render.speedShare <= 1) return [];
    const { right, bottom } = camera.viewport;
    const bright = mode === 0x11 || mode === 1 ? 7 : Math.trunc((5 * render.speedShare) / 100);
    const marks: DustMark[] = [];
    for (const particle of particles) {
      const [px, py, pz] = particle.p;
      const dx = px - cam.x;
      const dy = py - cam.y;
      const dz = pz - cam.z;
      const qx = f(dy * rows[1] + dx * rows[0] + dz * rows[2]);
      const qy = f(f(dy) * rows[4] + f(dx) * rows[3] + f(dz) * rows[5]);
      const qz = f(f(dy) * rows[7] + f(dx) * rows[6] + f(dz) * rows[8]);
      const dist = f(Math.abs(cam.y - py) + Math.abs(cam.x - px) + Math.abs(cam.z - pz));
      let ok = qz >= 0 && dist < limit;
      let sx = 0;
      let sy = 0;
      if (ok) {
        sx = Math.trunc(f(right) * qx * (1 / qz)) + (right >> 1);
        sy = Math.trunc(-f(right) * qy * (1 / qz)) + (bottom >> 1);
        ok = sx >= 1 && sx <= right - 1 && sy >= 1 && sy <= bottom - 1;
      }
      if (!ok) {
        const x = f(next() * c * f(2 * h) - h);
        const y = f(next() * c * f(2 * h) - h);
        const select = next() % 100;
        const r = next() * c;
        const z = select < 60 ? f(r * near) : f(r * f(limit - near) + near);
        particle.p = place(rows, cam, x, y, z);
        particle.drawn = false;
        continue;
      }
      const v = mode === 0x11 || mode === 1 ? dist : dist + near;
      const colour = Math.max(2, Math.min(7, 2 + bright - bright * Math.trunc(v * 0.004)));
      marks.push(mode === 1 && particle.drawn ? { type: 'line', x0: particle.sx, y0: particle.sy, x1: sx, y1: sy, colour } : { type: 'pixel', x: sx, y: sy, colour });
      particle.sx = sx;
      particle.sy = sy;
      particle.drawn = true;
    }
    return marks;
  };
  return { step, particles };
}

function compare(specs: readonly TickSpec[], seed = 7, marks: DustMark[] = []) {
  const values = randSequence(20_000, seed);
  const random = scriptedRand(values);
  const dust = new SpeedDust(random);
  let used = 0;
  const reference = referenceDust(() => values[used++]);
  for (const spec of specs) {
    const tick = tickOf(spec);
    dust.step(tick);
    const expected = reference.step(tick);
    expect(dust.pass?.marks, `tick ${spec.tick}`).toEqual(expected);
    marks.push(...expected);
    expect(random.used, `draws by tick ${spec.tick}`).toBe(used);
    expect(dust.particles.map(({ position: { x, y, z } }) => [x, y, z])).toEqual(reference.particles.map(({ p }) => p));
  }
  return dust;
}

/** A camera flying along +z and drifting sideways, turning a little each tick. */
function flight(from: number, count: number, viewMode: number, speed: number, extra: Partial<TickSpec> = {}, turn = yaw): TickSpec[] {
  return Array.from({ length: count }, (_, at) => ({
    tick: from + at, viewMode, position: vec(3 * Math.sin(at / 5), 0.5 * at, speed * (from + at)), rows: turn(0.004 * at), ...extra,
  }));
}

describe('speed dust 0x44f74 against the independent transcription (AC-23)', () => {
  it('matches every tick in F1, Warp and the destruction view, with respawns, lines and view resets', () => {
    const specs: TickSpec[] = [
      ...flight(1, 40, F1, 12),
      { ...flight(41, 1, WARP, 40)[0], switches: [[F1, WARP]] },
      ...flight(42, 40, WARP, 40),
      { ...flight(82, 1, F1, 12)[0], switches: [[WARP, F1]] },
      ...flight(83, 20, F1, 12, { share: 37 }),
      { ...flight(103, 1, DESTRUCTION, 3)[0], switches: [[F1, DESTRUCTION]] },
      ...flight(104, 30, DESTRUCTION, 3, { share: 2 }, pitch),
    ];
    const marks: DustMark[] = [];
    const dust = compare(specs, 7, marks);
    expect(dust.initialised).toBe(true);
    expect(new Set(marks.map(({ type }) => type))).toEqual(new Set(['pixel', 'line']));
    expect(new Set(marks.map(({ colour }) => colour))).toEqual(new Set([2, 3, 7]));
  });

  it('respawns and draws lines in a fast Warp, where most particles leave the box', () => {
    const marks: DustMark[] = [];
    compare(flight(1, 30, WARP, 300), 3, marks);
    expect(marks.filter(({ type }) => type === 'line').length).toBeGreaterThan(10);
  });
});

describe('speed dust rules (AC-23)', () => {
  /** Every rand value 16384: every particle at (0.000916, 0.000916, 150.0046) ahead of an identity camera at the origin (F1's box). */
  const centred = () => scriptedRand(Array<number>(150).fill(16384));

  it('initialises the 50 particles with 150 draws and draws them where the gate projection puts them', () => {
    const random = centred();
    const dust = new SpeedDust(random);
    dust.step(tickOf({ tick: 1, share: 100 }));
    expect(random.used).toBe(150);
    const { x, y, z } = dust.particles[0].position;
    expect([x, y, z]).toEqual([0.00091552734375, 0.00091552734375, 150.00457763671875]);
    // sx = chop(639 x / z) + 319, sy = chop(−639 y / z) + 157; L1 distance + 75 ≈ 225 < 250: k = 0, colour 2 + 5.
    expect(dust.pass?.marks).toHaveLength(DUST_PARTICLE_COUNT);
    expect(dust.pass?.marks[0]).toEqual({ type: 'pixel', x: 319, y: 157, colour: 7 });
  });

  it('takes the near brightness from the share outside views 0x11 and 1, and 7 in them', () => {
    const colourAt = (viewMode: number, share: number): number | undefined => {
      const dust = new SpeedDust(centred());
      dust.step(tickOf({ tick: 1, viewMode, share }));
      const mark = dust.pass?.marks[0];
      return mark?.type === 'pixel' ? mark.colour : undefined;
    };
    expect(colourAt(F1, 100)).toBe(7);
    expect(colourAt(F1, 60)).toBe(5);
    expect(colourAt(F1, 39)).toBe(3);
    expect(colourAt(F1, 2)).toBe(2);
    expect(colourAt(DESTRUCTION, 2)).toBe(7);
    // A share wrapped above 100 by the original's i16 store (FS-12) is still clamped to colour 7.
    expect(colourAt(F1, 5000)).toBe(7);
  });

  it('colours by distance: F1 2 + bright below 175, 2 beyond; 0x11 7 below 250, 2 beyond', () => {
    const colourFrom = (viewMode: number, distance: number): number | undefined => {
      const dust = new SpeedDust(centred());
      dust.step(tickOf({ tick: 1, viewMode, share: 100 }));
      // The camera moved back along z: every particle's L1 distance is about `distance` + 0.002.
      dust.step(tickOf({ tick: 2, viewMode, share: 100, position: vec(0, 0, 150.00457763671875 - distance) }));
      return dust.pass?.marks[0]?.colour;
    };
    expect(colourFrom(F1, 174.9)).toBe(7);
    expect(colourFrom(F1, 175.1)).toBe(2);
    expect(colourFrom(DESTRUCTION, 249.9)).toBe(7);
    expect(colourFrom(DESTRUCTION, 250.1)).toBe(2);
  });

  it('skips the whole layer once initialised while the share is at most 1: no draw, no change, no mark', () => {
    const random = scriptedRand(randSequence(400));
    const dust = new SpeedDust(random);
    dust.step(tickOf({ tick: 1, share: 1 }));
    expect([random.used, dust.initialised, dust.pass?.marks]).toEqual([150, true, []]);
    const before = dust.particles;
    for (const [tick, share] of [[2, 1], [3, 0], [4, -5]] as const) {
      dust.step(tickOf({ tick, share, position: vec(0, 0, 1000 * tick) }));
      expect([random.used, dust.pass?.marks]).toEqual([150, []]);
    }
    expect(dust.particles).toEqual(before);
    dust.step(tickOf({ tick: 5, share: 2 }));
    expect(dust.pass?.marks.length).toBeGreaterThan(0);
  });

  it('follows FS-12 in the destruction view: drawn before the explosion and while following, skipped once the fragment left', () => {
    // A synthetic player craft with trunc(+0xB8) = 150: A(30) = 20 before the explosion, A(45) = 30 for the fragment.
    const random = scriptedRand(randSequence(2000));
    const dust = new SpeedDust(random);
    const shares = [cameraSpeedShare(30, 150), cameraSpeedShare(45, 150), 0];
    expect(shares).toEqual([20, 30, 0]);
    dust.step(tickOf({ tick: 1, viewMode: DESTRUCTION, share: shares[0], switches: [[F1, DESTRUCTION]] }));
    expect(dust.pass?.marks.length).toBeGreaterThan(0);
    expect(dust.pass?.marks.every(({ colour }) => colour === 7 || colour === 2)).toBe(true);
    dust.step(tickOf({ tick: 2, viewMode: DESTRUCTION, share: shares[1], position: vec(0, 0, 3) }));
    expect(dust.pass?.marks.length).toBeGreaterThan(0);
    const used = random.used;
    dust.step(tickOf({ tick: 3, viewMode: DESTRUCTION, share: shares[2], position: vec(0, 0, 900) }));
    expect([dust.pass?.marks, random.used]).toEqual([[], used]);
  });

  it('initialises again after a reset even with the share at most 1, and once for several switches in a tick', () => {
    const random = scriptedRand(randSequence(1000));
    const dust = new SpeedDust(random);
    dust.step(tickOf({ tick: 1, share: 0 }));
    expect(random.used).toBe(150);
    dust.step(tickOf({ tick: 2, viewMode: WARP, share: 0, switches: [[F1, WARP]] }));
    expect(random.used).toBe(300);
    dust.step(tickOf({ tick: 3, viewMode: WARP, share: 0, switches: [[WARP, F1], [F1, WARP]] }));
    expect(random.used).toBe(450);
    // A switch to the same view is not a reset, except into 0x11.
    dust.step(tickOf({ tick: 4, viewMode: WARP, share: 0, switches: [[WARP, WARP]] }));
    expect(random.used).toBe(450);
    dust.step(tickOf({ tick: 5, viewMode: DESTRUCTION, share: 0, switches: [[DESTRUCTION, DESTRUCTION]] }));
    expect(random.used).toBe(600);
  });

  it('uses the box of the view current at the initialisation: ±100 to 1000 in Warp, ±30 to 300 elsewhere', () => {
    const top = scriptedRand(Array<number>(150).fill(32767));
    const warp = new SpeedDust(top);
    warp.step(tickOf({ tick: 1, viewMode: WARP, share: 0 }));
    const world = new SpeedDust(scriptedRand(Array<number>(150).fill(32767)));
    world.step(tickOf({ tick: 1, viewMode: F1, share: 0 }));
    const c = Math.fround(1 / 32767);
    expect(warp.particles[0].position).toEqual({ x: Math.fround(32767 * c * 200 - 100), y: Math.fround(32767 * c * 200 - 100), z: Math.fround(32767 * c * 1000) });
    expect(world.particles[0].position).toEqual({ x: Math.fround(32767 * c * 60 - 30), y: Math.fround(32767 * c * 60 - 30), z: Math.fround(32767 * c * 300) });
  });

  it('respawns with four draws (x, y, near selector, z) and does not draw a respawned particle that tick', () => {
    const near = [16384, 16384, 59, 16384];
    const far = [16384, 16384, 60, 16384];
    const random = scriptedRand([...Array<number>(150).fill(16384), ...near, ...Array.from({ length: 49 }, () => far).flat()]);
    const dust = new SpeedDust(random);
    dust.step(tickOf({ tick: 1, share: 100 }));
    // Past every particle: all 50 are behind the camera.
    dust.step(tickOf({ tick: 2, share: 100, position: vec(0, 0, 200) }));
    expect(random.used).toBe(150 + 4 * 50);
    expect(dust.pass?.marks).toEqual([]);
    const c = Math.fround(1 / 32767);
    expect(dust.particles[0].position.z).toBe(Math.fround(200 + Math.fround(16384 * c * 75)));
    expect(dust.particles[1].position.z).toBe(Math.fround(200 + Math.fround(16384 * c * 225 + 75)));
    expect(dust.particles.every(({ drawn }) => !drawn)).toBe(true);
  });

  it('draws in Warp a line from the previous pass\'s position, a pixel after a reset or respawn', () => {
    const dust = new SpeedDust(scriptedRand(Array<number>(300).fill(16384)));
    dust.step(tickOf({ tick: 1, viewMode: WARP, share: 100 }));
    // Warp's box puts every particle at z ≈ 500, beyond 250: colour 2.
    expect(dust.pass?.marks[0]).toEqual({ type: 'pixel', x: 319, y: 157, colour: 2 });
    dust.step(tickOf({ tick: 2, viewMode: WARP, share: 100, rows: yaw(0.05) }));
    const { screenX, screenY } = dust.particles[0];
    expect(screenX).toBeLessThan(319);
    expect(dust.pass?.marks[0]).toEqual({ type: 'line', x0: 319, y0: 157, x1: screenX, y1: screenY, colour: 2 });
    dust.step(tickOf({ tick: 3, viewMode: WARP, share: 100, rows: yaw(0.05), switches: [[WARP, F1], [F1, WARP]] }));
    expect(dust.pass?.marks[0].type).toBe('pixel');
  });

  it('draws nothing and changes nothing in views 6, 8 and 0x13 or without a player entity', () => {
    const random = scriptedRand([]);
    const dust = new SpeedDust(random);
    for (const [tick, viewMode] of [[1, 6], [2, 8], [3, 0x13]] as const) {
      dust.step(tickOf({ tick, viewMode, share: 100 }));
      expect(dust.pass?.marks).toEqual([]);
    }
    dust.step(tickOf({ tick: 4, share: 100, observed: false }));
    expect([random.used, dust.initialised, dust.pass?.marks]).toEqual([0, false, []]);
  });

  it('rejects a camera of another tick, a tick out of order and rand values outside 0–32767', () => {
    const dust = new SpeedDust(scriptedRand([40000]));
    const tick = tickOf({ tick: 2 });
    expect(() => dust.step({ ...tick, camera: { ...tick.camera, tick: 1 } })).toThrow(FlightRenderError);
    expect(() => dust.step(tick)).toThrow(/32767/);
    expect(() => dust.step(tickOf({ tick: 2 }))).toThrow(/after tick 2/);
  });
});

describe('dust line 0x5ad00', () => {
  const line = (x0: number, y0: number, x1: number, y1: number): number[][] => {
    const out: number[][] = [];
    drawDustLine(x0, y0, x1, y1, (x, y) => out.push([x, y]));
    return out;
  };

  it('plots both ends, one pixel per step of the major axis', () => {
    expect(line(5, 5, 5, 5)).toEqual([[5, 5]]);
    expect(line(1, 1, 4, 1)).toEqual([[1, 1], [2, 1], [3, 1], [4, 1]]);
    expect(line(4, 3, 4, 1)).toEqual([[4, 3], [4, 2], [4, 1]]);
    // The error starts at 2|d_minor| − |d_major| = 0, so the minor axis steps at once.
    expect(line(0, 0, 4, 2)).toEqual([[0, 0], [1, 1], [2, 1], [3, 2], [4, 2]]);
    expect(line(0, 0, -2, 4)).toEqual([[0, 0], [-1, 1], [-1, 2], [-2, 3], [-2, 4]]);
  });

  it('steps along y on a tie, and ends exactly at the second end for any slope', () => {
    expect(line(0, 0, 3, -3)).toEqual([[0, 0], [1, -1], [2, -2], [3, -3]]);
    for (const [x1, y1] of [[17, 5], [-9, 13], [3, -40], [-25, -24]]) {
      const points = line(0, 0, x1, y1);
      expect(points.at(-1)).toEqual([x1, y1]);
      expect(points).toHaveLength(Math.max(Math.abs(x1), Math.abs(y1)) + 1);
    }
  });
});
