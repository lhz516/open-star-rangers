import { describe, expect, it } from 'vitest';
import type { DomainEvent, Vec3 } from '../../../core/contracts/domain-events.ts';
import type { Projection, RadarContact } from '../../../core/projections/projection.ts';
import type { RenderEntity } from '../../../core/projections/render-state.ts';
import type { RandSource } from '../../../core/rules/original-random.ts';
import { randomDirection } from '../../../core/rules/random-direction.ts';
import type { Matrix3 } from '../../../core/world/entity-table.ts';
import type { CameraPose } from '../../flight/presentation/presentation-contract.ts';
import type { CockpitPresentation } from '../presentation/cockpit-contract.ts';
import { PresentationError } from '../presentation/cockpit-limits.ts';
import { cockpitRandom } from '../presentation/cockpit-random.ts';
import {
  cockpitBatch, cockpitContent, cockpitTick, createTestPresentation, FLIGHT_VIEW, isolatedDrawContext, TEST_SEED, viewSwitched, WARP_VIEW,
  type DeepPartial,
} from '../presentation/cockpit.test-support.ts';
import { createIndexedSurface, drawCircle, plot, type IndexedSurface } from '../raster/indexed-surface.ts';
import { createRadar, RADAR_BLINK_COLOUR, type RadarEntry, type RadarModule } from './radar.ts';
import { planeOffsets, projectOnPlane, radarGeometry, radarPoint, ZERO_DIRECTION } from './radar-geometry.ts';

// Expectations from docs/original/formats/hud.md §4.3 and executable.md T6 (Confirmed, code; P3-13/02), derived by
// hand: positions from the camera's rows (0 right, 1 up, 2 forward), colours and shapes from T6's tables, cadences
// from the strict comparisons. The synthetic radar record is (260, 330)–(380, 470) with interval 3: r = 58, centre
// (320, 400), scale 56. Never original data.

const RECT = { x0: 260, y0: 330, x1: 380, y1: 470 };
const IDENTITY: CameraPose = Object.freeze({ position: { x: 0, y: 0, z: 0 }, rows: [1, 0, 0, 0, 1, 0, 0, 0, 1] as unknown as Matrix3 });
/** Yawed so that right is −z, up is +y and forward is +x, at (10, 0, 0). */
const YAWED: CameraPose = Object.freeze({ position: { x: 10, y: 0, z: 0 }, rows: [0, 0, -1, 0, 1, 0, 1, 0, 0] as unknown as Matrix3 });

const GEOMETRY = radarGeometry(RECT);
const point = (position: Vec3, camera = IDENTITY, cached = ZERO_DIRECTION) => radarPoint(position, camera, planeOffsets(camera), GEOMETRY, cached);

describe('geometry (set-up 0x3ffb4)', () => {
  it('derives centre, radius, scale, rings and the disc’s row spans from the rectangle', () => {
    expect(GEOMETRY).toMatchObject({ cx: 320, cy: 400, radius: 58, scale: 56, rings: { half: 29, tenth: 5, nineTenths: 52 } });
    // Rows within 58 of the centre: 342–458. Half-widths √(58² − d²) + 3, at least 10.
    expect(GEOMETRY.spans).toHaveLength(117);
    expect(GEOMETRY.spans[0]).toEqual({ y: 342, x0: 310, x1: 330 });
    expect(GEOMETRY.spans[1]).toEqual({ y: 343, x0: 307, x1: 333 });
    expect(GEOMETRY.spans[58]).toEqual({ y: 400, x0: 259, x1: 381 });
    expect(GEOMETRY.spans.at(-1)).toEqual({ y: 458, x0: 310, x1: 330 });
  });

  it('rejects a rectangle too small for a radius of 0', () => {
    expect(radarGeometry({ x0: 0, y0: 0, x1: 3, y1: 3 }).radius).toBe(0);
    expect(() => radarGeometry({ x0: 0, y0: 0, x1: 2, y1: 20 })).toThrow(PresentationError);
  });
});

describe('projection (0x40d44)', () => {
  it('maps straight ahead to the centre, through the degenerate in-plane direction', () => {
    const ahead = point({ x: 0, y: 0, z: 100 });
    expect([ahead.x, ahead.y, ahead.side]).toEqual([320, 400, true]);
    expect(ahead.direction).toMatchObject({ a: 0, b: 0, forwardOnRow0Plane: 1 });
  });

  it('maps right, below and up-front by the camera rows, independent of distance', () => {
    // Right: b = 1 → the row-1 plane, c = 0, f = 0.5: x = 320 + 56 × 0.5.
    expect(point({ x: 100, y: 0, z: 0 })).toMatchObject({ x: 348, y: 400, side: true, direction: { a: 0, b: 1 } });
    expect(point({ x: 7, y: 0, z: 0 })).toMatchObject({ x: 348, y: 400 });
    // Below: a = −1, c = 0: y = 400 + 28.
    expect(point({ x: 0, y: -100, z: 0 })).toMatchObject({ x: 320, y: 428, side: true });
    // Up and ahead at 45°: c = f32(√½), f = f32((1 − c) / 2) ≈ 0.146447, y = chop(400 − 56 × f) = chop(391.80).
    expect(point({ x: 0, y: 100, z: 100 })).toMatchObject({ x: 320, y: 391, side: true });
    // Behind and left at 45°: b = −1, c = −√½, f ≈ 0.853553, x = chop(320 − 47.80); behind the camera plane.
    expect(point({ x: -50, y: 0, z: -50 })).toMatchObject({ x: 272, y: 400, side: false });
  });

  it('uses the camera’s position and orientation (plane offsets from the same pose)', () => {
    // Forward is +x from (10, 0, 0): (10, 0, 50) is 90° to the left, on the camera plane.
    expect(point({ x: 10, y: 0, z: 50 }, YAWED)).toMatchObject({ x: 292, y: 400, side: true });
    // (−40, 0, 50) is 45° behind on the left.
    expect(point({ x: -40, y: 0, z: 50 }, YAWED)).toMatchObject({ x: 272, y: 400, side: false });
    expect(planeOffsets(YAWED)).toEqual([-0, -0, -10]);
  });

  it('stores the plane distance once after adding the offset, so a contact just behind a far camera plane is behind', () => {
    const [cos, sin] = [Math.fround(Math.cos(0.5)), Math.fround(Math.sin(0.5))];
    const camera: CameraPose = {
      position: { x: Math.fround(123456.7), y: Math.fround(-9876.5), z: Math.fround(54321.1) },
      rows: [cos, 0, -sin, 0, 1, 0, sin, 0, cos] as unknown as Matrix3,
    };
    const position = { x: 123459.3359375, y: -9875.5, z: 54319.66015625 };
    // d = f32((p.y R21 + p.z R22) + p.x R20 + off2), off2 = −f32(R2 · camera): about −0.001 here, while storing the
    // dot product before adding the offset would give +0.
    const raw = (v: Vec3): number => v.y * 0 + v.z * cos + v.x * sin;
    const d = Math.fround(raw(position) - Math.fround(raw(camera.position)));
    expect(d).toBeLessThan(0);
    expect(Math.fround(Math.fround(raw(position)) - Math.fround(raw(camera.position)))).toBe(0);
    expect(projectOnPlane(position, 2, camera, planeOffsets(camera)).side).toBe(false);
  });

  it('keeps the cached values when a projection degenerates', () => {
    const right = point({ x: 100, y: 0, z: 0 });
    // Straight behind: the in-plane direction degenerates, so a and b stay (0, 1); |b| ≥ 0.707 picks the row-1 plane,
    // where c = −1 and f = 1: x = 320 + 56.
    const behind = point({ x: 0, y: 0, z: -100 }, IDENTITY, right.direction);
    expect(behind).toMatchObject({ x: 376, y: 400, side: false, direction: { a: 0, b: 1, forwardOnRow1Plane: -1 } });
    // A new block holds 0: b = 0 picks the row-0 plane, c = −1, but b × f is 0, so the centre.
    expect(point({ x: 0, y: 0, z: -100 })).toMatchObject({ x: 320, y: 400 });
  });
});

const contact = (entityId: number, position: Vec3, kind: RadarContact['class'] = 'hostile', options: Partial<RadarContact> = {}): RadarContact =>
  ({ entityId, offset: position, position, class: kind, missile: false, near: false, target: false, ...options });

interface TickSetup {
  readonly status?: 0 | 1 | 2;
  readonly contacts?: readonly RadarContact[];
  readonly player?: boolean;
  readonly viewMode?: number;
  readonly events?: readonly DomainEvent[];
}

function tickOf(tick: number, { status = 0, contacts = [], player = true, viewMode = FLIGHT_VIEW, events }: TickSetup = {}) {
  const patch: DeepPartial<Projection> = player
    ? { flight: { combat: { readiness: 'ready', player: { entityId: 1, radar: { status, contacts } } } } } as DeepPartial<Projection>
    : {};
  const entities = [{ id: 1 }, ...contacts.map(({ entityId }) => ({ id: entityId }))] as unknown as RenderEntity[];
  return cockpitTick(tick, { patch, viewMode, events, render: { entities } });
}

function start(seed = TEST_SEED, mutateInterval?: number): { presentation: CockpitPresentation; radar: RadarModule } {
  const radar = createRadar();
  const content = mutateInterval === undefined ? cockpitContent() : cockpitContent((mutable) => {
    mutable.slots[0].instruments.find(({ type }) => type === 5)!.redrawInterval = mutateInterval;
  });
  return { presentation: createTestPresentation({ modules: [radar], content, seed }), radar };
}

const run = (presentation: CockpitPresentation, first: number, last: number, setup: TickSetup | ((tick: number) => TickSetup) = {}): void => {
  for (let tick = first; tick <= last; tick++) presentation.advance(cockpitBatch([tickOf(tick, typeof setup === 'function' ? setup(tick) : setup)]));
};

const pixel = (surface: IndexedSurface, x: number, y: number): number => surface.indices[y * surface.width + x];

/** The 0xD ring set: 0.5r limited to 8 steps per octant, full circles at 0.1r, 0.9r and r, and the centre. */
function ringPixels(): Set<number> {
  const scratch = createIndexedSurface(640, 480);
  drawCircle(scratch, 320, 400, 29, 1, 8);
  drawCircle(scratch, 320, 400, 5, 1);
  drawCircle(scratch, 320, 400, 52, 1);
  drawCircle(scratch, 320, 400, 58, 1);
  plot(scratch, 320, 400, 1);
  return new Set([...scratch.indices.keys()].filter((at) => scratch.indices[at] === 1));
}

const colourAt = (surface: IndexedSurface, colour: number): Set<number> => new Set([...surface.indices.keys()].filter((at) => surface.indices[at] === colour));

const CONTACTS: readonly RadarContact[] = [
  contact(2, { x: 100, y: 0, z: 0 }),
  contact(3, { x: 0, y: -100, z: 0 }, 'friendly', { near: true }),
  contact(4, { x: 50, y: 0, z: -50 }, 'hostile', { missile: true }),
  contact(5, { x: 0, y: 100, z: 100 }, 'marker', { target: true }),
  contact(6, { x: -100, y: 0, z: 0 }, 'friendly', { missile: true }),
  contact(7, { x: -50, y: 0, z: -50 }),
  contact(8, { x: 0, y: -50, z: -60 }, 'friendly'),
  contact(9, { x: 100, y: 0, z: 100 }, 'hostile', { near: true }),
];

describe('build and draw (0x401e8, 0x40370)', () => {
  it('projects, classifies and shapes Core’s contacts in order, boxes the target and draws the rings after them', () => {
    const { presentation, radar } = start();
    run(presentation, 1, 1, { contacts: CONTACTS });
    const expected: RadarEntry[] = [
      { x: 348, y: 400, colour: 9, blink: false, shape: 'plus' },
      { x: 320, y: 428, colour: 0x10, blink: false, shape: 'plus' },
      { x: 367, y: 400, colour: 0x0c, blink: true, shape: 'large-cross' },
      { x: 320, y: 391, colour: 8, blink: false, shape: 'plus' },
      { x: 320, y: 391, colour: 0x0f, blink: false, shape: 'box' },
      { x: 292, y: 400, colour: 0x10, blink: true, shape: 'large-cross' },
      { x: 272, y: 400, colour: 9, blink: false, shape: 'cross' },
      // Below and behind: a = −1, then c = −60 / √6100 on the row-0 plane, f ≈ 0.884111, y = chop(400 + 49.51).
      { x: 320, y: 449, colour: 0x0f, blink: false, shape: 'cross' },
      // 45° right and ahead: c = √½, f ≈ 0.146447, x = chop(320 + 8.20).
      { x: 328, y: 400, colour: 0x0a, blink: false, shape: 'plus' },
    ];
    expect(radar.state().entries).toEqual(expected);
    const { screen } = presentation.surfaces();
    // The hostile far plus at (348, 400); the target box's outline with index 0 at its edge midpoints over the marker.
    for (const [x, y] of [[348, 399], [348, 400], [348, 401], [347, 400]]) expect(pixel(screen, x, y)).toBe(9);
    // Its right arm (349, 400) is the 0.5r ring's axis point, drawn over it.
    expect(pixel(screen, 349, 400)).toBe(0x0d);
    for (const [x, y] of [[318, 389], [322, 393], [319, 389]]) expect(pixel(screen, x, y)).toBe(0x0f);
    for (const [x, y] of [[318, 391], [322, 391], [320, 389], [320, 393]]) expect(pixel(screen, x, y)).toBe(0);
    expect(pixel(screen, 320, 391)).toBe(8);
    // The missiles' 5 × 5 X: corners and centre.
    for (const [x, y] of [[365, 398], [369, 402], [369, 398], [365, 402], [367, 400]]) expect(pixel(screen, x, y)).toBe(0x0c);
    // Rings in 0xD, drawn last, and no other 0xD pixel: no crosshair.
    expect(colourAt(screen, 0x0d)).toEqual(ringPixels());
    expect(pixel(screen, 320, 380)).toBe(0);
    expect(presentation.schedule().randomDraws).toBe(0);
  });

  it('clears and copies exactly the disc spans, and draws without a player only the cleared disc', () => {
    for (const player of [true, false]) {
      const radar = createRadar();
      const { context, surfaces: { back, screen }, published } = isolatedDrawContext(1, {
        patch: player ? { flight: { combat: { player: { entityId: 1, radar: { status: 0, contacts: [] } } } } } as DeepPartial<Projection> : {},
      });
      const [record] = context.layout.slot!.instruments.filter(({ type }) => type === 5);
      radar.instruments![5]!.activate!(context, record);
      back.indices.fill(3);
      radar.instruments![5]!.draw(context, record);
      expect(published).toEqual(GEOMETRY.spans.map(({ y, x0, x1 }) => ({ x0, y0: y, x1, y1: y })));
      const inSpans = new Set(GEOMETRY.spans.flatMap(({ y, x0, x1 }) => Array.from({ length: x1 - x0 + 1 }, (_, i) => y * 640 + x0 + i)));
      const rings = player ? ringPixels() : new Set<number>();
      back.indices.forEach((index, at) => {
        const expected = rings.has(at) ? 0x0d : inSpans.has(at) ? 0 : 3;
        if (index !== expected) throw new Error(`pixel ${at % 640},${Math.floor(at / 640)}: ${index} ≠ ${expected}`);
      });
      // A copied pixel outside the spans would show 3 in S; none does.
      expect([...screen.indices].some((index) => index === 3)).toBe(false);
      expect(radar.state().drawn).toBe(player);
    }
  });

  it('rebuilds only when its due is below the clock (strict), due := clock + 5, so an interval below 5 skips rebuilds', () => {
    const { presentation, radar } = start();
    const moving = (tick: number): TickSetup => ({ contacts: [contact(2, { x: 100, y: tick, z: 0 })] });
    // Interval 3 draws at clocks 2, 6, 10, 14, …; rebuilds at 2 (due 7), 10 (due 15), 18, …
    const rebuilt: number[] = [];
    let last: RadarEntry | undefined;
    for (let tick = 1; tick <= 13; tick++) {
      run(presentation, tick, tick, moving(tick));
      const [entry] = radar.state().entries;
      if (entry !== last) rebuilt.push(tick);
      last = entry;
    }
    expect(rebuilt).toEqual([1, 5, 9, 13]);
    expect(radar.state().rebuildDue).toBe(26 + 5);
    // An interval of 6 (above 5, as slot 0's) rebuilds at every scheduled call.
    const every = start(TEST_SEED, 6);
    const calls: number[] = [];
    let previous: RadarEntry | undefined;
    for (let tick = 1; tick <= 16; tick++) {
      run(every.presentation, tick, tick, moving(tick));
      const [entry] = every.radar.state().entries;
      if (entry !== previous) calls.push(tick);
      previous = entry;
    }
    expect(calls).toEqual([1, 5, 9, 13]);
  });

  it('erases the drawn entries in B at the next pre-pass while S keeps them, and toggles the blink strictly after 0x10', () => {
    const { presentation, radar } = start();
    const missile = { contacts: [contact(2, { x: 100, y: 0, z: 0 }, 'hostile', { missile: true })] };
    run(presentation, 1, 1, missile);
    // Tick 1 (clock 2): the blink due 0 is below 2, so the phase becomes 1 and the due 18.
    expect(radar.state()).toMatchObject({ drawn: true, blinkPhase: 1, blinkDue: 18 });
    const { back, screen } = presentation.surfaces();
    expect([pixel(back, 348, 400), pixel(screen, 348, 400)]).toEqual([0x0c, 0x0c]);
    run(presentation, 2, 2, missile);
    expect(radar.state().drawn).toBe(false);
    expect([pixel(back, 348, 400), pixel(screen, 348, 400)]).toEqual([0, 0x0c]);
    // Draws at clocks 6, 10, 14, 18 (18 < 18 fails); the pre-pass at clock 20 toggles to phase 0, due 36.
    run(presentation, 3, 9, missile);
    expect(radar.state()).toMatchObject({ blinkPhase: 1, blinkDue: 18 });
    run(presentation, 10, 10, missile);
    expect(radar.state()).toMatchObject({ blinkPhase: 0, blinkDue: 36 });
    run(presentation, 11, 11, missile);
    expect(pixel(screen, 348, 400)).toBe(RADAR_BLINK_COLOUR);
  });

  it('keeps each contact’s cached direction while it is presentable and lets the overlay read it', () => {
    const { presentation, radar } = start();
    run(presentation, 1, 1, { contacts: [contact(2, { x: 100, y: 0, z: 0 }), contact(3, { x: 0, y: -100, z: 0 })] });
    expect(radar.cachedDirection(2)).toEqual({ a: 0, b: 1 });
    expect(radar.cachedDirection(3)).toEqual({ a: -1, b: 0 });
    expect(radar.cachedDirection(99)).toEqual({ a: 0, b: 0 });
    // Straight behind at the next rebuild (tick 5): the cache picks the row-1 plane, so the far right edge.
    run(presentation, 2, 5, { contacts: [contact(2, { x: 0, y: 0, z: -100 })] });
    expect(radar.state().entries[0]).toMatchObject({ x: 376, y: 400, shape: 'cross' });
    expect(radar.cachedDirection(2)).toEqual({ a: 0, b: 1 });
    expect(radar.cachedDirection(3)).toEqual({ a: 0, b: 0 });
  });
});

/** hud §4.3's noise, written out from the record: (entries, draws) for `count` real entries. */
function expectedNoise(random: RandSource, status: 1 | 2, count: number): { readonly noise: RadarEntry[]; readonly draws: number } {
  let draws = 0;
  const next = (): number => {
    draws++;
    return random.next();
  };
  const counted: RandSource = { next };
  const noise: RadarEntry[] = [];
  const at = (): { x: number; y: number } => {
    const v = randomDirection(counted);
    return { x: 320 + Math.trunc(v.x * 56), y: 400 + Math.trunc(v.y * 56) };
  };
  if (status === 1) {
    const end = count + (next() & 7);
    while (count < end) {
      const { x, y } = at();
      const colour = (next() & 1) === 1 ? 10 : 9;
      const blink = (next() & 1) === 1;
      const shape = (next() & 1) === 1 ? 'plus' : 'cross';
      noise.push({ x, y, colour, blink, shape });
      count++;
      if (count < end && (next() & 7) === 2) {
        noise.push({ x, y, colour: 0x0f, blink: false, shape: 'box' });
        count++;
      }
    }
  } else {
    for (; count < 60; count++) {
      const { x, y } = at();
      const colour = (next() & 1) === 1 ? 10 : 9;
      const blink = (next() & 1) === 1;
      noise.push({ x, y, colour, blink, shape: (['pixel', 'plus', 'cross', 'pixel'] as const)[next() & 3] });
    }
  }
  return { noise, draws };
}

/** A seed whose first draw has rand & 7 ≥ `least`, so status 1 adds that much noise or more. */
function seedWithNoise(least: number): number {
  for (let seed = TEST_SEED; ; seed++) if ((cockpitRandom(seed).next() & 7) >= least) return seed;
}

describe('damage noise and the 120-entry limit (DC-08)', () => {
  it('status 1 keeps the real entries and adds rand & 7 noise entries and fake boxes: 1 + 5 per entry + 1 while noise remains', () => {
    const seed = seedWithNoise(5);
    const { presentation, radar } = start(seed);
    const contacts = [contact(2, { x: 100, y: 0, z: 0 }, 'hostile', { target: true })];
    run(presentation, 1, 1, { status: 1, contacts });
    const { noise, draws } = expectedNoise(cockpitRandom(seed), 1, 2);
    expect(noise.length).toBeGreaterThanOrEqual(5);
    expect(radar.state().entries).toEqual([
      { x: 348, y: 400, colour: 9, blink: false, shape: 'plus' }, { x: 348, y: 400, colour: 0x0f, blink: false, shape: 'box' }, ...noise,
    ]);
    expect(presentation.schedule().randomDraws).toBe(draws);
    expect(radar.state().noiseDropped).toBe(0);
  });

  it('status 2 has no contact and exactly 60 noise entries by rand & 3 shapes: 300 draws', () => {
    const { presentation, radar } = start();
    run(presentation, 1, 1, { status: 2, contacts: [] });
    const { noise, draws } = expectedNoise(cockpitRandom(TEST_SEED), 2, 0);
    expect(draws).toBe(300);
    expect(radar.state().entries).toEqual(noise);
    expect(presentation.schedule().randomDraws).toBe(300);
    expect(new Set(noise.map(({ shape }) => shape))).toEqual(new Set(['pixel', 'plus', 'cross']));
  });

  it('keeps noise only below 120 entries, still draws every number, counts the rest and never throws', () => {
    const seed = seedWithNoise(4);
    const full = Array.from({ length: 119 }, (_, i) => contact(100 + i, { x: 100, y: 0, z: 0 }, 'hostile', { target: i === 118 }));
    const { presentation, radar } = start(seed);
    run(presentation, 1, 1, { status: 1, contacts: full });
    const { noise, draws } = expectedNoise(cockpitRandom(seed), 1, 120);
    expect(noise.length).toBeGreaterThanOrEqual(4);
    expect(radar.state().entries).toHaveLength(120);
    expect(radar.state().noiseDropped).toBe(noise.length);
    expect(presentation.schedule().randomDraws).toBe(draws);
    // At 118 real entries the first two noise entries (or one and its fake box) still fit.
    const partial = start(seed);
    run(partial.presentation, 1, 1, { status: 1, contacts: full.slice(0, 118).map((item) => ({ ...item, target: false })) });
    const near = expectedNoise(cockpitRandom(seed), 1, 118);
    expect(partial.radar.state().entries.slice(118)).toEqual(near.noise.slice(0, 2));
    expect(partial.radar.state().noiseDropped).toBe(near.noise.length - 2);
    expect(partial.presentation.schedule().randomDraws).toBe(near.draws);
  });

  it('rejects more than 120 real entries, which Core never gives', () => {
    const { presentation } = start();
    const tooMany = Array.from({ length: 120 }, (_, i) => contact(100 + i, { x: 100, y: 0, z: 0 }, 'hostile', { target: i === 119 }));
    expect(() => run(presentation, 1, 1, { contacts: tooMany })).toThrow(PresentationError);
    expect(presentation.status()).toBe('failed');
  });
});

describe('Warp (view mode 1)', () => {
  it('neither rebuilds, draws entries, toggles the blink nor draws a number: only the cleared disc and the rings', () => {
    const { presentation, radar } = start();
    run(presentation, 1, 1, { status: 1, contacts: CONTACTS });
    const before = radar.state();
    const draws = presentation.schedule().randomDraws;
    // Tick 2 switches to Warp: S is cleared and every record is forced; the pre-pass erases the drawn entries once.
    presentation.advance(cockpitBatch([tickOf(2, { status: 1, contacts: CONTACTS, viewMode: WARP_VIEW, events: [viewSwitched(2, FLIGHT_VIEW, WARP_VIEW)] })]));
    run(presentation, 3, 40, { status: 2, contacts: [], viewMode: WARP_VIEW });
    expect(radar.state()).toEqual({ ...before, drawn: false });
    expect(presentation.schedule().randomDraws).toBe(draws);
    const { screen } = presentation.surfaces();
    const disc = new Set(GEOMETRY.spans.flatMap(({ y, x0, x1 }) => Array.from({ length: x1 - x0 + 1 }, (_, i) => y * 640 + x0 + i)));
    const rings = ringPixels();
    for (const at of disc) expect(screen.indices[at]).toBe(rings.has(at) ? 0x0d : 0);
  });
});

it('is the same state and picture whether ticks come one by one or in batches', () => {
  const setup = (tick: number): TickSetup => ({ status: ([0, 1, 1, 2, 0] as const)[tick % 5], contacts: tick % 5 === 3 ? [] : CONTACTS.map((item) => ({ ...item, position: { ...item.position, y: item.position.y + tick } })) });
  const single = start();
  run(single.presentation, 1, 20, setup);
  const batched = start();
  for (const [first, last] of [[1, 5], [6, 6], [7, 9], [10, 14], [15, 19], [20, 20]]) {
    batched.presentation.advance(cockpitBatch(Array.from({ length: last - first + 1 }, (_, i) => tickOf(first + i, setup(first + i)))));
  }
  expect(batched.radar.state()).toEqual(single.radar.state());
  expect(batched.presentation.surfaces().screen.indices).toEqual(single.presentation.surfaces().screen.indices);
  expect(batched.presentation.schedule()).toEqual(single.presentation.schedule());
  expect(single.presentation.schedule().randomDraws).toBeGreaterThan(0);
});
