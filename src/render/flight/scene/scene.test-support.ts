import type { RenderFrame } from '../../../app/runtime/game-runtime.ts';
import type { SceneSettings } from '../../../content/flight/flight-data-content.ts';
import { readSceneSettings } from '../../../content/flight/flight-data-readers.ts';
import { syntheticSceneSettings } from '../../../content/flight/flight-data.test-support.ts';
import type { Projection } from '../../../core/projections/projection.ts';
import type { RenderState } from '../../../core/projections/render-state.ts';
import { cameraAfterStep, INITIAL_CAMERA_POSE } from '../presentation/presentation-camera.ts';
import type { PresentationCamera } from '../presentation/presentation-contract.ts';
import type { FlightFrame } from '../renderer/flight-renderer.ts';
import type { SceneCameras } from './flight-scene.ts';

// Code-generated synthetic scene inputs for the scene, composition and renderer tests; never original data.

/** The synthetic scene settings with device values ordered as the shipped data's: +0x1C 600, +0x20 1200, +0x24 4000. */
export const SCENE_SETTINGS: SceneSettings = readSceneSettings({ ...syntheticSceneSettings(), deviceValues: { base: 600, kinds1c7c: 1200, kindsF8000: 4000 } });

/** The scene and composition read no projection field; an opaque stand-in is passed through. */
export const PROJECTION = Object.freeze({}) as unknown as Projection;

/** The presentation camera after the step of `render`'s tick: the observed entity's pose (presentation-camera.ts). */
export const cameraOf = (render: RenderState): PresentationCamera => cameraAfterStep(render, INITIAL_CAMERA_POSE, null);

export const renderFrame = (current: RenderState, previous: RenderState = current, alpha = 0): RenderFrame => Object.freeze({ previous, current, alpha });

/** Cameras for `frame`: the previous tick's only when the two states are consecutive ticks. */
export function camerasOf({ previous, current }: RenderFrame): SceneCameras {
  return Object.freeze({ previous: previous.tick + 1 === current.tick ? cameraOf(previous) : null, current: cameraOf(current) });
}

export function flightFrame(render: RenderFrame, runId = 1, cameras: SceneCameras = camerasOf(render)): FlightFrame {
  return Object.freeze({ runId, render, projection: PROJECTION, cameras });
}
