/**
 * The viewer's view parameters (P2-11 查看器操作): rotation about the vertical and horizontal axes in 15° steps, zoom in
 * 1.25× steps from 1/8 to 8 times the initial framing, and the optional neutral light.
 */
export interface ViewerView {
  /** Degrees about the vertical axis, a multiple of the rotation step in [0, 360). */
  readonly yaw: number;
  /** Degrees about the horizontal axis, a multiple of the rotation step in [0, 360). */
  readonly pitch: number;
  /** Times the initial framing. */
  readonly zoom: number;
  /** Whether the neutral light is on; it applies to models only. */
  readonly lit: boolean;
}

export const VIEW_LIMITS = Object.freeze({
  rotationStep: 15,
  zoomStep: 1.25,
  minZoom: 1 / 8,
  maxZoom: 8,
});

export const INITIAL_VIEW: ViewerView = Object.freeze({ yaw: 0, pitch: 0, zoom: 1, lit: false });

export type ViewerViewAction =
  /** `steps` rotation steps about the axis, negative for the other direction. */
  | { readonly type: 'rotate'; readonly axis: 'vertical' | 'horizontal'; readonly steps: number }
  /** `steps` zoom steps, positive to zoom in. */
  | { readonly type: 'zoom'; readonly steps: number }
  /** Back to the initial rotation and framing; the light stays. */
  | { readonly type: 'reset' }
  | { readonly type: 'light'; readonly lit: boolean };

function requireSteps(steps: number): number {
  if (!Number.isSafeInteger(steps)) throw new RangeError(`View steps must be an integer, got ${String(steps)}`);
  return steps;
}

const turn = (degrees: number, steps: number): number => {
  const turned = (degrees + steps * VIEW_LIMITS.rotationStep) % 360;
  // `+ 0` folds -0 into 0.
  return (turned < 0 ? turned + 360 : turned) + 0;
};

export const sameView = (a: ViewerView, b: ViewerView): boolean =>
  a.yaw === b.yaw && a.pitch === b.pitch && a.zoom === b.zoom && a.lit === b.lit;

/** The view after `action`; the same object when nothing changes. Throws a RangeError for non-integer steps or rotations. */
export function applyViewAction(view: ViewerView, action: ViewerViewAction): ViewerView {
  let next: ViewerView;
  switch (action.type) {
    case 'rotate': {
      const steps = requireSteps(action.steps);
      next = action.axis === 'vertical' ? { ...view, yaw: turn(view.yaw, steps) } : { ...view, pitch: turn(view.pitch, steps) };
      break;
    }
    case 'zoom': {
      const zoom = view.zoom * VIEW_LIMITS.zoomStep ** requireSteps(action.steps);
      next = { ...view, zoom: Math.min(VIEW_LIMITS.maxZoom, Math.max(VIEW_LIMITS.minZoom, zoom)) };
      break;
    }
    case 'reset':
      next = { ...view, yaw: 0, pitch: 0, zoom: 1 };
      break;
    case 'light':
      next = { ...view, lit: action.lit };
      break;
  }
  return sameView(next, view) ? view : Object.freeze(next);
}
