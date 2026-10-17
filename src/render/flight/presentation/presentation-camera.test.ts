import { describe, expect, it } from 'vitest';
import { PresentationError } from './presentation-budget.ts';
import { cameraAfterStep, INITIAL_CAMERA_POSE, presentationViewport } from './presentation-camera.ts';
import { renderEntity, renderState, vec } from './presentation.test-support.ts';
import type { Matrix3 } from '../../../core/world/entity-table.ts';

const ROWS = Object.freeze([0, 0, 1, 0, 1, 0, -1, 0, 0]) as unknown as Matrix3;
const PREVIOUS = Object.freeze({ position: vec(7, 8, 9), rows: ROWS });

describe('presentation viewport', () => {
  it('gives the flight views the 640 × 316 rectangle and the full-screen views 640 × 480, in logical pixels', () => {
    for (const viewMode of [0x0c, 1, 6]) expect(presentationViewport(viewMode, 3)).toEqual({ left: 0, top: 0, right: 639, bottom: 315 });
    for (const [viewMode, subMode] of [[8, 0], [0x13, 2], [0x11, 8]]) {
      expect(presentationViewport(viewMode, subMode)).toEqual({ left: 0, top: 0, right: 639, bottom: 479 });
    }
  });

  it('rejects views without a camera', () => {
    for (const [viewMode, subMode] of [[0x11, 0], [0x11, 7], [0, 0], [2, 0], [0x0d, 0]]) {
      expect(() => presentationViewport(viewMode, subMode)).toThrow(expect.objectContaining({ kind: 'unsupported-view' }));
    }
  });
});

describe('camera after the step', () => {
  const player = renderEntity(4, { position: vec(1, 2, 3), orientation: ROWS });

  it('takes the observed entity pose in the flight, Warp, base, map and 0x13 views', () => {
    for (const viewMode of [0x0c, 1, 6, 8, 0x13]) {
      const camera = cameraAfterStep(renderState(5, { viewMode, observedEntityId: 4, entities: [renderEntity(2), player] }), INITIAL_CAMERA_POSE, null);
      expect(camera).toEqual({ tick: 5, position: vec(1, 2, 3), rows: ROWS, viewMode, subMode: 0, viewport: presentationViewport(viewMode, 0) });
      expect(Object.isFrozen(camera)).toBe(true);
    }
  });

  it('keeps the previous pose without an observed entity, with this tick and view', () => {
    for (const render of [renderState(6, { viewMode: 8 }), renderState(6, { viewMode: 8, observedEntityId: 4, entities: [renderEntity(2)] })]) {
      expect(cameraAfterStep(render, PREVIOUS, null)).toEqual({ tick: 6, ...PREVIOUS, viewMode: 8, subMode: 0, viewport: presentationViewport(8, 0) });
    }
  });

  it('takes the destruction camera in view 0x11, sub-mode 8, even with an observed entity', () => {
    const pose = { position: vec(-5), rows: Object.freeze([0, 0, 0, 0, 0, 0, 0, 0, 1]) as unknown as Matrix3 };
    const render = renderState(9, { viewMode: 0x11, subMode: 8, observedEntityId: 4, entities: [player] });
    expect(cameraAfterStep(render, PREVIOUS, pose)).toMatchObject({ tick: 9, ...pose, viewMode: 0x11, subMode: 8 });
    expect(() => cameraAfterStep(render, PREVIOUS, null)).toThrow(PresentationError);
    // Outside that view a destruction pose is ignored.
    expect(cameraAfterStep(renderState(9, { observedEntityId: 4, entities: [player] }), PREVIOUS, pose).position).toEqual(vec(1, 2, 3));
  });

  it('starts at the origin with the identity rows', () => {
    expect(INITIAL_CAMERA_POSE).toEqual({ position: vec(0), rows: [1, 0, 0, 0, 1, 0, 0, 0, 1] });
  });
});
