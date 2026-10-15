import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../contracts/domain-events.ts';
import type { Entity } from '../world/entity-table.ts';
import { entityInit, expectFault, testState } from '../world/world.test-support.ts';
import type { WorldState } from '../world/world-state.ts';
import { isWithinRevealRange, mapContactClass, mapCoverage, revealMapVisibility } from './map-visibility.ts';

// docs/plan/p3/02/spec.md, MW-06 (the reveal) and MW-11 (coverage, contact classes); docs/original/formats/
// executable.md, map contacts, coverage and fog. The expectations are worked out from those texts: the reveal range is
// the friendly's own craft +0x0C, compared squared on the plane, strictly; the ring or disc radius is trunc(+0x0C × ppX)
// with the synthetic map's 225 units per pixel (map-rule-data.test.ts). Kind bit 7 is hostile (0x93780), 3 and 4
// friendly, 0 the player's.

const HOSTILE = 7;
const FRIENDLY = 3;
const OTHER_FRIENDLY = 4;
/** Craft +0x0C per kind bit in `ranged`: the player 1000, kind 3 500, kind 4 2000. */
const RANGES: Readonly<Record<number, number>> = { 0: 1000, [FRIENDLY]: 500, [OTHER_FRIENDLY]: 2000 };

/** testState with the craft +0x0C of RANGES. */
function ranged(): WorldState {
  const base = testState();
  const { content } = base.craftInfo;
  const craft = content.craft.map((record, kindBit) => (RANGES[kindBit] === undefined ? record : { ...record, at0C: RANGES[kindBit] }));
  return { ...base, craftInfo: { ...base.craftInfo, content: { ...content, craft } } };
}

const at = (x: number, y: number, z = 0): Vec3 => ({ x, y, z });

function craft(state: WorldState, kindBit: number, position: Vec3, change: Partial<Entity> = {}): Entity {
  return Object.assign(state.entities.allocate(entityInit(kindBit, { position })), change);
}

const visible = (...entities: Entity[]) => entities.map(({ mapVisible }) => mapVisible);

describe('isWithinRevealRange (0x2ee60\'s test)', () => {
  it('is strict on the planar squared distance and ignores z', () => {
    expect(isWithinRevealRange(at(0, 0), at(600, 800), 1000 * 1000)).toBe(false);
    expect(isWithinRevealRange(at(0, 0), at(600, 799.5), 1000 * 1000)).toBe(true);
    expect(isWithinRevealRange(at(10, 20, -5e6), at(10, 20, 5e6), 1)).toBe(true);
    expect(isWithinRevealRange(at(0, 0), at(0, 0), 0)).toBe(false);
  });

  it('counts an unordered compare as within', () => {
    expect(isWithinRevealRange(at(Number.NaN, 0), at(1e9, 0), 1)).toBe(true);
    expect(isWithinRevealRange(at(0, 0), at(1e9, 0), Number.NaN)).toBe(true);
  });
});

describe('revealMapVisibility (0x2ee60; MW-06)', () => {
  it('makes every friendly member visible and each hostile within that member\'s own +0x0C, on the plane', () => {
    const state = ranged();
    const player = craft(state, 0, at(0, 0));
    const near = craft(state, FRIENDLY, at(10000, 0));
    const far = craft(state, OTHER_FRIENDLY, at(-20000, 0));
    // The player's 1000: inside, on the bound, and inside with a large z difference.
    const [h1, h2, h3] = [at(600, 799.5), at(600, 800), at(0, 999, 4e4)].map((position) => craft(state, HOSTILE, position));
    // Kind 3's 500 and kind 4's 2000.
    const [h4, h5, h6, h7] = [at(10000, 499.5), at(10000, 500), at(-20000, 1999), at(-20000, 2001)].map((position) => craft(state, HOSTILE, position));
    state.objectSets = { friendly: [player.id, near.id, far.id], hostile: [h1, h2, h3, h4, h5, h6, h7].map(({ id }) => id) };
    revealMapVisibility(state);
    expect(visible(player, near, far)).toEqual([true, true, true]);
    expect(visible(h1, h2, h3, h4, h5, h6, h7)).toEqual([true, false, true, true, false, true, false]);
  });

  it('reads only the sets: members are revealed or reveal whatever their state, activity, Warp or kind', () => {
    const state = ranged();
    const source = craft(state, FRIENDLY, at(0, 0), { inWarp: true, state: 'pending-removal', destroyed: true, activity: 'parked' });
    const hidden = craft(state, HOSTILE, at(0, 100), { inWarp: true, state: 'pending-removal', destroyed: true, activity: 'parked' });
    const listedAsHostile = craft(state, OTHER_FRIENDLY, at(100, 0));
    const unlisted = craft(state, HOSTILE, at(0, 50));
    state.objectSets = { friendly: [source.id], hostile: [hidden.id, listedAsHostile.id] };
    revealMapVisibility(state);
    expect(visible(source, hidden, listedAsHostile, unlisted)).toEqual([true, true, true, false]);
  });

  it('keeps a hostile already visible and does not count it', () => {
    const state = ranged();
    const player = craft(state, 0, at(0, 0));
    const later = craft(state, FRIENDLY, at(50000, 50000));
    const shown = craft(state, HOSTILE, at(1e5, 0), { mapVisible: true });
    const near = craft(state, HOSTILE, at(0, 10));
    state.objectSets = { friendly: [player.id, later.id], hostile: [shown.id, near.id] };
    revealMapVisibility(state);
    // One revealed of two hostiles: no early return, so the later friendly is reached.
    expect(visible(player, later, shown, near)).toEqual([true, true, true, true]);
  });

  it('returns once it has revealed as many as the hostile set holds, leaving later friendlies at their value', () => {
    const state = ranged();
    const player = craft(state, 0, at(0, 0));
    const later = craft(state, FRIENDLY, at(50000, 50000));
    const near = craft(state, HOSTILE, at(0, 10));
    state.objectSets = { friendly: [player.id, later.id], hostile: [near.id] };
    revealMapVisibility(state);
    expect(visible(player, later, near)).toEqual([true, false, true]);
  });

  it('visits every friendly when there is no hostile', () => {
    const state = ranged();
    const members = [0, FRIENDLY, OTHER_FRIENDLY].map((kindBit) => craft(state, kindBit, at(kindBit, 0)));
    state.objectSets = { friendly: members.map(({ id }) => id), hostile: [] };
    revealMapVisibility(state);
    expect(visible(...members)).toEqual([true, true, true]);
  });

  it('drops stale IDs as it meets them, keeping the order, as P3-08\'s call on the last rebuild\'s sets meets them', () => {
    const state = ranged();
    const gone = [craft(state, FRIENDLY, at(0, 0)), craft(state, HOSTILE, at(0, 0)), craft(state, FRIENDLY, at(0, 0))];
    const player = craft(state, 0, at(0, 0));
    const other = craft(state, OTHER_FRIENDLY, at(30000, 0));
    const away = craft(state, HOSTILE, at(-30000, 0));
    const near = craft(state, HOSTILE, at(30000, 100));
    for (const entity of gone) state.entities.remove(entity);
    state.objectSets = { friendly: [gone[0].id, player.id, gone[2].id, other.id], hostile: [away.id, gone[1].id, near.id] };
    revealMapVisibility(state);
    expect(state.objectSets).toEqual({ friendly: [player.id, other.id], hostile: [away.id, near.id] });
    expect(Object.isFrozen(state.objectSets) && Object.isFrozen(state.objectSets.friendly) && Object.isFrozen(state.objectSets.hostile)).toBe(true);
    expect(visible(player, other, away, near)).toEqual([true, true, false, true]);
  });

  it('leaves the stale IDs after an early return in place', () => {
    const state = ranged();
    const player = craft(state, 0, at(0, 0));
    const [goneFriendly, goneHostile] = [craft(state, FRIENDLY, at(0, 0)), craft(state, HOSTILE, at(0, 0))];
    const near = craft(state, HOSTILE, at(0, 10));
    state.entities.remove(goneFriendly);
    state.entities.remove(goneHostile);
    // The stale hostile goes first (count 1), then near is revealed: 1 of 1, so the stale friendly is never reached.
    const sets = { friendly: [player.id, goneFriendly.id], hostile: [goneHostile.id, near.id] };
    state.objectSets = sets;
    revealMapVisibility(state);
    expect(state.objectSets).toEqual({ friendly: [player.id, goneFriendly.id], hostile: [near.id] });
  });

  it('keeps the same sets when nothing is stale', () => {
    const state = ranged();
    const player = craft(state, 0, at(0, 0));
    const sets = Object.freeze({ friendly: Object.freeze([player.id]), hostile: Object.freeze([]) });
    state.objectSets = sets;
    revealMapVisibility(state);
    expect(state.objectSets).toBe(sets);
  });

  it('faults on a friendly whose kind has no craft record', () => {
    const state = ranged();
    const player = craft(state, 0, at(0, 0));
    const { content } = state.craftInfo;
    const unbound: WorldState = { ...state, craftInfo: { ...state.craftInfo, content: { ...content, craft: content.craft.map(() => undefined) } } } as unknown as WorldState;
    unbound.objectSets = { friendly: [player.id], hostile: [] };
    expectFault(() => revealMapVisibility(unbound), 'invariant-violated', 'map-visibility.record');
  });
});

describe('map contact classes and coverage (MW-11; 0x49f8c, 0x4ad1c)', () => {
  it('classes kind bit 0 as the player, 0x6c87f as friendly and 0x93780 as hostile', () => {
    const classes = Array.from({ length: 20 }, (_, kindBit) => mapContactClass(kindBit));
    const hostile = [7, 8, 9, 10, 12, 13, 16, 19];
    expect(classes).toEqual(classes.map((_, kindBit) => (kindBit === 0 ? 'player' : hostile.includes(kindBit) ? 'hostile' : 'friendly')));
  });

  it('gives trunc(+0x0C × ppX) pixels: a disc for the player and friendly kinds, a ring for hostile ones', () => {
    const { map } = testState().ruleData;
    // 225 units per pixel: 1000 → 4.44…, 250 → 1.11…
    expect(mapCoverage(map, 0, 1000)).toEqual({ radius: 4, style: 'disc' });
    expect(mapCoverage(map, FRIENDLY, 250)).toEqual({ radius: 1, style: 'disc' });
    expect(mapCoverage(map, HOSTILE, 1000)).toEqual({ radius: 4, style: 'ring' });
  });

  it('draws nothing for a radius of 0, or beyond i32 (the integer indefinite)', () => {
    const { map } = testState().ruleData;
    expect(mapCoverage(map, FRIENDLY, 224)).toBeNull();
    expect(mapCoverage(map, HOSTILE, 0)).toBeNull();
    expect(mapCoverage(map, FRIENDLY, 3e38)).toBeNull();
  });
});
