import { describe, expect, it } from 'vitest';
import type { DomainEvent } from '../../../core/contracts/domain-events.ts';
import type { CockpitPresentation, CockpitTick } from '../presentation/cockpit-contract.ts';
import { PresentationError } from '../presentation/cockpit-limits.ts';
import { cockpitRandom } from '../presentation/cockpit-random.ts';
import {
  BASE_VIEW, cockpitBatch, cockpitTick, cockpitTicks, createTestPresentation, DESTRUCTION_SUB_MODE, EXTERNAL_VIEW, FLIGHT_VIEW, MAP_VIEW,
  syntheticEvent, TEST_SEED, viewSwitched, WARP_VIEW, type TickOptions,
} from '../presentation/cockpit.test-support.ts';
import { isCovered, type IndexedSurface } from '../raster/indexed-surface.ts';
import type { FlightOverlayModule } from './flight-overlay.ts';
import { RATE_ACCELERATION } from './overlay-geometry.ts';
import {
  advanceAll, LABEL, overlay, OVERLAY_TEXT, pilot, radarStub, target, weaponList, type PilotOptions,
} from './overlay.test-support.ts';

// Expectations from docs/original/formats/hud.md §4.6 (Confirmed, code; P3-13/04 and /21), derived by hand: centre
// (319,157), projection x = chop(639x/z) + 319, y = chop(−639y/z) + 157, the HI parameter block's radii and offsets,
// clock = 2 × tick. The camera is the identity at the origin, so a target's camera coordinates are its position. The
// synthetic font draws each byte as the top-left pixel of its 6-pixel cell. Synthetic content only.

const RETICLE = 0x0c;

const at = (surface: IndexedSurface, x: number, y: number): number => surface.indices[y * 640 + x];
/** The pixel's index when covered, otherwise null (the world shows). */
const shown = (surface: IndexedSurface, x: number, y: number): number | null => (isCovered(surface, x, y) ? at(surface, x, y) : null);
/** The colours of an n-byte text's pixels at (x + 6i, y). */
const text = (surface: IndexedSurface, x: number, y: number, length: number): (number | null)[] =>
  Array.from({ length }, (_, index) => shown(surface, x + 6 * index, y));
const count = (surface: IndexedSurface, colour: number, top = 0, bottom = 479): number => {
  let total = 0;
  for (let y = top; y <= bottom; y++) for (let x = 0; x < 640; x++) if (isCovered(surface, x, y) && at(surface, x, y) === colour) total++;
  return total;
};
const coveredWorld = (surface: IndexedSurface): number => {
  let total = 0;
  for (let y = 0; y <= 315; y++) for (let x = 0; x < 640; x++) if (isCovered(surface, x, y)) total++;
  return total;
};

/** The first-octant offsets (x, y) of a midpoint circle of radius r, one per step, written independently of the raster. */
function midpoint(radius: number): [number, number][] {
  const points: [number, number][] = [];
  let [x, y, d] = [0, radius, 1 - radius];
  while (x < y) {
    if (d < 0) d += 2 * x + 3;
    else {
      d += 2 * (x - y) + 5;
      y--;
    }
    x++;
    points.push([x, y]);
  }
  return points;
}

interface Run {
  readonly module: FlightOverlayModule;
  readonly presentation: CockpitPresentation;
  readonly back: IndexedSurface;
  readonly screen: IndexedSurface;
  tick(options?: TickOptions): void;
  ticks(count: number, options?: TickOptions | ((tick: number) => TickOptions)): void;
  readonly next: number;
}

function start(module = overlay(), viewMode = FLIGHT_VIEW, subMode = 0): Run {
  const presentation = createTestPresentation({ modules: [module], viewMode, subMode });
  let next = 1;
  const { back, screen } = presentation.surfaces();
  return {
    module, presentation, back, screen,
    tick(options = {}) {
      presentation.advance(cockpitBatch([cockpitTick(next, options)]));
      next++;
    },
    ticks(total, options = {}) {
      advanceAll(presentation, cockpitTicks(next, next + total - 1, options));
      next += total;
    },
    get next() {
      return next;
    },
  };
}

const flight = (options: PilotOptions = {}, events: readonly DomainEvent[] = []): TickOptions => ({ patch: pilot(options), events });
/** A target in front of the camera, right of and above the centre: screen (446, 94), half-size 21. */
const AHEAD = Object.freeze({ x: 100, y: 50, z: 500 });
/** Both weapons out of range of AHEAD, so no lead marks are drawn. */
const SHORT = [weaponList('gun', { range: 10 }), weaponList('missile', { range: 10 })] as const;

describe('flight overlay: reticle, rate indicator, texts and erase', () => {
  it('draws the 10-step reticle at (319,157) and erases nothing on the first call after the reset', () => {
    const run = start();
    run.tick(flight());
    const { back } = run;
    // Ring 84 and tick 117 pixels (hud §4.6 captures); their four axis points coincide.
    expect(count(back, RETICLE)).toBe(84 + 117 - 4);
    for (const [x, y] of [[319, 137], [319, 177], [299, 157], [339, 157], [319, 125], [319, 145], [315, 145], [323, 145], [307, 153], [307, 161], [319, 157]]) {
      expect(shown(back, x, y)).toBe(RETICLE);
    }
    const ring = midpoint(20);
    for (const [dx, dy] of ring.slice(0, 10)) expect([shown(back, 319 + dx, 157 - dy), shown(back, 319 - dy, 157 + dx)]).toEqual([RETICLE, RETICLE]);
    // Negative controls: no 11th step (full circle), no ring at (320,158).
    const [dx, dy] = ring[10];
    expect(shown(back, 319 + dx, 157 - dy)).not.toBe(RETICLE);
    expect(shown(back, 340, 158)).toBeNull();
    expect(run.module.state().reticle).toEqual({ phase: 1, due: 10, pulse: 1 });
  });

  it('draws the autopilot "off" text once after the reset and erases it with the next call', () => {
    const run = start();
    run.tick(flight());
    expect(text(run.back, 283, 109, 12)).toEqual(Array(12).fill(0x0f));
    expect(run.module.state().autopilot).toEqual({ step: 5, previous: false, due: 40 });
    run.tick(flight());
    expect(text(run.back, 283, 109, 12)).toEqual(Array(12).fill(null));
    run.ticks(40, flight());
    expect(text(run.back, 283, 109, 12)).toEqual(Array(12).fill(null));
    expect(run.module.state().autopilot).toEqual({ step: 5, previous: false, due: 40 });
  });

  it('draws the rate figure from rates smoothed at 0.9599 rad/s² over f32 seconds, updated every 4 units', () => {
    const run = start();
    const rates = [0.5, Math.fround(0.3)] as const;
    run.tick(flight({ rates }));
    const first = Math.fround(0.03125 * RATE_ACCELERATION);
    expect(run.module.state().rate).toEqual({ pitch: first, roll: first, due: 6, lastSeconds: 0.03125 });
    run.tick(flight({ rates }));
    run.tick(flight({ rates }));
    expect(run.module.state().rate.due).toBe(6);
    run.tick(flight({ rates }));
    const second = Math.fround(first + 0.09375 * RATE_ACCELERATION);
    expect(run.module.state().rate).toEqual({ pitch: second, roll: second, due: 12, lastSeconds: 0.125 });
    run.ticks(36, flight({ rates }));
    expect(run.module.state().rate).toMatchObject({ pitch: 0.5, roll: rates[1] });
    // Stem to chop(157 + 0.5 × 3.1415927 × 4) = 163 in 10, whose end the bar X0–X1 (θ = 0.3, 0x13) crosses.
    expect([158, 160, 162, 163].map((y) => shown(run.back, 319, y))).toEqual([10, 10, 10, 0x13]);
    expect(shown(run.back, 319, 164)).toBeNull();
    const [x0, y0] = [319 + Math.trunc(48 * Math.cos(rates[1])), 163 - Math.trunc(48 * Math.fround(Math.sin(rates[1])))];
    expect(shown(run.back, x0, y0)).toBe(0x13);
    expect(shown(run.back, 638 - x0, 326 - y0)).toBe(0x13);
  });

  it('snaps the smoothed rates after a view switch, whose reset makes the next step the whole elapsed seconds', () => {
    const run = start();
    run.ticks(60, flight({ rates: [0.5, 0] }));
    run.tick({ ...flight(), events: [viewSwitched(run.next, FLIGHT_VIEW, MAP_VIEW)], viewMode: MAP_VIEW });
    run.tick({ ...flight({ rates: [-0.5, 0] }), events: [viewSwitched(run.next, MAP_VIEW, FLIGHT_VIEW)] });
    expect(run.module.state().rate.pitch).toBe(-0.5);
  });

  it('erases each call\'s marks before the next and keeps the reticle', () => {
    const run = start();
    run.tick(flight());
    const { back } = run;
    expect(text(back, 233, 289, 3)).toEqual([10, 10, 10]);
    run.tick(flight({ target: target(AHEAD), weapons: SHORT }));
    // Out of range in blink phase 1: both lines in 10, the missile's ammunition after its name and one advance.
    expect(text(back, 233, 289, 3)).toEqual([10, 10, 10]);
    expect(text(back, 233, 298, 3)).toEqual([10, 10, 10]);
    expect(shown(back, 233 + 18 + 6, 298)).toBe(10);
    expect(shown(back, 426, 74)).toBe(0x0f);
    run.tick(flight());
    // The box, its name and the marks are gone; the reticle and the next weapon lines are drawn again.
    expect(shown(back, 426, 74)).toBeNull();
    expect(text(back, 428, 118, 6)).toEqual(Array(6).fill(null));
    expect(count(back, RETICLE)).toBe(197);
  });
});

describe('flight overlay: target, lock and weapons', () => {
  it('projects the target box with 639 and (319,157), with half-size clamp((850 − z) >> 4, 8, 100) and the cross before B', () => {
    const run = start();
    run.tick(flight({ target: target(AHEAD), weapons: SHORT }));
    const { back } = run;
    // Corners at 446 ± 20, 94 ± 20: the 2-point brackets (dx 4, dy 1 and dx 1, dy 4).
    for (const [x, y] of [[426, 74], [427, 74], [428, 75], [430, 75], [426, 75], [427, 78], [466, 74], [462, 75], [466, 114], [465, 110], [426, 114], [430, 113]]) {
      expect(shown(back, x, y)).toBe(0x0f);
    }
    for (const [x, y] of [[443, 94], [449, 94], [446, 91], [446, 97], [426, 94], [430, 94], [462, 94], [446, 74], [446, 78], [446, 110]]) expect(shown(back, x, y)).toBe(0x0f);
    // Negative controls: no bracket pixel where 640 and (320,158) would put the corner; no fifth tick pixel.
    expect(shown(back, 428, 74)).toBeNull();
    expect(shown(back, 431, 94)).toBeNull();
    // The name, at most 16 bytes, centred below: x = 446 − (36 >> 1), y = 94 + 21 + 3.
    expect(text(back, 428, 118, 6)).toEqual(Array(6).fill(0x0f));
    expect(run.module.state().aim).toBe(false);
  });

  it('omits the cross behind the back plane and draws no box at z ≤ 1', () => {
    const run = start(overlay({ backPlane: () => 400 }));
    run.tick(flight({ target: target(AHEAD), weapons: SHORT }));
    expect(shown(run.back, 443, 94)).toBeNull();
    expect(shown(run.back, 426, 74)).toBe(0x0f);
    const near = start();
    near.tick(flight({ target: target({ x: 0.01, y: 0.01, z: 1 }) }));
    expect(near.module.state().aim).toBe(true);
    // No box: half-size (850 − 1) >> 4 = 53 would put a corner at (273, 99).
    expect(shown(near.back, 273, 99)).toBeNull();
  });

  it('draws the off-centre pointer from the radar\'s cached direction at radii 21 and 40 while unaimed', () => {
    const radar = radarStub({ 9: { a: 0, b: 1 } });
    const run = start(overlay({ radar }));
    run.tick(flight({ target: target(AHEAD) }));
    const { back } = run;
    // (340,157)–(359,157) and the line from the previous inner point (the centre); the reticle's tick covers 331–351.
    expect([325, 352, 359].map((x) => shown(back, x, 157))).toEqual([0x0f, 0x0f, 0x0f]);
    expect(shown(back, 360, 157)).toBe(0x13);
    // Aimed (a target near the centre): no pointer.
    const aimed = start(overlay({ radar }));
    aimed.tick(flight({ target: target({ x: 1, y: 0, z: 500 }) }));
    expect(aimed.module.state().aim).toBe(true);
    expect(shown(aimed.back, 355, 157)).toBe(0x13);
  });

  it('follows a target switch: the new target\'s cached direction, joined to the previous call\'s inner point', () => {
    const radar = radarStub({ 9: { a: Math.fround(Math.SQRT1_2), b: Math.fround(Math.SQRT1_2) }, 10: { a: 1, b: 0 } });
    const run = start(overlay({ radar }));
    run.tick(flight({ target: target(AHEAD, { entityId: 9 }), weapons: SHORT }));
    // Inner point (chop(f32(21 × 0.7071 + 319)), chop(f32(157 − 21 × 0.7071))) = (333, 142).
    expect(shown(run.back, 333, 142)).toBe(0x0f);
    run.tick(flight({ target: target(AHEAD, { entityId: 10 }), weapons: SHORT }));
    // (319,136)–(319,117) for the new target, and (333,142)–(319,117) from the previous inner point.
    expect([shown(run.back, 319, 120), shown(run.back, 333, 142)]).toEqual([0x0f, 0x0f]);
    run.tick(flight({ target: target(AHEAD, { entityId: 10 }), weapons: SHORT }));
    expect(shown(run.back, 333, 142)).toBeNull();
  });

  it('draws the lock rings at radius v and 8 + v while acquiring, with the inner ring all in 10', () => {
    const run = start();
    run.tick(flight({ target: target(AHEAD), progress: 20 }));
    const { back } = run;
    const outer = midpoint(28);
    expect([shown(back, 466, 94), shown(back, 446, 74 + 0), shown(back, 474, 94), shown(back, 446, 66)]).toEqual([10, 10, 10, 10]);
    const [ix, iy] = midpoint(20)[12];
    expect(shown(back, 446 + ix, 94 + iy)).toBe(10);
    // The outer ring: its first (60 − 20) >> 2 = 10 steps per octant in 10 over 0xF, the rest 0xF.
    const [ax, ay] = outer[9];
    const [bx, by] = outer[12];
    expect([shown(back, 446 + ax, 94 + ay), shown(back, 446 + bx, 94 + by)]).toEqual([10, 0x0f]);
    expect(run.module.state().lockedRing.radius).toBe(80);
    // Negative control: no ring at v ± 1.
    expect(shown(back, 467, 94)).toBeNull();
  });

  it('shrinks the locked circle from 80 by 8 every 2 units and shows the locked text in phase 1 of its 8-unit clock', () => {
    const run = start();
    const locked = flight({ target: target(AHEAD), progress: 0 });
    run.tick(locked);
    const { back } = run;
    expect(run.module.state().lockedRing).toEqual({ radius: 80, phase: 1, due: 4 });
    expect(run.module.state().lockedText).toEqual({ phase: 0, due: 10 });
    // Locked box in 10; full circle in phase 1 colour 10, its first 20 steps in 11.
    expect(shown(back, 426, 74)).toBe(10);
    expect(shown(back, 526, 94)).toBe(11);
    const [fx, fy] = midpoint(80)[30];
    expect(shown(back, 446 + fx, 94 + fy)).toBe(10);
    expect(text(back, 277, 191, 14)).toEqual(Array(14).fill(null));
    run.tick(locked);
    expect(run.module.state().lockedRing.radius).toBe(80);
    run.tick(locked);
    expect(run.module.state().lockedRing).toEqual({ radius: 72, phase: 0, due: 8 });
    expect(shown(back, 518, 94)).toBe(10);
    expect(shown(back, 526, 94)).toBeNull();
    run.ticks(3, locked);
    expect(run.module.state().lockedText).toEqual({ phase: 1, due: 20 });
    expect(text(back, 277, 191, 14)).toEqual(Array(14).fill(10));
    // Steps at ticks 5, 7, … 17 reach 16; the next would be 8 < 14 and returns to 80.
    run.ticks(11, locked);
    expect(run.module.state().lockedRing.radius).toBe(16);
    run.ticks(2, locked);
    expect(run.module.state().lockedRing.radius).toBe(80);
  });

  it('draws the weapon lines in range, the lead marks for kinds 0x93780 and the readouts', () => {
    const run = start();
    const options = { target: target(AHEAD), speed: 300, commanded: 50, maximum: 100 };
    run.tick(flight(options));
    const { back } = run;
    expect(text(back, 233, 289, 3)).toEqual([0x10, 0x10, 0x10]);
    expect(text(back, 233, 298, 3)).toEqual([0x10, 0x10, 0x10]);
    expect(shown(back, 257, 298)).toBe(0x10);
    // Lead point z = 500 + f32(100 / 1000 × 512.35) → screen (434, 100); ring radius chop(10 + 51.23) = 61, 1 step.
    expect([shown(back, 444, 100), shown(back, 424, 100), shown(back, 434, 39), shown(back, 495, 100)]).toEqual([0x10, 0x10, 0x10, 0x10]);
    const [rx, ry] = midpoint(61)[1];
    expect(shown(back, 434 + rx, 100 - ry)).toBeNull();
    expect(shown(back, 400, 117)).toBe(0x10);
    // Readouts: own speed, throttle 50 × 100 / 100, closing −1 × 100 + 300, time chop(512.35 / 200).
    expect(run.module.state().readouts.texts).toEqual(['300v', '50%', '200v', '2t']);
    expect([shown(back, 234, 177), shown(back, 234, 185), shown(back, 375, 177), shown(back, 375, 185)]).toEqual([0x0f, 0x12, 0x10, 0x10]);
    // A kind outside 0x93780 gets no lead marks; the aim flag is still recomputed at the lead point.
    const other = start();
    other.tick(flight({ ...options, target: target(AHEAD, { kindBit: 2 }) }));
    expect(shown(other.back, 444, 100)).toBeNull();
  });

  it('shows the placeholder for a closing speed below 1 or a time beyond 10000, and 10 for a negative closing speed', () => {
    const run = start();
    run.tick(flight({ target: target(AHEAD) }));
    expect(run.module.state().readouts.texts).toEqual(['0v', '0%', '-100v', '--']);
    expect(shown(run.back, 375, 177)).toBe(10);
    const far = start();
    far.tick(flight({ target: target({ x: 0, y: 0, z: 2e6 }, { speed: 0 }), speed: 100 }));
    expect(far.module.state().readouts.texts.slice(2)).toEqual(['100v', '--']);
    const none = start();
    none.tick(flight());
    expect(none.module.state().readouts.texts.slice(2)).toEqual(['--', '--']);
  });

  it('lets an over-long readout run on into the next 8-byte buffer, as sprintf does', () => {
    const run = start();
    run.tick(flight({ target: target(AHEAD, { speed: 1e6 }), weapons: SHORT }));
    // '-1000000v' and its NUL reach bytes 24 and 25; the placeholder's 4-byte copy then overwrites them.
    expect(run.module.state().readouts.texts).toEqual(['0v', '0%', '-1000000--', '--']);
    expect(text(run.back, 375, 177, 10)).toEqual(Array(10).fill(10));
    // The widened erase box clears the whole text once the next refresh (clock 20 > 18) shortens it.
    run.ticks(9, flight());
    expect(run.module.state().readouts.texts[2]).toBe('--');
    expect(shown(run.back, 375 + 54, 177)).toBeNull();
  });

  it('gives a list without a mount the previous list\'s speed and range, and the empty-slot text', () => {
    const run = start();
    run.tick(flight({ target: target(AHEAD), weapons: [weaponList('gun', { mount: null }), weaponList('missile', { speed: 500 })] }));
    expect(text(run.back, 233, 289, 4)).toEqual(Array(4).fill(0x10));
    // The gun takes the missile's speed 500: lead z = 500 + f32(0.2 × 512.35) → (425, 104); the 10-pixel circle.
    expect([shown(run.back, 435, 104), shown(run.back, 415, 104)]).toEqual([0x10, 0x10]);
    const first = start();
    first.tick(flight({ target: target(AHEAD), weapons: [weaponList('gun'), weaponList('missile', { mount: null })] }));
    expect(text(first.back, 233, 298, 4)).toEqual(Array(4).fill(10));
    expect(text(first.back, 233, 289, 3)).toEqual(Array(3).fill(0x10));
  });

  it('refreshes the readouts every 0x10 units and draws them every call', () => {
    const run = start();
    run.tick(flight({ speed: 10 }));
    run.ticks(8, flight({ speed: 20 }));
    expect(run.module.state().readouts).toEqual({ texts: ['10v', '0%', '--', '--'], due: 18 });
    run.tick(flight({ speed: 20 }));
    expect(run.module.state().readouts).toEqual({ texts: ['20v', '0%', '--', '--'], due: 36 });
  });

  it('blinks the out-of-range weapon lines every 0x20 units and draws the empty-slot text without a mount', () => {
    const run = start();
    const options = flight({ weapons: [weaponList('gun', { mount: null }), weaponList('missile', { ammunition: 0 })] });
    run.tick(options);
    expect(text(run.back, 233, 289, 4)).toEqual([10, 10, 10, 10]);
    expect(shown(run.back, 257, 298)).toBe(10);
    run.ticks(17, options);
    expect(run.module.state().weaponBlink).toEqual({ phase: 0, due: 68 });
    expect(text(run.back, 233, 289, 4)).toEqual(Array(4).fill(null));
  });
});

describe('flight overlay: subsystem 9, views, events and lifetime', () => {
  it('never draws at subsystem 9 state 2: a colour-0 reticle every 0x20 units, uncovered by the next erase, no random draw', () => {
    const run = start();
    const damaged = flight({ subsystem9: 2, progress: 20, target: target(AHEAD) });
    run.tick(damaged);
    const { back } = run;
    expect(shown(back, 319, 137)).toBe(0);
    expect(run.module.state().skip).toEqual({ holdUntil: 34, visibleUntil: 0 });
    // The lock progress is still read before the visual gates (D-02 DD-03/DD-04: hiding never stops the lock tone).
    expect(run.module.state().progress).toBe(20);
    run.tick(damaged);
    expect(shown(back, 319, 137)).toBeNull();
    expect(coveredWorld(back)).toBe(0);
    run.ticks(15, damaged);
    expect(run.module.state().skip.holdUntil).toBe(66);
    expect(run.presentation.schedule().randomDraws).toBe(0);
  });

  it('skips at state 1 with probability 44/256, one draw per eligible call after 0x40 visible units', () => {
    const run = start();
    const ticks = 600;
    run.ticks(ticks, flight({ subsystem9: 1 }));
    // An independent model of the gate on the same stream.
    const random = cockpitRandom(TEST_SEED);
    let [hold, visible, draws, skips, lastDrawn] = [0, 0, 0, 0, 0];
    for (let tick = 1; tick <= ticks; tick++) {
      const clock = 2 * tick;
      if (hold > clock) continue;
      if (visible < clock) {
        draws++;
        if ((random.next() & 0xff) < 0x2c) {
          skips++;
          [hold, visible] = [clock + 0x20, 0];
          continue;
        }
      }
      hold = 0;
      if (visible === 0) visible = clock + 0x40;
      lastDrawn = tick;
    }
    expect(skips).toBeGreaterThan(0);
    expect(run.presentation.schedule().randomDraws).toBe(draws);
    expect(run.module.state().skip).toEqual({ holdUntil: hold, visibleUntil: visible });
    expect(shown(run.back, 319, 137)).toBe(lastDrawn === ticks ? RETICLE : lastDrawn === ticks - 1 ? 0 : null);
  });

  it('draws only the label in the destruction view and never in Warp; nothing without a player', () => {
    const run = start();
    run.tick(flight());
    run.tick({ ...flight(), viewMode: EXTERNAL_VIEW, subMode: DESTRUCTION_SUB_MODE, events: [viewSwitched(2, FLIGHT_VIEW, EXTERNAL_VIEW, DESTRUCTION_SUB_MODE)] });
    run.tick({ ...flight(), viewMode: EXTERNAL_VIEW, subMode: DESTRUCTION_SUB_MODE });
    const { back } = run;
    expect(text(back, 0, 0, LABEL.length)).toEqual(Array(LABEL.length).fill(0x0f));
    expect(count(back, 0x0f)).toBe(LABEL.length);
    expect(count(back, RETICLE)).toBe(0);
    run.tick({ viewMode: EXTERNAL_VIEW, subMode: DESTRUCTION_SUB_MODE });
    expect(count(back, 0x0f)).toBe(0);
    const warp = start();
    warp.tick(flight());
    warp.tick({ ...flight(), viewMode: WARP_VIEW, events: [viewSwitched(2, FLIGHT_VIEW, WARP_VIEW)] });
    expect(coveredWorld(warp.back)).toBe(0);
    const empty = start();
    empty.ticks(3);
    expect(coveredWorld(empty.back)).toBe(0);
    expect(empty.module.state().reticle).toEqual({ phase: 0, due: 0, pulse: 0 });
  });

  it('sets up a run that starts outside view 0xC from tick 0\'s view', () => {
    const external = start(overlay(), EXTERNAL_VIEW, DESTRUCTION_SUB_MODE);
    external.tick({ ...flight(), viewMode: EXTERNAL_VIEW, subMode: DESTRUCTION_SUB_MODE });
    expect(text(external.back, 0, 0, LABEL.length)).toEqual(Array(LABEL.length).fill(0x0f));
    expect(count(external.back, RETICLE)).toBe(0);
    expect(external.module.state().mode).toBe(EXTERNAL_VIEW);
    const warp = start(overlay(), WARP_VIEW);
    warp.tick({ ...flight(), viewMode: WARP_VIEW });
    expect(coveredWorld(warp.back)).toBe(0);
    warp.tick({ ...flight(), events: [viewSwitched(2, WARP_VIEW, FLIGHT_VIEW)] });
    expect(text(warp.back, 283, 109, 12)).toEqual(Array(12).fill(0x0f));
    expect(count(warp.back, RETICLE)).toBe(197);
  });

  it('refuses an external view other than the destruction view', () => {
    const run = start();
    expect(() => run.tick({ ...flight(), viewMode: EXTERNAL_VIEW, subMode: 1, events: [viewSwitched(1, FLIGHT_VIEW, EXTERNAL_VIEW, 1)] })).toThrow(PresentationError);
  });

  it('keeps marks in rows 316–478 of B until an erase; the frame-end copy never shows them', () => {
    const run = start();
    run.tick(flight({ target: target({ x: 0, y: -30, z: 100 }) }));
    // Screen (319, 348), half-size 46: the lower brackets at row 393.
    expect(shown(run.back, 274, 393)).toBe(0x0f);
    expect(at(run.screen, 274, 393)).toBe(0);
    run.tick(flight());
    expect(at(run.back, 274, 393)).toBe(0);
  });

  it('starts the speed-assist flash only from the three rule starts while the counter is 0 (Δ-08)', () => {
    const tick = (index: number, type: DomainEvent['type'], fields: Record<string, unknown>) => syntheticEvent(index, type, fields);
    for (const [event, started] of [
      [tick(3, 'speed-assist-toggled', { commandIndex: 0, enabled: true }), true],
      [tick(3, 'speed-assist-toggled', { commandIndex: 0, enabled: false }), false],
      [tick(3, 'speed-assist-released', {}), true],
      [tick(3, 'speed-matched', { targetEntityId: 9, origin: 'assist', speedDifferenceExceeded: true }), true],
      [tick(3, 'speed-matched', { targetEntityId: 9, origin: 'assist', speedDifferenceExceeded: false }), false],
      [tick(3, 'speed-matched', { targetEntityId: 9, origin: 'command', commandIndex: 0 }), false],
    ] as const) {
      const run = start();
      run.ticks(2, flight());
      run.tick(flight({}, [event]));
      expect(run.module.state().speedAssist.counter).toBe(started ? 2 : 0);
    }
  });

  it('steps the speed-assist text every 0x26 units: 0xC at 2–3, 0x13 at 5–6, erased after 3 and 6, then idle', () => {
    const run = start();
    run.ticks(2, flight());
    run.tick(flight({}, [syntheticEvent(3, 'speed-assist-toggled', { commandIndex: 0, enabled: true })]));
    const { back } = run;
    expect(run.module.state().speedAssist).toEqual({ counter: 2, due: 44 });
    expect(text(back, 280, 109, 13)).toEqual(Array(13).fill(0x0c));
    // A second start while it runs changes nothing.
    run.tick(flight({}, [syntheticEvent(4, 'speed-assist-released')]));
    expect(run.module.state().speedAssist.counter).toBe(2);
    const counters: number[] = [];
    const colours: (number | null)[] = [];
    for (let index = 0; index < 120; index++) {
      run.tick(flight());
      counters.push(run.module.state().speedAssist.counter);
      colours.push(shown(back, 280, 109));
    }
    // Clock 44 < 46 at tick 23: 3 drawn and erased; tick 42 (84 > 82) to 5 …
    expect(counters.indexOf(4)).toBe(23 - 5);
    expect(colours[counters.indexOf(4)]).toBe(0x0c);
    expect(colours[counters.indexOf(4) + 1]).toBeNull();
    expect(colours[counters.indexOf(5)]).toBe(0x13);
    expect(counters.at(-1)).toBe(0);
    expect(colours.at(-1)).toBeNull();
  });

  it('resets on entering the base view, so the autopilot text shows once more; Warp round trips do not', () => {
    const base = start();
    base.ticks(2, flight());
    base.tick({ events: [viewSwitched(3, FLIGHT_VIEW, BASE_VIEW)], viewMode: BASE_VIEW });
    base.tick({ ...flight(), events: [viewSwitched(4, BASE_VIEW, FLIGHT_VIEW)] });
    expect(text(base.back, 283, 109, 12)).toEqual(Array(12).fill(0x0f));
    const warp = start();
    warp.ticks(2, flight());
    warp.tick({ events: [viewSwitched(3, FLIGHT_VIEW, WARP_VIEW)], viewMode: WARP_VIEW });
    warp.tick({ ...flight(), events: [viewSwitched(4, WARP_VIEW, FLIGHT_VIEW)] });
    expect(text(warp.back, 283, 109, 12)).toEqual(Array(12).fill(null));
  });

  it('refuses texts of other lengths than the code draws', () => {
    expect(() => overlay({ hudText: { ...OVERLAY_TEXT, overlayPlayerState4: 'LOCKED' } })).toThrow(PresentationError);
    expect(() => overlay({ hudText: { ...OVERLAY_TEXT, overlayReadoutUnavailable: '----' } })).toThrow(PresentationError);
  });

  it('gives the same state and pictures for any split of the same ticks; 0-tick batches and queries change nothing', () => {
    const radar = radarStub({ 9: { a: 0.6, b: -0.8 }, 10: { a: -0.3, b: 0.9 } });
    const scenario = (tick: number): TickOptions => flight({
      subsystem9: tick > 200 ? 1 : 0,
      progress: tick < 40 ? -1 : tick < 90 ? Math.max(0, 150 - tick) : 0,
      target: tick % 70 < 50 ? target({ x: 40 - tick, y: tick % 30, z: 300 + 2 * tick }, { entityId: tick < 120 ? 9 : 10 }) : null,
      speed: tick, commanded: 30, rates: [Math.fround(Math.sin(tick / 20)), Math.fround(Math.cos(tick / 30))],
    }, tick % 37 === 0 ? [syntheticEvent(tick, 'speed-assist-toggled', { commandIndex: 0, enabled: true })] : []);
    const all: CockpitTick[] = cockpitTicks(1, 300, scenario);
    const runs = [[5], [1, 4, 2, 3, 5], [3, 0, 2]].map((pattern) => {
      const module = overlay({ radar });
      const presentation = createTestPresentation({ modules: [module] });
      let at = 0;
      for (let index = 0; at < all.length; index++) {
        const size = pattern[index % pattern.length];
        presentation.advance(cockpitBatch(all.slice(at, at + size)));
        at += size;
      }
      const state = module.state();
      expect(module.state()).toEqual(state);
      const { back, screen } = presentation.surfaces();
      return { state, back: [...back.indices], coverage: [...back.coverage!], screen: [...screen.indices], draws: presentation.schedule().randomDraws };
    });
    expect(runs[1]).toEqual(runs[0]);
    expect(runs[2]).toEqual(runs[0]);
  });
});
