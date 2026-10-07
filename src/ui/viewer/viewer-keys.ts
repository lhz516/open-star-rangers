/**
 * The viewer's keys (P2-11 查看器操作), a diagnostic interface rather than the original key map: the arrows turn about
 * the vertical and horizontal axes, `+` or `=` and `-` zoom, and `0` resets. Keys held with Control, Meta or Alt are
 * left to the browser.
 */
import type { ViewerViewAction } from '../../render/viewer/viewer-view.ts';

/** The parts of a keydown event the mapping reads; DOM-free, so Node tests can call it. */
export interface ViewerKey {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
}

export function viewerKeyAction({ key, ctrlKey, metaKey, altKey }: ViewerKey): ViewerViewAction | null {
  if (ctrlKey || metaKey || altKey) return null;
  switch (key) {
    case 'ArrowLeft': return { type: 'rotate', axis: 'vertical', steps: -1 };
    case 'ArrowRight': return { type: 'rotate', axis: 'vertical', steps: 1 };
    case 'ArrowUp': return { type: 'rotate', axis: 'horizontal', steps: -1 };
    case 'ArrowDown': return { type: 'rotate', axis: 'horizontal', steps: 1 };
    case '+': case '=': return { type: 'zoom', steps: 1 };
    case '-': return { type: 'zoom', steps: -1 };
    case '0': return { type: 'reset' };
    default: return null;
  }
}
