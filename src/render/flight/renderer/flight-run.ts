/**
 * Wires one run to the flight presentation module and the flight renderer (docs/plan/p3/12/spec.md: 渲染器生命周期;
 * docs/plan/p3/04/spec.md: 帧后逐 tick 输出（P3-12 的修订）, 消费者接线与释放). Called while the run is held at tick 0,
 * before its first frame: the run's presentation module starts from the tick-0 Render State with a presentation random
 * source of its own seed, the presentation effects (P3-12/13) and the destruction camera (P3-12/14), the renderer binds
 * the run with the package's scene settings, and the run's frame consumer advances the module by each frame's per-tick
 * outputs, in order, then draws with the cameras after the steps of the previous and the current tick. A still frame,
 * whose report is null, advances nothing and only redraws.
 *
 * Every acquisition is handed to `run.ownCleanup` as it is made, so the run's end, a failed start's rollback included,
 * releases it, newest first; one that cannot be handed over is released here before the error is thrown. Whatever the
 * frame consumer throws faults the session as a consumer failure (P3-04), except the graphics device's own failures,
 * which the renderer turns into its `failed` state.
 */
import type { GameSessionRun } from '../../../app/session/game-session.ts';
import { RollbackError } from '../../../app/session/rollback-error.ts';
import type { SessionCleanup } from '../../../app/session/session-host.ts';
import type { SceneSettings } from '../../../content/flight/flight-data-content.ts';
import { createDestructionCamera } from '../presentation/destruction-camera/destruction-camera.ts';
import { createPresentationEffects } from '../presentation/effects/presentation-effects.ts';
import type { PresentationContent } from '../presentation/explosion-selection.ts';
import { createFlightPresentation, presentationRandom, type FlightPresentation } from '../presentation/flight-presentation.ts';
import type { SceneCameras } from '../scene/flight-scene.ts';
import type { FlightGpuPlan, FlightRunBinding } from './flight-gpu-cache.ts';
import { FlightRenderError } from './flight-render-error.ts';
import type { FlightRenderer, FlightRunRender } from './flight-renderer.ts';

/** What the wiring uses of the session's run handle. */
export type FlightRunHandle = Pick<GameSessionRun, 'runId' | 'renderFrame' | 'onFrame' | 'ownCleanup'>;

export interface FlightRunInput {
  readonly renderer: FlightRenderer;
  readonly binding: FlightRunBinding;
  /** Decoded from the package the run was created from. */
  readonly content: PresentationContent;
  /** Decoded from the same package: its `data/scene-settings`. */
  readonly settings: SceneSettings;
  /** The presentation random source's uint32 seed, drawn from the host for this run; never the world's. */
  readonly seed: number;
  /** What the run's passes will allocate in all, checked before anything is; nothing by default. */
  readonly plan?: FlightGpuPlan;
}

export interface FlightRunWiring {
  readonly presentation: FlightPresentation;
  readonly render: FlightRunRender;
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

export function wireFlightRun(run: FlightRunHandle, { renderer, binding, content, settings, seed, plan }: FlightRunInput): FlightRunWiring {
  const { ownerId, runId } = binding;
  if (run.runId !== runId) throw new FlightRenderError('invalid-input', 'flightRun.binding', `binds run ${runId} to run ${run.runId}`);
  const presentation = createFlightPresentation({
    ownerId, runId, content, initial: run.renderFrame().current, random: presentationRandom(seed),
    effects: createPresentationEffects({ content }), destructionCamera: createDestructionCamera(),
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
  const render = renderer.beginRun(binding, settings, plan);
  own(run, () => {
    render.release();
    return undefined;
  });
  own(run, run.onFrame((frame) => {
    if (frame.report) presentation.advance({ ownerId, runId, outputs: frame.report.outputs });
    render.draw({ runId: frame.runId, render: frame.render, projection: frame.projection, cameras });
    return undefined;
  }));
  return Object.freeze({ presentation, render });
}
