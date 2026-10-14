import { describe, expect, it } from 'vitest';
import { MAP_INPUT_POLICY } from './map-input-policy.ts';

describe('production map input policy', () => {
  it.each([
    [
      { left: 20, top: 40, right: 340, bottom: 360 },
      { right: (159.5 - 20) / 320, down: (159.5 - 40) / 320 },
    ],
    [
      { left: 7, top: 5, right: 11, bottom: 9 },
      { right: 0.5 / 4, down: 0.5 / 4 },
    ],
  ])('uses the confirmed screen-origin start formula for %o', (mainMap, expected) => {
    expect(MAP_INPUT_POLICY.start({
      screen: { width: 640, height: 480 },
      mainMap,
      frame: { left: 0, top: 0, width: 640, height: 480 },
    })).toEqual(expected);
  });

  it('repeats held left-button selects every eight simulation clock units', () => {
    expect(MAP_INPUT_POLICY.repeatInterval).toBe(8);
  });
});
