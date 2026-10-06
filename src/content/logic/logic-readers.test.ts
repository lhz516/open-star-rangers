import { describe, expect, it } from 'vitest';
import { LOGIC_LIMITS } from './logic-content.ts';
import { MARKER, declaration, syntheticCraftTypes, syntheticMission, syntheticRoster } from './logic-content.test-support.ts';
import { readCraftTypeTable, readLogicContent, readMissionContent, readWingmanRoster } from './logic-readers.ts';

type Mission = ReturnType<typeof syntheticMission>;
type Roster = ReturnType<typeof syntheticRoster>;
type CraftTypes = ReturnType<typeof syntheticCraftTypes>;

const contractError = (code: string, path: string) => expect.objectContaining({ name: 'ContentContractError', code, path });

const deepFrozen = (value: unknown): boolean =>
  typeof value !== 'object' || value === null || (Object.isFrozen(value) && Object.values(value).every(deepFrozen));

const changed = <T>(build: () => T, change: (value: T) => void): T => {
  const value = build();
  change(value);
  return value;
};

describe('logic content readers', () => {
  it.each([
    ['mission', syntheticMission, readMissionContent],
    ['craft types', syntheticCraftTypes, readCraftTypeTable],
    ['wingman roster', syntheticRoster, readWingmanRoster],
  ] as const)('read the synthetic %s as frozen copies isolated from the input', (_, build, read) => {
    const input = build();
    const result = read(input);
    expect(result).toEqual(build());
    expect(deepFrozen(result)).toBe(true);
    expect(structuredClone(result)).toEqual(result);
    (input as { [key: string]: unknown })[Object.keys(input)[0]] = null;
    expect(result).toEqual(build());
    expect(read(build())).toEqual(result);
  });

  it('dispatches by role and keeps the role', () => {
    expect(readLogicContent('wingman-roster', syntheticRoster())).toEqual({ role: 'wingman-roster', content: syntheticRoster() });
    expect(() => readLogicContent('map' as never, {})).toThrowError(contractError('invalid-logic-payload', 'role'));
  });

  it('turns -0 into 0 and keeps integer boundaries', () => {
    const mission = readMissionContent(changed(syntheticMission, value => {
      value.declarations[0].position.x = -0;
      value.groups[0].layout[0].z = -0;
      value.declarations[0].ruleInputs.percentB = -0x80000000;
      value.declarations[0].ruleInputs.aiValueA = 0x7fffffff;
      value.declarations[0].ruleInputs.craftCount = 0;
    }));
    expect(Object.is(mission.declarations[0].position.x, 0)).toBe(true);
    expect(Object.is(mission.groups[0].layout[0].z, 0)).toBe(true);
    expect(mission.declarations[0].ruleInputs).toMatchObject({ percentB: -0x80000000, aiValueA: 0x7fffffff, craftCount: 0 });
    expect(mission.declarations[2].ruleInputs.percentA).toBe(0xffffffff);
  });

  it('accepts a declaration that is both a group template and a member of another group', () => {
    const mission = changed(syntheticMission, value => {
      value.declarations[3].origins = ['object', 'group-template', 'group-member'];
      value.declarations[3].memberOf = 0;
      value.groups[0].members.push(3);
    });
    expect(readMissionContent(mission).groups[0].members).toEqual([2, 2, 3]);
  });

  it('accepts structures exactly at their limits', () => {
    const names = (count: number) => Array.from({ length: count }, (_, index) => `n${index}`.padEnd(LOGIC_LIMITS.nameLength, 'x'));
    const mission = changed(syntheticMission, value => {
      value.namePool = names(LOGIC_LIMITS.namePool);
      value.declarations[5].nameCandidates = names(LOGIC_LIMITS.nameCandidates);
      value.spawnRegions = Array.from({ length: LOGIC_LIMITS.spawnRegions }, () => ({ x0: 0, y0: 0, x1: 1, y1: 1 }));
      value.groups[0].layout = Array.from({ length: LOGIC_LIMITS.layoutElements }, () => ({ x: 0, y: 0, z: 0 }));
      value.groups[0].members = Array.from({ length: LOGIC_LIMITS.groupMembers }, () => 2);
    });
    expect(readMissionContent(mission).groups[0].members).toHaveLength(LOGIC_LIMITS.groupMembers);
    // At most 64 section-1 declarations, then group-only members in first-use order up to the declaration limit.
    const full = changed(syntheticMission, value => {
      for (let index = 5; index < LOGIC_LIMITS.objects; index++) value.declarations.splice(index, 0, declaration(index));
      value.declarations.forEach((item, index) => { item.index = index; });
      value.groups[1].members = [LOGIC_LIMITS.objects];
      while (value.declarations.length < LOGIC_LIMITS.declarations) {
        const first = value.declarations.length;
        const members = Array.from({ length: Math.min(LOGIC_LIMITS.groupMembers, LOGIC_LIMITS.declarations - first) }, (_, offset) => first + offset);
        members.forEach(index => value.declarations.push(declaration(index, { origins: ['group-member'], memberOf: value.groups.length })));
        value.groups.push({ template: 1, members, spawnCount: 1, layout: [{ x: 0, y: 0, z: 0 }] });
      }
    });
    expect(readMissionContent(full).declarations).toHaveLength(LOGIC_LIMITS.declarations);
    const roster = changed(syntheticRoster, value => {
      value.options = Array.from({ length: LOGIC_LIMITS.wingmanOptions }, (_, index) => declaration(index, { origins: ['wingman-option'] }));
    });
    expect(readWingmanRoster(roster).options).toHaveLength(LOGIC_LIMITS.wingmanOptions);
  });

  const missionCases: readonly (readonly [string, (value: Mission) => void, string, string])[] = [
    ['a missing field', value => { delete (value as Partial<Mission>).namePool; }, 'invalid-logic-payload', 'mission.namePool'],
    ['an unknown field', value => { Object.assign(value.coordinates, { extra: 1 }); }, 'invalid-logic-payload', 'mission.coordinates'],
    ['another campaign', value => { value.campaign.slot = 2; }, 'invalid-logic-payload', 'mission.campaign'],
    ['another unit', value => { value.coordinates.unit = 'scen-runtime'; }, 'invalid-logic-payload', 'mission.coordinates.unit'],
    ['a zero reference scale', value => { value.coordinates.referenceScale = 0; }, 'invalid-logic-payload', 'mission.coordinates.referenceScale'],
    ['a model as craft type table', value => { value.references.craftTypes = 'model/craft-types'; }, 'invalid-logic-payload', 'mission.references.craftTypes'],
    ['a malformed Asset ID', value => { value.references.wingmanRoster = 'data/Roster'; }, 'invalid-logic-payload', 'mission.references.wingmanRoster'],
    ['one Asset for both references', value => { value.references.wingmanRoster = value.references.craftTypes; }, 'logic-reference-mismatch', 'mission.references.wingmanRoster'],
    ['map axes on one axis', value => { value.mapFrame.upAxis = '-x'; }, 'invalid-logic-payload', 'mission.mapFrame.upAxis'],
    ['an unknown map axis', value => { value.mapFrame.rightAxis = 'x'; }, 'invalid-logic-payload', 'mission.mapFrame.rightAxis'],
    ['a non-positive half extent', value => { value.mapFrame.halfExtent = -1; }, 'invalid-logic-payload', 'mission.mapFrame.halfExtent'],
    ['a non-finite map centre', value => { value.mapFrame.center.up = Number.NaN; }, 'invalid-logic-payload', 'mission.mapFrame.center.up'],
    ['an empty name', value => { value.namePool[1] = ''; }, 'invalid-logic-payload', 'mission.namePool[1]'],
    ['a name beyond the length limit', value => { value.namePool[0] = 'n'.repeat(LOGIC_LIMITS.nameLength + 1); }, 'invalid-logic-payload', 'mission.namePool[0]'],
    ['a non-ASCII name', value => { value.namePool[0] = `${MARKER}\u00e9`; }, 'invalid-logic-payload', 'mission.namePool[0]'],
    ['a control character in a name', value => { value.declarations[2].nameCandidates[1] = `${MARKER}\n`; }, 'invalid-logic-payload', 'mission.declarations[2].nameCandidates[1]'],
    ['too many name candidates', value => { value.declarations[2].nameCandidates = Array(LOGIC_LIMITS.nameCandidates + 1).fill('n'); }, 'invalid-logic-payload', 'mission.declarations[2].nameCandidates'],
    ['too many pool names', value => { value.namePool = Array(LOGIC_LIMITS.namePool + 1).fill('n'); }, 'invalid-logic-payload', 'mission.namePool'],
    ['too many spawn regions', value => { value.spawnRegions = Array(LOGIC_LIMITS.spawnRegions + 1).fill(value.spawnRegions[0]); }, 'invalid-logic-payload', 'mission.spawnRegions'],
    ['a fractional rectangle', value => { value.spawnRegions[1].x1 = 0.5; }, 'invalid-logic-payload', 'mission.spawnRegions[1].x1'],
    ['too many declarations', value => { value.declarations = Array(LOGIC_LIMITS.declarations + 1).fill(value.declarations[4]); }, 'invalid-logic-payload', 'mission.declarations'],
    ['too many object declarations', value => { for (let index = 5; index <= LOGIC_LIMITS.objects; index++) value.declarations.splice(index, 0, declaration(index)); value.declarations.forEach((item, index) => { item.index = index; }); value.groups[1].members = [value.declarations.length - 1]; }, 'invalid-logic-payload', 'mission.declarations'],
    ['an object after a group-only declaration', value => { value.declarations.push(declaration(6)); }, 'logic-reference-mismatch', 'mission.declarations[6]'],
    ['group-only declarations out of first use order', value => { value.declarations.push(declaration(6, { origins: ['group-member'], memberOf: 0 })); value.groups[0].members = [2, 6]; }, 'logic-reference-mismatch', 'mission.declarations[5]'],
    ['too many groups', value => { value.groups = Array(LOGIC_LIMITS.groups + 1).fill(value.groups[0]); }, 'invalid-logic-payload', 'mission.groups'],
    ['too many group members', value => { value.groups[0].members = Array(LOGIC_LIMITS.groupMembers + 1).fill(2); }, 'invalid-logic-payload', 'mission.groups[0].members'],
    ['an empty layout', value => { value.groups[1].layout = []; }, 'invalid-logic-payload', 'mission.groups[1].layout'],
    ['too many layout elements', value => { value.groups[1].layout = Array(LOGIC_LIMITS.layoutElements + 1).fill({ x: 0, y: 0, z: 0 }); }, 'invalid-logic-payload', 'mission.groups[1].layout'],
    ['an infinite layout offset', value => { value.groups[0].layout[1].x = Number.POSITIVE_INFINITY; }, 'invalid-logic-payload', 'mission.groups[0].layout[1].x'],
    ['a spawn count beyond u32', value => { value.groups[0].spawnCount = 2 ** 32; }, 'invalid-logic-payload', 'mission.groups[0].spawnCount'],
    ['an infinite position', value => { value.declarations[5].position.y = Number.NEGATIVE_INFINITY; }, 'invalid-logic-payload', 'mission.declarations[5].position.y'],
    ['a craft type beyond 31', value => { value.declarations[0].craftType = 32; }, 'invalid-logic-payload', 'mission.declarations[0].craftType'],
    ['a negative spawn time', value => { value.declarations[3].spawnTime = -1; }, 'invalid-logic-payload', 'mission.declarations[3].spawnTime'],
    ['a u32 rule input of 2^32', value => { value.declarations[0].ruleInputs.craftCount = 2 ** 32; }, 'invalid-logic-payload', 'mission.declarations[0].ruleInputs.craftCount'],
    ['a negative u32 rule input', value => { value.declarations[0].ruleInputs.percentA = -1; }, 'invalid-logic-payload', 'mission.declarations[0].ruleInputs.percentA'],
    ['an i32 rule input of 2^31', value => { value.declarations[0].ruleInputs.aiValueC = 2 ** 31; }, 'invalid-logic-payload', 'mission.declarations[0].ruleInputs.aiValueC'],
    ['an i32 rule input below -2^31', value => { value.declarations[0].ruleInputs.percentD = -(2 ** 31) - 1; }, 'invalid-logic-payload', 'mission.declarations[0].ruleInputs.percentD'],
    ['a grid spacing beyond i32', value => { value.declarations[5].gridSpacing = 2 ** 31; }, 'invalid-logic-payload', 'mission.declarations[5].gridSpacing'],
    ['a string number', value => { (value.declarations[0] as { spawnTime: unknown }).spawnTime = '0'; }, 'invalid-logic-payload', 'mission.declarations[0].spawnTime'],
    ['empty origins', value => { value.declarations[4].origins = []; }, 'invalid-logic-payload', 'mission.declarations[4].origins'],
    ['origins out of order', value => { value.declarations[2].origins = ['group-member', 'object']; }, 'invalid-logic-payload', 'mission.declarations[2].origins[1]'],
    ['a repeated origin', value => { value.declarations[4].origins = ['object', 'object']; }, 'invalid-logic-payload', 'mission.declarations[4].origins[1]'],
    ['a wingman origin in a mission', value => { value.declarations[4].origins = ['wingman-option']; }, 'invalid-logic-payload', 'mission.declarations[4].origins[0]'],
    ['unordered AI target craft types', value => { value.declarations[2].aiTargetCraftTypes = [17, 0]; }, 'invalid-logic-payload', 'mission.declarations[2].aiTargetCraftTypes[1]'],
    ['a repeated AI target craft type', value => { value.declarations[2].aiTargetCraftTypes = [0, 0]; }, 'invalid-logic-payload', 'mission.declarations[2].aiTargetCraftTypes[1]'],
    ['a declaration index gap', value => { value.declarations[3].index = 4; }, 'logic-reference-mismatch', 'mission.declarations[3].index'],
    ['a missing template', value => { value.groups[1].template = 6; }, 'logic-reference-mismatch', 'mission.groups[1].template'],
    ['a template without its origin', value => { value.groups[1].template = 4; }, 'logic-reference-mismatch', 'mission.groups[1].template'],
    ['a member without its origin', value => { value.groups[0].members.push(4); }, 'logic-reference-mismatch', 'mission.groups[0].members[2]'],
    ['a member of another group', value => { value.groups[0].members.push(5); }, 'logic-reference-mismatch', 'mission.groups[0].members[2]'],
    ['a missing member', value => { value.groups[1].members = [9]; }, 'logic-reference-mismatch', 'mission.groups[1].members[0]'],
    ['an unlisted member', value => { value.groups[1].members = []; }, 'logic-reference-mismatch', 'mission.declarations[5].origins'],
    ['an unused template origin', value => { value.declarations[4].origins = ['object', 'group-template']; }, 'logic-reference-mismatch', 'mission.declarations[4].origins'],
    ['a memberOf without a listing', value => { value.declarations[4].memberOf = 0; }, 'logic-reference-mismatch', 'mission.declarations[4].memberOf'],
    ['a missing spawn region', value => { value.declarations[0].placement.region = 2; }, 'logic-reference-mismatch', 'mission.declarations[0].placement.region'],
    ['a missing anchor', value => { value.declarations[3].placement.anchor = 6; }, 'logic-reference-mismatch', 'mission.declarations[3].placement.anchor'],
    ['a missing AI target', value => { value.declarations[3].aiTarget = 6; }, 'logic-reference-mismatch', 'mission.declarations[3].aiTarget'],
  ];

  it.each(missionCases)('rejects a mission with %s', (_, change, code, path) => {
    expect(() => readMissionContent(changed(syntheticMission, change))).toThrowError(contractError(code, path));
  });

  const craftTypeCases: readonly (readonly [string, (value: CraftTypes) => void, string, string])[] = [
    ['two players', value => { value.entries[1].side = 'player'; }, 'invalid-logic-payload', 'craftTypes.entries'],
    ['no player', value => { value.entries[0].side = 'enemy'; }, 'invalid-logic-payload', 'craftTypes.entries'],
    ['an unknown side', value => { value.entries[2].side = 'hostile'; }, 'invalid-logic-payload', 'craftTypes.entries[2].side'],
    ['unordered craft types', value => { value.entries.reverse(); }, 'invalid-logic-payload', 'craftTypes.entries[1]'],
    ['a repeated craft type', value => { value.entries[2].craftType = 1; }, 'invalid-logic-payload', 'craftTypes.entries[2]'],
    ['a non-boolean interaction flag', value => { (value.entries[4] as { baseInteraction: unknown }).baseInteraction = 1; }, 'invalid-logic-payload', 'craftTypes.entries[4].baseInteraction'],
    ['a non-model reference', value => { value.entries[3].model = { id: 'image/enemy-ship-2', kind: 'image' }; }, 'invalid-logic-payload', 'craftTypes.entries[3].model.kind'],
    ['a kind that does not match the ID', value => { value.entries[3].model.kind = 'image'; }, 'invalid-logic-payload', 'craftTypes.entries[3].model.kind'],
  ];

  it.each(craftTypeCases)('rejects craft types with %s', (_, change, code, path) => {
    expect(() => readCraftTypeTable(changed(syntheticCraftTypes, change))).toThrowError(contractError(code, path));
  });

  const rosterCases: readonly (readonly [string, (value: Roster) => void, string, string])[] = [
    ['an object origin', value => { value.options[0].origins = ['object']; }, 'invalid-logic-payload', 'wingmanRoster.options[0].origins[0]'],
    ['too many options', value => { value.options = Array(LOGIC_LIMITS.wingmanOptions + 1).fill(value.options[0]); }, 'invalid-logic-payload', 'wingmanRoster.options'],
    ['an index gap', value => { value.options[1].index = 2; }, 'logic-reference-mismatch', 'wingmanRoster.options[1].index'],
    ['a placement region', value => { value.options[0].placement.region = 0; }, 'logic-reference-mismatch', 'wingmanRoster.options[0]'],
    ['an anchor', value => { value.options[1].placement.anchor = 0; }, 'logic-reference-mismatch', 'wingmanRoster.options[1]'],
    ['a group membership', value => { value.options[0].memberOf = 0; }, 'logic-reference-mismatch', 'wingmanRoster.options[0]'],
    ['an AI target', value => { value.options[1].aiTarget = 0; }, 'logic-reference-mismatch', 'wingmanRoster.options[1]'],
    ['a non-data craft type reference', value => { value.references.craftTypes = 'mission/craft-types'; }, 'invalid-logic-payload', 'wingmanRoster.references.craftTypes'],
  ];

  it.each(rosterCases)('rejects a wingman roster with %s', (_, change, code, path) => {
    expect(() => readWingmanRoster(changed(syntheticRoster, change))).toThrowError(contractError(code, path));
  });

  it('rejects oversized arrays before reading their items', () => {
    const declarations = new Proxy(Array(LOGIC_LIMITS.declarations + 1).fill(null), {
      getOwnPropertyDescriptor: () => { throw new Error('an item was read'); },
    });
    expect(() => readMissionContent({ ...syntheticMission(), declarations }))
      .toThrowError(contractError('invalid-logic-payload', 'mission.declarations'));
  });

  it('never echoes names, numbers or unknown keys in diagnostics', () => {
    const failures = [
      () => readMissionContent(changed(syntheticMission, value => { value.namePool[0] = `${MARKER}\u0001`; })),
      () => readMissionContent(changed(syntheticMission, value => { Object.assign(value.declarations[0], { [MARKER]: MARKER }); })),
      () => readMissionContent(changed(syntheticMission, value => { value.declarations[0].position.x = Number.NaN; })),
    ];
    for (const failure of failures) {
      expect(failure).toThrowError();
      try {
        failure();
      } catch (error) {
        expect(String((error as Error).message)).not.toContain(MARKER);
        expect(JSON.stringify(error)).not.toContain(MARKER);
      }
    }
  });
});
