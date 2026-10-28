import { describe, expect, it, vi } from 'vitest';
import type { FrameReport, TickOutput } from '../../../app/runtime/game-runtime.ts';
import type { GameSessionFrame } from '../../../app/session/game-session.ts';
import type { DomainEvent } from '../../../core/contracts/domain-events.ts';
import type { Projection } from '../../../core/projections/projection.ts';
import { renderState, tickInput } from '../../flight/presentation/presentation.test-support.ts';
import type { FlightGpuCache } from '../../flight/renderer/flight-gpu-cache.ts';
import { FlightRenderError } from '../../flight/renderer/flight-render-error.ts';
import { createFlightRenderer, type FlightRunRender } from '../../flight/renderer/flight-renderer.ts';
import { wireFlightRun, type FlightRunCockpit } from '../../flight/renderer/flight-run.ts';
import { BINDING, fakeRun, preparedContent } from '../../flight/renderer/flight-run.test-support.ts';
import type { MapInputGeometry } from '../../map/map-input-geometry.ts';
import { RecordingSurface } from '../../scene/render-surface.test-support.ts';
import { mapPictureGeometry } from '../map-picture/map-picture-geometry.ts';
import { syntheticMapOpen } from '../map-picture/map-picture.test-support.ts';
import { syntheticProjection, viewSwitched, type DeepPartial } from '../presentation/cockpit.test-support.ts';
import { syntheticCockpitContent, syntheticCockpitCopy } from './cockpit-run.test-support.ts';

// P3-13/29 (docs/plan/p3/13/spec.md, 接线与生命周期; AC-18): the cockpit's part of a run's lifecycle in the real run
// wiring with every real cockpit module: a failure at any of its acquisitions or registrations rolls the whole run back,
// a resource that cannot be released is reported and latched while everything else is still released, and warm runs
// hold the same resources, none once they end. The browser half is e2e/cockpit-lifecycle.spec.ts.

const FLIGHT_VIEW = 0x0c;
const MAP_VIEW = 0x08;

function setup() {
  const surface = new RecordingSurface();
  const renderer = createFlightRenderer({ ownerId: 1, surface, reportError: () => undefined });
  surface.resize();
  // Every run's GPU cache, in begin order.
  const caches: FlightGpuCache[] = [];
  const beginRun = renderer.beginRun.bind(renderer);
  const begin = vi.spyOn(renderer, 'beginRun').mockImplementation((binding, settings, plan) => {
    const run = beginRun(binding, settings, plan);
    caches.push(run.resources);
    return run;
  });
  return { surface, renderer, caches, begin, beginRun };
}

function cockpitInput(): FlightRunCockpit {
  const geometry: MapInputGeometry = { ...mapPictureGeometry(syntheticCockpitContent().mapGeometry), frame: { left: 0, top: 0, width: 640, height: 480 } };
  return {
    content: syntheticCockpitContent(), copy: syntheticCockpitCopy(), projection: syntheticProjection(0),
    map: { geometry: { read: () => geometry }, rightButton: () => false, pointer: () => null, revoked: () => undefined },
  };
}

/** One frame of ticks `first`..`last` in `viewMode` (after a switch from `from` on the first), each with its own projection. */
function deliver(fake: ReturnType<typeof fakeRun>, first: number, last: number, viewMode = FLIGHT_VIEW, from = viewMode): void {
  const outputs = Array.from({ length: last - first + 1 }, (_, at): TickOutput => {
    const tick = first + at;
    const events: DomainEvent[] = at === 0 && from !== viewMode ? [viewSwitched(tick, from, viewMode)] : [];
    const projection = syntheticProjection(tick, { viewMode }, { map: { player: viewMode === MAP_VIEW ? syntheticMapOpen() : null } } as DeepPartial<Projection>);
    return Object.freeze({ ...tickInput(renderState(tick, { viewMode }), events), projection }) as TickOutput;
  });
  const current = outputs.at(-1)!;
  const frame = {
    runId: fake.run.runId, phase: 'running', render: { previous: current.render, current: current.render, alpha: 0 }, projection: current.projection,
    report: { outputs } as unknown as FrameReport,
  } as unknown as GameSessionFrame;
  for (const listener of [...fake.listeners]) listener(frame);
}

const ZERO = { geometries: 0, materials: 0, textures: 0, renderTargets: 0, vertices: 0, indices: 0, texels: 0 };

/** A clean run's resources and the renderer's GPU objects after tick 1, on a renderer of its own. */
function cleanRun() {
  const { renderer } = setup();
  const fake = fakeRun();
  const { render } = wireFlightRun(fake.run, { renderer, binding: BINDING, content: preparedContent(), seed: 7, cockpit: cockpitInput() });
  deliver(fake, 1, 1);
  return { counts: render.resources.counts(), gpu: renderer.diagnostics().gpu };
}

/** Makes the run's cache fail the cockpit layer's acquisition `kind` before allocating it. */
function failing(kind: 'texture' | 'geometry' | 'material') {
  return (run: FlightRunRender) => {
    const acquire = run.resources[kind].bind(run.resources) as (...args: unknown[]) => unknown;
    vi.spyOn(run.resources, kind).mockImplementation(((key: string, ...rest: unknown[]) => {
      if (key.startsWith('cockpitLayer')) throw new FlightRenderError('render-capacity', key, 'test');
      return acquire(key, ...rest);
    }) as never);
  };
}

describe('the cockpit in a run\'s lifecycle', () => {
  it.each([
    ['its picture texture', failing('texture')],
    ['its geometry', failing('geometry')],
    ['its material', failing('material')],
    ['its layer\'s registration', (run: FlightRunRender) => { vi.spyOn(run, 'addLayer').mockImplementation(() => { throw new Error('no layer'); }); }],
  ])('rolls the whole run back when %s fails, and the next run starts with the same resources', (_name, fail) => {
    const { renderer, caches, begin, beginRun } = setup();
    begin.mockImplementationOnce((binding, settings, plan) => {
      const run = beginRun(binding, settings, plan);
      caches.push(run.resources);
      fail(run);
      return run;
    });
    const fake = fakeRun();
    expect(() => wireFlightRun(fake.run, { renderer, binding: BINDING, content: preparedContent(), seed: 7, cockpit: cockpitInput() })).toThrow();
    // Every cleanup the run was handed already ran, and nothing it acquired remains.
    expect(fake.end()).toEqual([]);
    expect(caches[0]).toMatchObject({ released: true });
    expect(caches[0].counts()).toEqual(ZERO);
    expect(renderer.diagnostics()).toMatchObject({ runId: null, resources: null });
    const next = fakeRun(2);
    const wired = wireFlightRun(next.run, { renderer, binding: { ...BINDING, runId: 2 }, content: preparedContent(), seed: 7, cockpit: cockpitInput() });
    deliver(next, 1, 1);
    expect(wired.cockpit!.run.presentation.schedule().tick).toBe(1);
    expect({ counts: wired.render.resources.counts(), gpu: renderer.diagnostics().gpu }, 'as a clean run holds').toEqual(cleanRun());
    expect(next.end()).toEqual([]);
  });

  // wireFlightRun's registrations, in order: P3-12's presentation and subscription (1, 2), the cockpit (3), the render
  // release and passes (4, 5), the cockpit layer's removal, the map port and the renderer subscription (6–8), frames (9).
  it.each([
    ['the cockpit\'s disposal', 3], ['its layer\'s removal', 6], ['its map port\'s disposal', 7], ['its renderer subscription', 8],
  ])('rolls the whole run back when the run refuses %s, and the next run starts', (_name, refused) => {
    const { renderer, caches, begin } = setup();
    const fake = fakeRun();
    let registrations = 0;
    const own = fake.run.ownCleanup;
    (fake.run as { ownCleanup: typeof own }).ownCleanup = (cleanup) => {
      if (++registrations === refused) throw new Error('run ended');
      return own(cleanup);
    };
    expect(() => wireFlightRun(fake.run, { renderer, binding: BINDING, content: preparedContent(), seed: 7, cockpit: cockpitInput() })).toThrow('run ended');
    // The cockpit registers before the run begins on the renderer; the layer, port and subscription after.
    expect(begin).toHaveBeenCalledTimes(refused === 3 ? 0 : 1);
    expect(fake.end()).toEqual([]);
    for (const cache of caches) expect(cache.counts()).toEqual(ZERO);
    expect(renderer.diagnostics()).toMatchObject({ runId: null, resources: null });
    expect(() => wireFlightRun(fakeRun(2).run, { renderer, binding: { ...BINDING, runId: 2 }, content: preparedContent(), seed: 7, cockpit: cockpitInput() })).not.toThrow();
  });

  it('refuses content a cockpit module cannot draw before the run begins on the renderer, so nothing is allocated', () => {
    const { renderer, begin } = setup();
    const fake = fakeRun();
    const input = cockpitInput();
    expect(() => wireFlightRun(fake.run, {
      renderer, binding: BINDING, content: preparedContent(), seed: 7, cockpit: { ...input, content: { ...input.content, interferenceFrames: [] } },
    })).toThrow();
    expect(begin).not.toHaveBeenCalled();
    expect(fake.end()).toEqual([]);
    expect(renderer.diagnostics()).toMatchObject({ runId: null, resources: null });
  });

  it('reports a cockpit resource that cannot be released, still releases everything else, and starts no run on that renderer again', () => {
    const { renderer, caches, begin, beginRun } = setup();
    begin.mockImplementationOnce((binding, settings, plan) => {
      const run = beginRun(binding, settings, plan);
      caches.push(run.resources);
      const acquire = run.resources.texture.bind(run.resources);
      vi.spyOn(run.resources, 'texture').mockImplementation((key, size, create) => acquire(key, size, () => {
        const texture = create();
        if (key.startsWith('cockpitLayer')) texture.dispose = () => { throw new Error('stuck'); };
        return texture;
      }));
      return run;
    });
    const fake = fakeRun();
    const { cockpit } = wireFlightRun(fake.run, { renderer, binding: BINDING, content: preparedContent(), seed: 7, cockpit: cockpitInput() });
    deliver(fake, 1, 2, MAP_VIEW, FLIGHT_VIEW);
    expect(cockpit!.mapPort.cursor.draw()).toBe(true);
    const errors = fake.end();
    // One failed cleanup, the run's release, whose failures name the stuck texture; the session latches it (P3-04).
    expect(errors).toHaveLength(1);
    expect(String((errors[0] as AggregateError).errors?.map(String))).toContain('stuck');
    expect(caches[0]).toMatchObject({ released: true });
    expect(caches[0].counts()).toEqual(ZERO);
    expect(cockpit!.run.presentation.status()).toBe('disposed');
    expect(cockpit!.mapPort.cursor.draw()).toBe(false);
    expect(() => wireFlightRun(fakeRun(2).run, { renderer, binding: { ...BINDING, runId: 2 }, content: preparedContent(), seed: 7, cockpit: cockpitInput() }))
      .toThrow(expect.objectContaining({ kind: 'invalid-state' }));
  });

  it('holds the same resources in warm runs of the same ticks, and none once each ends', () => {
    const { renderer } = setup();
    const counts = [1, 2, 3].map((runId) => {
      const fake = fakeRun(runId);
      const { render, cockpit } = wireFlightRun(fake.run, { renderer, binding: { ...BINDING, runId }, content: preparedContent(), seed: 7, cockpit: cockpitInput() });
      deliver(fake, 1, 3);
      deliver(fake, 4, 6, MAP_VIEW, FLIGHT_VIEW);
      deliver(fake, 7, 8, FLIGHT_VIEW, MAP_VIEW);
      const held = render.resources.counts();
      const drawn = renderer.diagnostics().gpu;
      expect(cockpit!.run.presentation.schedule().tick).toBe(8);
      expect(fake.end()).toEqual([]);
      expect(render.resources.counts()).toEqual(ZERO);
      expect(renderer.diagnostics()).toMatchObject({ runId: null, resources: null });
      return { held, drawn };
    });
    expect(counts[0].held).toMatchObject({ textures: expect.any(Number), renderTargets: 1 });
    expect(counts[0].held.texels).toBeGreaterThanOrEqual(640 * 480);
    expect(counts[1]).toEqual(counts[0]);
    expect(counts[2]).toEqual(counts[0]);
  });
});
