/**
 * Fixed synthetic camera for the P1 demo. Its aspect is the viewport's 4:3 and nothing about the
 * layout changes it; the field of view and placement are invented values that keep every possible
 * marker position and the mover's start in view. They say nothing about the original game's camera.
 */
import { PerspectiveCamera } from 'three';
import { VIEWPORT_ASPECT } from '../viewport/viewport-layout.ts';

export function createSyntheticCamera(): PerspectiveCamera {
  const camera = new PerspectiveCamera(50, VIEWPORT_ASPECT, 0.1, 100);
  camera.position.set(0, 6, 20);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  return camera;
}
