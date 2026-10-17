import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../contracts/domain-events.ts';
import type { CommunicationsRuleData } from '../world/comm-input.ts';
import { EntityTable, type Entity, type EntityInit } from '../world/entity-table.ts';
import type { MenuItem } from '../world/player-state.ts';
import { entityInit, expectFault } from '../world/world.test-support.ts';
import { buildCategoryMenu, buildCommandMenu, buildObjectList, commandTable, matchItem, nearMenuGate, type NearMenuView } from './comm-menus.ts';

// Expectations written out from comm.md §7.2–§7.5 and executable.md CD5, not from the builders.

type Menus = CommunicationsRuleData['menus'];

const key = (character: string): number => character.charCodeAt(0);
const at = (x: number, y = 0, z = 0): Vec3 => ({ x, y, z });

/** TABL 2007 with a category of kind bits 1 and 7, one of the bases' bit 17, one of bit 18 and the exit `X`. */
const MENUS: Menus = Object.freeze({
  categories: [{ key: key('a'), kindMask: 0x82 }, { key: key('b'), kindMask: 0x20000 }, { key: key('c'), kindMask: 0x40000 }, { key: key('X'), kindMask: 0 }],
  objectListExitKey: key('x'),
  commands: {
    gated: [{ key: key('1'), code: 7 }, { key: key('2'), code: 9 }, { key: key('X'), code: 0 }],
    other: [{ key: key('1'), code: 7 }, { key: key('x'), code: 0 }],
    kind2: [{ key: key('3'), code: 3 }, { key: key('x'), code: 0 }],
  },
});

/** An entity of `kindBit` in state 7 unless `overrides` say otherwise. */
function add(table: EntityTable, kindBit: number, overrides: Partial<EntityInit> = {}): Entity {
  const entity = table.allocate(entityInit(kindBit, overrides));
  entity.state = 'active';
  return entity;
}

const NEAR: NearMenuView = Object.freeze({ position: at(0), viewMode: 0x0c, flow: Object.freeze({ mainState: 3, subState: 0 }) });

describe('key matching (0x27e10)', () => {
  const items: MenuItem<number>[] = [
    { key: key('1'), value: 10 },
    { key: key('A'), value: 11 },
    { key: key('1'), value: 12 },
    { key: key('x'), value: { type: 'exit' } },
    { key: key('X'), value: 13 },
  ];

  it('takes the first item whose key equals the key, both folded A–Z to a–z only', () => {
    expect(matchItem(items, key('1'))?.value).toBe(10);
    expect(matchItem(items, key('a'))?.value).toBe(11);
    expect(matchItem(items, key('A'))?.value).toBe(11);
    expect(matchItem(items, key('X'))?.value).toEqual({ type: 'exit' });
    // Only A–Z fold: '!' (0x21) is not '1' (0x31), and nothing else matches.
    expect(matchItem(items, key('!'))).toBeUndefined();
    expect(matchItem(items, key('2'))).toBeUndefined();
    expect(matchItem([], key('1'))).toBeUndefined();
  });
});

describe('the object list (0x2c9d0)', () => {
  it('lists the mask\'s entities in state 7 or above by kind bit, then allocation, whatever their activity or destroyed flag', () => {
    const table = new EntityTable();
    const late = add(table, 7);
    const parked = add(table, 1, { activity: 'parked' });
    const notReady = table.allocate(entityInit(1));
    const hit = add(table, 1);
    hit.state = 'projectile-hit';
    const docked = add(table, 7);
    docked.activity = 'docked';
    docked.destroyed = true;
    add(table, 2);
    const leaving = add(table, 7);
    leaving.state = 'pending-removal';
    const list = buildObjectList(table, MENUS, 0x82)!;
    expect(notReady.state).toBe('presentation-ready');
    expect(list.level).toBe(3);
    expect(list.table).toBe('objects');
    expect(list.items.map(({ key: itemKey, value }) => [String.fromCharCode(itemKey), value.type === 'object' ? value.entityId : value.type]))
      .toEqual([['1', parked.id], ['2', hit.id], ['3', late.id], ['4', docked.id], ['x', 'exit']]);
  });

  it('takes the kind, name and tone at build time: active, otherwise threatened while stamped, otherwise other', () => {
    const table = new EntityTable();
    const active = add(table, 17, { name: { type: 'pool', index: 1 } });
    active.communications.threatStamp = 40;
    const stamped = add(table, 17, { activity: 'parked' });
    stamped.communications.threatStamp = 40;
    const quiet = add(table, 17, { activity: 'parked' });
    const list = buildObjectList(table, MENUS, 0x20000)!;
    expect(list.items.slice(0, 3).map(({ value }) => value)).toEqual([
      { type: 'object', entityId: active.id, kindBit: 17, name: { type: 'pool', index: 1 }, tone: 'active' },
      { type: 'object', entityId: stamped.id, kindBit: 17, name: { type: 'none' }, tone: 'threatened' },
      { type: 'object', entityId: quiet.id, kindBit: 17, name: { type: 'none' }, tone: 'other' },
    ]);
    active.communications.threatStamp = null;
    expect(list.items[0].value).toMatchObject({ tone: 'active' });
  });

  it('is no list without an entity, and a tenth item breaks world creation\'s bound', () => {
    const table = new EntityTable();
    expect(buildObjectList(table, MENUS, 0x82)).toBeNull();
    add(table, 1, { activity: 'parked' }).state = 'new';
    expect(buildObjectList(table, MENUS, 0x82)).toBeNull();
    for (let count = 0; count < 9; count++) add(table, 7);
    expect(buildObjectList(table, MENUS, 0x80)!.items.at(-2)!.key).toBe(key('9'));
    add(table, 7);
    expectFault(() => buildObjectList(table, MENUS, 0x80), 'invariant-violated', 'comm-menus.object-keys');
  });
});

describe('the category menu (0x2c850)', () => {
  it('shows the categories with objects, keyed by their position among the shown, and the exit with its data key', () => {
    const table = new EntityTable();
    add(table, 18);
    add(table, 7);
    const menu = buildCategoryMenu(table, MENUS)!;
    expect(menu.level).toBe(2);
    expect(menu.items).toEqual([
      { key: key('1'), value: { type: 'category', source: 0, kindMask: 0x82 } },
      { key: key('2'), value: { type: 'category', source: 2, kindMask: 0x40000 } },
      { key: key('X'), value: { type: 'exit' } },
    ]);
  });

  it('is a menu with one category and the exit, and none with only the exit', () => {
    const table = new EntityTable();
    expect(buildCategoryMenu(table, MENUS)).toBeNull();
    add(table, 7).state = 'area-switch';
    expect(buildCategoryMenu(table, MENUS)).toBeNull();
    add(table, 17);
    expect(buildCategoryMenu(table, MENUS)!.items.map(({ value }) => value)).toEqual([{ type: 'category', source: 1, kindMask: 0x20000 }, { type: 'exit' }]);
  });
});

describe('the near-menu gate and the command table (0x2cbb4, CD5)', () => {
  it('needs a view other than 0 and 1, an active object, a squared distance of at most 1,000,000 and sub-state 0', () => {
    const table = new EntityTable();
    const base = add(table, 17, { position: at(1000) });
    expect(nearMenuGate(base, NEAR)).toBe(true);
    expect(nearMenuGate(base, { ...NEAR, viewMode: 0 })).toBe(false);
    expect(nearMenuGate(base, { ...NEAR, viewMode: 1 })).toBe(false);
    expect(nearMenuGate(base, { ...NEAR, viewMode: 6 })).toBe(true);
    expect(nearMenuGate(base, { ...NEAR, flow: { mainState: 3, subState: 3 } })).toBe(false);
    expect(nearMenuGate(base, { ...NEAR, flow: { mainState: 3, subState: 5 } })).toBe(false);
    // 1000.0000610… is the next f32 above 1000: its square exceeds the constant.
    base.position = at(Math.fround(1000.0001));
    expect(nearMenuGate(base, NEAR)).toBe(false);
    // 600² + 800² = 1,000,000 across two axes; the player's position is the other end.
    base.position = at(600, -800, 5);
    expect(nearMenuGate(base, { ...NEAR, position: at(0, 0, 5) })).toBe(true);
    base.activity = 'docked';
    expect(nearMenuGate(base, { ...NEAR, position: at(0, 0, 5) })).toBe(false);
  });

  it('chooses TABL 2013 for kind 2, TABL 2003 for a gated base and TABL 2005 for everything else', () => {
    const table = new EntityTable();
    const wingman = add(table, 1, { position: at(5000) });
    const near = add(table, 17, { position: at(10) });
    const farBase = add(table, 15, { position: at(1001) });
    const parkedBase = add(table, 18, { activity: 'parked', position: at(10) });
    const craft = add(table, 7, { position: at(10) });
    expect([wingman, near, farBase, parkedBase, craft].map((entity) => commandTable(entity, NEAR))).toEqual(['kind2', 'gated', 'other', 'other', 'other']);
    expect(commandTable(near, { ...NEAR, flow: { mainState: 3, subState: 4 } })).toBe('other');
  });

  it('builds the chosen table\'s items with their data keys, sources and exit, and fails for an object that no longer resolves', () => {
    const table = new EntityTable();
    const base = add(table, 17, { position: at(10) });
    expect(buildCommandMenu(table, MENUS, base.id, NEAR)).toEqual({
      level: 4,
      table: 'gated',
      items: [
        { key: key('1'), value: { type: 'command', source: 0, code: 7 } },
        { key: key('2'), value: { type: 'command', source: 1, code: 9 } },
        { key: key('X'), value: { type: 'exit' } },
      ],
    });
    expect(buildCommandMenu(table, MENUS, base.id + 1, NEAR)).toBeNull();
  });
});
