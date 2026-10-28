/**
 * Wires one run to the flight presentation module and the flight renderer (docs/plan/p3/12/spec.md: 渲染器生命周期;
 * docs/plan/p3/04/spec.md: 帧后逐 tick 输出（P3-12 的修订）, 消费者接线与释放). Called while the run is held at tick 0,
 * before its first frame: the run's presentation random source is created from its own seed, the presentation module
 * starts from the tick-0 Render State with it, the presentation effects (P3-12/13) and the destruction camera
 * (P3-12/14), the renderer binds the run with the package's scene settings and the passes' whole GPU plan, and the
 * passes join the run's composition (flight-passes.ts), drawing from the same random source. The run's frame consumer
 * takes each frame's per-tick outputs in order, advancing the module by one tick and then stepping the passes by it, so
 * every draw from the shared source goes to the same consumer however the ticks are grouped into frames; then it draws
 * with the cameras after the steps of the previous and the current tick. A frame without a tick, a still frame whose
 * report is null included, advances nothing and only redraws. A batch is checked one tick at a time: a tick that does
 * not continue the run faults the consumer after the ticks before it were processed.
 *
 * The cockpit (docs/plan/p3/13/spec.md, 接线与生命周期, 地图输入几何与指针; D-01 定稿 DC-03/DC-04/DC-09; D-02 定稿
 * DD-05), when given: its presentation and every module are created from the tick-0 state, the P3-12 camera and the
 * same seed before the renderer binds the run, so content, copy or a binding of another package refuses the start before
 * any GPU allocation; its layer (cockpit-layer.ts) joins the composition's cockpit slot and its GPU plan the run's plan
 * `beginRun` checks. Each frame, after P3-12's module and passes stepped through all of the frame's ticks, the cockpit
 * advances by the same ticks in order, each with its own output and camera and the map's right-button level read once
 * for the batch, and then the frame is drawn once. No cue model is shared with P3-14's sounds. The run's map
 * presentation port (map-presentation-port.ts) gets the map picture's `drawn()` after every frame the renderer actually
 * submitted and is revoked by a frame it did not submit or that failed and by the renderer leaving `ready` (context
 * lost, failed), so the map input becomes ready only after a picture was shown and never waits for it the other way
 * round: the first map picture is drawn whatever the input's state.
 *
 * Every acquisition is handed to `run.ownCleanup` as it is made, so the run's end, a failed start's rollback included,
 * releases it, newest first; one that cannot be handed over is released here before the error is thrown. Whatever the
 * frame consumer throws faults the session as a consumer failure (P3-04), except the graphics device's own failures,
 * which the renderer turns into its `failed` state.
 */
import type { GameSessionRun } from '../../../app/session/game-session.ts';
import { RollbackError } from '../../../app/session/rollback-error.ts';
import type { SessionCleanup } from '../../../app/session/session-host.ts';
import type { Projection } from '../../../core/projections/projection.ts';
import type { RenderState } from '../../../core/projections/render-state.ts';
import { createCockpitLayer, COCKPIT_GPU_PLAN, type CockpitLayer } from '../../cockpit/composition/cockpit-layer.ts';
import { createCockpitRun, type CockpitContent, type CockpitCopy, type CockpitRun } from '../../cockpit/composition/cockpit-run.ts';
import type { CockpitTick } from '../../cockpit/presentation/cockpit-contract.ts';
import type { MapInputGeometryPort, MapPosition } from '../../map/map-input-geometry.ts';
import { createMapPresentationPort, type MapPresentationPort } from '../../map/map-presentation-port.ts';
import { createDestructionCamera } from '../presentation/destruction-camera/destruction-camera.ts';
import { createPresentationEffects, type FlightPresentationEffects } from '../presentation/effects/presentation-effects.ts';
import { createFlightPresentation, presentationRandom, type FlightPresentation } from '../presentation/flight-presentation.ts';
import type { PresentationCamera } from '../presentation/presentation-contract.ts';
import { backPlane } from '../scene/projection.ts';
import type { SceneCameras } from '../scene/flight-scene.ts';
import { addGpuPlans, type FlightRunBinding } from './flight-gpu-cache.ts';
import { attachFlightPasses, type PreparedFlightContent } from './flight-passes.ts';
import { FlightRenderError } from './flight-render-error.ts';
import type { FlightRenderer, FlightRunRender } from './flight-renderer.ts';

/** What the wiring uses of the session's run handle. */
export type FlightRunHandle = Pick<GameSessionRun, 'runId' | 'renderFrame' | 'onFrame' | 'ownCleanup'>;

export interface FlightRunInput {
  readonly renderer: FlightRenderer;
  readonly binding: FlightRunBinding;
  /** Decoded from the package the run was created from and prepared (`prepareFlightContent`). */
  readonly content: PreparedFlightContent;
  /** The presentation random source's uint32 seed, drawn from the host for this run; never the world's. */
  readonly seed: number;
  /** The cockpit, HUD and map; P3-12's isolated entries, which draw no cockpit, leave it out. */
  readonly cockpit?: FlightRunCockpit;
}

/** What the cockpit of a run is drawn from and how the map input reaches it. */
export interface FlightRunCockpit {
  /** The package's checked HUD content (the app's `cockpitContentOf`), of the run's generation and content identity. */
  readonly content: CockpitContent;
  readonly copy: CockpitCopy;
  /** The run's tick-0 projection (`GameSessionRun.projection()` while held at tick 0). */
  readonly projection: Projection;
  readonly map: FlightRunMap;
}

/** The map input's side of the run's map presentation (P3-05, P3-13 DC-09). */
export interface FlightRunMap {
  /** The production geometry port (`createZoneGeometryPort`) the input reads. */
  readonly geometry: MapInputGeometryPort;
  /** The main map's right-button level (`GameInputConsumer.mapRightButton.read`), read once per batch of ticks. */
  readonly rightButton: () => boolean;
  /** The local map pointer (`GameInputConsumer.mapCursor.read`), read at each map draw. */
  readonly pointer: () => MapPosition | null;
  /** Called when a revocation ended a credential (`GameInputConsumer.syncMap`). */
  readonly revoked: () => void;
}

export interface FlightRunWiring {
  readonly presentation: FlightPresentation;
  /** The run's presentation effects, which the presentation module steps. */
  readonly effects: FlightPresentationEffects;
  readonly render: FlightRunRender;
  /** Null without `FlightRunInput.cockpit`. */
  readonly cockpit: FlightRunCockpitWiring | null;
}

export interface FlightRunCockpitWiring {
  readonly run: CockpitRun;
  readonly layer: CockpitLayer;
  /** `cursor` is the map input's production cursor (`MapInputOptions.cursor`) for this run. */
  readonly mapPort: MapPresentationPort;
}

/** Hands `cleanup` to the run; releases it at once, then throws, when the run refuses it. */
function own(run: FlightRunHandle, cleanup: SessionCleanup): void {
  try {
    run.ownCleanup(cleanup);
  } catch (cause) {
    try {
      cleanup();
    } catch (failure) {
      throw new RollbackError(cause, [failure], 'Flight run registration and rollback failed');
    }
    throw cause;
  }
}

export function wireFlightRun(run: FlightRunHandle, { renderer, binding, content, seed, cockpit: cockpitInput }: FlightRunInput): FlightRunWiring {
  const { ownerId, runId } = binding;
  if (run.runId !== runId) throw new FlightRenderError('invalid-input', 'flightRun.binding', `binds run ${runId} to run ${run.runId}`);
  if (cockpitInput && (cockpitInput.content.binding.generation !== binding.generation || cockpitInput.content.binding.identity !== binding.identity)) {
    throw new FlightRenderError('invalid-input', 'flightRun.cockpit.content.binding', 'must be the run\'s package generation and content identity');
  }
  const initial = run.renderFrame().current;
  const random = presentationRandom(seed);
  const effects = createPresentationEffects({ content: content.presentation });
  const presentation = createFlightPresentation({
    ownerId, runId, content: content.presentation, initial, random, effects, destructionCamera: createDestructionCamera(),
  });
  own(run, () => {
    presentation.dispose();
    return undefined;
  });
  let cameras: SceneCameras = Object.freeze({ previous: null, current: presentation.camera() });
  const unsubscribe = presentation.subscribe(({ beforeStep, afterStep }) => {
    cameras = Object.freeze({ previous: beforeStep, current: afterStep });
  });
  own(run, () => {
    unsubscribe();
    return undefined;
  });
  const started = cockpitInput ? startCockpit(run, cockpitInput, { ownerId, runId, content, seed, initial, camera: presentation.camera() }) : null;
  const render = renderer.beginRun(binding, content.settings, started ? addGpuPlans(content.plan, COCKPIT_GPU_PLAN) : content.plan);
  own(run, () => {
    render.release();
    return undefined;
  });
  const passes = attachFlightPasses({ content, render, presentation, effects, random, initial });
  own(run, () => {
    passes.dispose();
    return undefined;
  });
  const cockpit = started ? attachCockpit(run, renderer, render, started) : null;
  own(run, run.onFrame((frame) => {
    const outputs = frame.report?.outputs ?? [];
    const mapRightButton = started !== null && outputs.length > 0 && started.input.map.rightButton();
    const ticks: CockpitTick[] = [];
    // One tick at a time, the module then the passes, so the shared random source gives every consumer the same draws
    // however the ticks are grouped into frames (AC-17).
    for (const output of outputs) {
      presentation.advance({ ownerId, runId, outputs: [output] });
      const camera = presentation.camera();
      passes.step(output, camera);
      ticks.push({ output, camera, mapRightButton });
    }
    // Then the cockpit by the same ticks in order (DC-04), and one picture of the frame.
    if (cockpit && ticks.length > 0) {
      cockpit.run.presentation.advance({ ownerId, runId, ticks });
      cockpit.layer.changed();
    }
    const picture = { runId: frame.runId, render: frame.render, projection: frame.projection, cameras };
    if (!cockpit) {
      render.draw(picture);
      return undefined;
    }
    // The renderer counts the frames it actually submitted; only such a frame showed the map picture.
    const draws = renderer.diagnostics().draws;
    try {
      render.draw(picture);
    } catch (error) {
      cockpit.mapPort.revoke();
      throw error;
    }
    if (renderer.diagnostics().draws > draws) cockpit.mapPort.submitted(cockpit.run.mapPicture.drawn());
    else cockpit.mapPort.revoke();
    return undefined;
  }));
  return Object.freeze({ presentation, effects, render, cockpit });
}

interface CockpitStart {
  readonly ownerId: number;
  readonly runId: number;
  readonly content: PreparedFlightContent;
  readonly seed: number;
  readonly initial: RenderState;
  readonly camera: PresentationCamera;
}

interface StartedCockpit {
  readonly input: FlightRunCockpit;
  readonly run: CockpitRun;
}

/** The run's cockpit presentation and modules, from tick 0 and before any GPU allocation. */
function startCockpit(run: FlightRunHandle, input: FlightRunCockpit, { ownerId, runId, content: flight, seed, initial, camera }: CockpitStart): StartedCockpit {
  const { deviceValues } = flight.settings;
  const cockpit = createCockpitRun({
    ownerId, runId, content: input.content, copy: input.copy, seed,
    initial: { render: initial, projection: input.projection, camera },
    models: flight.passes.models,
    backPlane: (render) => backPlane(deviceValues, render.entities),
    pointer: input.map.pointer,
  });
  own(run, () => {
    cockpit.presentation.dispose();
    return undefined;
  });
  return { input, run: cockpit };
}

/**
 * Adds the cockpit layer to the run's composition, and creates the run's map presentation port, which the renderer's
 * leaving `ready` revokes at once.
 */
function attachCockpit(run: FlightRunHandle, renderer: FlightRenderer, render: FlightRunRender, { input, run: cockpit }: StartedCockpit): FlightRunCockpitWiring {
  const layer = createCockpitLayer({ cache: render.resources, presentation: cockpit.presentation, palettes: input.content.palettes });
  const remove = render.addLayer(layer);
  own(run, () => {
    remove();
    return undefined;
  });
  const mapPort = createMapPresentationPort({ geometry: input.map.geometry, revoked: input.map.revoked });
  own(run, () => {
    mapPort.dispose();
    return undefined;
  });
  const unsubscribe = renderer.subscribe(() => {
    if (renderer.getSnapshot().state !== 'ready') mapPort.revoke();
  });
  own(run, () => {
    unsubscribe();
    return undefined;
  });
  return Object.freeze({ run: cockpit, layer, mapPort });
}
