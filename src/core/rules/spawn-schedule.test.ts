import { describe, expect, it } from 'vitest';
import { loadMission, type LoadMissionInput, type MissionSetup } from '../mission/load-mission.ts';
import { declaration, missionFrame, rosterContent, ruleInputs, sliceMission, worldInput, type MissionDraft } from '../world/create-world.test-support.ts';
import { checkSetup } from '../world/setup-check.ts';
import type { RandSource } from './original-random.ts';
import { buildSpawnState, isScheduledRecord } from './spawn-schedule.ts';

// Expectations follow Q-01 and Q-04 (docs/original/formats/executable.md#spawn-queue-p3-0203,
// #record-defaults-p3-0203), written out entry by entry.

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

const setupOf = (mission: MissionDraft): MissionSetup => loadMission(worldInput({ mission }) as unknown as LoadMissionInput);

function build(mission: MissionDraft, wingman: number | null, rand: RandSource) {
  const setup = setupOf(mission);
  return buildSpawnState(setup, checkSetup(setup, wingman), { group: 0, wingman }, rand);
}

const entry = (due: number, source: 'record' | 'group' | 'wingman', index: number, requests: number) => ({ due, source, index, requests });

/**
 * Records: 0 the player at 10 s; 1 kind bit 7 at 5 s; 2 kind bit 7 at 0 s with requests 0xffffffff; 3 kind bit 8 at
 * 5 s; 4 a kind-0 template at 0 s; 5 a member; 6 a template reachable only through group 1, at 1 s; 7 its member.
 * Group 1's request count is 0xffffffff.
 */
function orderingMission(): MissionDraft {
  const mission = missionFrame();
  mission.declarations = [
    declaration(0, { craftType: 0, spawnTime: 10 }),
    declaration(1, { craftType: 7, spawnTime: 5 }),
    declaration(2, { craftType: 7, ruleInputs: ruleInputs({ craftCount: 0xffffffff }) }),
    declaration(3, { craftType: 8, spawnTime: 5 }),
    declaration(4, { origins: ['object', 'group-template'] }),
    declaration(5, { origins: ['object', 'group-member'], craftType: 7, memberOf: 0, spawnTime: 2 }),
    declaration(6, { origins: ['group-template'], spawnTime: 1, ruleInputs: ruleInputs({ percentA: 100, aiValueB: -9 }) }),
    declaration(7, { origins: ['group-member'], craftType: 8, memberOf: 1 }),
  ];
  mission.groups = [
    { template: 4, members: [5], spawnCount: 1, layout: [{ x: 0, y: 0, z: 0 }] },
    { template: 6, members: [7], spawnCount: 0xffffffff, layout: [{ x: 0, y: 0, z: 0 }] },
  ];
  return mission;
}

describe('spawn scheduling (P3-02 AC-05, Q-01, Q-06)', () => {
  it('queues the slice-shaped mission as the instantiation list orders it', () => {
    expect(build(sliceMission(), null, scripted(Array(9).fill(0))).queue).toEqual([
      entry(0, 'record', 0, 1),
      entry(0, 'record', 3, 2),
      entry(0, 'record', 7, 4),
      entry(0, 'record', 8, 35),
      entry(0, 'group', 0, 2),
      entry(0, 'group', 1, 2),
      entry(19200, 'group', 2, 3),
    ]);
    expect(build(sliceMission(), 2, scripted(Array(9).fill(0))).queue.slice(0, 3)).toEqual([entry(0, 'record', 0, 1), entry(0, 'wingman', 2, 1), entry(0, 'record', 3, 2)]);
  });

  it('fires in ascending due order, insertion order among equal ones: records, the wingman after the player, then groups', () => {
    const state = build(orderingMission(), 1, scripted(Array(7).fill(0)));
    expect(state.queue).toEqual([
      entry(0, 'wingman', 1, 1),
      entry(0, 'record', 2, -1),
      entry(0, 'group', 0, 1),
      entry(64, 'group', 1, -1),
      entry(320, 'record', 1, 1),
      entry(320, 'record', 3, 1),
      entry(640, 'record', 0, 1),
    ]);
    expect(Object.isFrozen(state.queue[0])).toBe(true);
  });

  it('schedules a record by itself only with a kind and outside every group', () => {
    const setup = setupOf(orderingMission());
    expect(setup.declarations.map(isScheduledRecord)).toEqual([true, true, true, true, false, false, false, false]);
  });

  it('fills every section-1 record in array order, the wingman right after the player, and no other record', () => {
    // rand r gives +0x78 = r % 60 + 20: here 20, 21, … in draw order.
    const rand = scripted([60, 61, 62, 63, 64, 65, 66]);
    const state = build(orderingMission(), 1, rand);
    expect(rand.used).toBe(7);
    const filled = (aiValueC: number) => ({ percentA: 100, craftCount: 1, percentB: 100, percentC: 100, percentD: 100, aiValueA: 3, aiValueB: 3, aiValueC });
    expect(state.records.map(({ ruleInputs: inputs }) => inputs)).toEqual([
      filled(20),
      filled(22),
      { ...filled(23), craftCount: -1 },
      filled(24),
      filled(25),
      filled(26),
      { percentA: 100, craftCount: 0, percentB: 0, percentC: 0, percentD: 0, aiValueA: 0, aiValueB: -9, aiValueC: 0 },
      { percentA: 0, craftCount: 0, percentB: 0, percentC: 0, percentD: 0, aiValueA: 0, aiValueB: 0, aiValueC: 0 },
    ]);
    expect(state.wingman?.ruleInputs).toEqual(filled(21));
  });

  it('anchors the wingman on the player record, keeps its position as stored and starts every counter at 0', () => {
    const mission = orderingMission();
    const roster = rosterContent();
    roster.options[1].position = { x: 1.5, y: -2.25, z: 1000 };
    const setup = loadMission(worldInput({ mission, roster }) as unknown as LoadMissionInput);
    const state = buildSpawnState(setup, checkSetup(setup, 1), { group: 0, wingman: 1 }, scripted(Array(7).fill(0)));
    expect(state.wingman).toMatchObject({
      declaration: { collection: 'wingman', index: 1 },
      position: { x: 1.5, y: -2.25, z: 1000 },
      region: null,
      anchor: 0,
      spawnCount: 0,
    });
    expect(state.records.map(({ spawnCount }) => spawnCount)).toEqual(Array(8).fill(0));
    expect(state.groups.map(({ spawnCount, leader }) => [spawnCount, leader])).toEqual([[0, null], [0, null]]);
    expect(state.enabled).toBe(true);
  });

  it('gives the mission default (group + 3) × slot and keeps a pool counter per pool name', () => {
    const mission = sliceMission();
    const setup = setupOf(mission);
    const state = buildSpawnState(setup, checkSetup(setup, null), { group: 2, wingman: null }, scripted(Array(9).fill(0)));
    expect(state.records[1].ruleInputs).toMatchObject({ aiValueA: 5, aiValueB: 5 });
    expect(state.namePoolUses).toEqual([0, 0]);
    expect(state.wingman).toBeNull();
  });
});
