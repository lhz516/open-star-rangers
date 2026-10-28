import { describe, expect, it } from 'vitest';
import type { CockpitTick } from '../presentation/cockpit-contract.ts';
import {
  cockpitBatch, cockpitTicks, FLIGHT_VIEW, MAP_VIEW, syntheticInitial, syntheticProjection, TEST_SEED, viewSwitched, WARP_VIEW, type TickOptions,
} from '../presentation/cockpit.test-support.ts';
import { syntheticPlayer } from '../left-display/left-display.test-support.ts';
import { syntheticMapOpen } from '../map-picture/map-picture.test-support.ts';
import { subsystems } from '../target-display/target-display.test-support.ts';
import { createCockpitRun, type CockpitRun } from './cockpit-run.ts';
import { syntheticCockpitContent, syntheticCockpitCopy, syntheticModels } from './cockpit-run.test-support.ts';

// P3-13/24 (docs/plan/p3/13/spec.md, 接线与生命周期; DC-04, DC-07, DC-08): the run's cockpit with every real module on
// synthetic content.

const run = (seed = TEST_SEED): CockpitRun => createCockpitRun({
  ownerId: 1, runId: 1, content: syntheticCockpitContent(), copy: syntheticCockpitCopy(), initial: syntheticInitial(), seed,
  models: syntheticModels(), backPlane: () => 900, pointer: () => null,
});

/** 15 ticks with a player through F1, Warp, F1, the map and F1 again, with view switches on their ticks. */
function journey(): CockpitTick[] {
  const view = (tick: number): number => (tick < 4 ? FLIGHT_VIEW : tick < 7 ? WARP_VIEW : tick < 10 ? FLIGHT_VIEW : tick < 13 ? MAP_VIEW : FLIGHT_VIEW);
  return cockpitTicks(1, 15, (tick): TickOptions => {
    const viewMode = view(tick);
    const previous = view(tick - 1);
    // Damaged subsystems draw from the cockpit stream: the radar's noise (12), the F1 overlay's gate (9), a gauge (17).
    const player = syntheticPlayer({ subsystems: subsystems({ 9: 1, 12: 1, 17: 1 }) });
    return {
      viewMode,
      events: viewMode === previous ? [] : [viewSwitched(tick, previous, viewMode)],
      patch: {
        player: { entityId: 1 },
        flight: { combat: { player } },
        map: { player: viewMode === MAP_VIEW ? syntheticMapOpen() : null },
      } as TickOptions['patch'],
    };
  });
}

function advance(cockpit: CockpitRun, ticks: readonly CockpitTick[], groups: readonly number[]): void {
  let at = 0;
  for (const size of groups) {
    cockpit.presentation.advance(cockpitBatch(ticks.slice(at, at + size)));
    at += size;
  }
}

const picture = (cockpit: CockpitRun) => {
  const { back, screen } = cockpit.presentation.surfaces();
  return { back: [...back.indices], coverage: [...back.coverage!], screen: [...screen.indices], diagnostics: cockpit.diagnostics() };
};

describe('cockpit run', () => {
  it('registers the real modules, every type of every slot handled, and starts at tick 0 with nothing drawn', () => {
    const cockpit = run();
    expect(cockpit.presentation.schedule()).toMatchObject({ tick: 0, randomDraws: 0 });
    expect(cockpit.diagnostics()).toMatchObject({ tick: 0, viewMode: FLIGHT_VIEW, leftPage: 0, messages: 0, messageDrops: 0, radarNoiseDropped: 0 });
    expect(cockpit.mapPicture.drawn()).toBeNull();
    expect(cockpit.mapGeometry.mainMap).toEqual({ left: 13, top: 37, right: 314, bottom: 338 });
    expect(cockpit.presentation.surfaces().screen.indices.every((index) => index === 0)).toBe(true);
  });

  it('gives the same state, surfaces and draws however the ticks are grouped into frames, and nothing for an empty batch', () => {
    const ticks = journey();
    const one = run();
    advance(one, ticks, Array.from({ length: 15 }, () => 1));
    const grouped = run();
    advance(grouped, ticks, [2, 0, 3, 0, 5, 4, 1]);
    const fives = run();
    advance(fives, ticks, [5, 5, 5]);
    const expected = picture(one);
    expect(expected.diagnostics.tick).toBe(15);
    expect(expected.diagnostics.randomDraws).toBeGreaterThan(0);
    expect(expected.screen.some((index) => index !== 0)).toBe(true);
    expect(picture(grouped)).toEqual(expected);
    expect(picture(fives)).toEqual(expected);
    fives.presentation.advance(cockpitBatch([]));
    expect(picture(fives)).toEqual(expected);
  });

  it('shows the map picture drawn in view 8 as its ready credential, and none outside it', () => {
    const cockpit = run();
    const ticks = journey();
    advance(cockpit, ticks, [5, 5]);
    expect(cockpit.mapPicture.drawn()).toMatchObject({ opening: 1, tick: 10, pointerSource: 'confirmed' });
    advance(cockpit, ticks.slice(10), [3, 2]);
    expect(cockpit.mapPicture.drawn()).toBeNull();
  });

  it('refuses a batch of another run before any change', () => {
    const cockpit = run();
    const before = picture(cockpit);
    expect(() => { cockpit.presentation.advance(cockpitBatch(journey().slice(0, 1), 1, 2)); }).toThrow(expect.objectContaining({ kind: 'invalid-input' }));
    expect(picture(cockpit)).toEqual(before);
    expect(cockpit.presentation.status()).toBe('ready');
  });

  it('refuses content a module cannot draw while it is created', () => {
    const content = syntheticCockpitContent();
    expect(() => createCockpitRun({
      ownerId: 1, runId: 1, content: { ...content, interferenceFrames: [] }, copy: syntheticCockpitCopy(), initial: syntheticInitial(), seed: 1,
      models: syntheticModels(), backPlane: () => 900, pointer: () => null,
    })).toThrow();
    expect(() => createCockpitRun({
      ownerId: 1, runId: 1, content, copy: { ...syntheticCockpitCopy(), costUnavailable: 'TOO LONG' }, initial: syntheticInitial(), seed: 1,
      models: syntheticModels(), backPlane: () => 900, pointer: () => null,
    })).toThrow(expect.objectContaining({ kind: 'invalid-input' }));
    expect(() => createCockpitRun({
      ownerId: 1, runId: 1, content, copy: syntheticCockpitCopy(), seed: 1, models: syntheticModels(), backPlane: () => 900, pointer: () => null,
      initial: { ...syntheticInitial(), projection: syntheticProjection(0, {}, { map: { readiness: 'not-implemented' } } as never) },
    })).toThrow(expect.objectContaining({ kind: 'invalid-input' }));
  });

  it('disposes every module with the presentation, after which nothing is drawn or queried', () => {
    const cockpit = run();
    advance(cockpit, journey(), [5, 5]);
    cockpit.presentation.dispose();
    cockpit.presentation.dispose();
    expect(cockpit.presentation.status()).toBe('disposed');
    expect(cockpit.mapPicture.drawn()).toBeNull();
    expect(() => cockpit.messageLine.snapshot()).toThrow();
  });
});
