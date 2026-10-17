import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../contracts/domain-events.ts';
import type { Entity } from '../world/entity-table.ts';
import type { MapPoint } from '../world/map-rule-data.ts';
import { entityInit, testState } from '../world/world.test-support.ts';
import type { MapIcon, WorldState } from '../world/world-state.ts';
import { buildMapIcons, deOverlap, isMapContact, pickMapIcon } from './map-icons.ts';

// docs/plan/p3/02/spec.md, MW-07 (contacts, icon list, de-overlap, pick); docs/original/formats/executable.md, map
// contacts (0x2b8ec), the icon list a select reads, nearest icon (0x4c310) and the main-map de-overlap (0x4b3a8). The
// synthetic world is ±45000 with 225 units per pixel (map-frame.test.ts): x = −45000 + 225 × column + 100 lies in that
// column. Kind bit 7 is hostile (0x93780), 3 friendly, 0 and 1 the player's and the wingman's (kinds 1 and 2).

const HOSTILE = 7;
const FRIENDLY = 3;
const centre = (column: number, row: number, z = 0): Vec3 => ({ x: -45000 + 225 * column + 100, y: -45000 + 225 * row + 100, z });

function withCraft(state: WorldState, kindBit: number, position: Vec3, change: Partial<Entity> = {}): Entity {
  return Object.assign(state.entities.allocate(entityInit(kindBit, { position })), change);
}

describe('isMapContact (0x2b8ec)', () => {
  const contact = (kindBit: number, position: Vec3, change: Partial<Entity> = {}) => {
    const state = testState();
    return isMapContact(state.ruleData.map, withCraft(state, kindBit, position, change));
  };

  it('tests map visibility for hostile kinds only', () => {
    expect(contact(HOSTILE, centre(5, 5))).toBe(false);
    expect(contact(HOSTILE, centre(5, 5), { mapVisible: true })).toBe(true);
    expect(contact(FRIENDLY, centre(5, 5))).toBe(true);
  });

  it('skips craft in Warp or waiting for removal, whatever else they are', () => {
    expect(contact(FRIENDLY, centre(5, 5), { inWarp: true })).toBe(false);
    expect(contact(1, centre(5, 5), { inWarp: true })).toBe(false);
    expect(contact(FRIENDLY, centre(5, 5), { state: 'pending-removal' })).toBe(false);
    for (const state of ['new', 'area-switch', 'destroyed-source', 'active'] as const) expect(contact(FRIENDLY, centre(5, 5), { state })).toBe(true);
    expect(contact(FRIENDLY, centre(5, 5), { destroyed: true, activity: 'parked' })).toBe(true);
  });

  it('keeps others only in the world rectangle, bounds included, but the player and wingman anywhere', () => {
    expect(contact(FRIENDLY, { x: 45000, y: -45000, z: 1e6 })).toBe(true);
    expect(contact(FRIENDLY, { x: 45001, y: 0, z: 0 })).toBe(false);
    expect(contact(0, { x: 45001, y: 0, z: 0 })).toBe(true);
    expect(contact(1, { x: 0, y: -1e7, z: 0 })).toBe(true);
    expect(contact(HOSTILE, { x: 45001, y: 0, z: 0 }, { mapVisible: true })).toBe(false);
  });
});

const point = (column: number, row: number): MapPoint => ({ column, row });
const projected = (...entries: [MapPoint, boolean][]) => entries.map(([pixel, inWorld]) => ({ pixel, inWorld }));

describe('deOverlap (0x4b3a8)', () => {
  const P = point(100, 100);

  it('never moves the first icon and moves a later coincident one by its first step', () => {
    expect(deOverlap(projected([P, true], [P, true]))).toEqual([P, point(103, 103)]);
  });

  it('steps a third coincident icon past the moved one, in the step order', () => {
    expect(deOverlap(projected([P, true], [P, true], [P, true]))).toEqual([P, point(103, 103), point(97, 103)]);
  });

  it('restarts the scan from the first icon after every move', () => {
    // Icon 1 meets icon 2 at P, moves onto icon 0 at (+3, +3), and must move on although icon 0 was scanned already.
    expect(deOverlap(projected([point(103, 103), true], [P, true], [P, true]))).toEqual([point(103, 103), point(97, 103), P]);
  });

  it('only icons in the world are obstacles, but an icon outside the world still moves', () => {
    expect(deOverlap(projected([P, false], [P, true]))).toEqual([P, P]);
    expect(deOverlap(projected([P, true], [P, false]))).toEqual([P, point(103, 103)]);
  });

  it('returns to the own pixel after the eighth step is also taken', () => {
    const steps = [[3, 3], [-3, 3], [-3, -3], [3, -3], [3, 0], [0, 3], [-3, 0], [0, -3]];
    const occupied = [P, ...steps.map(([column, row]) => point(100 + column, 100 + row))];
    const result = deOverlap([...occupied, P].map((pixel) => ({ pixel, inWorld: true })));
    expect(result).toEqual([...occupied, P]);
    // With the last step free, it ends there.
    const free = deOverlap([...occupied.slice(0, 8), P].map((pixel) => ({ pixel, inWorld: true })));
    expect(free[8]).toEqual(point(100, 97));
  });
});

describe('buildMapIcons (MW-07 steps 1 and 2)', () => {
  it('lists the contacts in kind-table order with their position, projected pixel and in-world flag', () => {
    const state = testState();
    const friendly = withCraft(state, FRIENDLY, centre(10, 20, 7.5));
    const player = withCraft(state, 0, { x: -46000, y: 0, z: 1 });
    const hidden = withCraft(state, HOSTILE, centre(1, 1));
    const seen = withCraft(state, HOSTILE, centre(30, 40, -2), { mapVisible: true });
    state.entities.allocate(entityInit(20, { position: centre(10, 20) }));
    state.entities.allocate(entityInit(25, { position: centre(10, 21) }));
    void hidden;
    const icons = buildMapIcons(state);
    expect(icons).toEqual([
      { entityId: player.id, kindBit: 0, position: { x: -46000, y: 0, z: 1 }, pixel: { column: -4, row: 200 }, inWorld: false },
      { entityId: friendly.id, kindBit: FRIENDLY, position: centre(10, 20, 7.5), pixel: { column: 10, row: 20 }, inWorld: true },
      { entityId: seen.id, kindBit: HOSTILE, position: centre(30, 40, -2), pixel: { column: 30, row: 40 }, inWorld: true },
    ]);
    expect(Object.isFrozen(icons) && icons.every((icon) => Object.isFrozen(icon) && Object.isFrozen(icon.position) && Object.isFrozen(icon.pixel))).toBe(true);
    // Detached from the entity.
    friendly.position = { x: 0, y: 0, z: 0 };
    expect(icons[1].position).toEqual(centre(10, 20, 7.5));
  });

  it('de-overlaps the projected pixels in list order', () => {
    const state = testState();
    const first = withCraft(state, FRIENDLY, centre(10, 20));
    const second = withCraft(state, 4, centre(10, 20, 1));
    const icons = buildMapIcons(state);
    expect(icons.map(({ entityId, pixel }) => [entityId, pixel])).toEqual([[first.id, point(10, 20)], [second.id, point(13, 23)]]);
  });

  it('is empty without contacts', () => {
    expect(buildMapIcons(testState())).toEqual([]);
  });
});

describe('pickMapIcon (0x4c310)', () => {
  const icon = (entityId: number, column: number, row: number, change: Partial<MapIcon> = {}): MapIcon =>
    ({ entityId, kindBit: FRIENDLY, position: { x: 0, y: 0, z: entityId }, pixel: point(column, row), inWorld: true, ...change });

  it('reaches ±3 pixels on each axis, inclusive, a square', () => {
    for (const [column, row] of [[53, 53], [47, 47], [53, 47], [50, 47]]) expect(pickMapIcon([icon(1, column, row)], point(50, 50))?.entityId).toBe(1);
    for (const [column, row] of [[54, 50], [50, 46], [46, 53]]) expect(pickMapIcon([icon(1, column, row)], point(50, 50))).toBeNull();
  });

  it('takes the least squared distance, the earliest on a tie', () => {
    expect(pickMapIcon([icon(1, 53, 53), icon(2, 52, 50), icon(3, 49, 51)], point(50, 50))?.entityId).toBe(3);
    expect(pickMapIcon([icon(1, 51, 50), icon(2, 50, 51), icon(3, 49, 50)], point(50, 50))?.entityId).toBe(1);
  });

  it('never picks the player\'s icon or one outside the world', () => {
    expect(pickMapIcon([icon(1, 50, 50, { kindBit: 0 }), icon(2, 50, 50, { inWorld: false }), icon(3, 52, 52)], point(50, 50))?.entityId).toBe(3);
    expect(pickMapIcon([icon(1, 50, 50, { kindBit: 0 })], point(50, 50))).toBeNull();
  });

  it('hits icons beyond the last cursor pixel', () => {
    expect(pickMapIcon([icon(1, 400, 400)], point(399, 399))?.entityId).toBe(1);
  });

  it('finds nothing in an empty list', () => {
    expect(pickMapIcon([], point(0, 0))).toBeNull();
  });
});
