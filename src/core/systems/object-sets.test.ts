import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../contracts/domain-events.ts';
import { readTickInput, type Command } from '../contracts/tick-input.ts';
import type { CraftCombat, Entity } from '../world/entity-table.ts';
import { initialPlayerControl } from '../world/player-state.ts';
import { constructWorld } from '../world/world.ts';
import { addPlayerEntity, busyCombat, entityInit, stillEntityInit, testState } from '../world/world.test-support.ts';
import type { WorldState } from '../world/world-state.ts';
import { rebuildObjectSets } from './object-sets.ts';

// P3-09 S-05, AC-05 (docs/plan/p3/09/spec.md, 可见性与迷雾) against docs/plan/p3/02/spec.md, MW-01 (the base value is
// false: record +0x7C is never imported), MW-02 and MW-06 (the sets and flags, rebuilt every tick and kept to the next,
// the reveal in view 8 only), MW-07 (the map step's contacts) and MW-13 (the stage after energy). Expectations follow
// from that text: the sets list craft kinds 0–19 in kind-table order split by 0x93780; a hostile is visible in a map
// tick iff some friendly member lies strictly within the member's own craft +0x0C on the plane; nothing is remembered.

const FLIGHT = 0x0c;
const MAP = 8;
const HOSTILE = 7;
const FRIENDLY = 3;
const toggle: Command = { type: 'toggle-map' };

const at = (x: number, y: number, z = 0): Vec3 => ({ x, y, z });

/**
 * A world with an available, standing player at the origin in `viewMode` (previous view 0xC), the automatic selection
 * not due; the player's craft +0x0C is 1000 and kind 3's 500 (the others keep the synthetic 250). The player's own
 * record also gets synthetic Warp fields: pairs (10, 100) and (1000, 200), +0xA4 2 s, +0xA8 14 and +0xB8 64, so a
 * Warp to (0, 50000, 0) costs 200 × 50000 ÷ 1000 = 10000.
 */
function setUp(viewMode = FLIGHT): { state: WorldState; player: Entity } {
  const base = testState();
  const { content } = base.craftInfo;
  const craft = content.craft.map((record, kindBit) => {
    if (kindBit === 0) return { ...record, at0C: 1000, pairs: [{ at00: 10, at04: 100 }, { at00: 1000, at04: 200 }], atA4: 2, atA8: 14, atB8: 64 };
    return kindBit === FRIENDLY ? { ...record, at0C: 500 } : record;
  });
  const state: WorldState = { ...base, craftInfo: { ...base.craftInfo, content: { ...content, craft } } };
  const player = addPlayerEntity(state, { position: at(0, 0) });
  player.state = 'active';
  state.player.control = initialPlayerControl(1);
  state.player.targeting!.autoTargetDueClock = 1e9;
  state.player.viewMode = viewMode;
  state.player.previousViewMode = FLIGHT;
  return { state, player };
}

/** An active craft standing at `position`. */
function still(state: WorldState, kindBit: number, position: Vec3, change: Partial<Entity> = {}): Entity {
  const entity = state.entities.allocate(stillEntityInit(kindBit, { position }));
  entity.state = 'active';
  return Object.assign(entity, change);
}

const step = (state: WorldState, commands: readonly Command[] = []) => constructWorld(state).step(readTickInput({ axes: { pitch: 0, yaw: 0, roll: 0 }, commands: [...commands] }));
const icons = ({ mapIcons }: WorldState) => mapIcons.map(({ entityId }) => entityId);

describe('the rebuild (0x2f028; MW-06)', () => {
  it('lists kinds 0–19 in kind-table order, hostile by 0x93780, whatever their state, activity, destroyed flag or Warp', () => {
    const state = testState();
    const allocate = (kindBit: number, change: Partial<Entity> = {}) => Object.assign(state.entities.allocate(entityInit(kindBit, { combat: busyCombat(kindBit) })), change);
    const k19 = allocate(19);
    const hostileA = allocate(HOSTILE, { mapVisible: true });
    const parked = allocate(FRIENDLY, { activity: 'parked' });
    const marker = allocate(25);
    const projectile = allocate(20);
    const player = addPlayerEntity(state);
    const hostileB = allocate(HOSTILE, { destroyed: true, state: 'pending-removal' });
    const wingman = allocate(1, { inWarp: true, mapVisible: true });
    const k18 = allocate(18, { state: 'new' });
    state.objectSets = { friendly: [99], hostile: [98] };
    rebuildObjectSets(state);
    expect(state.objectSets).toEqual({
      friendly: [player.id, wingman.id, parked.id, k18.id],
      hostile: [hostileA.id, hostileB.id, k19.id],
    });
    expect(Object.isFrozen(state.objectSets) && Object.isFrozen(state.objectSets.friendly) && Object.isFrozen(state.objectSets.hostile)).toBe(true);
    // The base value, false, for every craft; other kinds keep theirs (false: only craft are ever written).
    expect([k19, hostileA, parked, player, hostileB, wingman, k18].map(({ mapVisible }) => mapVisible)).toEqual(new Array(7).fill(false));
    expect([marker, projectile].map(({ mapVisible }) => mapVisible)).toEqual([false, false]);
  });

  it('splits every craft kind by 0x93780 (bits 7, 8, 9, 10, 12, 13, 16 and 19)', () => {
    const state = testState();
    const ids = Array.from({ length: 20 }, (_, kindBit) => state.entities.allocate(entityInit(kindBit, { combat: busyCombat(kindBit) })).id);
    rebuildObjectSets(state);
    const hostile = [7, 8, 9, 10, 12, 13, 16, 19];
    expect(state.objectSets).toEqual({
      friendly: ids.filter((_, kindBit) => !hostile.includes(kindBit)),
      hostile: hostile.map((kindBit) => ids[kindBit]),
    });
  });
});

describe('the object-sets stage in the pipeline (MW-06, MW-07, MW-13)', () => {
  it('rebuilds every tick in flight, where nothing is revealed: new craft join and removed ones leave', () => {
    const { state, player } = setUp();
    const near = still(state, HOSTILE, at(0, 100));
    near.mapVisible = true;
    step(state);
    expect(state.objectSets).toEqual({ friendly: [player.id], hostile: [near.id] });
    expect([player.mapVisible, near.mapVisible]).toEqual([false, false]);
    const joined = still(state, FRIENDLY, at(200, 0));
    state.entities.remove(near);
    step(state);
    expect(state.objectSets).toEqual({ friendly: [player.id, joined.id], hostile: [] });
  });

  it('reveals from the tick that opens the map, not in the one that closes it, and again on reopening: no history', () => {
    const { state, player } = setUp();
    const near = still(state, HOSTILE, at(0, 999));
    const far = still(state, HOSTILE, at(0, 1001));
    step(state, [toggle]);
    expect(state.player.viewMode).toBe(MAP);
    expect([player.mapVisible, near.mapVisible, far.mapVisible]).toEqual([true, true, false]);
    // The map step of the same tick reads the flags: the hidden hostile is no contact.
    expect(icons(state)).toEqual([player.id, near.id]);
    step(state, [toggle]);
    expect(state.player.viewMode).toBe(FLIGHT);
    expect([player.mapVisible, near.mapVisible]).toEqual([false, false]);
    expect(icons(state)).toEqual([]);
    step(state, [toggle]);
    expect([player.mapVisible, near.mapVisible, far.mapVisible]).toEqual([true, true, false]);
    expect(icons(state)).toEqual([player.id, near.id]);
  });

  it('reveals by the strict planar distance to each friendly\'s own craft +0x0C, z ignored', () => {
    const { state } = setUp(MAP);
    still(state, FRIENDLY, at(10000, 0));
    // The player's 1000, then kind 3's 500.
    const hostiles = [at(600, 799.5), at(600, 800), at(0, 999, 30000), at(10000, 499.5), at(10000, 500), at(10000, 999)]
      .map((position) => still(state, HOSTILE, position));
    step(state);
    expect(hostiles.map(({ mapVisible }) => mapVisible)).toEqual([true, false, true, true, false, false]);
  });

  it('follows the current positions: a hostile leaving the range or a source moving away is hidden the next tick', () => {
    const { state, player } = setUp(MAP);
    const hostile = still(state, HOSTILE, at(0, 500));
    step(state);
    expect(hostile.mapVisible).toBe(true);
    hostile.position = at(0, 1500);
    step(state);
    expect(hostile.mapVisible).toBe(false);
    expect(icons(state)).toEqual([player.id]);
    hostile.position = at(0, 500);
    step(state);
    expect(hostile.mapVisible).toBe(true);
    player.position = at(0, 2000);
    step(state);
    expect(hostile.mapVisible).toBe(false);
  });

  it('hides what only a removed source revealed, from the next tick on', () => {
    const { state, player } = setUp(MAP);
    const source = still(state, FRIENDLY, at(5000, 0));
    const hostile = still(state, HOSTILE, at(5000, 300));
    step(state);
    expect(hostile.mapVisible).toBe(true);
    expect(icons(state)).toEqual([player.id, source.id, hostile.id]);
    state.entities.remove(source);
    step(state);
    expect(state.objectSets).toEqual({ friendly: [player.id], hostile: [hostile.id] });
    expect(hostile.mapVisible).toBe(false);
    expect(icons(state)).toEqual([player.id]);
  });

  it('reveals from and of parked craft, which stay set members', () => {
    const { state, player } = setUp(MAP);
    const source = state.entities.allocate(entityInit(FRIENDLY, { position: at(-30000, 0), activity: 'parked' }));
    const hostile = state.entities.allocate(entityInit(HOSTILE, { position: at(-30000, 400), activity: 'parked' }));
    const unseen = state.entities.allocate(entityInit(HOSTILE, { position: at(-30000, 600), activity: 'parked' }));
    step(state);
    expect(state.objectSets).toEqual({ friendly: [player.id, source.id], hostile: [hostile.id, unseen.id] });
    expect([source.mapVisible, hostile.mapVisible, unseen.mapVisible]).toEqual([true, true, false]);
  });

  it('lets a friendly in Warp reveal though it is no contact itself, and reveals a hostile in Warp that is no contact', () => {
    const { state, player } = setUp(MAP);
    const source = still(state, FRIENDLY, at(5000, 0), { inWarp: true });
    const hostile = still(state, HOSTILE, at(5000, 300));
    const warping = still(state, HOSTILE, at(0, 300), { inWarp: true });
    step(state);
    expect([source.inWarp, warping.inWarp]).toEqual([true, true]);
    expect([source.mapVisible, hostile.mapVisible, warping.mapVisible]).toEqual([true, true, true]);
    expect(icons(state)).toEqual([player.id, hostile.id]);
  });

  it('stops revealing in the tick the player starts a Warp from the map (view 1 at the stage), keeping the sets', () => {
    const { state, player } = setUp(MAP);
    (player.combat as CraftCombat).energy = 10000;
    state.player.map.destination = at(0, 50000);
    const hostile = still(state, HOSTILE, at(0, 300));
    step(state);
    expect(hostile.mapVisible).toBe(true);
    step(state, [{ type: 'request-warp' }]);
    expect([state.player.viewMode, state.player.previousViewMode, player.inWarp]).toEqual([1, MAP, true]);
    expect(state.objectSets).toEqual({ friendly: [player.id], hostile: [hostile.id] });
    expect([player.mapVisible, hostile.mapVisible]).toEqual([false, false]);
    expect(icons(state)).toEqual([]);
  });
});
