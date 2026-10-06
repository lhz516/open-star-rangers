import { describe, expect, it } from 'vitest';
import { ContentContractError } from '../../content/contract-validation.ts';
import {
  LOGIC_IDS, MARKER, deepFrozen, syntheticCraftTypes, syntheticMission, syntheticRoster,
} from '../../content/logic/logic-content.test-support.ts';
import { CoreInputError } from '../errors.ts';
import { loadMission, type LoadMissionInput } from './load-mission.ts';

type Input = {
  mission: { id: unknown; content: ReturnType<typeof syntheticMission> };
  craftTypes: { id: unknown; content: ReturnType<typeof syntheticCraftTypes> };
  wingmanRoster: { id: unknown; content: ReturnType<typeof syntheticRoster> };
};

/** Distinctive coordinates in the mission, which no diagnostic may echo. */
const COORDINATES = /98765|86420|13579/;

/** The synthetic mission with distinctive coordinates in a position, a spawn rectangle and a layout. */
function mission() {
  const content = syntheticMission();
  content.declarations[0].position = { x: 98765.25, y: 0, z: 0 };
  content.spawnRegions[0].x0 = -86420;
  content.groups[0].layout[1].x = 13579.5;
  return content;
}

const input = (): Input => ({
  mission: { id: LOGIC_IDS.mission, content: mission() },
  craftTypes: { id: LOGIC_IDS.craftTypes, content: syntheticCraftTypes() },
  wingmanRoster: { id: LOGIC_IDS.wingmanRoster, content: syntheticRoster() },
});
const changed = (change: (value: Input) => void): Input => {
  const value = input();
  change(value);
  return value;
};

const resolved = (side: string | null, model: string | null, baseInteraction = false) => ({ side, model, baseInteraction });
/** Each synthetic mission declaration's craft type resolved through the synthetic table. */
const MISSION_RESOLUTION = [
  resolved('player', 'model/player-ship'),
  resolved(null, null),
  resolved('enemy', 'model/enemy-ship-1'),
  resolved('enemy', 'model/enemy-ship-1'),
  resolved('friendly', 'model/base-1', true),
  resolved('enemy', 'model/enemy-ship-2'),
];

const load = (value: unknown) => loadMission(value as LoadMissionInput);

/** The error loading `value` throws, checked to carry no name or coordinate. */
function thrown(value: unknown): Error & { path?: string; code?: string; reason?: string } {
  try {
    load(value);
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    const text = `${(error as Error).message} ${JSON.stringify(error)}`;
    expect(text).not.toContain(MARKER);
    expect(text).not.toMatch(COORDINATES);
    return error as Error & { path?: string; code?: string; reason?: string };
  }
  throw new Error('expected loadMission to throw');
}

describe('loadMission', () => {
  it('resolves every declaration and copies the mission frame, pool, regions and groups, in the spec field order', () => {
    const content = mission();
    const roster = syntheticRoster();
    const setup = load(input());
    expect(setup).toEqual({
      mission: LOGIC_IDS.mission,
      campaign: content.campaign,
      coordinates: content.coordinates,
      mapFrame: content.mapFrame,
      namePool: content.namePool,
      spawnRegions: content.spawnRegions,
      declarations: content.declarations.map((declaration, index) => ({ ...declaration, ...MISSION_RESOLUTION[index] })),
      player: 0,
      groups: content.groups,
      wingmanOptions: roster.options.map(option => ({ ...option, ...resolved('friendly', 'model/player-ship') })),
    });
    expect(Object.keys(setup)).toEqual(['mission', 'campaign', 'coordinates', 'mapFrame', 'namePool', 'spawnRegions', 'declarations', 'player', 'groups', 'wingmanOptions']);
  });

  it('takes the scale and map frame from the input', () => {
    const mapFrame = { rightAxis: '-x', upAxis: '+z', center: { right: 12.5, up: -7.25 }, halfExtent: 999.5 };
    const setup = load(changed(value => {
      value.mission.content.coordinates.referenceScale = 2_000;
      Object.assign(value.mission.content, { mapFrame });
    }));
    expect(setup.coordinates.referenceScale).toBe(2_000);
    expect(setup.mapFrame).toEqual(mapFrame);
  });

  it('gives deeply equal frozen results that share nothing with the input', () => {
    const source = input();
    const first = load(source);
    expect(deepFrozen(first)).toBe(true);
    expect(load(input())).toEqual(first);
    expect(first.namePool).not.toBe(source.mission.content.namePool);
    expect(first.declarations[2].nameCandidates).not.toBe(source.mission.content.declarations[2].nameCandidates);
    source.mission.content.namePool[0] = 'changed';
    source.mission.content.declarations[0].placement.region = 1;
    source.craftTypes.content.entries[0].model.id = 'model/other';
    expect(first.namePool[0]).toBe(`${MARKER}-pool-1`);
    expect(first.declarations[0]).toMatchObject({ placement: { region: 0 }, model: 'model/player-ship' });
    expect(load(input())).toEqual(first);
  });

  it.each([
    ['input that is not an object', () => null, 'input'],
    ['an Asset that is not an object', () => changed(value => { (value as Record<string, unknown>).craftTypes = 'data/craft-types'; }), 'input.craftTypes'],
    ['a mission ID that is not an Asset ID', () => changed(value => { value.mission.id = 'Mission One'; }), 'input.mission.id'],
    ['a mission ID of another kind', () => changed(value => { value.mission.id = 'data/first-campaign'; }), 'input.mission.id'],
    ['a craft type table other than the referenced one', () => changed(value => { value.craftTypes.id = 'data/other-craft-types'; }), 'input.craftTypes.id'],
    ['a wingman roster other than the referenced one', () => changed(value => { value.wingmanRoster.id = 'data/other-roster'; }), 'input.wingmanRoster.id'],
    ['a roster referencing another craft type table', () => changed(value => { value.wingmanRoster.content.references.craftTypes = 'data/other-craft-types'; }),
      'input.wingmanRoster.content.references.craftTypes'],
    ['a referenced craft type the table lacks', () => changed(value => { value.mission.content.declarations[2].craftType = 9; }),
      'input.mission.content.declarations[2].craftType'],
    ['a wingman craft type the table lacks', () => changed(value => { value.wingmanRoster.content.options[1].craftType = 9; }),
      'input.wingmanRoster.content.options[1].craftType'],
    ['no player declaration', () => changed(value => { value.mission.content.declarations[0].craftType = 1; }), 'input.mission.content.declarations'],
    ['a second player declaration', () => changed(value => { value.mission.content.declarations[4].craftType = 0; }),
      'input.mission.content.declarations[4].craftType'],
    ['a player wingman option', () => changed(value => { value.wingmanRoster.content.options[1].craftType = 0; }),
      'input.wingmanRoster.content.options[1].craftType'],
    ['a craft type no declaration references', () => changed(value => {
      value.craftTypes.content.entries.push({ craftType: 25, side: 'friendly', baseInteraction: false, model: { id: 'model/friendly-craft-9', kind: 'model' } });
    }), 'input.craftTypes.content.entries[5]'],
  ] satisfies [string, () => unknown, string][])('rejects %s with CoreInputError at the input position', (_, build, path) => {
    const error = thrown(build());
    expect(error).toBeInstanceOf(CoreInputError);
    expect(error.path).toBe(path);
  });

  it.each([
    ['a group template beyond the declarations', () => changed(value => { value.mission.content.groups[0].template = 9; }),
      'logic-reference-mismatch', 'input.mission.content.groups[0].template'],
    ['a craft type table without a player', () => changed(value => { value.craftTypes.content.entries[0].side = 'friendly'; }),
      'invalid-logic-payload', 'input.craftTypes.content.entries'],
    ['a wingman option referencing a mission structure', () => changed(value => { value.wingmanRoster.content.options[0].aiTarget = 0; }),
      'logic-reference-mismatch', 'input.wingmanRoster.content.options[0]'],
  ] satisfies [string, () => unknown, string, string][])('passes the content error for %s through unchanged', (_, build, code, path) => {
    const error = thrown(build());
    expect(error).toBeInstanceOf(ContentContractError);
    expect(error).toMatchObject({ code, path, reason: expect.any(String) });
  });
});
