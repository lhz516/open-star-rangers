import { describe, expect, it } from 'vitest';
import { COCKPIT_VIEW_MODE, createPlayerState, initialPlayerControl, initialPlayerTargeting, interactionContext, KILL_KIND_BITS } from './player-state.ts';

describe('player state (P3-02 S-05, 实体与生命周期)', () => {
  it('starts without a player entity, in view mode 0xC', () => {
    expect(COCKPIT_VIEW_MODE).toBe(0x0c);
    expect(createPlayerState()).toMatchObject({ entityId: null, viewMode: 0x0c, previousViewMode: 0x0c, subMode: 0, target: null, control: null });
    expect(createPlayerState()).not.toBe(createPlayerState());
  });

  // P3-07 CR-04: no targeting before a player entity, no pod, no pending explosion, no kills or shots, heavy damage
  // unknown, the damage report page, and a status display due at once that must be drawn.
  it('starts with P3-07\'s and P3-10\'s creation values', () => {
    const state = createPlayerState();
    expect(state).toEqual({
      entityId: null, viewMode: 0x0c, previousViewMode: 0x0c, subMode: 0, target: null, control: null,
      targeting: null, followedEntity: null, delayedExplosionClock: null, kills: { 7: 0, 8: 0, 9: 0, 10: 0, 11: 0, 12: 0, 16: 0, 19: 0 },
      shots: { projectilesFired: 0, projectileHits: 0, missilesFired: 0, missileHits: 0 }, heavyDamage: -1, leftDisplay: { page: 0 },
      statusDisplay: { blink: 0, blinkDueClock: 0, redraw: true },
      // P3-10 CB-02, CB-03: no docking object, no menu, partner or stamps, the saved pages and the thanks at 0, no pose.
      dockingObject: null,
      communications: { menu: null, partner: null, menuSavedPage: 0, incomingSavedPage: 0, limits: { friendlyHit: null, friendlyKill: null }, thanks: 0 },
      docking: { savedPose: null },
    });
    expect(Object.keys(state.kills).map(Number)).toEqual([...KILL_KIND_BITS]);
    expect(Object.isFrozen(state.kills)).toBe(true);
    for (const part of ['shots', 'leftDisplay', 'statusDisplay', 'communications', 'docking'] as const) expect(state[part]).not.toBe(createPlayerState()[part]);
    expect(state.communications.limits).not.toBe(createPlayerState().communications.limits);
  });

  it('gives a new player entity the enemy mode with the automatic selection due at once', () => {
    expect(initialPlayerTargeting()).toEqual({ mode: 'enemy', autoTargetDueClock: 0 });
    expect(initialPlayerTargeting()).not.toBe(initialPlayerTargeting());
  });

  // P3-06 S-07 (docs/plan/p3/06/spec.md, 起飞初始状态): the controller's construction values (executable.md, initial
  // flight state, P3-06/05), with the speed assist on exactly in campaign group 0 (difficulty path 8).
  it.each([[0, true], [1, false], [2, false]] as const)('gives a new player entity in group %i the initial control state', (group, enabled) => {
    expect(initialPlayerControl(group)).toEqual({ lastAxes: { pitch: 0, yaw: 0, roll: 0 }, speedAssist: { enabled, dueClock: 0, engaged: false } });
    expect(initialPlayerControl(group)).not.toBe(initialPlayerControl(group));
  });

  it.each([
    [0, 'warp'], [1, 'warp'], [2, 'warp'], [3, 'warp'],
    [4, 'flight'], [5, 'flight'], [6, 'base'], [7, 'flight'], [8, 'map'], [9, 'flight'],
    [0x0c, 'flight'], [0x0d, 'flight'], [0x11, 'flight'], [0x13, 'flight'],
  ] as const)('derives the interaction context of view mode %i: %s', (viewMode, context) => {
    expect(interactionContext(viewMode)).toBe(context);
  });
});
