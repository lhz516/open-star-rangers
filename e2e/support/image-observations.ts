import { expect, type Page } from '@playwright/test';
import { SYNTHETIC_KIND_COLORS } from '../../src/render/synthetic/synthetic-appearance.ts';
import { computeViewportLayout } from '../../src/render/viewport/viewport-layout.ts';

export async function image(page: Page) {
  const screenshot = await page.getByTestId('synthetic-view').screenshot();
  return page.evaluate(async ({ bytes, colors }) => {
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/png' }));
    try {
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Screenshot decode requires a 2D context');
      context.drawImage(bitmap, 0, 0);
      const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
      const measure = (color: number) => {
        const rgb = [color >> 16, (color >> 8) & 255, color & 255];
        let count = 0;
        let sumX = 0;
        for (let index = 0; index < pixels.length; index += 4) {
          if (rgb.every((value, channel) => Math.abs(pixels[index + channel] - value) <= 3)) {
            count++;
            sumX += (index / 4) % bitmap.width;
          }
        }
        return { count, x: count ? sumX / count : null };
      };
      return { mover: measure(colors.mover), marker: measure(colors.marker), width: bitmap.width, height: bitmap.height };
    } finally {
      bitmap.close();
    }
  }, { bytes: [...screenshot], colors: SYNTHETIC_KIND_COLORS });
}

export async function verifyLayout(page: Page) {
  const actual = await page.getByTestId('synthetic-view').evaluate(container => {
    const canvas = container.querySelector('canvas');
    if (!canvas) throw new Error('Missing canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) throw new Error('Missing WebGL 2 capability');
    const rect = container.getBoundingClientRect();
    const frame = canvas.getBoundingClientRect();
    const viewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array;
    return {
      input: {
        width: rect.width, height: rect.height, devicePixelRatio,
        maxDrawingBufferSize: Math.min(viewport[0], viewport[1], gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number),
      },
      frame: { left: frame.left - rect.left, top: frame.top - rect.top, width: frame.width, height: frame.height },
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
