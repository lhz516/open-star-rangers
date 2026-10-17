import { describe, expect, it, vi } from 'vitest';
import type { FrameReport } from '../../../app/runtime/game-runtime.ts';
import type { GameSessionFrame } from '../../../app/session/game-session.ts';
import { RollbackError } from '../../../app/session/rollback-error.ts';
import type { SessionCleanup } from '../../../app/session/session-host.ts';
import { ContentContractError } from '../../../content/contract-validation.ts';
import { attemptAll } from '../../scene/cleanup.ts';
import { RecordingSurface } from '../../scene/render-surface.test-support.ts';
import { PresentationError } from '../presentation/presentation-budget.ts';
import { explosionStarted, presentationContent, renderEntity, renderState, tickInput, vec } from '../presentation/presentation.test-support.ts';
import { SCENE_SETTINGS } from '../scene/scene.test-support.ts';
import type { PresentationTickInput } from '../presentation/presentation-contract.ts';
import type { ViewSwitchedEvent } from '../../../core/contracts/domain-events.ts';
import type { WorldView } from '../composition/flight-layers.ts';
import { createFlightRenderer } from './flight-renderer.ts';
import { wireFlightRun, type FlightRunHandle } from './flight-run.ts';

const BINDING = Object.freeze({ ownerId: 1, runId: 1, generation: 1, identity: 'identity' });

/** A run handle the test drives: its cleanups run newest first at `end`, and `deliver` notifies its frame listeners. */
function fakeRun(runId = 1) {
  const cleanups: SessionCleanup[] = [];
  const listeners = new Set<(frame: GameSessionFrame) => undefined>();
  const log: string[] = [];
  const state = { refuse: undefined as unknown, current: renderState(0) };
  const run: FlightRunHandle = {
    runId,
    renderFrame: () => ({ previous: state.current, current: state.current, alpha: 0 }),
    onFrame: (listener) => {
      listeners.add(listener);
      return () => { log.push('frames'); listeners.delete(listener); return undefined; };
    },
    ownCleanup: (cleanup) => {
      if (state.refuse !== undefined) throw state.refuse;
      cleanups.push(cleanup);
      return cleanup;
    },
  };
  const deliver = (outputs: readonly PresentationTickInput[] | null) => {
    const current = outputs?.at(-1)?.render ?? state.current;
    state.current = current;
    const report = outputs && ({ outputs } as unknown as FrameReport);
    const frame = { runId, phase: 'running', render: { previous: current, current, alpha: 0 }, projection: null, report } as unknown as GameSessionFrame;
    for (const listener of [...listeners]) listener(frame);
  };
  const end = () => attemptAll([...cleanups].reverse());
  return { run, state, log, deliver, end, listeners };
}

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
    const { presentation, render } = wireFlightRun(fake.run, { renderer, binding: BINDING, settings: SCENE_SETTINGS, content: presentationContent(), seed: 7 });
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
    const { presentation, render } = wireFlightRun(fake.run, { renderer, binding: BINDING, settings: SCENE_SETTINGS, content: presentationContent(), seed: 7 });
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
    wireFlightRun(fake.run, { renderer, binding: BINDING, settings: SCENE_SETTINGS, content: presentationContent(), seed: 7 });
    expect(() => { fake.deliver([tickInput(renderState(2))]); }).toThrow(expect.objectContaining({ kind: 'invalid-input' }));
  });

  it('releases the frame subscription, the run\'s resources and the presentation, newest first, when the run ends', () => {
    const { renderer } = setup();
    const fake = fakeRun();
    const { presentation, render } = wireFlightRun(fake.run, { renderer, binding: BINDING, settings: SCENE_SETTINGS, content: presentationContent(), seed: 7 });
    render.resources.material('m', () => ({ dispose: () => { fake.log.push('resources'); } }) as never);
    const dispose = presentation.dispose.bind(presentation);
    vi.spyOn(presentation, 'dispose').mockImplementation(() => { fake.log.push('presentation'); dispose(); });
    expect(fake.end()).toEqual([]);
    expect(fake.log).toEqual(['frames', 'resources', 'presentation']);
    expect(fake.listeners.size).toBe(0);
    expect(renderer.diagnostics().runId).toBeNull();
    expect(() => presentation.camera()).toThrow(PresentationError);
    expect(() => renderer.beginRun({ ...BINDING, runId: 2 }, SCENE_SETTINGS)).not.toThrow();
  });

  it('acquires nothing for content or a seed the presentation refuses, or a run the binding does not name', () => {
    const { renderer } = setup();
    const fake = fakeRun();
    const empty = presentationContent();
    const content = { ...empty, nebula: { images: [] } };
    expect(() => wireFlightRun(fake.run, { renderer, binding: BINDING, settings: SCENE_SETTINGS, content, seed: 7 })).toThrow(ContentContractError);
    expect(() => wireFlightRun(fake.run, { renderer, binding: BINDING, settings: SCENE_SETTINGS, content: empty, seed: -1 })).toThrow(PresentationError);
    expect(() => wireFlightRun(fakeRun(2).run, { renderer, binding: BINDING, settings: SCENE_SETTINGS, content: empty, seed: 7 })).toThrow(expect.objectContaining({ kind: 'invalid-input' }));
    expect(fake.end()).toEqual([]);
    expect(renderer.diagnostics().runId).toBeNull();
  });

  it('releases at once what a run that refuses its cleanups would have owned', () => {
    const { renderer } = setup();
    const fake = fakeRun();
    const refusal = new Error('run ended');
    fake.state.refuse = refusal;
    expect(() => wireFlightRun(fake.run, { renderer, binding: BINDING, settings: SCENE_SETTINGS, content: presentationContent(), seed: 7 })).toThrow(refusal);
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
    expect(() => wireFlightRun(fake.run, { renderer, binding: BINDING, settings: SCENE_SETTINGS, content: presentationContent(), seed: 7 })).toThrow(RollbackError);
  });
});
