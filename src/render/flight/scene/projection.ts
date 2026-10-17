/**
 * The world projection in logical pixels (docs/original/formats/executable.md, PV2–PV5, RS1, RS2; docs/plan/p3/12/spec.md,
 * 相机、投影与视口). Pure arithmetic, so its values can be compared with the original's formulas.
 *
 * - **Camera space:** a world point P seen from a camera at C with rows R0, R1, R2 is (R0·d, R1·d, R2·d), d = P − C:
 *   x to the right, y up, z away from the viewer (PV5).
 * - **Screen:** with the viewport's (left, top, right, bottom), ends included, width w = right − left + 1, height
 *   h = bottom − top + 1, half = ⌊max(w, h) / 2⌋, cx = left + 0.5·w and cy = top + 0.5·h (f32): sx = F(cx + 2x·half / z),
 *   sy = F(cy − 2y·half / z) (PV3). In HI views 0xC and 1 this is sx = 320 + 640·x/z, sy = 158 − 640·y/z.
 * - **View volume:** a point is inside when f ≤ z < B and −kx·z ≤ 2x < kx·z, −ky·z ≤ 2y < ky·z, kx = w / (2·half),
 *   ky = h / (2·half) (f32): the viewport rectangle itself; f = 1 is the front plane, B the back plane (PV3, PV4).
 * - **Pixels:** a vertex's row is round-half-even(sy) and a span starting at sx begins at column ⌊sx⌋ after sx is
 *   rounded to 16.16 fixed point (RS1, RS2, the baseline's rounding).
 * - **Back plane:** B = max(RENS +0x1C, +0x20 while a visual of a kind in 0x1C7C exists, +0x24 while one in 0xF8000
 *   exists), discriminator-3 fragments counting by their source kind (PV4). A visual exists from the pass that creates it
 *   until the pass that removes it: every listed entity whose display is not `released`. The run's values are checked
 *   to be ordered as the shipped data are (+0x1C < +0x20 < +0x24, +0x1C above the front plane), which makes the
 *   original's raise-and-restore counters equal to this maximum; other values are refused.
 */
import type { Vec3 } from '../../../core/contracts/domain-events.ts';
import type { RenderEntity } from '../../../core/projections/render-state.ts';
import { FRAGMENT_KIND_BIT } from '../../../core/world/entity-table.ts';
import type { SceneDeviceValues } from '../../../content/flight/flight-data-content.ts';
import type { PresentationViewport } from '../presentation/presentation-contract.ts';
import { FlightRenderError } from '../renderer/flight-render-error.ts';
import type { DrawnPose } from './drawn-pose.ts';

/** The viewport's front plane +0xF4, never changed after creation (PV1). */
export const FRONT_PLANE = 1;

const CLASS_1_KINDS = 0x1c7c;
const CLASS_2_KINDS = 0xf8000;

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

/** The viewport's size, projection scale and centre (PV3). */
export interface ViewportProjection {
  readonly width: number;
  readonly height: number;
  readonly half: number;
  readonly cx: number;
  readonly cy: number;
}

export function viewportProjection({ left, top, right, bottom }: PresentationViewport): ViewportProjection {
  const width = right - left + 1;
  const height = bottom - top + 1;
  return Object.freeze({
    width, height, half: Math.floor(Math.max(width, height) / 2), cx: Math.fround(left + 0.5 * width), cy: Math.fround(top + 0.5 * height),
  });
}

export function cameraSpace({ position, rows: r }: DrawnPose, point: Vec3): Vec3 {
  const dx = point.x - position.x;
  const dy = point.y - position.y;
  const dz = point.z - position.z;
  return Object.freeze({
    x: r[0] * dx + r[1] * dy + r[2] * dz,
    y: r[3] * dx + r[4] * dy + r[5] * dz,
    z: r[6] * dx + r[7] * dy + r[8] * dz,
  });
}

/** The logical screen position of a camera-space point (z > 0). */
export function projectToScreen(viewport: PresentationViewport, { x, y, z }: Vec3): ScreenPoint {
  const { half, cx, cy } = viewportProjection(viewport);
  return Object.freeze({ x: Math.fround(cx + (2 * x * half) / z), y: Math.fround(cy - (2 * y * half) / z) });
}

export function insideViewVolume(viewport: PresentationViewport, backPlane: number, { x, y, z }: Vec3): boolean {
  const { width, height, half } = viewportProjection(viewport);
  const kx = Math.fround(width / (2 * half)) * z;
  const ky = Math.fround(height / (2 * half)) * z;
  return z >= FRONT_PLANE && z < backPlane && 2 * x >= -kx && 2 * x < kx && 2 * y >= -ky && 2 * y < ky;
}

const roundHalfEven = (value: number): number => {
  const floor = Math.floor(value);
  const fraction = value - floor;
  if (fraction !== 0.5) return Math.round(value);
  return floor % 2 === 0 ? floor : floor + 1;
};

/** The logical pixel row a vertex at `sy` starts at, and the first column of a span whose edge is at `sx`. */
export function rasterPixel({ x, y }: ScreenPoint): { readonly column: number; readonly row: number } {
  return Object.freeze({ column: Math.floor(roundHalfEven(x * 65536) / 65536), row: roundHalfEven(y) });
}

/** Refuses device values the back-plane rule cannot use; see the module comment. */
export function checkSceneDevice(values: SceneDeviceValues): void {
  const { base, kinds1c7c, kindsF8000 } = values ?? {};
  const finite = [base, kinds1c7c, kindsF8000].every((value) => typeof value === 'number' && Number.isFinite(value));
  if (!finite || !(base > FRONT_PLANE) || !(base < kinds1c7c) || !(kinds1c7c < kindsF8000)) {
    throw new FlightRenderError('invalid-input', 'scene.deviceValues', 'must be finite with front plane < +0x1C < +0x20 < +0x24');
  }
}

/** The back plane B while `entities` are listed (PV4); `values` passed `checkSceneDevice`. */
export function backPlane(values: SceneDeviceValues, entities: readonly RenderEntity[]): number {
  let plane = values.base;
  for (const { kindBit, sourceKindBit, display } of entities) {
    if (display === 'released') continue;
    const bit = kindBit === FRAGMENT_KIND_BIT ? sourceKindBit : kindBit;
    if (bit === null || bit > 30) continue;
    const kind = 1 << bit;
    if ((kind & CLASS_2_KINDS) !== 0) return Math.fround(values.kindsF8000);
    if ((kind & CLASS_1_KINDS) !== 0) plane = values.kinds1c7c;
  }
  return Math.fround(plane);
}
