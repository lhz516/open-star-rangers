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
 * Every acquisition is handed to `run.ownCleanup` as it is made, so the run's end, a failed start's rollback included,
 * releases it, newest first; one that cannot be handed over is released here before the error is thrown. Whatever the
 * frame consumer throws faults the session as a consumer failure (P3-04), except the graphics device's own failures,
 * which the renderer turns into its `failed` state.
 */
import type { GameSessionRun } from '../../../app/session/game-session.ts';
import { RollbackError } from '../../../app/session/rollback-error.ts';
import type { SessionCleanup } from '../../../app/session/session-host.ts';
import { createDestructionCamera } from '../presentation/destruction-camera/destruction-camera.ts';
import { createPresentationEffects, type FlightPresentationEffects } from '../presentation/effects/presentation-effects.ts';
import { createFlightPresentation, presentationRandom, type FlightPresentation } from '../presentation/flight-presentation.ts';
import type { SceneCameras } from '../scene/flight-scene.ts';
import type { FlightRunBinding } from './flight-gpu-cache.ts';
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
}

export interface FlightRunWiring {
  readonly presentation: FlightPresentation;
  /** The run's presentation effects, which the presentation module steps. */
  readonly effects: FlightPresentationEffects;
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

export function wireFlightRun(run: FlightRunHandle, { renderer, binding, content, seed }: FlightRunInput): FlightRunWiring {
  const { ownerId, runId } = binding;
  if (run.runId !== runId) throw new FlightRenderError('invalid-input', 'flightRun.binding', `binds run ${runId} to run ${run.runId}`);
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
  const render = renderer.beginRun(binding, content.settings, content.plan);
  own(run, () => {
    render.release();
    return undefined;
  });
  const passes = attachFlightPasses({ content, render, presentation, effects, random, initial });
  own(run, () => {
    passes.dispose();
    return undefined;
  });
  own(run, run.onFrame((frame) => {
    // One tick at a time, the module then the passes, so the shared random source gives every consumer the same draws
    // however the ticks are grouped into frames (AC-17).
    for (const output of frame.report?.outputs ?? []) {
      presentation.advance({ ownerId, runId, outputs: [output] });
      passes.step(output, presentation.camera());
    }
    render.draw({ runId: frame.runId, render: frame.render, projection: frame.projection, cameras });
    return undefined;
  }));
  return Object.freeze({ presentation, effects, render });
}
