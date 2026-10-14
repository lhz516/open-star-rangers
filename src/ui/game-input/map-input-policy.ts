/**
 * Production values finalised by P3-05 checkpoint K (docs/plan/p3/05/spec.md, strategic map input, approval rules 1-2).
 * The start formula follows the confirmed map-opening behavior and the +8 map poll in
 * docs/original/formats/executable.md#map-mouse-input-p3-0503.
 */
import { mapStartPosition } from '../../render/map/map-input-geometry.ts';
import type { MapInputGeometry } from '../../render/map/map-input-geometry.ts';
import type { MapInputPolicy } from './map-input.ts';

export const MAP_INPUT_POLICY: MapInputPolicy = Object.freeze({
  start: ({ mainMap }: MapInputGeometry) => mapStartPosition(mainMap),
  repeatInterval: 8,
});
