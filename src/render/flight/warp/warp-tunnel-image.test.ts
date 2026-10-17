import { describe, expect, it } from 'vitest';
import { RandStream } from '../../../core/rules/original-random.ts';
import { setUpWarpPath, evaluateWarpPath } from '../../../core/rules/warp-path.ts';
import type { Matrix3 } from '../../../core/world/entity-table.ts';
import { vec } from '../presentation/presentation.test-support.ts';
import { FlightRenderError } from '../renderer/flight-render-error.ts';
import {
  WARP_CENTRE_COLOURS, WARP_EDGE_COLOURS, WARP_EDGE_DRAWS, WARP_EDGE_SLOTS, WARP_IMAGE_HEIGHT, WARP_IMAGE_WIDTH,
  WARP_RAMP_LEVELS, WARP_SLOT_COUNT, warpRampLevel, warpRingSlots, WarpTunnelImage, type WarpTunnelDrawing,
} from './warp-tunnel-image.ts';
import { WARP_TEMPLATES } from './warp-templates.ts';
import { cameraAt, STRAIGHT_PATH } from './warp.test-support.ts';

const TEMPLATES = Object.freeze(Array.from({ length: WARP_SLOT_COUNT }, (_, slot) => slot % 50));
const NO_EDGES = Object.freeze(Array<boolean>(WARP_EDGE_DRAWS).fill(false));
const ALL_EDGES = Object.freeze(Array<boolean>(WARP_EDGE_DRAWS).fill(true));

const drawing = (overrides: Partial<WarpTunnelDrawing> = {}): WarpTunnelDrawing => ({
  serial: 1, path: STRAIGHT_PATH, templates: TEMPLATES, edges: NO_EDGES, camera: cameraAt(9000), ...overrides,
});

/** The colour at logical (x, y) as 0xRRGGBB, or null where nothing is drawn. */
function colourAt(image: WarpTunnelImage, x: number, y: number): number | null {
  const offset = (y * WARP_IMAGE_WIDTH + x) * 4;
  const p = image.pixels;
  return p[offset + 3] === 0 ? null : (p[offset] << 16) | (p[offset + 1] << 8) | p[offset + 2];
}

function drawnPixels(image: WarpTunnelImage): number {
  let count = 0;
  for (let index = 3; index < image.pixels.length; index += 4) if (image.pixels[index] !== 0) count++;
  return count;
}

const expand = (level: number): number => (level << 2) | (level >> 4);

describe('Warp palette ramps (WT3)', () => {
  it('runs 63, 61, 60, … 2, 1 over 53 distinct levels, green at the edges and grey at the centre', () => {
    expect(WARP_RAMP_LEVELS).toHaveLength(53);
    expect(new Set(WARP_RAMP_LEVELS).size).toBe(53);
    expect(WARP_RAMP_LEVELS.slice(0, 3)).toEqual([63, 61, 60]);
    expect(WARP_RAMP_LEVELS.slice(-3)).toEqual([3, 2, 1]);
    expect(WARP_EDGE_COLOURS[0]).toBe(0x00ff00);
    expect(WARP_CENTRE_COLOURS[0]).toBe(0xffffff);
    expect(WARP_EDGE_COLOURS[52]).toBe(expand(1) << 8);
    expect(WARP_CENTRE_COLOURS[52]).toBe(0x040404);
  });

  it('chooses the level by the squared distance, dimmest from about 6532 units', () => {
    const level = (distance: number) => warpRampLevel(Math.fround(distance * distance));
    expect([1000, 2000, 4000, 6532, 7000].map(level)).toEqual([1, 4, 19, 52, 52]);
    expect(level(0)).toBe(0);
  });
});

describe('Warp ring slots (WT4 step 2)', () => {
  it('puts 10 slots on each of segments 1–4, drawing ring edges at slots 30, 20 and 10 only', () => {
    expect(WARP_EDGE_SLOTS).toEqual([30, 20, 10]);
    expect(WARP_EDGE_DRAWS).toBe(60);
    const slots = warpRingSlots(STRAIGHT_PATH);
    expect(slots).toHaveLength(40);
    for (const [slot, z] of [[0, 10000], [10, 12000], [20, 14000], [30, 16000]]) expect(slots[slot].position).toEqual(vec(0, 0, z));
    for (let slot = 1; slot < 40; slot++) expect(slots[slot].position.z).toBeGreaterThan(slots[slot - 1].position.z);
    expect(slots[39].position.z).toBeLessThan(18000);
  });

  it('evaluates segment s on points s − 1 to s + 2 with the rule\'s spline, so a path shift keeps the far rings', () => {
    const path = setUpWarpPath(new RandStream(0x5eed));
    const slots = warpRingSlots(path);
    expect(slots[0]).toEqual(evaluateWarpPath(path, 0));
    let t = 0;
    for (let step = 0; step < 5; step++) t = Math.fround(t + 0.1);
    expect(slots[25]).toEqual(evaluateWarpPath(path.slice(2, 6), t));
    const shifted = warpRingSlots(path.slice(1));
    for (let slot = 0; slot < 30; slot++) expect(shifted[slot]).toEqual(slots[slot + 10]);
  });
});

describe('Warp tunnel image (WT4–WT6)', () => {
  it('projects each entry with the effect\'s 800 scale about (320, 158), truncating towards zero', () => {
    const image = new WarpTunnelImage();
    image.draw(drawing());
    // Identity frames: Q = (x, y, F(centre + z)), and camera space is Q − (0, 0, 9000).
    for (const [slot, centre] of [[10, 12000], [20, 14000], [30, 16000]]) {
      WARP_TEMPLATES[TEMPLATES[slot]].forEach(({ x, y, z }, point) => {
        const depth = Math.fround(centre + z) - 9000;
        expect(image.screenEntry(slot, point)).toEqual({ x: Math.trunc((x * 800) / depth) + 320, y: Math.trunc((-y * 800) / depth) + 158 });
      });
    }
  });

  it('draws rails between neighbouring slots in the slot\'s ramp colours, within columns 1–638 and rows 1–314', () => {
    const image = new WarpTunnelImage();
    image.draw(drawing());
    const colours = new Set<number>();
    for (let y = 0; y < WARP_IMAGE_HEIGHT; y++) {
      for (let x = 0; x < WARP_IMAGE_WIDTH; x++) {
        const colour = colourAt(image, x, y);
        if (colour === null) continue;
        expect(x).toBeGreaterThanOrEqual(1);
        expect(x).toBeLessThanOrEqual(638);
        expect(y).toBeGreaterThanOrEqual(1);
        expect(y).toBeLessThanOrEqual(314);
        colours.add(colour);
      }
    }
    for (const colour of colours) expect(WARP_EDGE_COLOURS.includes(colour) || WARP_CENTRE_COLOURS.includes(colour)).toBe(true);
    // The rail from slot 10 (3000 ahead, level 10) towards slot 9 ends at slot 10's entry, grey at its core.
    const level = warpRampLevel(Math.fround(3000 * 3000));
    expect(level).toBe(10);
    const { x, y } = image.screenEntry(10, 0);
    expect([WARP_CENTRE_COLOURS[level], WARP_EDGE_COLOURS[level]]).toContain(colourAt(image, x, y));
  });

  it('draws a ring edge only where the pass\'s draw allows it, in slots 30, 20 and 10', () => {
    const rails = new WarpTunnelImage();
    rails.draw(drawing());
    const rings = new WarpTunnelImage();
    rings.draw(drawing({ edges: ALL_EDGES }));
    expect(drawnPixels(rings)).toBeGreaterThan(drawnPixels(rails));
    // Only slot 30's first edge: one more line than the rails alone, between its entries 19 and 0.
    const one = new WarpTunnelImage();
    one.draw(drawing({ edges: NO_EDGES.map((_, index) => index === 0) }));
    const from = one.screenEntry(30, 19);
    const to = one.screenEntry(30, 0);
    const midX = Math.trunc((from.x + to.x) / 2);
    expect(drawnPixels(one)).toBeGreaterThan(drawnPixels(rails));
    const column = Array.from({ length: WARP_IMAGE_HEIGHT }, (_, y) => colourAt(one, midX, y));
    const railsColumn = Array.from({ length: WARP_IMAGE_HEIGHT }, (_, y) => colourAt(rails, midX, y));
    expect(column).not.toEqual(railsColumn);
  });

  it('draws a set-up path from a camera on it, brighter near than far', () => {
    const path = setUpWarpPath(new RandStream(0x5eed));
    const { position, orientation } = evaluateWarpPath(path, Math.fround(0.3));
    const image = new WarpTunnelImage();
    image.draw(drawing({ path, edges: ALL_EDGES, camera: { position, rows: orientation } }));
    expect(drawnPixels(image)).toBeGreaterThan(1000);
    const levels = warpRingSlots(path).map((slot) => {
      const d = [slot.position.x - position.x, slot.position.y - position.y, slot.position.z - position.z];
      return warpRampLevel(Math.fround(d[1] * Math.fround(d[1]) + d[2] * Math.fround(d[2]) + d[0] * Math.fround(d[0])));
    });
    expect(levels[10]).toBeLessThan(levels[39]);
    const centres = new Set<number>();
    for (let y = 0; y < WARP_IMAGE_HEIGHT; y++) {
      for (let x = 0; x < WARP_IMAGE_WIDTH; x++) {
        const colour = colourAt(image, x, y);
        if (colour !== null && WARP_CENTRE_COLOURS.includes(colour)) centres.add(WARP_CENTRE_COLOURS.indexOf(colour));
      }
    }
    expect(centres.size).toBeGreaterThan(3);
  });

  it('draws the same image again from the same input', () => {
    const image = new WarpTunnelImage();
    image.draw(drawing({ edges: ALL_EDGES }));
    const first = image.pixels.slice();
    image.draw(drawing({ edges: ALL_EDGES }));
    expect(image.pixels).toHaveLength(first.length);
    expect(image.pixels.findIndex((value, index) => value !== first[index])).toBe(-1);
  });

  it('marks entries on or behind the camera plane with x = −1, keeping their last y until a new Warp', () => {
    const image = new WarpTunnelImage();
    image.draw(drawing({ camera: cameraAt(9000) }));
    const seen = image.screenEntry(0, 3);
    expect(seen.x).toBeGreaterThan(0);
    // Slot 0's ring lies within z 10000 − 15 … 10000 + 5, behind a camera at 10100.
    image.draw(drawing({ camera: cameraAt(10100) }));
    expect(image.screenEntry(0, 3)).toEqual({ x: -1, y: seen.y });
    image.draw(drawing({ serial: 2, camera: cameraAt(10100) }));
    expect(image.screenEntry(0, 3)).toEqual({ x: -1, y: 0 });
  });

  it('draws nothing when the whole tunnel is behind the camera', () => {
    const image = new WarpTunnelImage();
    image.draw(drawing({ camera: cameraAt(9000, Object.freeze([-1, 0, 0, 0, 1, 0, 0, 0, -1]) as unknown as Matrix3) }));
    expect(drawnPixels(image)).toBe(0);
  });

  it('rejects a drawing without 40 templates and 60 edge draws, or with a camera that is not finite', () => {
    const image = new WarpTunnelImage();
    expect(() => image.draw(drawing({ templates: TEMPLATES.slice(1) }))).toThrow(FlightRenderError);
    expect(() => image.draw(drawing({ edges: ALL_EDGES.slice(1) }))).toThrow(FlightRenderError);
    expect(() => image.draw(drawing({ camera: cameraAt(Number.NaN) }))).toThrow(FlightRenderError);
    expect(() => new WarpTunnelImage(new Uint8Array(4))).toThrow(FlightRenderError);
  });
});
