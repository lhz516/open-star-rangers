import { Camera, type BufferGeometry, type Mesh, type ShaderMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import type { ScreenFlash } from '../../../content/flight/flight-data-content.ts';
import type { DomainEvent } from '../../../core/contracts/domain-events.ts';
import type { RenderState, RenderWarp } from '../../../core/projections/render-state.ts';
import { BASE_VIEW_MODE, MAP_VIEW_MODE, WARP_VIEW_MODE } from '../../../core/systems/view-switch.ts';
import { COCKPIT_VIEW_MODE } from '../../../core/world/player-state.ts';
import type { CompositionFrame } from '../composition/flight-layers.ts';
import { controlledRand, PLAYER } from '../presentation/effects/effects.test-support.ts';
import type { ExplosionFlashRequest } from '../presentation/effects/presentation-effects.ts';
import { DESTRUCTION_VIEW_MODE } from '../presentation/presentation-camera.ts';
import { renderState } from '../presentation/presentation.test-support.ts';
import { FlightGpuCache } from '../renderer/flight-gpu-cache.ts';
import { deviceShift, FLASH_SCREEN_GPU_PLAN, FlashScreenStage, flashedComponent } from './flash-screen-stage.ts';
import { checkFlashRecords, createScreenFlashes, inWarpEndWindow, type ScreenFlashes, type ScreenFlashTick } from './screen-flash.ts';

// Code-generated synthetic flash records, Render States and events; never original data.

const FLASH_0: ScreenFlash = { randomMask: 0x0f, duration: 0.5, drawIntervalTicks: 6, level: 40 };
const FLASH_1: ScreenFlash = { randomMask: 0, duration: 0.25, drawIntervalTicks: 2, level: 10 };
const FLASH_2: ScreenFlash = { randomMask: 0, duration: 1, drawIntervalTicks: 0, level: 63 };
const RECORDS = [FLASH_0, FLASH_1, FLASH_2] as const;

const F1 = COCKPIT_VIEW_MODE;
const WARP = WARP_VIEW_MODE;
const MAP = MAP_VIEW_MODE;
const BASE = BASE_VIEW_MODE;
const DESTRUCTION = DESTRUCTION_VIEW_MODE;

interface TickOptions {
  readonly viewMode?: number;
  readonly player?: number | null;
  readonly events?: readonly DomainEvent[];
  readonly explosionFlashes?: number;
  readonly warp?: RenderWarp | null;
}

function tickOf(tick: number, { viewMode = F1, player = PLAYER, events = [], explosionFlashes = 0, warp = null }: TickOptions = {}): ScreenFlashTick {
  const render: RenderState = { ...renderState(tick, { viewMode, subMode: viewMode === DESTRUCTION ? 8 : 0, observedEntityId: player }), warp };
  const request = (): ExplosionFlashRequest => ({ tick, clock: render.clock, explosionKey: 'core:9', sourceKindBit: 7 });
  return { tick, clock: render.clock, render, events, explosionFlashes: Array.from({ length: explosionFlashes }, request) };
}

const hit = (tick: number, victim = PLAYER, cause = 'projectile'): DomainEvent => ({ type: 'hit', tick, victimEntityId: victim, cause }) as unknown as DomainEvent;
const event = (type: string, tick: number, fields: object = {}): DomainEvent => ({ type, tick, ...fields }) as unknown as DomainEvent;
const switched = (tick: number, fromViewMode: number, viewMode: number): DomainEvent => event('view-switched', tick, { fromViewMode, fromSubMode: 0, viewMode, subMode: 0 });
const warpAt = (segments: number, fraction: number, length = 20): RenderWarp => ({ serial: 1, progress: 0, segments, fraction, length, path: [] });

/** Steps ticks `from` to `to` with the same options; returns the screen after each. */
function run(flashes: ScreenFlashes, from: number, to: number, options: TickOptions = {}) {
  const screens = [];
  for (let tick = from; tick <= to; tick++) {
    flashes.step(tickOf(tick, options));
    screens.push(flashes.screen());
  }
  return screens;
}

/** Level chop((d − e) ÷ d × L) at elapsed clock units `units`, as SF3 computes it. */
const levelAt = ({ duration, level }: ScreenFlash, units: number): number => Math.trunc(((duration - Math.fround(units / 64)) / duration) * level);

describe('screen flash records', () => {
  it('accepts the supported domain, a negative duration included', () => {
    expect(() => checkFlashRecords(RECORDS)).not.toThrow();
    expect(() => checkFlashRecords([FLASH_0, { ...FLASH_1, duration: -1, randomMask: 0xffff_ffff, drawIntervalTicks: 0xffff_ffff }, { ...FLASH_2, level: 0 }])).not.toThrow();
  });

  it.each([
    ['a level above 63', { level: 64 }, 'flash.screenFlashes[1].level'],
    ['a negative level', { level: -1 }, 'flash.screenFlashes[1].level'],
    ['a zero duration', { duration: 0 }, 'flash.screenFlashes[1].duration'],
    ['a NaN duration', { duration: Number.NaN }, 'flash.screenFlashes[1].duration'],
    ['a mask beyond u32', { randomMask: 2 ** 32 }, 'flash.screenFlashes[1].randomMask'],
    ['a negative interval', { drawIntervalTicks: -2 }, 'flash.screenFlashes[1].drawIntervalTicks'],
  ])('refuses %s', (_name, change, path) => {
    expect(() => createScreenFlashes({ records: [FLASH_0, { ...FLASH_1, ...change }, FLASH_2], random: controlledRand(0) })).toThrow(expect.objectContaining({ kind: 'invalid-input', path }));
  });

  it('refuses two flashes', () => {
    expect(() => checkFlashRecords([FLASH_0, FLASH_1])).toThrow(expect.objectContaining({ path: 'flash.screenFlashes' }));
  });
});

describe('screen flashes', () => {
  it('starts flash 0 on a hit on the player after the update, then decays, draws and ends on its schedule', () => {
    const random = controlledRand(0x0b);
    const flashes = createScreenFlashes({ records: RECORDS, random });
    flashes.step(tickOf(1, { events: [hit(1)] }));
    expect(flashes.screen()).toEqual({ active: 0, level: 0, table: 0, offset: 0, shiftRows: 0 });

    const screens = run(flashes, 2, 18);
    // Tick n's clock is 2n: the first update draws at once (tick 2), then at the first sample past the last draw + 6
    // (ticks 6, 10 and 14).
    expect(random.used).toBe(4);
    screens.slice(0, 16).forEach((screen, at) => {
      const units = 2 * (at + 1);
      expect(screen).toEqual({ active: 0, level: levelAt(FLASH_0, units), table: levelAt(FLASH_0, units) >> 1, offset: 0x0b, shiftRows: 5 });
    });
    expect(screens[0].level).toBe(37);
    // Elapsed 0.5 s (tick 17) is not past the duration; tick 18's is.
    expect(screens[15]).toEqual({ active: 0, level: 0, table: 0, offset: 0x0b, shiftRows: 5 });
    expect(screens[16]).toEqual({ active: null, level: 0, table: 0, offset: 0, shiftRows: 0 });
    expect(run(flashes, 19, 20).every((screen) => screen === screens[16] || screen.active === null)).toBe(true);
  });

  it('draws every interval ÷ 2 + 1 ticks and keeps the offset in between (r = −1)', () => {
    const random = controlledRand(0);
    random.queue(0x03, 0x05, 0x0e);
    const flashes = createScreenFlashes({ records: RECORDS, random });
    flashes.step(tickOf(1, { events: [hit(1)] }));
    const offsets = run(flashes, 2, 10).map(({ offset }) => offset);
    expect(offsets).toEqual([0x03, 0x03, 0x03, 0x03, 0x05, 0x05, 0x05, 0x05, 0x0e]);
    expect(run(flashes, 11, 11)[0].shiftRows).toBe(7);
  });

  it('lets the latest start win, weaker or not, without resetting the offset; flash 1 clears it at its first update', () => {
    const flashes = createScreenFlashes({ records: RECORDS, random: controlledRand(0x0d) });
    flashes.step(tickOf(1, { events: [hit(1)] }));
    run(flashes, 2, 3);
    expect(flashes.screen()).toMatchObject({ active: 0, offset: 0x0d, shiftRows: 6 });
    flashes.step(tickOf(4, { explosionFlashes: 1 }));
    expect(flashes.screen()).toMatchObject({ active: 1, offset: 0x0d, shiftRows: 6, level: levelAt(FLASH_0, 6) });
    flashes.step(tickOf(5));
    // Mask 0: the first update draws r = 0; the level restarts from flash 1's.
    expect(flashes.screen()).toEqual({ active: 1, level: levelAt(FLASH_1, 2), table: levelAt(FLASH_1, 2) >> 1, offset: 0, shiftRows: 0 });
  });

  it('starts flash 2 at a Warp start before the update of the same tick, which clears the offset', () => {
    const flashes = createScreenFlashes({ records: RECORDS, random: controlledRand(0x0f) });
    flashes.step(tickOf(1, { events: [hit(1)] }));
    flashes.step(tickOf(2));
    expect(flashes.screen().offset).toBe(0x0f);
    flashes.step(tickOf(3, { viewMode: WARP, events: [switched(3, F1, WARP), event('warp-started', 3)], warp: warpAt(0, 0) }));
    expect(flashes.screen()).toEqual({ active: 2, level: 63, table: 31, offset: 0, shiftRows: 0 });
  });

  it('starts the explosion flash before the hit flash of the same tick', () => {
    const flashes = createScreenFlashes({ records: RECORDS, random: controlledRand(0) });
    flashes.step(tickOf(1, { events: [hit(1)], explosionFlashes: 2 }));
    expect(flashes.screen().active).toBe(0);
    flashes.step(tickOf(2, { explosionFlashes: 1 }));
    expect(flashes.screen().active).toBe(1);
  });

  it.each([
    ['a hit on another entity', { events: [hit(1, 7)] }],
    ['a parked engagement', { events: [hit(1, PLAYER, 'parked')] }],
    ['a hit in view 0x11', { events: [hit(1)], viewMode: DESTRUCTION }],
    ['a hit once the player has left', { events: [hit(1)], player: null }],
    ['a flash check once the player has left', { explosionFlashes: 1, player: null }],
    ['a wall contact outside view 1', { events: [event('warp-wall-contact', 1)] }],
    ['the end window outside view 1', { warp: warpAt(20, 0) }],
  ])('starts nothing for %s', (_name, options) => {
    const flashes = createScreenFlashes({ records: RECORDS, random: controlledRand(0) });
    flashes.step(tickOf(1, options));
    expect(flashes.screen().active).toBeNull();
  });

  it('starts flash 1 in view 0x11 and flashes 0 and 1 in the map and the base', () => {
    for (const [viewMode, options, active] of [
      [DESTRUCTION, { explosionFlashes: 1 }, 1], [MAP, { events: [hit(1)] }, 0], [BASE, { explosionFlashes: 1 }, 1],
    ] as const) {
      const flashes = createScreenFlashes({ records: RECORDS, random: controlledRand(0) });
      flashes.step(tickOf(1, { viewMode, ...options }));
      expect(flashes.screen().active).toBe(active);
    }
  });

  it('starts flash 0 at a wall contact and flash 2 strictly past 95 % of a Warp, every tick', () => {
    const random = controlledRand(0);
    const flashes = createScreenFlashes({ records: RECORDS, random });
    flashes.step(tickOf(1, { viewMode: WARP, events: [event('warp-wall-contact', 1)], warp: warpAt(5, 0) }));
    expect(flashes.screen().active).toBe(0);
    expect(inWarpEndWindow(warpAt(19, 0))).toBe(false);
    expect(inWarpEndWindow(warpAt(19, Math.fround(0.001)))).toBe(true);
    flashes.step(tickOf(2, { viewMode: WARP, warp: warpAt(19, 0) }));
    expect(flashes.screen().active).toBe(0);
    const before = random.used;
    run(flashes, 3, 6, { viewMode: WARP, warp: warpAt(19, 0.5) });
    // Restarted after each update: every update is the first after a start, so it draws, at full level.
    expect(random.used - before).toBe(3);
    expect(flashes.screen()).toMatchObject({ active: 2, level: levelAt(FLASH_2, 2), table: levelAt(FLASH_2, 2) >> 1 });
    // The wall contact and the end window in one tick: flash 2 starts last.
    flashes.step(tickOf(7, { viewMode: WARP, events: [event('warp-wall-contact', 7)], warp: warpAt(19, 0.5) }));
    expect(flashes.screen().active).toBe(2);
  });

  it('updates only in views 1, 8 and 0xC–0x12, and a view switch shows the layout palette', () => {
    const flashes = createScreenFlashes({ records: RECORDS, random: controlledRand(4) });
    flashes.step(tickOf(1, { events: [hit(1)] }));
    flashes.step(tickOf(2));
    const running = flashes.screen();
    expect(running.table).toBeGreaterThan(0);
    flashes.step(tickOf(3, { viewMode: BASE, events: [switched(3, F1, BASE)] }));
    expect(flashes.screen()).toEqual({ ...running, table: 0 });
    run(flashes, 4, 40, { viewMode: BASE });
    expect(flashes.screen()).toEqual({ ...running, table: 0 });
    // Long past its duration: the first update in a view that has one ends it.
    flashes.step(tickOf(41, { viewMode: F1, events: [switched(41, BASE, F1)] }));
    expect(flashes.screen()).toEqual({ active: null, level: 0, table: 0, offset: 0, shiftRows: 0 });
  });

  it('keeps the table through a switch into a view that updates it at once', () => {
    const flashes = createScreenFlashes({ records: RECORDS, random: controlledRand(4) });
    flashes.step(tickOf(1, { events: [hit(1)] }));
    flashes.step(tickOf(2, { viewMode: MAP, events: [switched(2, F1, MAP)] }));
    expect(flashes.screen()).toMatchObject({ active: 0, level: levelAt(FLASH_0, 2) });
  });

  it('changes only when stepped, and refuses ticks out of order', () => {
    const flashes = createScreenFlashes({ records: RECORDS, random: controlledRand(4) });
    flashes.step(tickOf(5, { events: [hit(5)] }));
    flashes.step(tickOf(6));
    const paused = flashes.screen();
    expect(flashes.screen()).toBe(paused);
    expect(() => flashes.step(tickOf(8))).toThrow(expect.objectContaining({ kind: 'invalid-input', path: 'flash.step' }));
    expect(() => flashes.step(tickOf(6))).toThrow(expect.objectContaining({ kind: 'invalid-input' }));
    flashes.step(tickOf(7));
    expect(flashes.screen().level).toBe(levelAt(FLASH_0, 4));
  });

  it('draws from a u32 next-draw sample and a u32 mask', () => {
    const random = controlledRand(0x7fff);
    const flashes = createScreenFlashes({ records: [{ ...FLASH_0, randomMask: 0xffff_ffff, drawIntervalTicks: 0xffff_ffff, duration: 10 }, FLASH_1, FLASH_2], random });
    flashes.step(tickOf(1, { events: [hit(1)] }));
    run(flashes, 2, 6);
    // next = 4 + 0xFFFFFFFF wraps to 3: every later sample is past it.
    expect(random.used).toBe(5);
    expect(flashes.screen()).toMatchObject({ offset: 0x7fff, shiftRows: 0x3fff });
  });
});

describe('flash screen stage', () => {
  it('maps each 6-bit component to min(v + 2k, 63) and leaves table 0 unchanged', () => {
    const e = (v: number): number => (v << 2) | (v >> 4);
    for (let component = 0; component < 256; component++) expect(flashedComponent(component, 0)).toBe(component);
    expect(flashedComponent(e(10), 3)).toBe(e(16));
    expect(flashedComponent(e(0), 1)).toBe(e(2));
    expect(flashedComponent(e(60), 2)).toBe(e(63));
    expect(flashedComponent(e(63), 31)).toBe(255);
  });

  it('moves the picture by whole device pixels at the layout scale', () => {
    expect(deviceShift(3, 1)).toBe(3);
    expect(deviceShift(3, 1.5)).toBe(5);
    expect(deviceShift(7, 2)).toBe(14);
    expect(deviceShift(0, 1.25)).toBe(0);
  });

  it('draws the image with the flash state of each frame, from one triangle in the run cache', () => {
    const cache = new FlightGpuCache({ ownerId: 1, runId: 1, generation: 1, identity: 'identity' }, () => ({ width: 960, height: 720 }));
    let screen = { active: null, level: 0, table: 0, offset: 0, shiftRows: 0 };
    const stage = new FlashScreenStage({ resources: cache, flash: { screen: () => screen } });
    const logicalCamera = new Camera();
    const frame = { logical: { scale: 1.5, bufferWidth: 960, bufferHeight: 720 }, logicalCamera } as unknown as CompositionFrame;
    const image = { name: 'image' } as never;
    const [first] = stage.passes(frame, image);
    expect(first.camera).toBe(logicalCamera);
    const { uniforms } = (first.scene.children[0] as Mesh<BufferGeometry, ShaderMaterial>).material;
    expect(uniforms.image.value).toBe(image);
    expect(uniforms.shift.value).toBe(0);
    expect(uniforms.add.value).toBe(0);
    screen = { active: 0, level: 37, table: 18, offset: 0x0b, shiftRows: 5 } as never;
    const [second] = stage.passes(frame, image);
    expect(second.scene).toBe(first.scene);
    expect(uniforms.shift.value).toBe(8);
    expect(uniforms.add.value).toBe(36);
    expect(cache.counts()).toMatchObject({ geometries: 1, materials: 1, vertices: FLASH_SCREEN_GPU_PLAN.vertices });
  });
});
