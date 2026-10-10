import { expect, type Page } from '@playwright/test';
import { computeViewportLayout } from '../../src/render/viewport/viewport-layout.ts';

// Layout evidence of the WebGL picture, read from the resource viewer, the one screen with a WebGL surface since P3-04
// retired the synthetic demo view (docs/plan/p3/04/spec.md, 合成演示退役). Pixel samples of the viewer's items are in
// viewer-observations.ts.

/**
 * Expects the viewer canvas's CSS frame and drawing buffer to follow the 4:3 rule of `computeViewportLayout` for the
 * `viewer-view` box, the page's pixel ratio and the context's limits, and resolves to what it compared.
 */
export async function verifyLayout(page: Page) {
  const actual = await page.getByTestId('viewer-view').evaluate(container => {
    const canvas = container.querySelector('canvas');
    if (!canvas?.parentElement) throw new Error('Missing viewer canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) throw new Error('Missing WebGL 2 capability');
    const [outer, inner] = [canvas.parentElement.getBoundingClientRect(), canvas.getBoundingClientRect()];
    const viewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array;
    return {
      input: {
        width: container.clientWidth, height: container.clientHeight, devicePixelRatio,
        maxDrawingBufferSize: Math.min(viewport[0], viewport[1], gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number),
      },
      frame: { left: inner.left - outer.left, top: inner.top - outer.top, width: inner.width, height: inner.height },
      buffer: { width: canvas.width, height: canvas.height },
    };
  });
  const expected = computeViewportLayout(actual.input);
  expect(expected).not.toBeNull();
  for (const key of ['left', 'top', 'width', 'height'] as const) {
    expect(Math.abs(actual.frame[key] - expected!.frame[key]), `CSS ${key}`).toBeLessThanOrEqual(1);
  }
  expect(actual.buffer).toEqual({ width: expected!.bufferWidth, height: expected!.bufferHeight });
  expect(Math.abs(actual.buffer.width * 3 / 4 - actual.buffer.height)).toBeLessThanOrEqual(1);
  return { actual, expected };
}
