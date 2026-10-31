import { describe, expect, it } from 'vitest';
import { LOGICAL_PIXEL_GLSL } from './logical-screen.ts';

// P3-15/13: the device pixel → logical pixel rule every layer that enlarges logical pixels shares (AC-05, AC-16).

/** `logicalPixel()`'s integer expression for one axis, as the shader evaluates it. */
const shaderPixel = (device: number, bufferWidth: number): number => Math.trunc(((2 * device + 1) * 320) / bufferWidth);

describe('logical pixel rule', () => {
  it('is integer arithmetic on the device pixel, rows from the top, kept on the logical screen', () => {
    expect(LOGICAL_PIXEL_GLSL).toContain('uniform ivec2 logicalBuffer;');
    expect(LOGICAL_PIXEL_GLSL).toContain('ivec2 device = ivec2(gl_FragCoord.x, float(logicalBuffer.y) - gl_FragCoord.y);');
    expect(LOGICAL_PIXEL_GLSL).toContain('min((2 * device + 1) * 320 / logicalBuffer.x, ivec2(639, 479))');
  });

  it('shows the logical pixel whose [x·s, (x + 1)·s) holds the device pixel\'s centre, the later one on an edge', () => {
    for (const width of [298, 365, 485, 576, 640, 960, 1280]) {
      for (let device = 0; device < width; device++) {
        const x = shaderPixel(device, width);
        // Exact in rationals: x·W ≤ (d + ½)·640 < (x + 1)·W.
        expect(x * width <= (2 * device + 1) * 320 && (2 * device + 1) * 320 < (x + 1) * width, `${device} of ${width}`).toBe(true);
      }
    }
    // A buffer 485 wide: device row 145's centre is exactly logical 192.0.
    expect([shaderPixel(144, 485), shaderPixel(145, 485), shaderPixel(146, 485)]).toEqual([190, 192, 193]);
  });
});
