import { describe, expect, it } from 'vitest';
import { ContentContractError } from '../../content/contract-validation.ts';
import { deepFrozen } from '../../content/logic/logic-content.test-support.ts';
import { syntheticIdentity } from '../../content/synthetic-content.test-support.ts';
import { nextRandom } from '../determinism/rng.ts';
import { CoreInputError } from '../errors.ts';
import { loadMission } from '../mission/load-mission.ts';
import { createWorld, initialWorldState, instantiableModelIds } from './create-world.ts';
import { MARKER as CRAFT_INFO_MARKER } from '../../content/rule-data/rule-data.test-support.ts';
import {
  asCreateInput, craftInfoContent, craftTypesContent, declaration, eventMission, mapGeometryContent, MARKER, menuText, missionFrame, modelOf,
  originalImportIdentity, playerOnlyMission, reversedKeys, ruleInputs, sliceMission, transponderBinding, worldInput, type CraftInfoDraft, type MissionDraft,
  type RosterDraft,
  type WorldInputParts,
} from './create-world.test-support.ts';
import { setupHash } from './setup-hash.ts';
import { constructWorld } from './world.ts';
import { stateText, thrownBy, tickInput } from './world.test-support.ts';

const MISSION = 'input.mission.content';
const ROSTER = 'input.wingmanRoster.content';
const CRAFT_INFO = 'input.craftInfo.content';
const SEED = 0x1234_5678;

const create = (parts: WorldInputParts = {}) => initialWorldState(asCreateInput(worldInput(parts)));

/** The craft info content after `change`. */
function craftInfoWithContent(change: (info: CraftInfoDraft) => void): CraftInfoDraft {
  const info = craftInfoContent();
  change(info);
  return info;
}

/** Creation input whose craft info content `change` changed, with other `parts`. */
const craftInfoWith = (change: (info: CraftInfoDraft) => void, parts: WorldInputParts = {}) =>
  worldInput({ ...parts, craftInfo: craftInfoWithContent(change) });

/** Asserts that creation throws a CoreInputError at `path` whose message names no imported value. */
function expectRejected(input: unknown, path: string, reason?: string, values: readonly string[] = []): CoreInputError {
  const error = thrownBy(() => createWorld(asCreateInput(input)));
  expect(error).toBeInstanceOf(CoreInputError);
  const { message } = error as CoreInputError;
  expect(error).toMatchObject({ path });
  if (reason !== undefined) expect((error as CoreInputError).reason).toContain(reason);
  expect(message).not.toContain(MARKER);
  expect(message).not.toContain(CRAFT_INFO_MARKER);
  for (const value of values) expect(message).not.toContain(value);
  return error as CoreInputError;
}

/** The slice-shaped mission after `change`. */
function sliceWith(change: (mission: MissionDraft) => void): MissionDraft {
  const mission = sliceMission();
  change(mission);
  return mission;
}

describe('world creation (P3-02 AC-02, 运行配置与世界创建)', () => {
  it('starts P3-11\'s flow in main state 3, sub-state 0, with nothing pending, and one zero counter set per section-2 trigger (ME-03, ME-04)', () => {
    const flow = {
      mainState: 3, subState: 0, dockingDeadline: 0, beaconDeadline: 0, settlementDeadline: 0, rescues: 0,
      wingmanLoss: { pending: false, dueClock: 0 }, settlement: null, result: null, completedTick: null,
    };
    const plain = create();
    expect(plain.flow).toEqual(flow);
    expect(plain.missionEvents).toEqual({ triggers: [] });
    const events = create({ mission: eventMission() });
    expect(events.flow).toEqual(flow);
    expect(events.missionEvents).toEqual({ triggers: [{ instantiated: 0, destroyed: 0, left: 0 }, { instantiated: 0, destroyed: 0, left: 0 }] });
    // Each trigger has its own counters.
    expect(events.missionEvents.triggers[0]).not.toBe(events.missionEvents.triggers[1]);
  });

  it('builds tick 0: clock 0, no entities, view mode 0xC, mission built, the queue ready and the run configuration in effect', () => {
    const state = create();
    expect(state).toMatchObject({ tick: 0, clock: 0, missionStatus: 'built', player: { entityId: null, viewMode: 0xc, previousViewMode: 0xc, subMode: 0 } });
    expect(state.entities.size).toBe(0);
    expect(state.entities.nextId).toBe(1);
    expect(state.spawn.enabled).toBe(true);
    expect(state.spawn.queue).toHaveLength(7);
    expect(state.config).toEqual({
      content: syntheticIdentity(),
      mission: 'mission/first-campaign',
      setupHash: expect.stringMatching(/^[0-9a-f]{16}$/),
      group: 0,
      slot: 1,
      rawDifficulty: 19,
      wingman: null,
      seed: SEED,
      clockUnitsPerTick: 2,
    });
    const world = constructWorld(state);
    expect(world.projection()).toMatchObject({ clock: { tick: 0, clock: 0, clockUnitsPerTick: 2 }, player: { entityId: null, viewMode: 0xc } });
    expect(world.renderState()).toEqual({ tick: 0, clock: 0, viewMode: 0xc, observedEntityId: null, entities: [], warp: null });
  });

  it('draws only the +0x78 defaults: 8 of the 9 section-1 records, 9 with a wingman', () => {
    let rng = SEED;
    const after: number[] = [rng];
    for (let draw = 0; draw < 9; draw++) after.push((rng = nextRandom(rng).state));
    expect(create().rngState).toBe(after[8]);
    expect(create({ run: { wingman: 3 } }).rngState).toBe(after[9]);
  });

  it('creates equal worlds from equal input, and no world shares state with its input or another world', () => {
    const input = worldInput({ run: { wingman: 1 } });
    const first = initialWorldState(asCreateInput(input));
    const second = initialWorldState(asCreateInput(input));
    const before = stateText(first);
    expect(stateText(second)).toBe(before);
    (input.run as Record<string, unknown>).seed = 7;
    const mission = input.mission.content as MissionDraft;
    mission.declarations[0].position.x = 999;
    mission.declarations[7].nameCandidates[0] = 'changed';
    mission.groups[0].layout[1].x = 9;
    (input.wingmanRoster.content as RosterDraft).options[1].ruleInputs.aiValueA = 77;
    (input.craftInfo.content as CraftInfoDraft).craft[7].atB8 = 1;
    expect(stateText(first)).toBe(before);
    // So is the craft info.
    expect(first.craftInfo.content.craft[7].atB8).toBe(64);
    expect(deepFrozen(first.craftInfo)).toBe(true);
    expect(first.craftInfo).not.toBe(second.craftInfo);
    // The static setup is the world's own frozen copy: names and coordinates stay as read.
    expect(first.setup.declarations[7].nameCandidates[0]).toBe(`${MARKER}-base-0`);
    expect(first.setup.declarations[0].position.x).toBe(0);
    expect(first.setup.groups[0].layout[1].x).toBe(250);
    expect(deepFrozen(first.setup)).toBe(true);
    expect(first.setup).not.toBe(second.setup);
    expect(first.spawn.records[0]).not.toBe(second.spawn.records[0]);
    constructWorld(second).step(tickInput());
    expect(stateText(first)).toBe(before);
    const fresh = initialWorldState(asCreateInput(worldInput({ run: { wingman: 1 } })));
    expect(constructWorld(first).step(tickInput())).toEqual(constructWorld(fresh).step(tickInput()));
    expect(stateText(first)).toBe(stateText(fresh));
  });
});

describe('world creation input structure (P3-02 AC-02)', () => {
  it.each([
    ['not an object', () => 5, 'input'],
    ['missing its run', () => ({ ...worldInput(), run: undefined }), 'input.run'],
    ['with an unknown field', () => ({ ...worldInput(), extra: 1 }), 'input'],
  ])('rejects input %s', (_, input, path) => {
    expect(thrownBy(() => createWorld(asCreateInput(input())))).toMatchObject({ name: 'CoreInputError', path });
  });

  it('passes the content readers\' ContentContractError through, aliases that do not match included', () => {
    const malformed = worldInput();
    (malformed.mission.content as MissionDraft).declarations[3].position.x = Number.NaN;
    expect(thrownBy(() => createWorld(asCreateInput(malformed)))).toMatchObject({ name: 'ContentContractError', path: `${MISSION}.declarations[3].position.x` });
    const alias = worldInput({ mission: sliceWith((mission) => void (mission.declarations[4].origins = ['object'])) });
    const error = thrownBy(() => createWorld(asCreateInput(alias)));
    expect(error).toBeInstanceOf(ContentContractError);
    expect(error).toMatchObject({ code: 'logic-reference-mismatch' });
  });

  it('passes loadMission\'s cross-Asset CoreInputError through', () => {
    const input = worldInput();
    input.craftTypes.id = 'data/other-table' as typeof input.craftTypes.id;
    expectRejected(input, 'input.craftTypes.id');
  });

  it('keeps ContentContractError for a malformed identity', () => {
    const error = thrownBy(() => createWorld(asCreateInput(worldInput({ identity: syntheticIdentity({ origin: { type: 'other' } }) }))));
    expect(error).toBeInstanceOf(ContentContractError);
    expect(error).toMatchObject({ path: 'input.identity.origin.type' });
  });
});

describe('instantiable model IDs (P3-07 CR-01)', () => {
  const modelSet = ({ mission, craftTypes, wingmanRoster, identity, run }: ReturnType<typeof worldInput>) =>
    instantiableModelIds(asCreateInput({ mission, craftTypes, wingmanRoster, identity, run }));

  it('are the models world creation takes, once each in ascending order, and depend on the wingman', () => {
    for (const wingman of [null, 0]) {
      const input = worldInput({ run: { wingman } });
      const ids = modelSet(input);
      expect(ids).toEqual((input.models as { readonly id: string }[]).map(({ id }) => id));
      expect(Object.isFrozen(ids)).toBe(true);
      expect((ids as readonly string[]).includes(modelOf(1)), String(wingman)).toBe(wingman !== null);
      expect(() => createWorld(asCreateInput(input))).not.toThrow();
    }
    expect(modelSet(worldInput())).toEqual([0, 7, 8, 14, 17].map(modelOf).sort());
  });

  it('throw what creation throws for the fields they read, and reject any other field', () => {
    const input = worldInput({ run: { wingman: 5 } });
    expect(thrownBy(() => modelSet(input))).toMatchObject({ name: 'CoreInputError', path: 'input.run.wingman' });
    expectRejected(input, 'input.run.wingman');
    expect(thrownBy(() => instantiableModelIds(asCreateInput(worldInput())))).toMatchObject({ name: 'CoreInputError', path: 'input' });
  });
});

describe('run configuration (P3-02 AC-02)', () => {
  it.each([
    [{ rawDifficulty: 101 }, 'input.run.rawDifficulty'],
    [{ rawDifficulty: -1 }, 'input.run.rawDifficulty'],
    [{ rawDifficulty: 1.5 }, 'input.run.rawDifficulty'],
    [{ rawDifficulty: '19' }, 'input.run.rawDifficulty'],
    [{ rawDifficulty: 34 }, 'input.run.rawDifficulty'],
    [{ wingman: 5 }, 'input.run.wingman'],
    [{ wingman: -1 }, 'input.run.wingman'],
    [{ wingman: 0.5 }, 'input.run.wingman'],
    [{ wingman: '0' }, 'input.run.wingman'],
    [{ seed: 2 ** 32 }, 'input.run.seed'],
    [{ seed: -1 }, 'input.run.seed'],
    [{ seed: 1.5 }, 'input.run.seed'],
    [{ clockUnitsPerTick: 3 }, 'input.run.clockUnitsPerTick'],
    [{ clockUnitsPerTick: 0 }, 'input.run.clockUnitsPerTick'],
    [{ clockUnitsPerTick: -2 }, 'input.run.clockUnitsPerTick'],
    [{ clockUnitsPerTick: 2 ** 53 }, 'input.run.clockUnitsPerTick'],
    [{ clockUnitsPerTick: undefined }, 'input.run.clockUnitsPerTick'],
    [{ extra: 1 }, 'input.run'],
  ])('rejects %j at %s', (run, path) => {
    expectRejected(worldInput({ run }), path);
  });

  it('requires rawDifficulty, wingman and seed', () => {
    for (const field of ['rawDifficulty', 'wingman', 'seed'] as const) {
      const input = worldInput();
      delete (input.run as Record<string, unknown>)[field];
      expectRejected(input, `input.run.${field}`, 'is required');
    }
  });

  it('accepts the bounds and applies the default step', () => {
    expect(create({ run: { rawDifficulty: 0, wingman: 4, seed: 0xffffffff } }).config).toMatchObject({ rawDifficulty: 0, wingman: 4, seed: 0xffffffff, clockUnitsPerTick: 2 });
    expect(create({ run: { rawDifficulty: 33, seed: 0, clockUnitsPerTick: 4 } }).config).toMatchObject({ rawDifficulty: 33, group: 0, seed: 0, clockUnitsPerTick: 4 });
  });
});

describe('original-import and synthetic range gates (P3-02 AC-02)', () => {
  const imported = (run: Record<string, unknown> = {}) => worldInput({ identity: originalImportIdentity(), run });

  it('runs original-import content only as the slice: difficulty 19, the production mission and the default step', () => {
    expect(initialWorldState(asCreateInput(imported())).config.content.origin.type).toBe('original-import');
    expect(initialWorldState(asCreateInput(imported({ clockUnitsPerTick: 2 }))).config.clockUnitsPerTick).toBe(2);
    expectRejected(imported({ rawDifficulty: 20 }), 'input.run.rawDifficulty', 'must be 19');
    expectRejected(imported({ clockUnitsPerTick: 4 }), 'input.run.clockUnitsPerTick', 'must be the default');
    const other = imported();
    other.mission.id = 'mission/other-mission' as typeof other.mission.id;
    expectRejected(other, 'input.mission.id', 'production slice mission');
  });

  it('lets synthetic content use other difficulties of the group, other steps and other mission Assets', () => {
    const input = worldInput({ run: { rawDifficulty: 20, clockUnitsPerTick: 4 } });
    input.mission.id = 'mission/other-mission' as typeof input.mission.id;
    expect(initialWorldState(asCreateInput(input)).config).toMatchObject({ mission: 'mission/other-mission', rawDifficulty: 20, clockUnitsPerTick: 4 });
  });
});

/** A craft type table for the slice-shaped mission with one entry changed. */
function craftTypesWith(change: (entries: { craftType: number; side: string; baseInteraction: boolean }[]) => void) {
  const table = craftTypesContent([0, 1, 7, 8, 14, 17]);
  change(table.entries);
  return table;
}

const RULE_INPUT_FIELDS = ['percentA', 'craftCount', 'percentB', 'percentC', 'percentD', 'aiValueA', 'aiValueB', 'aiValueC'] as const;

describe('semantic checks before any world exists (P3-02 AC-02)', () => {
  it.each([
    ['a map not right +x', { mission: sliceWith((m) => void (m.mapFrame.rightAxis = '-x')) }, `${MISSION}.mapFrame.rightAxis`, 'must be +x'],
    ['a map not centred on the origin', { mission: sliceWith((m) => void (m.mapFrame.center.right = 8000)) }, `${MISSION}.mapFrame.center`, 'origin'],
    ['a map of a fractional sector count', { mission: sliceWith((m) => void (m.mapFrame.halfExtent = 25000)) }, `${MISSION}.mapFrame.halfExtent`, 'sectors'],
    ['a reference scale that is not a float32', { mission: sliceWith((m) => void (m.coordinates.referenceScale = 8000.1)) }, `${MISSION}.coordinates.referenceScale`, undefined],
    [
      'a player of a kind other than bit 0',
      {
        mission: (() => { const m = playerOnlyMission(); m.declarations[0].craftType = 25; return m; })(),
        craftTypes: { entries: [{ craftType: 1, side: 'friendly', baseInteraction: false, model: { id: 'model/craft-1', kind: 'model' } }, { craftType: 25, side: 'player', baseInteraction: false, model: { id: 'model/craft-25', kind: 'model' } }] },
      },
      `${MISSION}.declarations[0].craftType`,
      'kind bit 0',
    ],
    [
      'a player in a group',
      {
        mission: (() => {
          const m = playerOnlyMission();
          m.declarations[0].origins = ['object', 'group-template'];
          m.declarations.push(declaration(1, { origins: ['group-member'], craftType: 7, memberOf: 0 }));
          m.groups = [{ template: 0, members: [1], spawnCount: 1, layout: [{ x: 0, y: 0, z: 0 }] }];
          return m;
        })(),
      },
      `${MISSION}.declarations[0].origins`,
      'outside every group',
    ],
    ['a player with two requests', { mission: sliceWith((m) => void (m.declarations[0].ruleInputs.craftCount = 2)) }, `${MISSION}.declarations[0].ruleInputs.craftCount`, 'one request'],
    ['an enemy kind bound as friendly', { craftTypes: craftTypesWith((e) => void (e.find(({ craftType }) => craftType === 7)!.side = 'friendly')) }, `${MISSION}.declarations[3].craftType`, 'side or interaction'],
    ['an interaction kind bound without interaction', { craftTypes: craftTypesWith((e) => void (e.find(({ craftType }) => craftType === 17)!.baseInteraction = false)) }, `${MISSION}.declarations[7].craftType`, 'side or interaction'],
    [
      'a kind without a supported side',
      {
        mission: sliceWith((m) => void (m.declarations[8].craftType = 20)),
        craftTypes: { entries: [...craftTypesContent([0, 1, 7, 8, 17]).entries, { craftType: 20, side: 'enemy', baseInteraction: false, model: { id: 'model/craft-20', kind: 'model' } }] },
      },
      `${MISSION}.declarations[8].craftType`,
      'side or interaction',
    ],
    ['a fixed-height kind', { mission: sliceWith((m) => void (m.declarations[8].craftType = 2)) }, `${MISSION}.declarations[8].craftType`, 'fixed-height'],
    ['the wingman kind in the mission', { mission: sliceWith((m) => void (m.declarations[8].craftType = 1)) }, `${MISSION}.declarations[8].craftType`, 'wingman kind'],
    ['a group member without a kind', { mission: sliceWith((m) => void (m.declarations[6].craftType = null)) }, `${MISSION}.declarations[6].craftType`, 'group member'],
    ['a spawn time past u32 clock units', { mission: sliceWith((m) => void (m.declarations[3].spawnTime = 0x4000000)) }, `${MISSION}.declarations[3].spawnTime`, 'u32'],
    ['a template spawn time past u32 clock units', { mission: sliceWith((m) => void (m.declarations[2].spawnTime = 0x4000000)) }, `${MISSION}.declarations[2].spawnTime`, 'u32'],
    ['a probability other than 100', { mission: sliceWith((m) => void (m.declarations[3].ruleInputs.percentA = 50)) }, `${MISSION}.declarations[3].ruleInputs.percentA`, 'probability'],
    ['a negative probability', { mission: sliceWith((m) => void (m.declarations[3].ruleInputs.percentA = 0xffffffff)) }, `${MISSION}.declarations[3].ruleInputs.percentA`, 'probability'],
    ['a template probability other than 100', { mission: sliceWith((m) => void (m.declarations[1].ruleInputs.percentA = 99)) }, `${MISSION}.declarations[1].ruleInputs.percentA`, 'probability'],
    ['grid placement', { mission: sliceWith((m) => void (m.declarations[3].gridSpacing = 5)) }, `${MISSION}.declarations[3].gridSpacing`, 'grid'],
    ['template grid placement', { mission: sliceWith((m) => void (m.declarations[2].gridSpacing = -5)) }, `${MISSION}.declarations[2].gridSpacing`, 'grid'],
    ['a position out of the coordinate range', { mission: sliceWith((m) => void (m.declarations[3].position.x = 2240000)) }, `${MISSION}.declarations[3].position.x`, 'range', ['2240000', '4200000']],
    ['a position that is not a float32', { mission: sliceWith((m) => void (m.declarations[3].position.y = 0.1)) }, `${MISSION}.declarations[3].position.y`, 'float32', ['0.1']],
    ['a rectangle out of the coordinate range', { mission: sliceWith((m) => void (m.spawnRegions[0].x1 = 3000000)) }, `${MISSION}.spawnRegions[0].x1`, 'range', ['3000000', '5625000']],
    ['a layout offset that is not a float32', { mission: sliceWith((m) => void (m.groups[0].layout[1].x = 0.1)) }, `${MISSION}.groups[0].layout[1].x`, 'float32', ['0.1']],
  ] as [string, WorldInputParts, string, string | undefined, string[]?][])('rejects %s', (_, parts, path, reason, values = []) => {
    expectRejected(worldInput(parts), path, reason, values);
  });

  it.each(RULE_INPUT_FIELDS)('rejects an explicit 0 in %s, of a mission record and of a wingman option', (field) => {
    expectRejected(worldInput({ mission: sliceWith((m) => void (m.declarations[4].ruleInputs[field] = 0)) }), `${MISSION}.declarations[4].ruleInputs.${field}`, 'explicit 0');
    const roster = worldInput().wingmanRoster.content as RosterDraft;
    roster.options[3].ruleInputs[field] = 0;
    expectRejected(worldInput({ roster }), `${ROSTER}.options[3].ruleInputs.${field}`, 'explicit 0');
  });

  it('rejects a wingman option of another kind, an unconvertible one and, when selected, an unsupported placement', () => {
    const kind = worldInput().wingmanRoster.content as RosterDraft;
    kind.options[2].craftType = 7;
    expectRejected(worldInput({ roster: kind }), `${ROSTER}.options[2].craftType`, 'kind bit 1');
    const far = worldInput().wingmanRoster.content as RosterDraft;
    far.options[1].position.z = 5000000;
    expectRejected(worldInput({ roster: far }), `${ROSTER}.options[1].position.z`, 'range', ['5000000']);
    for (const [field, value] of [['gridSpacing', 3], ['percentA', 50]] as const) {
      const roster = worldInput().wingmanRoster.content as RosterDraft;
      if (field === 'gridSpacing') roster.options[1].gridSpacing = value;
      else roster.options[1].ruleInputs.percentA = value;
      const path = field === 'gridSpacing' ? `${ROSTER}.options[1].gridSpacing` : `${ROSTER}.options[1].ruleInputs.percentA`;
      expectRejected(worldInput({ roster, run: { wingman: 1 } }), path);
      expect(create({ roster, run: { wingman: 0 } }).config.wingman).toBe(0);
    }
  });

  it('accepts the bounds and values that no spawn reads: a member\'s probability or grid, the last u32 spawn time', () => {
    const state = create({
      mission: sliceWith((m) => {
        m.declarations[4].ruleInputs.percentA = 50;
        m.declarations[4].gridSpacing = 5;
        m.declarations[5].spawnTime = 0xffffffff;
        m.declarations[3].spawnTime = 0x3ffffff;
        m.declarations[3].ruleInputs.percentA = 100;
      }),
    });
    expect(state.spawn.queue.at(-1)).toEqual({ due: 0x3ffffff * 64, source: 'record', index: 3, requests: 2 });
  });
});

describe('craft info input (P3-06 AC-01, D-01)', () => {
  it('reads the craft info strictly into the world\'s frozen copy, detached from the input', () => {
    const input = worldInput();
    const state = initialWorldState(asCreateInput(input));
    expect(state.craftInfo.id).toBe('data/craft-info');
    expect(state.craftInfo.content).toEqual(craftInfoContent());
    expect(deepFrozen(state.craftInfo)).toBe(true);
    const content = input.craftInfo.content as CraftInfoDraft;
    content.craft[0].name = 'changed';
    content.guns.pop();
    expect(state.craftInfo.content).toEqual(craftInfoContent());
  });

  it.each([
    ['missing', () => ({ ...worldInput(), craftInfo: undefined }), 'input.craftInfo'],
    ['not an object', () => ({ ...worldInput(), craftInfo: 'data/craft-info' }), 'input.craftInfo'],
    ['an Asset with an extra field', () => { const input = worldInput(); Object.assign(input.craftInfo, { role: 'craft-info' }); return input; }, 'input.craftInfo'],
    ['an Asset without an ID', () => { const input = worldInput(); delete (input.craftInfo as Record<string, unknown>).id; return input; }, 'input.craftInfo.id'],
    ['an Asset without content', () => { const input = worldInput(); delete (input.craftInfo as Record<string, unknown>).content; return input; }, 'input.craftInfo.content'],
  ])('rejects craft info %s with a CoreInputError', (_, input, path) => {
    const error = thrownBy(() => createWorld(asCreateInput(input())));
    expect(error).toBeInstanceOf(CoreInputError);
    expect(error).toMatchObject({ path });
  });

  it('keeps the content readers\' ContentContractError for a malformed Asset ID or content, a non-finite f32 included', () => {
    const malformedId = worldInput();
    (malformedId.craftInfo as Record<string, unknown>).id = 'data/Craft-Info';
    expect(thrownBy(() => createWorld(asCreateInput(malformedId)))).toMatchObject({ name: 'ContentContractError', path: 'input.craftInfo.id' });
    const cases: [(info: CraftInfoDraft) => void, string][] = [
      [(info) => void info.craft.pop(), `${CRAFT_INFO}.craft`],
      [(info) => void (info.craft[7].atB8 = Number.POSITIVE_INFINITY), `${CRAFT_INFO}.craft[7].atB8`],
      [(info) => void (info.craft[0].at0C = Number.NaN), `${CRAFT_INFO}.craft[0].at0C`],
      [(info) => void (info.craft[0].at88 = 2 ** 31), `${CRAFT_INFO}.craft[0].at88`],
      [(info) => void (info.missiles[0].body = 9), `${CRAFT_INFO}.missiles[0].body`],
    ];
    for (const [change, path] of cases) {
      const error = thrownBy(() => createWorld(asCreateInput(craftInfoWith(change))));
      expect(error).toBeInstanceOf(ContentContractError);
      expect(error).toMatchObject({ path });
      expect((error as Error).message).not.toContain(CRAFT_INFO_MARKER);
    }
  });

  it('takes a data Asset ID, any for synthetic content and only data/craft-info for original-import content', () => {
    const model = worldInput();
    (model.craftInfo as Record<string, unknown>).id = 'model/craft-info';
    expectRejected(model, 'input.craftInfo.id', 'data Asset ID');
    const other = worldInput();
    (other.craftInfo as Record<string, unknown>).id = 'data/other-craft-info';
    expect(initialWorldState(asCreateInput(other)).craftInfo.id).toBe('data/other-craft-info');
    const imported = worldInput({ identity: originalImportIdentity() });
    expect(initialWorldState(asCreateInput(imported)).craftInfo.id).toBe('data/craft-info');
    (imported.craftInfo as Record<string, unknown>).id = 'data/other-craft-info';
    expectRejected(imported, 'input.craftInfo.id', 'production craft info');
  });
});

describe('craft info semantic checks (P3-06 AC-01, D-01)', () => {
  /** The player and one stored record of kind bit `craftType`, of `origins`. */
  const withKind = (craftType: number, overrides: Record<string, unknown> = {}) => {
    const m = playerOnlyMission();
    m.declarations.push(declaration(1, { craftType, position: { x: 400, y: 0, z: 0 }, ...overrides }));
    return m;
  };

  it('requires a craft record for every kind the run can instantiate: records, group members and the player', () => {
    expectRejected(worldInput({ mission: withKind(25) }), `${MISSION}.declarations[1].craftType`, 'without a craft record');
    const member = playerOnlyMission();
    member.declarations.push(declaration(1, { origins: ['group-template'], ruleInputs: ruleInputs({ percentA: 100 }) }));
    member.declarations.push(declaration(2, { origins: ['group-member'], craftType: 25, memberOf: 0 }));
    member.groups = [{ template: 1, members: [2], spawnCount: 1, layout: [{ x: 0, y: 0, z: 0 }] }];
    expectRejected(worldInput({ mission: member }), `${MISSION}.declarations[2].craftType`, 'without a craft record');
  });

  it('does not check kinds whose queue entries post no request: no requests, or a template that never fires', () => {
    // A record of -1 requests, a group of 0, and a group whose template the build does not fill (probability source 0);
    // record 2 binds kind 0x4000 (CR-15) and requests none either.
    const never = withKind(25, { ruleInputs: ruleInputs({ craftCount: 0xffffffff }) });
    never.declarations.push(transponderBinding(2));
    never.declarations.push(declaration(3, { origins: ['group-template'], ruleInputs: ruleInputs({ percentA: 100 }) }));
    never.declarations.push(declaration(4, { origins: ['group-member'], craftType: 25, memberOf: 0 }));
    never.declarations.push(declaration(5, { origins: ['group-template'] }));
    never.declarations.push(declaration(6, { origins: ['group-member'], craftType: 13, memberOf: 1 }));
    never.groups = [
      { template: 3, members: [4], spawnCount: 0, layout: [{ x: 0, y: 0, z: 0 }] },
      { template: 5, members: [6], spawnCount: 3, layout: [{ x: 0, y: 0, z: 0 }] },
    ];
    const craftInfo = craftInfoWithContent((info) => void (info.craft[13].at0C = 0));
    expect(create({ mission: never, craftInfo }).spawn.queue.map(({ requests }) => requests)).toEqual([1, -1, -1, 0, 3]);
    const fired = structuredClone(never);
    fired.declarations[5].ruleInputs.percentA = 100;
    expectRejected(worldInput({ mission: fired, craftInfo }), `${CRAFT_INFO}.craft[13].at0C`, 'at least 1');
  });

  describe('+0x0C, the parked travel\'s modulus, of every instantiable kind', () => {
    it.each([[0], [0.5], [-1], [-0.5]])('rejects %s', (value) => {
      expectRejected(craftInfoWith((info) => void (info.craft[7].at0C = value)), `${CRAFT_INFO}.craft[7].at0C`, 'at least 1');
      expectRejected(craftInfoWith((info) => void (info.craft[0].at0C = value)), `${CRAFT_INFO}.craft[0].at0C`, 'at least 1');
    });

    it('accepts 1 and more, and any value of kinds not instantiated: the wingman\'s only when one is selected', () => {
      expect(create({ craftInfo: craftInfoWithContent((info) => { info.craft[7].at0C = 1; info.craft[14].at0C = 1.5; }) }).craftInfo.content.craft[7].at0C).toBe(1);
      expect(create({ craftInfo: craftInfoWithContent((info) => { info.craft[9].at0C = 0; info.craft[1].at0C = 0; }) }).config.wingman).toBeNull();
      expectRejected(craftInfoWith((info) => void (info.craft[1].at0C = 0), { run: { wingman: 2 } }), `${CRAFT_INFO}.craft[1].at0C`);
    });
  });

  it('accepts zero rule values elsewhere, as the original\'s branches take them', () => {
    const zeroed = craftInfoWithContent((info) => {
      for (const kind of [0, 7, 8, 14, 17]) {
        Object.assign(info.craft[kind], { atA0: 0, atA4: 0, atA8: 0, atAC: 0, atB0: 0, atB4: 0, atB8: 0, atBC: 0, atC0: 0 });
      }
      // Except the AI's divisors (CR-15): the turn rates of opcodes 1001–1003, which kinds 7 and 8 run, and the top
      // speed of kind 0x4000, which `b` constructs.
      for (const kind of [7, 8]) Object.assign(info.craft[kind], { atAC: 0.75, atB0: 0.5, atB4: 0.25 });
      info.craft[14].atB8 = 64;
      // The player's Warp divides by its +0xA8 and +0xB8 (MW-01 check 4); only the player's are checked.
      Object.assign(info.craft[0], { atA8: 1, atB8: Math.fround(1e-30), at58: 0, at64: [0, 0, 0, 0], at78: [0, 0, 0, 0] });
    });
    const { craft } = create({ craftInfo: zeroed }).craftInfo.content;
    expect([craft[0].atA4, craft[7].atA8, craft[7].atB8]).toEqual([0, 0, 0]);
  });

  describe('the parked Warp timing of every instantiable kind, in i32 clock units', () => {
    it('accepts +0xA8 × 64 and (+0xA8 + +0xA4) × 64 at the i32 bounds', () => {
      expect(create({ craftInfo: craftInfoWithContent((info) => Object.assign(info.craft[7], { atA8: 2 ** 25 - 1, atA4: 0 })) }).config).toBeDefined();
      expect(create({ craftInfo: craftInfoWithContent((info) => Object.assign(info.craft[8], { atA8: -(2 ** 25), atA4: 2 ** 25 - 1 })) }).config).toBeDefined();
      expect(create({ craftInfo: craftInfoWithContent((info) => Object.assign(info.craft[9], { atA8: 2 ** 30, atA4: 2 ** 30 })) }).config).toBeDefined();
    });

    it('rejects one more at the field that passes the bound', () => {
      expectRejected(craftInfoWith((info) => void Object.assign(info.craft[7], { atA8: 2 ** 25, atA4: 0 })), `${CRAFT_INFO}.craft[7].atA8`, 'i32');
      expectRejected(craftInfoWith((info) => void Object.assign(info.craft[7], { atA8: -(2 ** 25) - 1, atA4: 0 })), `${CRAFT_INFO}.craft[7].atA8`, 'i32');
      expectRejected(craftInfoWith((info) => void Object.assign(info.craft[17], { atA8: 2 ** 25 - 1, atA4: 1 })), `${CRAFT_INFO}.craft[17].atA4`, 'i32');
      expectRejected(craftInfoWith((info) => void Object.assign(info.craft[1], { atA8: 0, atA4: 2 ** 30 }), { run: { wingman: 0 } }), `${CRAFT_INFO}.craft[1].atA4`, 'i32');
    });
  });

  describe('the player\'s energy branch at every allocation level', () => {
    /** The player's record with energy +0x58, allocations +0x64 and +0x78, divisor +0x88 and base maximum +0xB8. */
    const energy = (fields: Record<string, unknown>) => craftInfoWith((info) => void Object.assign(info.craft[0], fields));
    const PLAYER = `${CRAFT_INFO}.craft[0]`;

    it('rejects a divisor +0x88 of 0', () => {
      expectRejected(energy({ at88: 0 }), `${PLAYER}.at88`, 'must not be 0');
      expect(create({ craftInfo: craftInfoWithContent((info) => void (info.craft[7].at88 = 0)) }).config).toBeDefined();
    });

    it('bounds the threshold chop(+0xB8) × +0x88 to i32', () => {
      // 65536 × 32767 = 2147418112; the energy 187 is then below the threshold, and 187000 / 32767 is in range.
      expect(create({ craftInfo: craftInfoWithContent((info) => void Object.assign(info.craft[0], { atB8: 65536, at88: 32767 })) }).config).toBeDefined();
      expect(create({ craftInfo: craftInfoWithContent((info) => void Object.assign(info.craft[0], { atB8: 65536, at88: -32768 })) }).config).toBeDefined();
      expectRejected(energy({ atB8: 65536, at88: 32768 }), PLAYER, 'threshold');
      expectRejected(energy({ atB8: 2 ** 31 }), PLAYER, 'threshold');
      // A non-positive +0xB8 is rejected first by the player's Warp check (MW-01 check 4).
      expectRejected(energy({ atB8: 2 ** 40 }), PLAYER, 'threshold');
    });

    it('bounds the allocations, the energy and the energy × 1000 to i32, also at levels other than the initial 1 and 2', () => {
      // +0x58 − (+0x64[l1] + +0x78[l2]): 2147483 × 1000 fits, 2147484 × 1000 does not.
      const flat = (at58: number) => ({ at58, at64: [0, 0, 0, 0], at78: [0, 0, 0, 0] });
      expect(create({ craftInfo: craftInfoWithContent((info) => void Object.assign(info.craft[0], flat(2147483))) }).config).toBeDefined();
      expectRejected(energy(flat(2147484)), PLAYER, 'allocation levels');
      expectRejected(energy({ at58: 0, at64: [0, 0, 0, 2147484], at78: [0, 0, 0, 0] }), PLAYER, 'allocation levels');
      expectRejected(energy({ at58: 0, at64: [0, 0, 0, 0], at78: [2147484, 0, 0, 0] }), PLAYER, 'allocation levels');
      expectRejected(energy({ at58: 2 ** 31 - 1, at64: [2 ** 31 - 1, 0, 0, 0], at78: [1, 0, 0, 0] }), PLAYER, 'allocation levels');
      // Only the player's record is read this way.
      expect(create({ craftInfo: craftInfoWithContent((info) => void Object.assign(info.craft[7], flat(2 ** 31 - 1))) }).config).toBeDefined();
    });
  });
});

describe('the player\'s Warp fields (P3-09 AC-02, docs/plan/p3/02/spec.md MW-01 check 4)', () => {
  const PLAYER = `${CRAFT_INFO}.craft[0]`;

  // The content reader already holds +0xA4 to 0–2^31 − 1, so only the upper bound reaches the check.
  it.each([
    ['no pair', (info: CraftInfoDraft) => void (info.craft[0].pairs = []), `${PLAYER}.pairs`],
    ['+0xA8 of 0', (info: CraftInfoDraft) => void (info.craft[0].atA8 = 0), `${PLAYER}.atA8`],
    ['a negative +0xA8', (info: CraftInfoDraft) => void (info.craft[0].atA8 = -1), `${PLAYER}.atA8`],
    ['+0xB8 of 0', (info: CraftInfoDraft) => void (info.craft[0].atB8 = 0), `${PLAYER}.atB8`],
    ['a negative +0xB8', (info: CraftInfoDraft) => void (info.craft[0].atB8 = -0.5), `${PLAYER}.atB8`],
    // Before the parked Warp's (+0xA8 + +0xA4) × 64 check (P3-06), which would reject it too at +0xA8 ≥ 1.
    ['+0xA4 of 2^25, whose × 64 leaves i32', (info: CraftInfoDraft) => Object.assign(info.craft[0], { atA4: 2 ** 25, atA8: 1 }), `${PLAYER}.atA4`],
  ])('rejects %s', (_, change, path) => {
    expectRejected(craftInfoWith(change), path, 'for the player');
  });

  it('accepts one pair, the smallest positive values, an +0xA4 of 0 and the largest +0xA8 = 1 allows, and does not check other kinds', () => {
    const accepted = create({
      craftInfo: craftInfoWithContent((info) => {
        Object.assign(info.craft[0], { pairs: [{ at00: 0, at04: 0x7fffffff }], atA8: 1, atB8: 2 ** -149, atA4: 0 });
        Object.assign(info.craft[7], { pairs: [], atA8: 0, atB8: 0 });
      }),
    });
    expect(accepted.craftInfo.content.craft[0].pairs).toHaveLength(1);
    expect(create({ craftInfo: craftInfoWithContent((info) => Object.assign(info.craft[0], { atA4: 2 ** 25 - 2, atA8: 1 })) }).config).toBeDefined();
  });

  it('comes after the map geometry\'s checks and before the other craft info checks', () => {
    const both = worldInput({
      craftInfo: craftInfoWithContent((info) => void (info.craft[0].atA8 = 0)),
      mapGeometry: { ...mapGeometryContent(), redrawInterval: 2 },
    });
    expectRejected(both, 'input.mapGeometry.content.redrawInterval');
    const overflow = craftInfoWithContent((info) => Object.assign(info.craft[0], { atA4: 2 ** 25, atA8: 1 }));
    expectRejected(worldInput({ craftInfo: overflow, mapGeometry: { ...mapGeometryContent(), redrawInterval: 2 } }), 'input.mapGeometry.content.redrawInterval');
    expectRejected(craftInfoWith((info) => Object.assign(info.craft[0], { atA8: 0, at0C: 0 })), `${PLAYER}.atA8`);
  });
});

describe('spawn expansion budget (P3-02 AC-02, CoreLimits)', () => {
  /** The player and one record of kind bit 7 with `craftCount` requests. */
  const withRecord = (craftCount: number) => {
    const m = playerOnlyMission();
    m.declarations.push(declaration(1, { craftType: 7, ruleInputs: ruleInputs({ craftCount }) }));
    return m;
  };
  /** The player, the binding of kind 0x4000 and a group of `members` copies of a member record, `spawnCount` requests. */
  const withGroup = (spawnCount: number, members: number) => {
    const m = playerOnlyMission();
    m.declarations.push(transponderBinding(1));
    m.declarations.push(declaration(2, { origins: ['group-template'], ruleInputs: ruleInputs({ percentA: 100 }) }));
    m.declarations.push(declaration(3, { origins: ['group-member'], craftType: 7, memberOf: 0 }));
    m.groups = [{ template: 2, members: Array(members).fill(3), spawnCount, layout: [{ x: 0, y: 0, z: 0 }] }];
    if (members === 0) {
      m.declarations.pop();
    }
    return m;
  };

  it('takes up to 1024 instances, the player included, and rejects 1025 at the record that passes the limit', () => {
    // The third entry is the binding of kind 0x4000 (transponderBinding), which requests none.
    expect(create({ mission: withRecord(1023) }).spawn.queue).toHaveLength(3);
    expectRejected(worldInput({ mission: withRecord(1024) }), `${MISSION}.declarations[1].ruleInputs.craftCount`, 'spawnExpansion');
    expect(create({ mission: withRecord(0xffffffff) }).spawn.queue[1].requests).toBe(-1);
  });

  it('counts the wingman, scheduled right after the player', () => {
    /** A record of kind bit 7 with `craftCount` requests before the player. */
    const recordFirst = (craftCount: number) => {
      const m = missionFrame();
      m.declarations = [declaration(0, { craftType: 7, ruleInputs: ruleInputs({ craftCount }) }), declaration(1, { craftType: 0 })];
      return m;
    };
    expect(create({ mission: recordFirst(1022), run: { wingman: 0 } }).spawn.queue).toHaveLength(4);
    expectRejected(worldInput({ mission: recordFirst(1023), run: { wingman: 0 } }), 'input.run.wingman', 'spawnExpansion');
    expectRejected(worldInput({ mission: withRecord(1023), run: { wingman: 0 } }), `${MISSION}.declarations[1].ruleInputs.craftCount`, 'spawnExpansion');
  });

  it('counts requests × members of a group, an empty group\'s requests once each, without overflowing', () => {
    expect(create({ mission: withGroup(341, 3) }).spawn.queue).toHaveLength(3);
    expectRejected(worldInput({ mission: withGroup(342, 3) }), `${MISSION}.groups[0].spawnCount`, 'spawnExpansion');
    expectRejected(worldInput({ mission: withGroup(0x7fffffff, 64) }), `${MISSION}.groups[0].spawnCount`, 'spawnExpansion');
    expect(create({ mission: withGroup(1023, 0) }).spawn.queue).toHaveLength(3);
    expectRejected(worldInput({ mission: withGroup(1024, 0) }), `${MISSION}.groups[0].spawnCount`, 'spawnExpansion');
    expect(create({ mission: withGroup(0xffffffff, 64) }).spawn.queue[2].requests).toBe(-1);
  });
});

describe('setupHash (P3-02 S-08, 快照、哈希与 replay)', () => {
  const hashOf = (parts: WorldInputParts = {}) => create(parts).config.setupHash;

  it('is 16 lowercase hex digits of the setup and the content read: not of the run or the identity', () => {
    const hash = hashOf();
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
    expect(hashOf({ run: { seed: 1, rawDifficulty: 0 } })).toBe(hash);
    expect(hashOf({ identity: originalImportIdentity() })).toBe(hash);
    // A wingman adds its model to the models the run reads, and only that changes the hash.
    const withWingman = create({ run: { wingman: 2 } });
    expect(withWingman.config.setupHash).not.toBe(hash);
    const { ruleData } = create();
    expect(setupHash(withWingman.setup, withWingman.craftInfo, ruleData.inputs)).toBe(hash);
  });

  it('changes with names, coordinates, members, rule inputs and bindings', () => {
    const hash = hashOf();
    const changes: WorldInputParts[] = [
      { mission: sliceWith((m) => void (m.declarations[7].nameCandidates[2] = `${MARKER}-other`)) },
      { mission: sliceWith((m) => void (m.namePool[1] = `${MARKER}-other`)) },
      { mission: sliceWith((m) => void (m.declarations[3].position.z = 1)) },
      { mission: sliceWith((m) => void (m.spawnRegions[1].y0 = 16008)) },
      { mission: sliceWith((m) => void (m.groups[2].layout[1].y = 251)) },
      { mission: sliceWith((m) => void (m.groups[0].members = [4])) },
      { mission: sliceWith((m) => void (m.groups[1].spawnCount = 3)) },
      { mission: sliceWith((m) => void (m.declarations[6].ruleInputs.aiValueB = -1)) },
      { mission: sliceWith((m) => void (m.declarations[8].aiTargetCraftTypes = [0])) },
      { craftTypes: craftTypesWith((e) => void ((e[3] as unknown as { model: { id: string } }).model.id = 'model/other')) },
    ];
    const hashes = changes.map((parts) => hashOf(parts));
    for (const changed of hashes) expect(changed).not.toBe(hash);
    expect(new Set(hashes).size).toBe(hashes.length);
  });

  it('does not depend on the key order of the input', () => {
    const mission = sliceMission();
    mission.declarations = mission.declarations.map((value) => Object.fromEntries(Object.entries(value).reverse()) as typeof value);
    expect(hashOf({ mission })).toBe(hashOf());
  });

  describe('craft info (P3-06 AC-01, D-01)', () => {
    const craftHash = (change: (info: CraftInfoDraft) => void, parts: WorldInputParts = {}) => hashOf({ ...parts, craftInfo: craftInfoWithContent(change) });

    it('changes with any part of the craft info, records of kinds the run does not instantiate included', () => {
      const hash = hashOf();
      expect(craftHash(() => undefined)).toBe(hash);
      const changes: ((info: CraftInfoDraft) => void)[] = [
        (info) => void (info.hitDamageScale = 1.5),
        (info) => void (info.guns[1].at24 = 41),
        (info) => void (info.missiles[0].at40 = 0),
        (info) => void (info.craft[0].atB8 = 65),
        (info) => void (info.craft[19].at08 = 2),
        (info) => void (info.craft[3].name = `${info.craft[3].name.slice(0, -1)}u`),
        (info) => void (info.craft[0].collision.boxes[1].upper[2] = 1),
        (info) => void (info.craft[0].mounts[1].at18 = null),
        (info) => void (info.craft[0].mountLists[0].reverse()),
        (info) => void (info.craft[0].pairs[0].at04 = 4),
        (info) => void (info.craft[1].collision.at2C[0] = -3),
        (info) => void (info.missileBodies[1].atC8 = 1),
        (info) => void info.craft[5].pairs.push({ at00: 1, at04: 2 }),
      ];
      const hashes = changes.map((change) => craftHash(change));
      for (const changed of hashes) expect(changed).not.toBe(hash);
      expect(new Set(hashes).size).toBe(hashes.length);
      const renamed = worldInput();
      (renamed.craftInfo as Record<string, unknown>).id = 'data/other-craft-info';
      expect(initialWorldState(asCreateInput(renamed)).config.setupHash).not.toBe(hash);
    });

    it('does not depend on the key order of the craft info, the seed or the wingman', () => {
      const hash = hashOf();
      expect(hashOf({ craftInfo: reversedKeys(craftInfoContent()) })).toBe(hash);
      expect(hashOf({ run: { seed: 99 } })).toBe(hash);
      expect(hashOf({ run: { wingman: 4 } })).toBe(hashOf({ run: { wingman: 0 } }));
    });
  });

  describe('rule-data inputs (P3-07 AC-02, CR-01)', () => {
    type Content = Record<string, unknown>;
    type Item = { id: string; content: Content };
    /** The hash of the default input after `change`, which must keep it valid. */
    const changedHash = (change: (input: Record<string, Item & Item[]>) => void, parts: WorldInputParts = {}) => {
      const input = worldInput(parts);
      change(input as never);
      return initialWorldState(asCreateInput(input)).config.setupHash;
    };
    const lists = (input: Record<string, Item>) => input.explosions.content.lists as { sound: { id: string }; animation: { id: string } }[][];
    const records = (input: Record<string, Item>) => input.projectileVisuals.content.records as { selector: number; width: number; length: number; colour: number[] }[];
    const partsOf = (model: Item) => (model.content.partLists as unknown[][])[1];
    const builtIn = (input: Record<string, Item>) => input.aiPrograms.content.builtInPrograms as { at14: number; at24: number; at28: number; at2C: number; handler: { offset: number } }[];
    const commands = (input: Record<string, Item>, table: string) => input.commMenus.content[table] as { text: string; command: number }[];
    const faceTables = (input: Record<string, Item>) => input.commMessages.content.faceTables as { present: boolean; frameDurations?: number[] }[][][];
    const keywordTables = (input: Record<string, Item>) => input.aiPrograms.content.keywordTables as { name: string; value: number }[][];

    it('changes with each field CR-01 lists: IDs, debris content, lengths, references, frame counts, part counts and AI programs', () => {
      const hash = hashOf();
      expect(changedHash(() => undefined)).toBe(hash);
      const changes: ((input: Record<string, Item & Item[]>) => void)[] = [
        (input) => void (input.debrisParameters.id = 'data/other-debris'),
        (input) => void ((input.debrisParameters.content.byCraftType as { at00: number[] }[][])[19][0].at00[1] = 0.5),
        (input) => void ((input.debrisParameters.content.byCraftType as { collision: { at28: number } }[][])[19][0].collision.at28 = 1),
        (input) => void (input.projectileVisuals.id = 'data/other-visuals'),
        (input) => void (records(input)[0].length = 2),
        (input) => void records(input).push({ ...records(input)[0] }),
        (input) => void (input.explosions.id = 'data/other-explosions'),
        (input) => void lists(input)[0].reverse(),
        (input) => void lists(input)[1].push({ ...lists(input)[1][0] }),
        (input) => {
          for (const animation of input.explosionAnimations.slice(0, 3)) animation.content.frames = (animation.content.frames as unknown[]).slice(0, 10);
        },
        (input) => {
          input.explosionAnimations[3].id = 'data/explosion-animation/09';
          lists(input)[2][0].animation.id = 'data/explosion-animation/09';
        },
        (input) => {
          // Kind bit 14's model gains a part and its DEBRIS table the matching record.
          partsOf(input.models[1]).push({ ...(partsOf(input.models[0])[0] as object) });
          (input.debrisParameters.content.byCraftType as unknown[][])[14].push(structuredClone((input.debrisParameters.content.byCraftType as unknown[][])[0][0]));
        },
        // The AI programs: the ID and the complete content, the homing records' fields and those the rules do not read yet.
        (input) => void (input.aiPrograms.id = 'data/other-ai-programs'),
        (input) => void (builtIn(input)[1].at14 = 17),
        (input) => void (builtIn(input)[2].at24 = 3),
        (input) => void (builtIn(input)[1].at2C = 0.5),
        (input) => void (builtIn(input)[0].at28 = 9),
        (input) => void (builtIn(input)[2].handler.offset = 0x200),
        (input) => void builtIn(input).push(structuredClone(builtIn(input)[0])),
        (input) => void ((input.aiPrograms.content.globals as { at24: number }).at24 = 31),
        (input) => void ((input.aiPrograms.content.programs as { kindMask: number | null }[])[1].kindMask = 0x80),
        // A script no reachable program names (CR-15: its semantics are not checked).
        (input) => void ((input.aiPrograms.content.entries as { items?: { argument: string | null }[] }[])[5].items![0].argument = 'x'),
        // The keyword tables (P3-03 revision 3): a value, a name and the pair order.
        (input) => void (keywordTables(input)[1][0].value = 9),
        (input) => void (keywordTables(input)[3][2].name = `${keywordTables(input)[3][2].name}!`),
        (input) => void keywordTables(input)[2].reverse(),
        // The communications inputs (CB-01): the IDs and the complete contents, texts beyond the keys included.
        (input) => void (input.commMenus.id = 'data/other-comm-menus'),
        (input) => void (commands(input, 'gatedTargetCommands')[0].text = menuText('2')),
        (input) => void (commands(input, 'gatedTargetCommands')[0].text = `${menuText('1')}!`),
        (input) => void (commands(input, 'kind2TargetCommands')[6].command = 0x8000_0000),
        (input) => void ((input.commMenus.content.categories as { kindMask: number }[])[2].kindMask = 0x80000),
        (input) => void (input.commMenus.content.objectListLastEntry = menuText('x')),
        (input) => void (input.baseRepairItems.id = 'data/other-base-repair-items'),
        (input) => void ((input.baseRepairItems.content.subsystemSelectors as number[])[10] = 10),
        (input) => void (input.commMessages.id = 'data/other-comm-messages'),
        (input) => void (faceTables(input)[1][0][1].frameDurations![1] = 2),
        (input) => void (faceTables(input)[2][0][0] = { present: true, frameDurations: [0] }),
        (input) => void (input.commMessages.content.direct as unknown[]).pop(),
        (input) => void ((input.commMessages.content.names2001 as string[])[1] = `${MARKER}-pool-0`),
        (input) => void (input.commMessages.content.names2011 as string[]).reverse(),
      ];
      const hashes = changes.map((change) => changedHash(change));
      for (const changed of hashes) expect(changed).not.toBe(hash);
      expect(new Set(hashes).size).toBe(hashes.length);
    });

    it('does not change with appearance: selectors, widths, colours, templates, sounds, frame images, geometry and parts', () => {
      const hash = hashOf();
      const changes: ((input: Record<string, Item & Item[]>) => void)[] = [
        (input) => Object.assign(records(input)[1], { selector: 7, width: 9, colour: [0, 0, 1] }),
        (input) => void (input.projectileVisuals.content.templates = [{ faces: [1] }]),
        (input) => void (lists(input)[0][1].sound = { id: 'sound/synthetic/other', kind: 'sound' } as never),
        (input) => void ((input.explosionAnimations[0].content.frames as { id: string }[])[0].id = 'image/synthetic-frame/other'),
        (input) => Object.assign(input.models[0].content, { geometries: [{ positions: [1, 2, 3] }], soundSlots: ['sound/x', null, null, null, null] }),
        (input) => Object.assign(partsOf(input.models[0])[0] as object, { sourceFlags: 0xffff, colour: [1, 2, 3], texture: 'image/t' }),
        (input) => void ((input.models[0].content.partLists as unknown[][])[2] = [{}]),
      ];
      for (const change of changes) expect(changedHash(change)).toBe(hash);
    });

    it('does not depend on the key order of the rule-data inputs', () => {
      expect(changedHash((input) => {
        for (const field of ['debrisParameters', 'projectileVisuals', 'explosions', 'aiPrograms', 'commMenus', 'baseRepairItems', 'commMessages'] as const) {
          input[field].content = reversedKeys(input[field].content);
        }
        input.models = input.models.map(reversedKeys) as never;
      })).toBe(hashOf());
    });
  });

  describe('event triggers (P3-03 S-02)', () => {
    /** The event mission after `change`. */
    const eventsWith = (change: (mission: MissionDraft) => void): WorldInputParts => {
      const mission = eventMission();
      change(mission);
      return { mission };
    };

    it('changes with any range field, message byte or count, the triggers and any declaration\'s eventTrigger', () => {
      const hash = hashOf({ mission: eventMission() });
      expect(hash).not.toBe(hashOf());
      const changes: WorldInputParts[] = [
        eventsWith((m) => void (m.eventTriggers[0].ranges[0].lower = 62)),
        eventsWith((m) => void (m.eventTriggers[0].ranges[0].upper = 99)),
        eventsWith((m) => void (m.eventTriggers[0].ranges[0].summarySelector = 2)),
        eventsWith((m) => void (m.eventTriggers[1].ranges[0].summarySelector = -9)),
        // One byte of a message, a message fewer, and the same bytes split into one message instead of two.
        eventsWith((m) => void (m.eventTriggers[0].ranges[1].messages[1] = `${MARKER}-part-2\u00ea\u0001`)),
        eventsWith((m) => void m.eventTriggers[0].ranges[1].messages.pop()),
        eventsWith((m) => void (m.eventTriggers[0].ranges[1].messages = [m.eventTriggers[0].ranges[1].messages.join('')])),
        eventsWith((m) => void m.eventTriggers[1].ranges.push({ lower: 6, upper: 9, messages: [], summarySelector: 9 })),
        eventsWith((m) => void m.eventTriggers[0].ranges.reverse()),
        // A trigger fewer: the record counted by it no longer counts events.
        eventsWith((m) => { m.eventTriggers.pop(); m.declarations[8].eventTrigger = null; }),
        // Only a declaration's eventTrigger: another trigger, and an index instead of null.
        eventsWith((m) => void (m.declarations[7].eventTrigger = 1)),
        eventsWith((m) => void (m.declarations[4].eventTrigger = 0)),
      ];
      const hashes = changes.map((parts) => hashOf(parts));
      for (const changed of hashes) expect(changed).not.toBe(hash);
      expect(new Set(hashes).size).toBe(hashes.length);
    });

    it('writes the wingman options\' eventTrigger too, though the content readers keep it null', () => {
      const setup = loadMission(asCreateInput(worldInput()));
      const { craftInfo, ruleData } = create();
      const hash = setupHash(setup, craftInfo, ruleData.inputs);
      const changed = { ...setup, wingmanOptions: setup.wingmanOptions.map((option, index) => (index === 1 ? { ...option, eventTrigger: 0 } : option)) };
      expect(hash).toBe(hashOf());
      expect(setupHash(changed, craftInfo, ruleData.inputs)).not.toBe(hash);
    });

    it('is the same for equal triggers built again or with keys in another order', () => {
      const hash = hashOf({ mission: eventMission() });
      expect(hashOf({ mission: eventMission() })).toBe(hash);
      const reversed = <T extends object>(value: T): T => Object.fromEntries(Object.entries(value).reverse()) as T;
      const mission = eventMission();
      mission.eventTriggers = mission.eventTriggers.map((trigger) => reversed({ ...trigger, ranges: trigger.ranges.map(reversed) }));
      mission.declarations = mission.declarations.map(reversed);
      expect(hashOf({ mission: reversed(mission) })).toBe(hash);
    });
  });
});
