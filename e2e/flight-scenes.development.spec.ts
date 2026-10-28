import type { Page } from '@playwright/test';
import type { DomainEvent, Vec3, ViewSwitchedEvent } from '../src/core/contracts/domain-events.ts';
import type { RenderState } from '../src/core/projections/render-state.ts';
import { MISSILE_KIND_BIT, type EntityId, type Matrix3 } from '../src/core/world/entity-table.ts';
import type { FlightRenderDiagnostics } from '../src/render/flight/renderer/flight-renderer.ts';
import type { FlightScenes, SceneTick } from '../src/render/flight/renderer/flight-scenes-entry.test-support.ts';
import { TEXTURE_COLOURS } from '../src/render/flight/lighting/lighting.test-support.ts';
import { explosionStarted as explosionStartedAt } from '../src/render/flight/presentation/effects/effects.test-support.ts';
import { vec } from '../src/render/flight/presentation/presentation.test-support.ts';
import { hit } from '../src/render/flight/shimmer/shimmer.test-support.ts';
import { cameraAt, STRAIGHT_PATH, warpState } from '../src/render/flight/warp/warp.test-support.ts';
import { CRAFT, PROJECTILE_VISUALS } from '../src/render/flight/objects/objects.test-support.ts';
import { syntheticMissile, syntheticProjectile } from '../src/content/effects/effects.test-support.ts';
import { expandMissiles } from '../src/content/effects/expand-effects.ts';
import {
  FLAT_COLOUR, FLAT_MODEL, modelEntity, sceneEntity, scenePlayer, sceneState, SHIMMER_BASE_COLOUR, SHIMMER_MODEL, SHIMMER_TEXEL, SHIMMER_THRESHOLD,
  TEXTURED_MODEL, UNLIT_MODEL,
} from '../src/render/flight/renderer/flight-scenes.test-support.ts';
import { expect, test } from './support/audited-test.ts';
import {
  colourByte, convexHull, flatShade, insideConvex, pixelKey, pixelsAround, placed, QUAD_NORMAL, QuadView, rampEntry, shown, texelAt, yaw,
} from './support/flight-models.ts';
import {
  F, F1_BOTTOM, FULL_BOTTOM, IDENTITY_ROWS, identityBackground, LogicalImage, logicalImage, mismatches, nextFrames, pagePixels, project, rect,
  sameImage, SCENE_DATA, starPixels, vga, type Mismatch, type Rgb, type Rows,
} from './support/flight-pictures.ts';

// P3-12/25 (docs/plan/p3/12/spec.md, 验证策略): the flight renderer drawn by the real WebGL 2 surface in Chrome, from
// synthetic Render States and events the isolated test entry (e2e/entries/flight-scenes.html, development server only)
// feeds through the real run wiring. Every expected picture is computed here from the original's rules as
// docs/original/formats/executable.md records them, not by the renderer's modules; the reads are the composited page.
// The scenes cover what Core cannot produce yet or cannot hold still: the destruction view (P3-11 is not wired), fixed
// poses for lighting, shimmer, sprites, the flash and the Warp effect. The formal flow is flight-render.*.spec.ts.

declare global {
  interface Window {
    osrFlightScenes?: FlightScenes;
  }
}

test.describe.configure({ timeout: 120_000 });

const area = (page: Page) => page.getByTestId('flight-scene');

async function openScenes(page: Page, width = 640, height = 480): Promise<void> {
  await page.goto('/e2e/entries/flight-scenes.html');
  await page.waitForFunction(() => window.osrFlightScenes !== undefined);
  await page.evaluate(([w, h]) => { window.osrFlightScenes!.open(w, h); }, [width, height]);
  await expect.poll(async () => (await diagnostics(page)).layout, { message: 'The surface got no layout' }).not.toBeNull();
}

const diagnostics = (page: Page): Promise<FlightRenderDiagnostics> =>
  page.evaluate(() => JSON.parse(JSON.stringify(window.osrFlightScenes!.diagnostics())) as FlightRenderDiagnostics);

async function startScene(page: Page, seed: number, initial: RenderState): Promise<void> {
  await page.evaluate(([s, state]) => { window.osrFlightScenes!.start(s, state); }, [seed, initial] as const);
}

/** One frame of `ticks`, or a still frame for null. */
async function deliver(page: Page, ticks: readonly SceneTick[] | null): Promise<void> {
  await page.evaluate((frame) => { window.osrFlightScenes!.deliver(frame); }, ticks);
}

const at = (render: RenderState, events: readonly DomainEvent[] = []): SceneTick => ({ render, events });

/** The picture once the renderer drew tick `tick` with a layout. */
async function picture(page: Page, tick: number): Promise<LogicalImage> {
  await expect.poll(async () => {
    const { layout, lastTick, state } = await diagnostics(page);
    return { state, laidOut: layout !== null, lastTick };
  }).toEqual({ state: 'ready', laidOut: true, lastTick: tick });
  // The draw happened inside the evaluate; one more animation frame lets the compositor show it.
  await nextFrames(page);
  return logicalImage(page, area(page));
}

/** The synthetic nebula list of the scene content (flightRunContent): b, a, c, a, whose images are dataImage seeds 0, 120, 80, 120. */
const NEBULA_SEEDS = Object.freeze([0, 120, 80, 120]);
/** The 128 × 128 nebula image with seed `seed`: index (seed + pixel) mod 256. */
const nebulaImage = (seed: number): number[] => Array.from({ length: 128 * 128 }, (_, pixel) => (seed + pixel) & 0xff);

/** Camera rows turned 180° about R1: slot 1 (−z) in view. */
const TURNED: Rows = [-1, 0, 0, 0, 1, 0, 0, 0, -1];

/**
 * The background with `rows` whose single visible nebula, of `seed`, has its stored rows along screen +x from column
 * `left` and its columns upwards from row `bottomRow` (θ = 0, NB4), then the stars.
 */
function turnedBackground(rows: Rows, seed: number, left: number, bottomRow: number): LogicalImage {
  const image = new LogicalImage();
  const indices = nebulaImage(seed);
  for (let row = 0; row < 128; row++) {
    for (let column = 0; column < 128; column++) {
      const [x, y] = [left + row, bottomRow - column];
      if (y >= 1 && y <= F1_BOTTOM && x >= 0 && x < 640) image.set(x, y, SCENE_DATA[indices[row * 128 + column]]);
    }
  }
  for (const { x, y, colour } of starPixels(rows, F1_BOTTOM)) image.set(x, y, SCENE_DATA[colour]);
  return image;
}

test.describe('backgrounds (AC-09, AC-16, AC-23)', () => {
  test('F1 draws exactly the start nebula and the star table over black, and the opposite slot the next image turned by 180°', async ({ page }, testInfo) => {
    await openScenes(page);
    const forward = [scenePlayer()];
    await startScene(page, 7, sceneState(0, forward));
    await deliver(page, [at(sceneState(1, forward))]);
    const front = await picture(page, 1);
    // Exactly one start of the list explains the whole picture: black outside the 3D viewport, the slot-0 image read
    // right to left and top to bottom (NB4), and the 57 stars the identity rows show (SD3).
    const fits = NEBULA_SEEDS.map((seed, start) => ({ start, wrong: mismatches(front, identityBackground(SCENE_DATA, nebulaImage(seed), F1_BOTTOM)).length }));
    const matching = fits.filter(({ wrong }) => wrong === 0);
    expect(matching.length, JSON.stringify(fits)).toBeGreaterThan(0);
    expect(starPixels([1, 0, 0, 0, 1, 0, 0, 0, 1], F1_BOTTOM)).toHaveLength(57);

    // Turned to −z, slot 1 shows the list's next image (start + 1) with θ = 0: rows to the right, columns upwards.
    const turned = [scenePlayer(undefined, TURNED as never)];
    // Two ticks of the same pose, so the interpolated camera is that pose.
    await deliver(page, [at(sceneState(2, turned)), at(sceneState(3, turned))]);
    const back = await picture(page, 3);
    const placements: { start: number; left: number; bottomRow: number }[] = [];
    for (const { start } of matching) {
      const seed = NEBULA_SEEDS[(start + 1) % NEBULA_SEEDS.length];
      for (let left = 252; left <= 260; left++) {
        for (let bottomRow = 299; bottomRow <= 307; bottomRow++) {
          if (mismatches(back, turnedBackground(TURNED, seed, left, bottomRow)).length === 0) placements.push({ start, left, bottomRow });
        }
      }
    }
    expect(placements, 'one start and one placement explain the turned picture').toHaveLength(1);
    await testInfo.attach('nebula', { body: JSON.stringify({ fits, turned: placements[0] }), contentType: 'application/json' });
    await page.evaluate(() => { window.osrFlightScenes!.close(); });
  });
});

// Models (LS2–LS8, PV3, PV5)

interface Expected {
  readonly what: string;
  readonly x: number;
  readonly y: number;
  readonly rgb: Rgb;
}

function expectPixels(actual: LogicalImage, expected: readonly Expected[]): void {
  const wrong = expected.filter(({ x, y, rgb }) => actual.at(x, y).join() !== rgb.join());
  const span = (values: number[]) => `${Math.min(...values)}–${Math.max(...values)}`;
  const where = wrong.length === 0 ? '' : ` (${[...new Set(wrong.map(({ what }) => what))].join(', ')} at x ${span(wrong.map(({ x }) => x))}, y ${span(wrong.map(({ y }) => y))})`;
  expect(wrong.slice(0, 12).map(({ what, x, y, rgb }) => ({ what, x, y, expected: rgb, actual: actual.at(x, y) })), `${wrong.length} of ${expected.length} pixels differ${where}`).toEqual([]);
}

test.describe('models (AC-07)', () => {
  test('flat, textured and unlit parts show their ramp entries as DATA colours, lit from world −x, and nearer models cover farther ones', async ({ page }, testInfo) => {
    await openScenes(page);
    const scene: { id: number; model: string; position: Vec3; rows: Rows }[] = [
      { id: 2, model: FLAT_MODEL, position: vec(-7, 3, 20), rows: IDENTITY_ROWS },
      { id: 3, model: FLAT_MODEL, position: vec(-2.5, 3, 20), rows: yaw(0.6) },
      { id: 4, model: FLAT_MODEL, position: vec(2.5, 3, 20), rows: yaw(-0.6) },
      // Steeply turned and near, so affine and perspective-correct texturing read different texels.
      { id: 5, model: TEXTURED_MODEL, position: vec(2.2, 0, 6.5), rows: yaw(0.95) },
      { id: 6, model: UNLIT_MODEL, position: vec(-5, -3.5, 20), rows: IDENTITY_ROWS },
      { id: 7, model: TEXTURED_MODEL, position: vec(-1.5, -3.5, 20), rows: IDENTITY_ROWS },
      // Behind the unlit quad, overlapping its right half.
      { id: 8, model: FLAT_MODEL, position: vec(-3.4, -3.2, 26), rows: yaw(0.8) },
    ];
    const entities = [scenePlayer(), ...scene.map(({ id, model, position, rows }) => modelEntity(id, model, position, { orientation: rows as never }))];
    await startScene(page, 11, sceneState(0, entities));
    await deliver(page, [at(sceneState(1, entities))]);
    const actual = await picture(page, 1);
    const background = matchingBackground(actual, F1_BOTTOM);

    const views = new Map(scene.map(item => [item.id, new QuadView(item.position, item.rows)]));
    const expected: Expected[] = [];
    const shades: Record<number, number> = {};
    let affineOnly = 0;
    for (const { id, model, position, rows } of scene) {
      const view = views.get(id)!;
      const shade = model === UNLIT_MODEL ? 0 : flatShade(rows, QUAD_NORMAL);
      shades[id] = shade;
      for (const [x, y] of view.interior()) {
        // A nearer quad covers this one (depth test, LS7); pixels near its edges are left out.
        if (scene.some(other => other.position.z < position.z && views.get(other.id)!.inside(x, y, -2))) continue;
        if (model === FLAT_MODEL) {
          expected.push({ what: `${id} flat shade ${shade}`, x, y, rgb: shown(rampEntry(FLAT_COLOUR, shade)) });
        } else {
          const affine = view.uvAffine(x, y);
          const texel = affine && texelAt(affine);
          if (texel === null || texel === undefined) continue;
          // Where perspective-correct sampling would read another texel, the picture tells the two apart.
          const perspective = texelAt(view.uvAt(x, y), 0);
          if (perspective !== null && perspective !== texel) affineOnly += 1;
          const colour = TEXTURE_COLOURS[texel];
          expected.push({ what: `${id} texel ${texel}`, x, y, rgb: shown(model === UNLIT_MODEL ? colour : rampEntry(colour, shade)) });
        }
      }
      // Around each quad, the background.
      for (const [x, y] of view.outside()) {
        if ([...views.values()].some(other => other !== view && other.inside(x, y, -2))) continue;
        expected.push({ what: `around ${id}`, x, y, rgb: background.at(x, y) });
      }
    }
    // The yawed quads are lit (shade 1), the ones facing the camera or turned away get the ambient entry (shade 0).
    expect(shades).toEqual({ 2: 0, 3: 1, 4: 0, 5: 1, 6: 0, 7: 0, 8: 1 });
    // Shading before quantising: the lit flat quad's entry differs from the one of its colour quantised to DATA first.
    expect(shown(rampEntry(FLAT_COLOUR, 1))).not.toEqual(shown(rampEntry(shown(FLAT_COLOUR), 1)));
    expect(affineOnly, 'sampled pixels where affine and perspective-correct texture sampling differ').toBeGreaterThan(0);
    expectPixels(actual, expected);
    await testInfo.attach('models', { body: JSON.stringify({ pixels: expected.length, shades, affineOnly }), contentType: 'application/json' });
    await page.evaluate(() => { window.osrFlightScenes!.close(); });
  });
});

// Hit shimmer (HS4, HS6, TEX 11069)

/** The band position t at `ticks` after the start, two clock units per tick (HS4: chop(Δ × F(1/128) × 255)). */
const bandAt = (ticks: number): number => Math.trunc(2 * ticks * F(1 / 128) * 255);
/** The opacity of a texel of threshold `v` at band position `t` (TEX 11069). */
const opacity = (v: number, t: number): number => (t + 1 < v && v < t + 40 ? 0xff : t - 3 < v && v < t + 43 ? 0x7f : 0);
/** The screen door's thresholds on the logical grid, by [y & 3][x & 3] (HS6): a pixel is drawn when opacity ≥ threshold. */
const SCREEN_DOOR = Object.freeze([[1, 192, 48, 240], [128, 64, 176, 112], [32, 224, 16, 208], [160, 96, 144, 80]]);

test.describe('hit shimmer (AC-08)', () => {
  test('the list-2 shell shows its texture colour over the whole hull, then the 0x7F screen door, then nothing', async ({ page }, testInfo) => {
    await openScenes(page);
    const position = vec(0, 2.5, 20);
    const HIT = 2;
    const craft = (tick: number) => modelEntity(2, SHIMMER_MODEL, position, { hitShimmerStart: tick >= HIT ? HIT * 2 : null });
    const state = (tick: number) => sceneState(tick, [scenePlayer(), craft(tick)]);
    await startScene(page, 13, state(0));
    const view = new QuadView(position, IDENTITY_ROWS);
    const interior = view.interior();
    const hull = shown(rampEntry(SHIMMER_BASE_COLOUR, flatShade(IDENTITY_ROWS, QUAD_NORMAL)));
    const shell = shown(TEXTURE_COLOURS[SHIMMER_TEXEL]);
    expect(hull).not.toEqual(shell);
    const observed: Record<number, { t: number; opacity: number; shell: number; hull: number }> = {};
    for (let tick = 1; tick <= HIT + 6; tick++) {
      await deliver(page, [at(state(tick), tick === HIT ? [hit(HIT, 2)] : [])]);
      if (tick !== 1 && tick < HIT + 4) continue;
      const actual = await picture(page, tick);
      const t = tick >= HIT ? bandAt(tick - HIT) : null;
      const alpha = t === null ? 0 : opacity(SHIMMER_THRESHOLD, t);
      expectPixels(actual, interior.map(([x, y]) => ({ what: `tick ${tick}`, x, y, rgb: alpha >= SCREEN_DOOR[y & 3][x & 3] ? shell : hull })));
      observed[tick] = { t: t ?? -1, opacity: alpha, shell: interior.filter(([x, y]) => actual.at(x, y).join() === shell.join()).length, hull: interior.filter(([x, y]) => actual.at(x, y).join() === hull.join()).length };
    }
    // The three phases the uniform thresholds give: all opaque (t = 15), the screen door on (x + y) even (t = 19), none (t = 23).
    expect(Object.values(observed).map(({ t, opacity: alpha }) => [t, alpha])).toEqual([[-1, 0], [15, 0xff], [19, 0x7f], [23, 0]]);
    await testInfo.attach('shimmer', { body: JSON.stringify({ interior: interior.length, observed }), contentType: 'application/json' });
    await page.evaluate(() => { window.osrFlightScenes!.close(); });
  });
});

// Explosion sprites (Q-09 as recorded for 21)

/** Frame f of every synthetic animation: 3 × 2 opaque pixels of DATA index 10f + 3j + i (flightRunContent). */
const spriteColour = (frame: number, i: number, j: number): Rgb => SCENE_DATA[(10 * frame + 3 * j + i) & 0xff];
/** The frame shown `ticks` after activation, two clock units per tick: (14 × Δclock) >> 6, hidden from frame 3. */
const spriteFrame = (ticks: number): number | null => {
  const frame = (14 * 2 * ticks) >> 6;
  return frame < 3 ? frame : null;
};

/** A missile's explosion, not a craft's, so it needs no construction callbacks (X2); the variant fixes list 1. */
const NOT_A_CRAFT = MISSILE_KIND_BIT;
const LARGE = Object.freeze({ sourceKindBit: NOT_A_CRAFT, variant: 'large' as const });

test.describe('explosion sprites (AC-13)', () => {
  test('a large explosion at depth 100 is a 9 × 6 block of 3 × 3 cells through its frames, hidden per block where the world is nearer', async ({ page }, testInfo) => {
    await openScenes(page);
    const START = 2;
    const free = vec(-20, 0, 100);
    const covered = vec(0, 0, 100);
    // A lit quad at depth about 50 whose left edge falls at column 316.5, between the covered block's first and second cells.
    const occluder = { position: vec(0.5233, 0, 50), rows: yaw(0.6) };
    const explosion = (id: number, where: Vec3) => sceneEntity(id, { type: 'explosion', variant: 'large' }, where, { kindBit: 22, sourceKindBit: NOT_A_CRAFT, explosionStart: START * 2 });
    const state = (tick: number) => sceneState(tick, [
      scenePlayer(), modelEntity(4, FLAT_MODEL, occluder.position, { orientation: occluder.rows as never }),
      ...(tick >= START ? [explosion(2, free), explosion(3, covered)] : []),
    ]);
    const started = (tick: number) => (tick === START ? [explosionStartedAt(START, 2, free, LARGE), explosionStartedAt(START, 3, covered, LARGE)] : []);
    await startScene(page, 17, state(0));
    const background = identityBackground(SCENE_DATA, null, F1_BOTTOM);
    const quad = new QuadView(occluder.position, occluder.rows);
    const quadColour = shown(rampEntry(FLAT_COLOUR, flatShade(occluder.rows, QUAD_NORMAL)));
    // Sprite centre (319 + trunc(639x/z), 157 + trunc(−639y/z)), scale trunc(4t) with t = (z − 1)K/z, K = F(599/598) for the
    // back plane 600, so 3 at z = 100; the block's top left is the centre less (3w >> 1, 3h >> 1).
    const K = F(599 / 598);
    const scale = Math.trunc(4 * ((100 - 1) * K / 100));
    expect(scale).toBe(3);
    const blocks = [{ left: 319 + Math.trunc(-639 * 20 / 100) - 4, top: 154, quadded: false }, { left: 315, top: 154, quadded: true }];
    const seen: Record<number, number | null> = {};
    for (let tick = 1; tick <= START + 8; tick++) {
      await deliver(page, [at(state(tick), started(tick))]);
      if (tick < START) continue;
      const actual = await picture(page, tick);
      const frame = spriteFrame(tick - START);
      seen[tick - START] = frame;
      const expected: Expected[] = [];
      for (const { left, top, quadded } of blocks) {
        for (let j = 0; j < 2; j++) {
          for (let i = 0; i < 3; i++) {
            const [cx, cy] = [left + 3 * i, top + 3 * j];
            // A cell is drawn unless the world is nearer at its top-left pixel; there the quad shows.
            const hidden = quadded && i > 0;
            for (const [x, y] of rect(cx, cy, cx + 2, cy + 2)) {
              const under = quadded && quad.inside(x, y, 0.5) ? quadColour : background.at(x, y);
              expected.push({ what: `tick ${tick} cell ${i},${j}`, x, y, rgb: frame === null || hidden ? under : spriteColour(frame, i, j) });
            }
          }
        }
      }
      expectPixels(actual, expected.filter(({ x }) => x !== 316 && x !== 317 || frame !== null));
    }
    expect(seen).toEqual({ 0: 0, 1: 0, 2: 0, 3: 1, 4: 1, 5: 2, 6: 2, 7: null, 8: null });
    await testInfo.attach('sprites', { body: JSON.stringify({ seen }), contentType: 'application/json' });
    await page.evaluate(() => { window.osrFlightScenes!.close(); });
  });
});

// Screen flash (SF1–SF5)

/** The flash palette table `table` applied to an 8-bit DATA colour: 6-bit component + 2 × table, at most 63 (SF4). */
const flashed = (rgb: Rgb, table: number): Rgb => rgb.map(c => vga(Math.min((c >> 2) + 2 * table, 63))) as unknown as Rgb;

/** The game image shifted up by `rows` logical rows, the revealed rows black, all through `table`. */
function flashPicture(base: LogicalImage, rows: number, table: number): LogicalImage {
  const image = new LogicalImage();
  for (let y = 0; y < 480; y++) {
    for (let x = 0; x < 640; x++) image.set(x, y, flashed(y + rows < 480 ? base.at(x, y + rows) : [0, 0, 0], table));
  }
  return image;
}

test.describe('screen flash (AC-14)', () => {
  test('a hit on the player shifts the whole game image up by (r AND 0xFFFE)/2 rows through the fading table, leaves the borders black and ends', async ({ page }, testInfo) => {
    // Wider than 4:3, so the canvas has black borders to its left and right.
    await openScenes(page, 800, 480);
    const HIT = 2;
    const entities = [scenePlayer(), modelEntity(2, UNLIT_MODEL, vec(-3, 2, 20)), modelEntity(3, FLAT_MODEL, vec(3, -2, 20), { orientation: yaw(0.6) as never })];
    const state = (tick: number) => sceneState(tick, entities);
    await startScene(page, 19, state(0));
    await deliver(page, [at(state(1))]);
    const base = await picture(page, 1);
    // Flash 0 of the scene settings (RUN_SETTINGS): mask 6, duration 0.5 s, a draw every tick, level 63.
    const [DURATION, LEVEL_MAX, MASK] = [0.5, 63, 6];
    const shifts = [...new Set([0, 2, 4, 6].map(r => ((r & MASK) & 0xfffe) / 2))];
    const found: { tick: number; rows: number; table: number }[] = [];
    for (let tick = HIT; tick <= HIT + 18; tick++) {
      await deliver(page, [at(state(tick), tick === HIT ? [hit(HIT, 1)] : [])]);
      const actual = await picture(page, tick);
      const k = tick - HIT;
      // The start touches neither table nor offset; each later tick's update writes level chop((d − e) ÷ d × 63) with
      // e = 2k ÷ 64 s, and the first update past the duration ends it with level 0 and offset 0.
      const elapsed = (2 * k) / 64;
      const table = k === 0 || elapsed > DURATION ? 0 : Math.trunc(((DURATION - elapsed) / DURATION) * LEVEL_MAX) >> 1;
      const candidates = (k === 0 || elapsed > DURATION ? [0] : shifts).filter(rows => sameImage(actual, flashPicture(base, rows, table)));
      expect(candidates, `tick ${tick}: one shift explains the picture with table ${table}`).toHaveLength(1);
      found.push({ tick, rows: candidates[0], table });
      if (k === 1) {
        // The letterbox is the page's, outside the game image: still black at the strongest table.
        expect(await pagePixels(page, [[10, 10], [40, 240], [790, 470], [760, 100]])).toEqual([[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]]);
      }
    }
    expect(found.some(({ rows }) => rows > 0), 'some tick shifted the picture').toBe(true);
    expect(found.at(-1)).toEqual({ tick: HIT + 18, rows: 0, table: 0 });
    // Still frames (a paused run) keep the flash where it stopped.
    await deliver(page, [at(state(HIT + 19), [hit(HIT + 19, 1)])]);
    await deliver(page, [at(state(HIT + 20))]);
    const held = await picture(page, HIT + 20);
    for (let frame = 0; frame < 3; frame++) await deliver(page, null);
    await nextFrames(page);
    expect(mismatches(await logicalImage(page, area(page)), held)).toEqual([]);
    await testInfo.attach('flash', { body: JSON.stringify(found), contentType: 'application/json' });
    await page.evaluate(() => { window.osrFlightScenes!.close(); });
  });
});

// Backgrounds of every view; speed dust (SD4–SD6)

/** The identity background whose nebula is one of the list's images and which explains `actual` but for `allowed` pixels. */
function matchingBackground(actual: LogicalImage, bottom: number): LogicalImage {
  const backgrounds = [...new Set(NEBULA_SEEDS)].map(seed => identityBackground(SCENE_DATA, nebulaImage(seed), bottom));
  const best = backgrounds.map(background => ({ background, wrong: mismatches(actual, background).length })).sort((a, b) => a.wrong - b.wrong)[0];
  return best.background;
}

interface DustRead {
  readonly pixels: number;
  readonly colours: readonly string[];
  readonly outside: number;
  readonly joined: number;
}

/** The pixels that differ from `background`, as dust: their count, colours, how many lie outside `area`, how many touch another. */
function dustOf(actual: LogicalImage, background: LogicalImage, [left, top, right, bottom]: readonly number[]): DustRead {
  const found = mismatches(actual, background);
  const at = new Set(found.map(({ x, y }) => `${x},${y}`));
  return {
    pixels: found.length,
    colours: [...new Set(found.map(({ actual: rgb }) => rgb.join()))].sort(),
    outside: found.filter(({ x, y }) => x < left || x > right || y < top || y > bottom).length,
    joined: found.filter(({ x, y }) => [-1, 0, 1].some(dx => [-1, 0, 1].some(dy => (dx || dy) && at.has(`${x + dx},${y + dy}`)))).length,
  };
}

const colourKeys = (...entries: number[]): string[] => entries.map(entry => SCENE_DATA[entry].join()).sort();

test.describe('views and speed dust (AC-23, AC-16)', () => {
  test('map, base and 0x13 draw no world, stars or nebula; a map marker draws nothing; F1 dust follows the speed share in DATA 2 and 4', async ({ page }, testInfo) => {
    await openScenes(page);
    // A map marker in front of the camera draws nothing (AC-04): the pictures below are exact without it.
    const entities = [scenePlayer(), modelEntity(2, UNLIT_MODEL, vec(-4, 2, 20)), sceneEntity(3, { type: 'map-marker' }, vec(0, 0, 20), { kindBit: 25 })];
    let tick = 0;
    const next = (options: Parameters<typeof sceneState>[2] = {}) => sceneState(++tick, entities, options);
    await startScene(page, 23, sceneState(0, entities));
    const reads: Record<string, unknown> = {};
    for (const viewMode of [8, 6, 0x13]) {
      await deliver(page, [at(next({ viewMode })), at(next({ viewMode }))]);
      const actual = await picture(page, tick);
      expect(mismatches(actual, new LogicalImage()).length, `view ${viewMode} is black`).toBe(0);
    }
    // Back in F1 with share 0: initialised, then skipped, so the picture is the background and the quad exactly.
    await deliver(page, [at(next({ speedShare: 0 })), at(next({ speedShare: 0 }))]);
    const still = await picture(page, tick);
    const background = matchingBackground(still, F1_BOTTOM);
    const quad = new QuadView(vec(-4, 2, 20), IDENTITY_ROWS);
    const withQuad = background.clone();
    for (const [x, y] of quad.interior(-1)) withQuad.set(x, y, still.at(x, y));
    expect(mismatches(still, withQuad)).toEqual([]);
    const withoutQuad = (image: LogicalImage) => {
      const copy = image.clone();
      for (const [x, y] of quad.interior(-1)) copy.set(x, y, withQuad.at(x, y));
      return copy;
    };
    // Share 50: bright = trunc(5 × 50 / 100) = 2, so 2 + 2 = 4 within L1 distance 175 of the camera, else 2; single
    // pixels in columns 1–638 and rows 1–314, at most the 50 particles.
    for (let frame = 0; frame < 4; frame++) await deliver(page, [at(next({ speedShare: 50 }))]);
    const moving = dustOf(withoutQuad(await picture(page, tick)), withQuad, [1, 1, 638, 314]);
    expect(moving.pixels).toBeGreaterThan(0);
    expect(moving.pixels).toBeLessThanOrEqual(50);
    expect(moving.outside).toBe(0);
    // With this seed both the near and the far colour show.
    expect(moving.colours).toEqual(colourKeys(2, 4));
    reads.f1 = moving;
    // Share 1 again: nothing is tested or drawn.
    await deliver(page, [at(next({ speedShare: 1 })), at(next({ speedShare: 1 }))]);
    expect(mismatches(withoutQuad(await picture(page, tick)), withQuad)).toEqual([]);
    await testInfo.attach('dust', { body: JSON.stringify(reads), contentType: 'application/json' });
    await page.evaluate(() => { window.osrFlightScenes!.close(); });
  });
});

// Destruction view (AC-06; destruction camera of the automatic views, executable.md)

const ENTRY_ANGLE = F((32 * Math.PI) / 180);
/** A player orientation the entry's 32° turn about R0 brings back to the identity rows. */
const PRE_TURNED = Object.freeze([1, 0, 0, 0, F(Math.cos(ENTRY_ANGLE)), -F(Math.sin(ENTRY_ANGLE)), 0, F(Math.sin(ENTRY_ANGLE)), F(Math.cos(ENTRY_ANGLE))]);
/** Without a followed entity the camera backs off along −R2 by 30 per second of mission clock: 30 × 2 ÷ 64 per tick. */
const RECESSION = (30 * 2) / 64;

function entered(tick: number): ViewSwitchedEvent {
  return Object.freeze({
    type: 'view-switched', tick, fromViewMode: 0x0c, fromSubMode: 0, viewMode: 0x11, subMode: 8, stage: 'collision',
    player: Object.freeze({ entityId: 1 as EntityId, position: vec(0), orientation: PRE_TURNED as unknown as Matrix3 }),
  });
}

test.describe('destruction view (AC-06, AC-23)', () => {
  test('from the switch snapshot the camera turns to the identity rows over the full screen and backs off 0.9375 per tick; stars, nebula and dust follow', async ({ page }, testInfo) => {
    await openScenes(page);
    const ENTRY = 2;
    const quadAt = vec(0, 0, 20);
    const rows = yaw(0.6);
    const entities = [scenePlayer(), modelEntity(2, FLAT_MODEL, quadAt, { orientation: rows as never })];
    const state = (tick: number, speedShare = 0) => sceneState(tick, entities, tick >= ENTRY ? { viewMode: 0x11, subMode: 8, speedShare } : { speedShare });
    await startScene(page, 29, state(0));
    await deliver(page, [at(state(1))]);
    const colour = shown(rampEntry(FLAT_COLOUR, flatShade(rows, QUAD_NORMAL)));
    const cameras: Record<number, number> = {};
    let background: LogicalImage | null = null;
    for (let tick = ENTRY; tick <= ENTRY + 12; tick++) {
      await deliver(page, [at(state(tick), tick === ENTRY ? [entered(ENTRY)] : [])]);
      if ((tick - ENTRY) % 4 !== 0) continue;
      const actual = await picture(page, tick);
      background ??= matchingBackground(actual, FULL_BOTTOM);
      // Drawn at alpha 0, the previous tick's camera after the entry tick, which folds the interpolation.
      const back = RECESSION * Math.max(0, tick - ENTRY - 1);
      cameras[tick] = back;
      const quad = new QuadView(vec(quadAt.x, quadAt.y, quadAt.z + back), rows, 240);
      const expected = background.clone();
      for (const [x, y] of quad.interior(1.5)) expected.set(x, y, colour);
      const inside = quad.interiorKeys(1.5);
      const edge = quad.interiorKeys(-1.5);
      const wrong = mismatches(actual, expected).filter(({ x, y }) => inside.has(pixelKey(x, y)) || !edge.has(pixelKey(x, y)));
      expect(wrong.slice(0, 10), `tick ${tick}: ${wrong.length} pixels differ (camera z −${back})`).toEqual([]);
      expect(inside.size).toBeGreaterThan(500);
    }
    // 68 stars over rows 0–479 with the identity rows (SD3), nebula slot 0 down to row 304.
    expect(starPixels(IDENTITY_ROWS, FULL_BOTTOM)).toHaveLength(68);
    // Before the explosion the share is that of speed 30; dust draws at bright 7: DATA 7 within L1 distance 250, else 2.
    const DUST_FROM = ENTRY + 13;
    for (let tick = DUST_FROM; tick < DUST_FROM + 4; tick++) await deliver(page, [at(state(tick, 30))]);
    const actual = await picture(page, DUST_FROM + 3);
    const quad = new QuadView(vec(quadAt.x, quadAt.y, quadAt.z + RECESSION * (DUST_FROM + 2 - ENTRY - 1)), rows, 240);
    const masked = actual.clone();
    for (const [x, y] of quad.interior(-2)) masked.set(x, y, background!.at(x, y));
    const dust = dustOf(masked, background!, [1, 1, 638, 478]);
    expect(dust.pixels).toBeGreaterThan(0);
    expect(dust.pixels).toBeLessThanOrEqual(50);
    expect(dust.outside).toBe(0);
    expect(colourKeys(2, 7)).toEqual(expect.arrayContaining([...dust.colours]));
    await testInfo.attach('destruction', { body: JSON.stringify({ cameras, dust }), contentType: 'application/json' });
    await page.evaluate(() => { window.osrFlightScenes!.close(); });
  });
});

// Warp effect (WT4, WT8) and dust lines

test.describe('Warp effect (AC-15, AC-23)', () => {
  test('view 1 draws the stars, the green and grey tunnel lines inside rows 2–313 with a clear centre, and dust as lines only while the share exceeds 1', async ({ page }, testInfo) => {
    await openScenes(page);
    // The camera flies along the tunnel, so the dust moves on screen between passes.
    const pose = (at: number) => cameraAt(9000 + 6 * at);
    let tick = 0;
    const state = (speedShare: number) => { tick += 1; return Object.freeze({ ...warpState(tick, 1, STRAIGHT_PATH, pose(tick)), speedShare }); };
    await startScene(page, 31, warpState(0, 1, STRAIGHT_PATH, pose(0)));
    const stars = identityBackground(SCENE_DATA, null, F1_BOTTOM);
    const starAt = new Set(starPixels(IDENTITY_ROWS, F1_BOTTOM).map(({ x, y }) => `${x},${y}`));
    // The tunnel's colours: (0, e, 0) at the rims and (e, e, e) in the middle for e the expansion of a ramp level.
    const levels = new Set(Array.from({ length: 63 }, (_, level) => vga(level + 1)));
    const tunnel = ([r, g, b]: Rgb) => (r === 0 && b === 0 && levels.has(g)) || (r === g && g === b && levels.has(r));
    const classify = (actual: LogicalImage) => {
      const counts = { black: 0, star: 0, tunnel: 0, other: 0, below: 0, centre: 0 };
      const others: Mismatch[] = [];
      for (let y = 0; y < 480; y++) {
        for (let x = 0; x < 640; x++) {
          const rgb = actual.at(x, y);
          if (y > F1_BOTTOM) {
            if (rgb.join() !== '0,0,0') counts.below += 1;
          } else if (rgb.join() === '0,0,0') counts.black += 1;
          else if (tunnel(rgb)) {
            counts.tunnel += 1;
            if (Math.hypot(x - 320, y - 158) < 8) counts.centre += 1;
          } else if (starAt.has(`${x},${y}`) && rgb.join() === stars.at(x, y).join()) counts.star += 1;
          else {
            counts.other += 1;
            others.push({ x, y, actual: rgb, expected: [0, 0, 0] });
          }
        }
      }
      return { counts, others };
    };
    for (let frame = 0; frame < 3; frame++) await deliver(page, [at(state(0))]);
    const calm = classify(await picture(page, tick));
    expect(calm.counts).toMatchObject({ below: 0, other: 0, centre: 0 });
    expect(calm.counts.tunnel).toBeGreaterThan(200);
    // The stars of the identity rows where the tunnel does not cover them (57 in view).
    expect(calm.counts.star).toBeGreaterThan(30);
    // With share 60 the dust draws: bright 7 in view 1, so DATA 7 within L1 distance 250 and 2 beyond, as lines once a
    // particle was drawn in the previous pass.
    for (let frame = 0; frame < 4; frame++) await deliver(page, [at(state(60))]);
    const dusty = classify(await picture(page, tick));
    expect(dusty.counts).toMatchObject({ below: 0, centre: 0 });
    expect(dusty.counts.other).toBeGreaterThan(0);
    expect(colourKeys(2, 7)).toEqual(expect.arrayContaining([...new Set(dusty.others.map(({ actual: rgb }) => rgb.join()))]));
    const dustAt = new Set(dusty.others.map(({ x, y }) => `${x},${y}`));
    const joined = dusty.others.filter(({ x, y }) => [-1, 0, 1].some(dx => [-1, 0, 1].some(dy => (dx || dy) && dustAt.has(`${x + dx},${y + dy}`)))).length;
    expect(joined, 'some dust pixels join into lines').toBeGreaterThan(0);
    await testInfo.attach('warp', { body: JSON.stringify({ calm: calm.counts, dusty: { ...dusty.counts, joined } }), contentType: 'application/json' });
    await page.evaluate(() => { window.osrFlightScenes!.close(); });
  });
});

// Projectiles, missiles and fragments (HS7, HS9, Q-07, Q-08)

const f32Bits = (value: number): number => new Uint32Array(Float32Array.of(value).buffer)[0];

/**
 * Projectile record `record` of the synthetic visuals as HS7 builds it: its template's vertices, a component widened by
 * the record's width when its f32 bits are one of that axis's markers, then a z equal to the length marker lengthened by
 * length × constant; the faces as listed (count, corners…), fanned from the first corner.
 */
function projectileShape(record: number) {
  const visuals = syntheticProjectile();
  const { selector, width, length, colour } = visuals.records[record];
  const template = visuals.templates[selector & 1];
  const vertices: [number, number, number][] = [];
  for (let at = 0; at < template.vertices.length; at += 3) {
    vertices.push([0, 1, 2].map(axis => {
      const value = template.vertices[at + axis];
      const bits = f32Bits(value);
      const widened = bits === template.widthMarkers[axis * 2] || bits === template.widthMarkers[axis * 2 + 1] ? F(value * width) : value;
      return axis === 2 && f32Bits(widened) === template.lengthMarker ? widened * (length * template.lengthConstant) : widened;
    }) as [number, number, number]);
  }
  const triangles: [number, number, number][] = [];
  for (let at = 0; template.faces[at] !== 0; at += template.faces[at] + 1) {
    const corners = [...template.faces.slice(at + 1, at + 1 + template.faces[at])];
    for (let corner = 1; corner + 1 < corners.length; corner++) triangles.push([corners[0], corners[corner], corners[corner + 1]]);
  }
  // A colour component as a byte: round half to even of the clamped value × 255.
  const rgb = colour.map(colourByte) as unknown as Rgb;
  return { vertices, triangles, rgb };
}

test.describe('projectiles, missiles and fragments (AC-10)', () => {
  test('a projectile record draws its template widened and lengthened in its colour, unlit; a list-1 fragment its part at its pose, flat lit; a missile within its hull', async ({ page }, testInfo) => {
    await openScenes(page);
    const shot = vec(-6, 3, 60);
    const missileAt = vec(6, 3, 60);
    const fragmentAt = vec(-4, -2, 15);
    const entities = [
      scenePlayer(),
      sceneEntity(2, { type: 'projectile', visuals: PROJECTILE_VISUALS, record: 0 }, shot, { kindBit: 21 }),
      sceneEntity(3, { type: 'missile', missile: 1 }, missileAt, { kindBit: MISSILE_KIND_BIT }),
      sceneEntity(4, { type: 'fragment', model: CRAFT, part: 1, display: 'part' }, fragmentAt, { kindBit: 24, sourceKindBit: 1, orientation: yaw(0.6) as never }),
    ];
    await startScene(page, 37, sceneState(0, entities));
    await deliver(page, [at(sceneState(1, entities))]);
    const actual = await picture(page, 1);
    const background = matchingBackground(actual, F1_BOTTOM);

    // The projectile: its front faces (the screen winding of a quad facing the camera) in its colour's DATA entry.
    const { vertices, triangles, rgb } = projectileShape(0);
    const screen = vertices.map(([x, y, z]) => project(shot.x + x, shot.y + y, shot.z + z));
    const faces = triangles.map(corners => corners.map(index => screen[index]));
    const front = faces.filter(([a, b, c]) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) > 0);
    const expected: Expected[] = [];
    for (const [x, y] of pixelsAround(screen, 4)) {
      if (front.some(face => insideConvex(face, x, y, 1.5))) expected.push({ what: 'projectile', x, y, rgb: shown(rgb) });
      else if (faces.every(face => !insideConvex(face, x, y, -1.5))) expected.push({ what: 'around the projectile', x, y, rgb: background.at(x, y) });
    }
    expect(expected.filter(({ what }) => what === 'projectile').length).toBeGreaterThan(200);
    expectPixels(actual, expected);

    // The fragment: list-1 part 1 of the craft model (the lighting tests' square, x, y in 0–1) at the fragment's pose
    // without an offset, flat lit in its axes, in the part's colour (HS9); of its two triangles only the one facing the
    // camera (3-2-0, normal −z) draws.
    const fragmentRows = yaw(0.6);
    const visible = [[0, 1, 0], [1, 1, 0], [0, 0, 0]].map(corner => placed(fragmentAt, fragmentRows, corner));
    const square = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]].map(corner => placed(fragmentAt, fragmentRows, corner));
    const fragmentColour = shown(rampEntry([200, 10, 10], flatShade(fragmentRows, QUAD_NORMAL)));
    const fragment: Expected[] = [];
    for (const [x, y] of pixelsAround(square, 4)) {
      if (insideConvex(visible, x, y, 1.5)) fragment.push({ what: 'fragment', x, y, rgb: fragmentColour });
      else if (!insideConvex(visible, x, y, -1.5)) fragment.push({ what: 'around the fragment', x, y, rgb: background.at(x, y) });
    }
    expect(fragment.filter(({ what }) => what === 'fragment').length).toBeGreaterThan(200);
    expectPixels(actual, fragment);

    // The missile (type 1: body, fins, textured element, extra element; HS7): its look is Node-tested (P3-12/20); here
    // it draws, and only inside the convex hull of its expanded vertices at its pose.
    const missileVisual = expandMissiles(syntheticMissile())[1];
    const missileScreen = [...missileVisual.parts, missileVisual.element, ...(missileVisual.extra ? [missileVisual.extra] : [])]
      .flatMap(({ positions }) => Array.from({ length: positions.length / 3 }, (_, at) => project(missileAt.x + positions[at * 3], missileAt.y + positions[at * 3 + 1], missileAt.z + positions[at * 3 + 2])));
    const hull = convexHull(missileScreen);
    const changed = mismatches(actual, background);
    const missile = changed.filter(({ x, y }) => insideConvex(hull, x, y, -1.5));
    expect(missile.length).toBeGreaterThan(0);
    // Nothing else changed: every pixel off the background belongs to the projectile, the fragment or the missile's hull.
    const stray = changed.filter(({ x, y }) => !insideConvex(hull, x, y, -1.5) && !front.some(face => insideConvex(face, x, y, -1.5)) && !insideConvex(visible, x, y, -1.5));
    expect(stray.slice(0, 10), `${stray.length} pixels changed outside the three objects`).toEqual([]);
    await testInfo.attach('objects', { body: JSON.stringify({ projectile: expected.length, missile: missile.length, fragment: fragment.length }), contentType: 'application/json' });
    await page.evaluate(() => { window.osrFlightScenes!.close(); });
  });
});

// Layout, still frames and the run's resources (AC-05, AC-16, AC-04, AC-02)

test.describe('layout and lifecycle (AC-02, AC-04, AC-05, AC-16)', () => {
  test('size, aspect ratio and pixel ratio change only the sharpness: the same logical picture in black borders; still frames advance nothing; each run returns its resources', async ({ page, browser, baseURL, audit }, testInfo) => {
    await openScenes(page);
    const START = 1;
    const entities = (tick: number) => [scenePlayer(), modelEntity(2, UNLIT_MODEL, vec(-5, -3.5, 20)), sceneEntity(3, { type: 'explosion', variant: 'large' }, vec(-20, 0, 100), { kindBit: 22, sourceKindBit: NOT_A_CRAFT, explosionStart: START * 2 })]
      .filter(entity => entity.id !== 3 || tick >= START);
    const state = (tick: number) => sceneState(tick, entities(tick));
    const run = async () => {
      await startScene(page, 41, state(0));
      await deliver(page, [at(state(1), [explosionStartedAt(START, 3, vec(-20, 0, 100), LARGE)])]);
      await deliver(page, [at(state(2))]);
      return picture(page, 2);
    };
    const reference = await run();
    const first = await diagnostics(page);
    const quad = new QuadView(vec(-5, -3.5, 20), IDENTITY_ROWS);
    const edges = new Set(quad.interior(-2).filter(([x, y]) => !quad.inside(x, y, 2)).map(([x, y]) => pixelKey(x, y)));
    const sameAsReference = (image: LogicalImage) => mismatches(image, reference).filter(({ x, y }) => !edges.has(pixelKey(x, y)));

    // Still frames, as while paused or held: drawn again, the tick and picture unchanged.
    for (let frame = 0; frame < 3; frame++) await deliver(page, null);
    const still = await diagnostics(page);
    expect(still).toMatchObject({ lastTick: 2, runId: first.runId });
    expect(still.draws).toBeGreaterThan(first.draws);
    expect(mismatches(await logicalImage(page, area(page)), reference)).toEqual([]);

    const layouts: unknown[] = [];
    const check = async (width: number, height: number, frame: { left: number; top: number }, borders: readonly (readonly [number, number])[]) => {
      await page.evaluate(([w, h]) => { window.osrFlightScenes!.resize(w, h); }, [width, height]);
      await expect.poll(async () => (await diagnostics(page)).layout?.frame).toMatchObject(frame);
      const layout = (await diagnostics(page)).layout!;
      const image = await picture(page, 2);
      expect(sameAsReference(image), `${width} × ${height} at ${layout.pixelRatio}`).toEqual([]);
      expect(await pagePixels(page, borders)).toEqual(borders.map(() => [0, 0, 0]));
      layouts.push(layout);
    };
    // Wider: borders left and right; taller: above and below; larger: a 1280 × 960 buffer of the same logical picture.
    await check(1000, 480, { left: 180, top: 0 }, [[20, 20], [990, 470]]);
    await check(640, 700, { left: 0, top: 110 }, [[20, 20], [620, 690]]);
    await check(1280, 960, { left: 0, top: 0 }, []);
    // The run's end returns its resources; the same scene again holds the same warm counts.
    const warm = { resources: first.resources, gpu: first.gpu };
    await page.evaluate(() => { window.osrFlightScenes!.end(); });
    expect(await diagnostics(page)).toMatchObject({ runId: null, resources: null });
    await run();
    const again = await diagnostics(page);
    expect({ resources: again.resources, gpu: again.gpu }).toEqual(warm);
    await page.evaluate(() => { window.osrFlightScenes!.close(); });
    expect(await page.evaluate(() => window.osrProbe.snapshot().canvases.filter(canvas => canvas.connected).length)).toBe(0);
    expect(await page.evaluate(() => window.osrFlightScenes!.reported())).toEqual([]);

    // A device pixel ratio of 2 in a page of its own: a 1280 × 960 buffer of the same logical picture. Chrome's emulated
    // ratio change (CDP) fires no `resolution` media query change, which the surface watches for a real one (measured:
    // devicePixelRatio 2, no change event), so a live change is left to real screens and zoom (P1-10/07 for the shared
    // surface).
    const doubled = await browser.newContext({ baseURL, viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
    try {
      const sharp = await doubled.newPage();
      await audit.attachPage(sharp);
      await openScenes(sharp);
      await startScene(sharp, 41, state(0));
      await deliver(sharp, [at(state(1), [explosionStartedAt(START, 3, vec(-20, 0, 100), LARGE)])]);
      await deliver(sharp, [at(state(2))]);
      const image = await picture(sharp, 2);
      const layout = (await diagnostics(sharp)).layout!;
      expect(layout).toMatchObject({ pixelRatio: 2, bufferWidth: 1280, bufferHeight: 960 });
      expect(sameAsReference(image)).toEqual([]);
      layouts.push(layout);
      await sharp.evaluate(() => { window.osrFlightScenes!.close(); });
      await audit.close(sharp);
    } finally {
      await doubled.close();
    }
    await testInfo.attach('layout', { body: JSON.stringify({ layouts, warm }), contentType: 'application/json' });
  });
});
