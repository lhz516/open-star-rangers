import { describe, expect, it } from 'vitest';
import { loadMission, type LoadMissionInput, type MissionSetup } from '../mission/load-mission.ts';
import { declaration, MARKER, missionFrame, rosterContent, ruleInputs, wingmanOption, worldInput } from '../world/create-world.test-support.ts';
import { EntityTable, type NameReference } from '../world/entity-table.ts';
import { entityInit, expectFault } from '../world/world.test-support.ts';
import { assignName } from './name-assignment.ts';
import type { RandSource } from './original-random.ts';

// Expectations follow Q-05 (docs/original/formats/executable.md#names-p3-0203), branch by branch.

const A = `${MARKER}-alpha`;
const B = `${MARKER}-bravo`;
const C = `${MARKER}-charlie`;
const POOL = [0, 1, 2].map((index) => `${MARKER}-pool-${index}`);

/**
 * Records: 0 the player; 1 kind bit 17 with candidates A, B (check mask 0x68000); 2 kind bit 7 with A, C (mask 0x87c);
 * 3 kind bit 25 without candidates; 4 kind bit 18 without; 5 kind bit 7 without; 6 kind bit 14 with A; 7 kind bit 13;
 * 8 kind bit 15 with the text of pool name 1. The wingman option has the candidate W.
 */
function namesSetup(namePool: readonly string[] = POOL): MissionSetup {
  const mission = missionFrame();
  mission.namePool = [...namePool];
  mission.declarations = [
    declaration(0, { craftType: 0 }),
    declaration(1, { craftType: 17, nameCandidates: [A, B] }),
    declaration(2, { craftType: 7, nameCandidates: [A, C] }),
    declaration(3, { craftType: 25 }),
    declaration(4, { craftType: 18 }),
    declaration(5, { craftType: 7 }),
    declaration(6, { craftType: 14, nameCandidates: [A] }),
    declaration(7, { craftType: 13 }),
    declaration(8, { craftType: 15, nameCandidates: [POOL[1]] }),
  ];
  const roster = rosterContent(0);
  roster.options = [wingmanOption(0, { nameCandidates: [`${MARKER}-w`], ruleInputs: ruleInputs() })];
  return loadMission(worldInput({ mission, roster }) as unknown as LoadMissionInput);
}

function scripted(values: readonly number[]): RandSource & { readonly used: number } {
  let used = 0;
  return {
    next() {
      if (used >= values.length) throw new Error('drew more rand values than scripted');
      return values[used++];
    },
    get used() {
      return used;
    },
  };
}

const candidate = (collection: 'mission' | 'wingman', index: number, which: number): NameReference => ({ type: 'candidate', declaration: { collection, index }, candidate: which });
const record = (index: number, kindBit: number) => ({ declaration: { collection: 'mission' as const, index }, kindBit });

/** Names an entity of `kindBit` holding `name`. */
function holder(table: EntityTable, kindBit: number, name: NameReference) {
  return table.allocate(entityInit(kindBit, { name }));
}

describe('name assignment (P3-02 AC-07, Q-05)', () => {
  it('gives kinds in 0x6001 the craft type name, candidates or not, without drawing', () => {
    const setup = namesSetup();
    const rand = scripted([]);
    for (const [index, kindBit] of [[0, 0], [6, 14], [7, 13]]) {
      expect(assignName(setup, new EntityTable(), [0, 0, 0], record(index, kindBit), rand)).toEqual({ type: 'craft-type', kindBit });
    }
    expect(rand.used).toBe(0);
  });

  it('takes the first candidate no entity of the check mask holds', () => {
    const setup = namesSetup();
    const table = new EntityTable();
    expect(assignName(setup, table, [0, 0, 0], record(1, 17), scripted([]))).toEqual(candidate('mission', 1, 0));
    holder(table, 17, candidate('mission', 1, 0));
    expect(assignName(setup, table, [0, 0, 0], record(1, 17), scripted([]))).toEqual(candidate('mission', 1, 1));
  });

  it('checks mask 0x68000 (kind bits 15, 17, 18) for kinds in 0x78000', () => {
    const setup = namesSetup();
    for (const kindBit of [7, 14, 2]) {
      const table = new EntityTable();
      holder(table, kindBit, candidate('mission', 2, 0));
      expect(assignName(setup, table, [0, 0, 0], record(1, 17), scripted([]))).toEqual(candidate('mission', 1, 0));
    }
    for (const kindBit of [15, 17, 18]) {
      const table = new EntityTable();
      holder(table, kindBit, candidate('mission', 2, 0));
      expect(assignName(setup, table, [0, 0, 0], record(1, 17), scripted([]))).toEqual(candidate('mission', 1, 1));
    }
  });

  it('checks mask 0x87c (kind bits 2–6, 11) for other kinds, the wingman included', () => {
    const setup = namesSetup();
    const outside = new EntityTable();
    holder(outside, 17, candidate('mission', 1, 0));
    holder(outside, 7, candidate('mission', 1, 0));
    expect(assignName(setup, outside, [0, 0, 0], record(2, 7), scripted([]))).toEqual(candidate('mission', 2, 0));
    for (const kindBit of [2, 6, 11]) {
      const inside = new EntityTable();
      holder(inside, kindBit, candidate('mission', 1, 0));
      expect(assignName(setup, inside, [0, 0, 0], record(2, 7), scripted([]))).toEqual(candidate('mission', 2, 1));
    }
    const wingmanTable = new EntityTable();
    holder(wingmanTable, 1, candidate('wingman', 0, 0));
    holder(wingmanTable, 17, candidate('wingman', 0, 0));
    expect(assignName(setup, wingmanTable, [0, 0, 0], { declaration: { collection: 'wingman', index: 0 }, kindBit: 1 }, scripted([]))).toEqual(candidate('wingman', 0, 0));
  });

  it('compares texts: an equal candidate of another record or an equal pool name holds a candidate', () => {
    const setup = namesSetup();
    const table = new EntityTable();
    holder(table, 18, candidate('mission', 2, 0));
    expect(assignName(setup, table, [0, 0, 0], record(1, 17), scripted([]))).toEqual(candidate('mission', 1, 1));
    const pooled = new EntityTable();
    holder(pooled, 17, { type: 'pool', index: 1 });
    const rand = scripted([4]);
    // Its only candidate is held, the pool is not empty: rand % 1 picks candidate 0 again.
    expect(assignName(setup, pooled, [0, 0, 0], record(8, 15), rand)).toEqual(candidate('mission', 8, 0));
    expect(rand.used).toBe(1);
  });

  it('counts a holder whatever its state, and frees the candidate once it is removed', () => {
    const setup = namesSetup();
    const table = new EntityTable();
    const held = holder(table, 17, candidate('mission', 1, 0));
    held.state = 'pending-removal';
    held.destroyed = true;
    expect(assignName(setup, table, [0, 0, 0], record(1, 17), scripted([]))).toEqual(candidate('mission', 1, 1));
    table.remove(held);
    expect(assignName(setup, table, [0, 0, 0], record(1, 17), scripted([]))).toEqual(candidate('mission', 1, 0));
  });

  it('when every candidate is held, draws a duplicate (rand % count) with a pool and gives none without one', () => {
    const fill = (table: EntityTable) => {
      holder(table, 17, candidate('mission', 1, 0));
      holder(table, 17, candidate('mission', 1, 1));
      return table;
    };
    const rand = scripted([5]);
    expect(assignName(namesSetup(), fill(new EntityTable()), [0, 0, 0], record(1, 17), rand)).toEqual(candidate('mission', 1, 1));
    expect(rand.used).toBe(1);
    const noPool = scripted([]);
    expect(assignName(namesSetup([]), fill(new EntityTable()), [], record(1, 17), noPool)).toEqual({ type: 'none' });
    expect(noPool.used).toBe(0);
  });

  it('without candidates: the craft type name in 0x93780, none in 0x78000, the craft type name when the pool is empty', () => {
    const rand = scripted([]);
    expect(assignName(namesSetup(), new EntityTable(), [0, 0, 0], record(5, 7), rand)).toEqual({ type: 'craft-type', kindBit: 7 });
    expect(assignName(namesSetup(), new EntityTable(), [0, 0, 0], record(4, 18), rand)).toEqual({ type: 'none' });
    expect(assignName(namesSetup([]), new EntityTable(), [], record(3, 25), rand)).toEqual({ type: 'craft-type', kindBit: 25 });
    expect(rand.used).toBe(0);
  });

  it('takes the pool from rand % count, the first unused name cycling forward, and resets when all are used', () => {
    const setup = namesSetup();
    const uses = [0, 0, 0];
    const rand = scripted([4, 1, 2, 5, 3]);
    const next = () => assignName(setup, new EntityTable(), uses, record(3, 25), rand);
    expect(next()).toEqual({ type: 'pool', index: 1 });
    expect(uses).toEqual([0, 1, 0]);
    expect(next()).toEqual({ type: 'pool', index: 2 });
    expect(next()).toEqual({ type: 'pool', index: 0 });
    expect(uses).toEqual([1, 1, 1]);
    // Start 2: every name used, so all reset and the start is taken.
    expect(next()).toEqual({ type: 'pool', index: 2 });
    expect(uses).toEqual([0, 0, 1]);
    expect(next()).toEqual({ type: 'pool', index: 0 });
    expect(uses).toEqual([1, 0, 1]);
    expect(rand.used).toBe(5);
  });

  it('never meets a craft type name in a check mask; one there is a broken invariant', () => {
    const table = new EntityTable();
    holder(table, 17, { type: 'craft-type', kindBit: 17 });
    expectFault(() => assignName(namesSetup(), table, [0, 0, 0], record(1, 17), scripted([])), 'invariant-violated', 'names.craft-type-text');
  });
});
