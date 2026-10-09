import { describe, expect, it } from 'vitest';
import { COCKPIT_VIEW_MODE, createPlayerState, interactionContext } from './player-state.ts';

describe('player state (P3-02 S-05, 实体与生命周期)', () => {
  it('starts without a player entity, in view mode 0xC', () => {
    expect(COCKPIT_VIEW_MODE).toBe(0x0c);
    expect(createPlayerState()).toEqual({ entityId: null, viewMode: 0x0c, previousViewMode: 0x0c, subMode: 0 });
    expect(createPlayerState()).not.toBe(createPlayerState());
  });

  it.each([
    [0, 'warp'], [1, 'warp'], [2, 'warp'], [3, 'warp'],
    [4, 'flight'], [5, 'flight'], [6, 'base'], [7, 'flight'], [8, 'map'], [9, 'flight'],
    [0x0c, 'flight'], [0x0d, 'flight'], [0x11, 'flight'], [0x13, 'flight'],
  ] as const)('derives the interaction context of view mode %i: %s', (viewMode, context) => {
    expect(interactionContext(viewMode)).toBe(context);
  });
});
