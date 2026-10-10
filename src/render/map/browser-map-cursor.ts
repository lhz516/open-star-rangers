/**
 * Browser canvas of the map cursor: a 2D canvas over the frame inside the container, which ignores pointer events and
 * is hidden from assistive technology. The DOM-free drawer decides what to paint; the caller runs its `draw` from the
 * existing session frame and disposes it with the session. Throws, leaving nothing in the container, when the browser
 * has no 2D canvas context.
 */
import type { MapInputGeometryPort } from './map-input-geometry.ts';
import { createMapCursorDrawer, type MapCursorDrawer, type MapCursorPositionPort } from './map-cursor.ts';

export function createBrowserMapCursor(container: HTMLElement, geometry: MapInputGeometryPort, position: MapCursorPositionPort): MapCursorDrawer {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('The map cursor needs a 2D canvas context');
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, { position: 'absolute', display: 'none', pointerEvents: 'none' });
  container.append(canvas);
  return createMapCursorDrawer({
    show(frame) {
      Object.assign(canvas.style, {
        display: 'block', left: `${frame.left}px`, top: `${frame.top}px`, width: `${frame.width}px`, height: `${frame.height}px`,
      });
    },
    hide() {
      canvas.style.display = 'none';
    },
    resize(width, height) {
      canvas.width = width;
      canvas.height = height;
    },
    clear({ x, y, width, height }) {
      context.clearRect(x, y, width, height);
    },
    fill({ x, y, width, height }, colour) {
      context.fillStyle = colour;
      context.fillRect(x, y, width, height);
    },
    readDevicePixelRatio: () => window.devicePixelRatio,
    remove() {
      canvas.remove();
    },
  }, geometry, position);
}
