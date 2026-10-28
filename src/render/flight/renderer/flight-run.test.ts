import { describe, expect, it, vi } from 'vitest';
import { RollbackError } from '../../../app/session/rollback-error.ts';
import { ContentContractError } from '../../../content/contract-validation.ts';
import { RecordingSurface } from '../../scene/render-surface.test-support.ts';
import { PresentationError } from '../presentation/presentation-budget.ts';
import { FlightRenderError } from './flight-render-error.ts';
import { explosionStarted, renderEntity, renderState, tickInput, vec } from '../presentation/presentation.test-support.ts';
import type { ViewSwitchedEvent } from '../../../core/contracts/domain-events.ts';
import type { WorldView } from '../composition/flight-layers.ts';
import { createFlightRenderer } from './flight-renderer.ts';
import { wireFlightRun } from './flight-run.ts';
import { BINDING, fakeRun, preparedContent, RUN_SETTINGS } from './flight-run.test-support.ts';
import type { FrameReport, TickOutput } from '../../../app/runtime/game-runtime.ts';
import type { GameSessionFrame } from '../../../app/session/game-session.ts';
import type { DomainEvent } from '../../../core/contracts/domain-events.ts';
import type { Projection } from '../../../core/projections/projection.ts';
import { COCKPIT_GPU_PLAN } from '../../cockpit/composition/cockpit-layer.ts';
import { syntheticCockpitContent, syntheticCockpitCopy } from '../../cockpit/composition/cockpit-run.test-support.ts';
import { syntheticMapOpen } from '../../cockpit/map-picture/map-picture.test-support.ts';
import { syntheticProjection, viewSwitched, type DeepPartial } from '../../cockpit/presentation/cockpit.test-support.ts';
import { mapPictureGeometry } from '../../cockpit/map-picture/map-picture-geometry.ts';
import type { MapInputGeometry } from '../../map/map-input-geometry.ts';
import { GraphicsDeviceError } from '../../scene/render-surface.ts';
import { addGpuPlans } from './flight-gpu-cache.ts';
import type { FlightRunCockpit } from './flight-run.ts';

function setup() {
  const surface = new RecordingSurface();
  const renderer = createFlightRenderer({ ownerId: 1, surface, reportError: () => undefined });
  surface.resize();
  return { surface, renderer };
}

describe('wireFlightRun', () => {
  it('starts the run\'s presentation at tick 0, advances it by each frame\'s ticks in order, and draws every frame', () => {
    const { surface, renderer } = setup();
    const fake = fakeRun();
    const { presentation, render } = wireFlightRun(fake.run, { renderer, binding: BINDING, content: preparedContent(), seed: 7 });
    expect(presentation.camera().tick).toBe(0);
    expect(render.binding).toEqual(BINDING);
    const activations: string[] = [];
    presentation.subscribe((tick) => { activations.push(...tick.activations.map(({ key }) => `${tick.tick}:${key}`)); });
    const explosion = renderEntity(9, { explosion: 'large', position: vec(5) });
    fake.deliver([tickInput(renderState(1))]);
    fake.deliver([]);
    fake.deliver([2, 3, 4, 5, 6].map((tick) => tickInput(
      renderState(tick, { entities: tick >= 4 ? [explosion] : [] }),
      // A missile's explosion: the presentation effects wired with the module add nothing to it.
      tick === 4 ? [{ ...explosionStarted(4, 9, 'large', vec(5)), sourceKindBit: 20 }] : [],
    )));
    // A still frame advances nothing and only redraws.
    fake.deliver(null);
    expect(presentation.camera().tick).toBe(6);
    expect(activations).toEqual(['4:core:9']);
    expect(presentation.explosions().map(({ key }) => key)).toEqual(['core:9']);
    expect(surface.frames).toHaveLength(4);
    expect(renderer.diagnostics()).toMatchObject({ draws: 4, lastTick: 6, runId: 1 });
  });

  it('draws the destruction view from the presentation\'s destruction camera, in the whole screen', () => {
    const { surface, renderer } = setup();
    const fake = fakeRun();
    const { presentation, render } = wireFlightRun(fake.run, { renderer, binding: BINDING, content: preparedContent(), seed: 7 });
    const worlds: WorldView[] = [];
    render.addLayer({ slot: 'world', passes: ({ world }) => { worlds.push(world!); return []; } });
    const player = renderEntity(1, { position: vec(0, 0, 50) });
    const entry: ViewSwitchedEvent = Object.freeze({
      type: 'view-switched', tick: 1, fromViewMode: 0x0c, fromSubMode: 0, viewMode: 0x11, subMode: 8, stage: 'collision',
      player: Object.freeze({ entityId: player.id, position: player.position, orientation: player.orientation }),
    });
    fake.deliver([tickInput(renderState(1, { viewMode: 0x11, subMode: 8, observedEntityId: 1, entities: [player] }), [entry])]);
    const camera = presentation.camera();
    expect(camera).toMatchObject({ tick: 1, viewMode: 0x11, subMode: 8 });
    expect(worlds).toHaveLength(1);
    expect(worlds[0].scene.camera.position).toEqual(camera.position);
    expect(worlds[0].viewport).toEqual({ x: 0, y: 0, width: 640, height: 480 });
    // The player's model is drawn in this view.
    expect(worlds[0].scene.entities.map(({ entity: { id } }) => id)).toEqual([1]);
    expect(surface.frames).toHaveLength(1);
  });

  it('faults the frame with a batch that does not continue from the last tick', () => {
    const { renderer } = setup();
    const fake = fakeRun();
    wireFlightRun(fake.run, { renderer, binding: BINDING, content: preparedContent(), seed: 7 });
    expect(() => { fake.deliver([tickInput(renderState(2))]); }).toThrow(expect.objectContaining({ kind: 'invalid-input' }));
  });

  it('releases the frame subscription, the run\'s resources and the presentation, newest first, when the run ends', () => {
    const { renderer } = setup();
    const fake = fakeRun();
    const { presentation, render } = wireFlightRun(fake.run, { renderer, binding: BINDING, content: preparedContent(), seed: 7 });
    render.resources.material('m', () => ({ dispose: () => { fake.log.push('resources'); } }) as never);
    const dispose = presentation.dispose.bind(presentation);
    vi.spyOn(presentation, 'dispose').mockImplementation(() => { fake.log.push('presentation'); dispose(); });
    expect(fake.end()).toEqual([]);
    expect(fake.log).toEqual(['frames', 'resources', 'presentation']);
    expect(fake.listeners.size).toBe(0);
    expect(renderer.diagnostics().runId).toBeNull();
    expect(() => presentation.camera()).toThrow(PresentationError);
    expect(() => renderer.beginRun({ ...BINDING, runId: 2 }, RUN_SETTINGS)).not.toThrow();
  });

  it('acquires nothing for content or a seed the presentation refuses, or a run the binding does not name', () => {
    const { renderer } = setup();
    const fake = fakeRun();
    const prepared = preparedContent();
    const content = { ...prepared, presentation: { ...prepared.presentation, nebula: { images: [] } } };
    expect(() => wireFlightRun(fake.run, { renderer, binding: BINDING, content, seed: 7 })).toThrow(ContentContractError);
    expect(() => wireFlightRun(fake.run, { renderer, binding: BINDING, content: prepared, seed: -1 })).toThrow(PresentationError);
    expect(() => wireFlightRun(fakeRun(2).run, { renderer, binding: BINDING, content: prepared, seed: 7 })).toThrow(expect.objectContaining({ kind: 'invalid-input' }));
    expect(fake.end()).toEqual([]);
    expect(renderer.diagnostics().runId).toBeNull();
  });

  it('releases at once what a run that refuses its cleanups would have owned', () => {
    const { renderer } = setup();
    const fake = fakeRun();
    const refusal = new Error('run ended');
    fake.state.refuse = refusal;
    expect(() => wireFlightRun(fake.run, { renderer, binding: BINDING, content: preparedContent(), seed: 7 })).toThrow(refusal);
    expect(renderer.diagnostics().runId).toBeNull();
  });

  it('throws a RollbackError when a refused cleanup also fails', () => {
    const { renderer } = setup();
    const fake = fakeRun();
    let owned = 0;
    fake.run.ownCleanup = (cleanup) => {
      if (owned++ === 2) {
        // The run refuses the render release, whose resources cannot be released either.
        throw new Error('run ended');
      }
      return cleanup;
    };
    const stuck = { dispose: () => { throw new Error('stuck'); } };
    const beginRun = renderer.beginRun.bind(renderer);
    vi.spyOn(renderer, 'beginRun').mockImplementation((binding, settings, plan) => {
      const run = beginRun(binding, settings, plan);
      run.resources.material('stuck', () => stuck as never);
      return run;
    });
    expect(() => wireFlightRun(fake.run, { renderer, binding: BINDING, content: preparedContent(), seed: 7 })).toThrow(RollbackError);
  });
});

const MAP_VIEW = 0x08;

/** One tick in `viewMode`, after a view switch from `from` when it differs, with a ready projection of that tick. */
interface CockpitStep {
  readonly tick: number;
  readonly viewMode?: number;
  readonly from?: number;
}

/** The map picture's geometry shown in a 640 × 480 frame at the input zone's origin. */
function shownGeometry(): MapInputGeometry {
  return { ...mapPictureGeometry(syntheticCockpitContent().mapGeometry), frame: { left: 0, top: 0, width: 640, height: 480 } };
}

/** The cockpit of a run, with the map input's side recorded. */
function cockpitInput(overrides: Partial<FlightRunCockpit> = {}) {
  const geometry = { current: shownGeometry() as MapInputGeometry | null };
  const map = {
    geometry: { read: () => geometry.current },
    rightButton: vi.fn(() => false),
    pointer: () => null,
    revoked: vi.fn(),
  };
  const input: FlightRunCockpit = {
    content: syntheticCockpitContent(), copy: syntheticCockpitCopy(), projection: syntheticProjection(0), map, ...overrides,
  };
  return { input, map, geometry };
}

const projectionOf = (tick: number, viewMode: number): Projection => syntheticProjection(tick, { viewMode }, {
  map: { player: viewMode === MAP_VIEW ? syntheticMapOpen() : null },
} as DeepPartial<Projection>);

/** Delivers one frame of `steps` (null for a still frame) to the fake run's listeners, each tick with its own projection. */
function deliver(fake: ReturnType<typeof fakeRun>, steps: readonly CockpitStep[] | null): void {
  const outputs = steps?.map(({ tick, viewMode = 0x0c, from = viewMode }): TickOutput => {
    const events: DomainEvent[] = from === viewMode ? [] : [viewSwitched(tick, from, viewMode)];
    const render = renderState(tick, { viewMode });
    return Object.freeze({ ...tickInput(render, events), projection: projectionOf(tick, viewMode) }) as TickOutput;
  }) ?? [];
  const last = outputs.at(-1);
  if (last) {
    fake.state.previous = fake.state.current;
    fake.state.current = last.render;
    fake.state.projection = last.projection;
  }
  const report = steps && ({ outputs } as unknown as FrameReport);
  const frame = {
    runId: fake.run.runId, phase: 'running', render: { previous: fake.state.previous, current: fake.state.current, alpha: 0 }, projection: fake.state.projection, report,
  } as unknown as GameSessionFrame;
  for (const listener of [...fake.listeners]) listener(frame);
}

const ticks = (first: number, last: number, viewMode = 0x0c, from = viewMode): CockpitStep[] =>
  Array.from({ length: last - first + 1 }, (_, at) => ({ tick: first + at, viewMode, from: at === 0 ? from : viewMode }));

describe('wireFlightRun with the cockpit (P3-13/24)', () => {
  it('advances the cockpit by each frame\'s ticks after P3-12\'s module, then draws one picture with the cockpit layer under the one flash', () => {
    const { surface, renderer } = setup();
    const fake = fakeRun();
    const { input, map } = cockpitInput();
    const { presentation, cockpit } = wireFlightRun(fake.run, { renderer, binding: BINDING, content: preparedContent(), seed: 7, cockpit: input });
    expect(cockpit!.run.presentation.schedule().tick).toBe(0);
    deliver(fake, ticks(1, 3));
    expect(presentation.camera().tick).toBe(3);
    expect(cockpit!.run.presentation.schedule().tick).toBe(3);
    expect(map.rightButton).toHaveBeenCalledOnce();
    // A frame without ticks only redraws: no advance and no right-button read.
    deliver(fake, []);
    deliver(fake, null);
    expect(cockpit!.run.presentation.schedule().tick).toBe(3);
    expect(map.rightButton).toHaveBeenCalledOnce();
    expect(surface.frames).toHaveLength(3);
    const passes = surface.frames[0];
    const names = passes.map(({ objects }) => objects[0]?.name);
    const at = names.indexOf('cockpit-layer');
    // After every world and 2-D layer of P3-12, into the game image, before the canvas clear and the flash.
    expect(at).toBe(names.lastIndexOf('cockpit-layer'));
    expect(passes[at].target).toBe(passes[0].target);
    expect(passes.slice(at + 1).map(({ objects }) => objects[0]?.name).filter(Boolean)).toEqual(['flight-screen-flash']);
    // Neither clears nor tests nor writes the world's depth.
    expect(passes[at]).toMatchObject({ clearColor: false, clearDepth: false, scissor: null });
    expect(passes[at].objects[0].material).toMatchObject({ depthTest: false, depthWrite: false });
    expect(passes[at].objects[0].geometry.getAttribute('position')).toBeUndefined();
  });

  it('adds the cockpit\'s GPU plan to the run\'s, with no render target, and acquires its resources from the run\'s cache', () => {
    const { surface, renderer } = setup();
    const beginRun = vi.spyOn(renderer, 'beginRun');
    const content = preparedContent();
    const fake = fakeRun();
    const { render } = wireFlightRun(fake.run, { renderer, binding: BINDING, content, seed: 7, cockpit: cockpitInput().input });
    expect(beginRun.mock.calls[0][2]).toEqual(addGpuPlans(content.plan, COCKPIT_GPU_PLAN));
    expect(COCKPIT_GPU_PLAN).toEqual({ texels: 640 * 480, vertices: 0, indices: 0, renderTargets: 0 });
    const without = fakeRun(2);
    fake.end();
    const plain = wireFlightRun(without.run, { renderer, binding: { ...BINDING, runId: 2 }, content, seed: 7 });
    surface.resize();
    deliver(without, ticks(1, 1));
    const plainCounts = plain.render.resources.counts();
    without.end();
    const again = fakeRun(3);
    const wired = wireFlightRun(again.run, { renderer, binding: { ...BINDING, runId: 3 }, content, seed: 7, cockpit: cockpitInput().input });
    deliver(again, ticks(1, 1));
    expect(wired.render.resources.counts()).toEqual({
      ...plainCounts, textures: plainCounts.textures + 1, materials: plainCounts.materials + 1, geometries: plainCounts.geometries + 1, texels: plainCounts.texels + 640 * 480,
    });
    expect(render.resources.released).toBe(true);
  });

  it('gives the same cockpit pictures and P3-12 state however the ticks are grouped into frames', () => {
    const pictures = (groups: readonly number[]) => {
      const { renderer } = setup();
      const fake = fakeRun();
      const { presentation, cockpit } = wireFlightRun(fake.run, { renderer, binding: BINDING, content: preparedContent(), seed: 7, cockpit: cockpitInput().input });
      const steps = [...ticks(1, 3), ...ticks(4, 6, MAP_VIEW, 0x0c), ...ticks(7, 9, 0x0c, MAP_VIEW)];
      let at = 0;
      for (const size of groups) {
        deliver(fake, steps.slice(at, at + size));
        at += size;
      }
      const { back, screen } = cockpit!.run.presentation.surfaces();
      return { camera: presentation.camera(), back: [...back.indices], screen: [...screen.indices], diagnostics: cockpit!.run.diagnostics() };
    };
    const expected = pictures([1, 1, 1, 1, 1, 1, 1, 1, 1]);
    expect(expected.diagnostics.tick).toBe(9);
    expect(pictures([5, 0, 4])).toEqual(expected);
    expect(pictures([2, 3, 4])).toEqual(expected);
  });

  it('grants the map\'s ready credential only after a frame that drew the map was submitted, and revokes it when one is not', () => {
    const { surface, renderer } = setup();
    const fake = fakeRun();
    const { input, map, geometry } = cockpitInput();
    const { cockpit } = wireFlightRun(fake.run, { renderer, binding: BINDING, content: preparedContent(), seed: 7, cockpit: input });
    const { cursor } = cockpit!.mapPort;
    deliver(fake, ticks(1, 1));
    expect(cursor.draw()).toBe(false);
    // The first map picture is drawn whatever the input's state, then the input may become ready.
    deliver(fake, ticks(2, 2, MAP_VIEW, 0x0c));
    expect(cockpit!.run.mapPicture.drawn()).toMatchObject({ opening: 1, tick: 2 });
    expect(cursor.draw()).toBe(true);
    // A geometry the picture does not show withholds it; the same again restores it.
    geometry.current = null;
    expect(cursor.draw()).toBe(false);
    geometry.current = shownGeometry();
    expect(cursor.draw()).toBe(true);
    // A context loss revokes it at once, and the frames while lost submit nothing.
    surface.events!.contextLost();
    expect(map.revoked).toHaveBeenCalledOnce();
    expect(cursor.draw()).toBe(false);
    deliver(fake, ticks(3, 3, MAP_VIEW));
    expect(cursor.draw()).toBe(false);
    surface.events!.contextRestored();
    deliver(fake, ticks(4, 4, MAP_VIEW));
    expect(cursor.draw()).toBe(true);
    // Leaving the map submits a picture without it.
    deliver(fake, ticks(5, 5, 0x0c, MAP_VIEW));
    expect(cursor.draw()).toBe(false);
    expect(map.revoked).toHaveBeenCalledOnce();
  });

  it('never grants the credential without a layout or a device, and revokes it on a device failure or a failed draw', () => {
    const { surface, renderer } = setup();
    const fake = fakeRun();
    const { input, map } = cockpitInput();
    const { cockpit } = wireFlightRun(fake.run, { renderer, binding: BINDING, content: preparedContent(), seed: 7, cockpit: input });
    deliver(fake, ticks(1, 1, MAP_VIEW, 0x0c));
    expect(cockpit!.mapPort.cursor.draw()).toBe(true);
    surface.drawFailure = new GraphicsDeviceError('lost', { cause: new Error('device') });
    deliver(fake, ticks(2, 2, MAP_VIEW));
    expect(renderer.getSnapshot().state).toBe('failed');
    expect(cockpit!.mapPort.cursor.draw()).toBe(false);
    expect(map.revoked).toHaveBeenCalled();
    // The cockpit keeps advancing without a picture.
    deliver(fake, ticks(3, 3, MAP_VIEW));
    expect(cockpit!.run.presentation.schedule().tick).toBe(3);

    const unlaid = createFlightRenderer({ ownerId: 1, surface: new RecordingSurface(), reportError: () => undefined });
    const other = fakeRun();
    const second = cockpitInput();
    const wired = wireFlightRun(other.run, { renderer: unlaid, binding: BINDING, content: preparedContent(), seed: 7, cockpit: second.input });
    deliver(other, ticks(1, 1, MAP_VIEW, 0x0c));
    expect(wired.cockpit!.run.mapPicture.drawn()).not.toBeNull();
    expect(wired.cockpit!.mapPort.cursor.draw()).toBe(false);

    const failing = setup();
    const third = fakeRun();
    const { input: thirdInput, map: thirdMap } = cockpitInput();
    const drawn = wireFlightRun(third.run, { renderer: failing.renderer, binding: BINDING, content: preparedContent(), seed: 7, cockpit: thirdInput });
    deliver(third, ticks(1, 1, MAP_VIEW, 0x0c));
    failing.surface.drawFailure = new Error('not the device');
    expect(() => { deliver(third, ticks(2, 2, MAP_VIEW)); }).toThrow('not the device');
    expect(thirdMap.revoked).toHaveBeenCalledOnce();
    expect(drawn.cockpit!.mapPort.cursor.draw()).toBe(false);
  });

  it('refuses, before any GPU allocation, content of another package, content a module refuses and an unready projection', () => {
    const { renderer } = setup();
    const beginRun = vi.spyOn(renderer, 'beginRun');
    const content = preparedContent();
    const attempt = (cockpit: FlightRunCockpit) => {
      const fake = fakeRun();
      expect(() => wireFlightRun(fake.run, { renderer, binding: BINDING, content, seed: 7, cockpit })).toThrow();
      expect(fake.end()).toEqual([]);
    };
    attempt(cockpitInput({ content: syntheticCockpitContent({ generation: 2, identity: 'identity' }) }).input);
    attempt(cockpitInput({ content: syntheticCockpitContent({ generation: 1, identity: 'other' }) }).input);
    attempt(cockpitInput({ copy: { ...syntheticCockpitCopy(), costUnavailable: '' } }).input);
    attempt(cockpitInput({ projection: syntheticProjection(0, {}, { communications: { readiness: 'not-implemented' } } as DeepPartial<Projection>) }).input);
    expect(beginRun).not.toHaveBeenCalled();
    expect(renderer.diagnostics().runId).toBeNull();
  });

  it('releases everything the run acquired when the cockpit layer\'s allocation fails, and the next run starts', () => {
    const { renderer } = setup();
    const fake = fakeRun();
    const beginRun = renderer.beginRun.bind(renderer);
    vi.spyOn(renderer, 'beginRun').mockImplementationOnce((binding, settings, plan) => {
      const run = beginRun(binding, settings, plan);
      const texture = run.resources.texture.bind(run.resources);
      vi.spyOn(run.resources, 'texture').mockImplementation((key, size, create) => {
        if (key.startsWith('cockpitLayer')) throw new FlightRenderError('render-capacity', key, 'test');
        return texture(key, size, create);
      });
      return run;
    });
    expect(() => wireFlightRun(fake.run, { renderer, binding: BINDING, content: preparedContent(), seed: 7, cockpit: cockpitInput().input }))
      .toThrow(expect.objectContaining({ kind: 'render-capacity' }));
    expect(fake.end()).toEqual([]);
    expect(renderer.diagnostics()).toMatchObject({ runId: null, resources: null });
    const next = fakeRun(2);
    expect(() => wireFlightRun(next.run, { renderer, binding: { ...BINDING, runId: 2 }, content: preparedContent(), seed: 7, cockpit: cockpitInput().input })).not.toThrow();
  });

  it('disposes the cockpit, its layer and its map port with the run, so a late result of the old run grants nothing', () => {
    const { surface, renderer } = setup();
    const fake = fakeRun();
    const { cockpit, render } = wireFlightRun(fake.run, { renderer, binding: BINDING, content: preparedContent(), seed: 7, cockpit: cockpitInput().input });
    deliver(fake, ticks(1, 1, MAP_VIEW, 0x0c));
    const drawn = cockpit!.run.mapPicture.drawn();
    expect(fake.end()).toEqual([]);
    expect(cockpit!.run.presentation.status()).toBe('disposed');
    expect(render.resources.released).toBe(true);
    cockpit!.mapPort.submitted(drawn);
    expect(cockpit!.mapPort.cursor.draw()).toBe(false);
    // The next run has its own cockpit and port, and the old run's frames reach nothing.
    const next = fakeRun(2);
    const wired = wireFlightRun(next.run, { renderer, binding: { ...BINDING, runId: 2 }, content: preparedContent(), seed: 7, cockpit: cockpitInput().input });
    deliver(fake, ticks(2, 2, MAP_VIEW));
    expect(wired.cockpit!.mapPort).not.toBe(cockpit!.mapPort);
    expect(wired.cockpit!.run.presentation.schedule().tick).toBe(0);
    expect(wired.cockpit!.mapPort.cursor.draw()).toBe(false);
    expect(surface.frames).toHaveLength(1);
  });
});
