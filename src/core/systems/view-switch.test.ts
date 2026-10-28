import { describe, expect, it } from 'vitest';
import { readTickInput } from '../contracts/tick-input.ts';
import type { LeftPage } from '../world/player-state.ts';
import { addPlayerEntity, testState, tickInput } from '../world/world.test-support.ts';
import { registerTick } from './pipeline.ts';
import { BASE_VIEW_MODE, commitViewSwitch, MAP_VIEW_MODE, switchPlayerView, switchView, WARP_VIEW_MODE } from './view-switch.ts';

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

// P3-12 (docs/plan/p3/02/spec.md, FS-02, FS-03): the shared switch writes the modes, runs switchView and emits
// `view-switched` with the stage and the player's pose at the write; only `0x216d4` writes whether the model is shown.
describe('commitViewSwitch and switchPlayerView (FS-02, FS-03)', () => {
  function context(stage: 'request-handling' | 'warp-completion' = 'request-handling') {
    const state = stateWith(1, 0);
    const player = addPlayerEntity(state, { position: { x: 1, y: -2, z: 3.5 } });
    state.player.subMode = 8;
    const tick = registerTick(state, readTickInput(tickInput()));
    tick.stage = stage;
    return { state, player, context: tick };
  }

  it('writes both modes, runs the rule effects, and reports the switch with the pose at the write', () => {
    const { state, player, context: tick } = context();
    expect(commitViewSwitch(tick, WARP_VIEW_MODE, FLIGHT)).toEqual({ page: 6, previousPage: 1 });
    expect([state.player.viewMode, state.player.previousViewMode, state.player.subMode]).toEqual([WARP_VIEW_MODE, FLIGHT, 8]);
    expect(pages(state)).toEqual([6, 1, false]);
    // A later move does not reach the event: it is a detached snapshot.
    player.position = { x: 9, y: 9, z: 9 };
    expect(tick.events).toEqual([{
      type: 'view-switched', tick: 1, fromViewMode: FLIGHT, fromSubMode: 8, viewMode: WARP_VIEW_MODE, subMode: 8, stage: 'request-handling',
      player: { entityId: player.id, position: { x: 1, y: -2, z: 3.5 }, orientation: [...player.orientation] },
    }]);
  });

  it('leaves the model flag on a switch outside 0x216d4 (the map toggle, the Warp start and completion)', () => {
    for (const shown of [false, true]) {
      const { state, context: tick } = context();
      state.player.modelShown = shown;
      commitViewSwitch(tick, 0x11, FLIGHT);
      commitViewSwitch(tick, MAP_VIEW_MODE, 0x11);
      expect(state.player.modelShown).toBe(shown);
    }
  });

  it('writes a new sub-mode and reports the old one', () => {
    const { state, context: tick } = context();
    commitViewSwitch(tick, 0x11, FLIGHT, 0);
    expect(state.player.subMode).toBe(0);
    expect(tick.events[0]).toMatchObject({ fromViewMode: FLIGHT, fromSubMode: 8, viewMode: 0x11, subMode: 0 });
  });

  it('0x216d4 keeps the old view as the previous one and shows the player\'s model in view 0x11 only', () => {
    const { state, context: tick } = context();
    switchPlayerView(tick, 0x11);
    expect([state.player.viewMode, state.player.previousViewMode, state.player.modelShown]).toEqual([0x11, FLIGHT, true]);
    for (const viewMode of [MAP_VIEW_MODE, 0x11, FLIGHT, BASE_VIEW_MODE, 0x13]) {
      const previous = state.player.viewMode;
      switchPlayerView(tick, viewMode);
      expect([state.player.previousViewMode, state.player.modelShown]).toEqual([previous, viewMode === 0x11]);
    }
    expect(tick.events.map((event) => (event.type === 'view-switched' ? [event.fromViewMode, event.viewMode] : null))).toEqual([
      [FLIGHT, 0x11], [0x11, MAP_VIEW_MODE], [MAP_VIEW_MODE, 0x11], [0x11, FLIGHT], [FLIGHT, BASE_VIEW_MODE], [BASE_VIEW_MODE, 0x13],
    ]);
  });

  it('reports no pose without a player entity, and the stage that runs it', () => {
    const { state, context: tick } = context('warp-completion');
    state.player.entityId = null;
    commitViewSwitch(tick, FLIGHT, WARP_VIEW_MODE);
    expect(tick.events).toEqual([{
      type: 'view-switched', tick: 1, fromViewMode: FLIGHT, fromSubMode: 8, viewMode: FLIGHT, subMode: 8, stage: 'warp-completion', player: null,
    }]);
  });
});
