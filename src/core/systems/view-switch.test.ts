import { describe, expect, it } from 'vitest';
import type { LeftPage } from '../world/player-state.ts';
import { testState } from '../world/world.test-support.ts';
import { BASE_VIEW_MODE, MAP_VIEW_MODE, switchView, WARP_VIEW_MODE } from './view-switch.ts';

// docs/plan/p3/02/spec.md, MW-09 (and MW-04, MW-08 for the Warp view's page): entering view 1 saves the left page and
// shows page 6; leaving it restores the saved page, 5 as 0; the map has no rule effect. The base's 0x4cd68 is P3-10's.

const FLIGHT = 0x0c;
const PAGES: readonly LeftPage[] = [0, 1, 2, 3, 4, 5, 6];

/** A world whose left page is `page`, saved page `saved` and status display redraw clear. */
function stateWith(page: LeftPage, saved: LeftPage = 0) {
  const state = testState();
  state.player.leftDisplay.page = page;
  state.player.savedLeftPage = saved;
  state.player.statusDisplay.redraw = false;
  return state;
}

const pages = ({ player }: ReturnType<typeof stateWith>) => [player.leftDisplay.page, player.savedLeftPage, player.statusDisplay.redraw];

describe('switchView (MW-09)', () => {
  it.each([[FLIGHT, MAP_VIEW_MODE], [MAP_VIEW_MODE, FLIGHT], [0x11, MAP_VIEW_MODE], [MAP_VIEW_MODE, 0x0d], [FLIGHT, 0x0d]])(
    'has no rule effect for a switch from %i to %i: no page, saved page or redraw change',
    (oldMode, newMode) => {
      for (const page of PAGES) {
        const state = stateWith(page, 3);
        expect(switchView(state, newMode, oldMode)).toBeNull();
        expect(pages(state)).toEqual([page, 3, false]);
      }
    },
  );

  it.each([FLIGHT, MAP_VIEW_MODE, 0x11])('saves the page and shows page 6 when entering view 1 from %i', (oldMode) => {
    for (const page of [0, 1, 2, 3, 4, 5] as const) {
      const state = stateWith(page, 4);
      expect(switchView(state, WARP_VIEW_MODE, oldMode)).toEqual({ page: 6, previousPage: page });
      expect(pages(state)).toEqual([6, page, false]);
    }
  });

  it.each([FLIGHT, 0x0d, 0x11])('restores the saved page when leaving view 1 for %i, the message page 5 as 0', (newMode) => {
    for (const saved of [0, 1, 2, 3, 4, 5] as const) {
      const state = stateWith(6, saved);
      const restored = saved === 5 ? 0 : saved;
      expect(switchView(state, newMode, WARP_VIEW_MODE)).toEqual({ page: restored, previousPage: 6 });
      expect(pages(state)).toEqual([restored, saved, false]);
    }
  });

  it('reports no change when the restored page is the page shown', () => {
    const state = stateWith(2, 2);
    expect(switchView(state, FLIGHT, WARP_VIEW_MODE)).toBeNull();
    expect(pages(state)).toEqual([2, 2, false]);
  });

  it('writes no view mode', () => {
    const state = stateWith(0);
    state.player.viewMode = BASE_VIEW_MODE;
    state.player.previousViewMode = FLIGHT;
    switchView(state, WARP_VIEW_MODE, FLIGHT);
    expect([state.player.viewMode, state.player.previousViewMode]).toEqual([BASE_VIEW_MODE, FLIGHT]);
  });
});
