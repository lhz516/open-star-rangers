/**
 * The flight renderer's errors and GPU budget (docs/plan/p3/02/spec.md, FS-07 预算; docs/plan/p3/12/spec.md, 渲染器生命周期).
 * Every budget is checked before the allocation it bounds; exceeding one is a `render-capacity` error, which blocks the
 * start or faults the renderer's consumer like any other error that is not the graphics device's.
 */

export type FlightRenderErrorKind =
  /** A GPU budget below would be exceeded. */
  | 'render-capacity'
  /** A use the renderer's state or the run's binding does not allow, such as a second run or a released cache. */
  | 'invalid-state'
  /** A malformed argument, such as a resource whose actual size differs from the size it was budgeted with. */
  | 'invalid-input';

export class FlightRenderError extends Error {
  readonly kind: FlightRenderErrorKind;
  readonly path: string;
  readonly reason: string;

  constructor(kind: FlightRenderErrorKind, path: string, reason: string, options?: { readonly cause: unknown }) {
    super(`${kind}: ${path} ${reason}`, options);
    this.name = 'FlightRenderError';
    this.kind = kind;
    this.path = path;
    this.reason = reason;
  }
}

/**
 * One run's GPU resources (FS-07 `FLIGHT_GPU_LIMITS`): texels of all textures, vertices and indices of all geometries,
 * and render targets, each no larger than the drawing buffer the device accepts.
 */
export const FLIGHT_GPU_LIMITS = Object.freeze({
  texels: 2 ** 25,
  vertices: 2 ** 18,
  indices: 2 ** 18,
  renderTargets: 4,
});
