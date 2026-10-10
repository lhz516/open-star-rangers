import { describe, expect, it } from 'vitest';
import { ContentContractError } from '../../content/contract-validation.ts';
import { deepFrozen } from '../../content/logic/logic-content.test-support.ts';
import { syntheticIdentity } from '../../content/synthetic-content.test-support.ts';
import { nextRandom } from '../determinism/rng.ts';
import { CoreInputError } from '../errors.ts';
import { loadMission } from '../mission/load-mission.ts';
import { createWorld, initialWorldState } from './create-world.ts';
import {
  asCreateInput, craftTypesContent, declaration, eventMission, MARKER, missionFrame, originalImportIdentity, playerOnlyMission, ruleInputs, sliceMission,
  worldInput, type MissionDraft, type RosterDraft, type WorldInputParts,
} from './create-world.test-support.ts';
import { setupHash } from './setup-hash.ts';
import { constructWorld } from './world.ts';
import { stateText, thrownBy, tickInput } from './world.test-support.ts';

const MISSION = 'input.mission.content';
const ROSTER = 'input.wingmanRoster.content';
const SEED = 0x1234_5678;

const create = (parts: WorldInputParts = {}) => initialWorldState(asCreateInput(worldInput(parts)));

/** Asserts that creation throws a CoreInputError at `path` whose message names no imported value. */
function expectRejected(input: unknown, path: string, reason?: string, values: readonly string[] = []): CoreInputError {
  const error = thrownBy(() => createWorld(asCreateInput(input)));
  expect(error).toBeInstanceOf(CoreInputError);
  const { message } = error as CoreInputError;
  expect(error).toMatchObject({ path });
  if (reason !== undefined) expect((error as CoreInputError).reason).toContain(reason);
  expect(message).not.toContain(MARKER);
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
    expect(world.renderState()).toEqual({ tick: 0, viewMode: 0xc, observedEntityId: null, entities: [] });
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
    expect(stateText(first)).toBe(before);
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

describe('spawn expansion budget (P3-02 AC-02, CoreLimits)', () => {
  /** The player and one record of kind bit 7 with `craftCount` requests. */
  const withRecord = (craftCount: number) => {
    const m = playerOnlyMission();
    m.declarations.push(declaration(1, { craftType: 7, ruleInputs: ruleInputs({ craftCount }) }));
    return m;
  };
  /** The player and a group of `members` copies of a member record, `spawnCount` requests. */
  const withGroup = (spawnCount: number, members: number) => {
    const m = playerOnlyMission();
    m.declarations.push(declaration(1, { origins: ['group-template'], ruleInputs: ruleInputs({ percentA: 100 }) }));
    m.declarations.push(declaration(2, { origins: ['group-member'], craftType: 7, memberOf: 0 }));
    m.groups = [{ template: 1, members: Array(members).fill(2), spawnCount, layout: [{ x: 0, y: 0, z: 0 }] }];
    if (members === 0) {
      m.declarations.pop();
    }
    return m;
  };

  it('takes up to 1024 instances, the player included, and rejects 1025 at the record that passes the limit', () => {
    expect(create({ mission: withRecord(1023) }).spawn.queue).toHaveLength(2);
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
    expect(create({ mission: recordFirst(1022), run: { wingman: 0 } }).spawn.queue).toHaveLength(3);
    expectRejected(worldInput({ mission: recordFirst(1023), run: { wingman: 0 } }), 'input.run.wingman', 'spawnExpansion');
    expectRejected(worldInput({ mission: withRecord(1023), run: { wingman: 0 } }), `${MISSION}.declarations[1].ruleInputs.craftCount`, 'spawnExpansion');
  });

  it('counts requests × members of a group, an empty group\'s requests once each, without overflowing', () => {
    expect(create({ mission: withGroup(341, 3) }).spawn.queue).toHaveLength(2);
    expectRejected(worldInput({ mission: withGroup(342, 3) }), `${MISSION}.groups[0].spawnCount`, 'spawnExpansion');
    expectRejected(worldInput({ mission: withGroup(0x7fffffff, 64) }), `${MISSION}.groups[0].spawnCount`, 'spawnExpansion');
    expect(create({ mission: withGroup(1023, 0) }).spawn.queue).toHaveLength(2);
    expectRejected(worldInput({ mission: withGroup(1024, 0) }), `${MISSION}.groups[0].spawnCount`, 'spawnExpansion');
    expect(create({ mission: withGroup(0xffffffff, 64) }).spawn.queue[1].requests).toBe(-1);
  });
});

describe('setupHash (P3-02 S-08, 快照、哈希与 replay)', () => {
  const hashOf = (parts: WorldInputParts = {}) => create(parts).config.setupHash;

  it('is 16 lowercase hex digits of the setup alone: not of the run or the identity', () => {
    const hash = hashOf();
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
    expect(hashOf({ run: { seed: 1, wingman: 2, rawDifficulty: 0 } })).toBe(hash);
    expect(hashOf({ identity: originalImportIdentity() })).toBe(hash);
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
      const hash = setupHash(setup);
      const changed = { ...setup, wingmanOptions: setup.wingmanOptions.map((option, index) => (index === 1 ? { ...option, eventTrigger: 0 } : option)) };
      expect(hash).toBe(hashOf());
      expect(setupHash(changed)).not.toBe(hash);
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
