import { describe, expect, it } from 'vitest';
import { ContentContractError } from '../../content/contract-validation.ts';
import { LOGIC_IDS, syntheticMission, syntheticRoster } from '../../content/logic/logic-content.test-support.ts';
import { readCraftInfo } from '../../content/rule-data/craft-info.ts';
import { syntheticCraftInfo } from '../../content/rule-data/rule-data.test-support.ts';
import { loadMission } from '../../core/mission/load-mission.ts';
import { thrownBy } from '../../core/world/world.test-support.ts';
import { imported, logicGroupInput, packageCraftTypes } from './resource-holder.test-support.ts';
import { craftInfoInput, missionInput } from './mission-input.ts';

// The mission input shared by the mission diagnostics and the mission owner (P3-04 subtask 05): the three logic Assets
// of a held logic group, decoded as the diagnostics always did; and the craft info the mission owner adds for world
// creation (P3-06 D-01, subtask 24).

describe('mission input', () => {
  it('decodes the mission and the craft type table and roster it references, by Asset ID among same-role Assets', () => {
    const input = missionInput(imported('logic', logicGroupInput({ duplicates: ['craft-types', 'wingman-roster'] })));
    expect(input.mission).toEqual({ id: LOGIC_IDS.mission, content: syntheticMission() });
    expect(input.craftTypes).toEqual({ id: LOGIC_IDS.craftTypes, content: packageCraftTypes() });
    expect(input.wingmanRoster).toEqual({ id: LOGIC_IDS.wingmanRoster, content: syntheticRoster() });
    expect(() => loadMission(input)).not.toThrow();
  });

  it('places a decoding error under the Asset it came from', () => {
    const missionBytes = new TextEncoder().encode('{"campaign":');
    const error = thrownBy(() => missionInput(imported('logic', logicGroupInput({ missionBytes }))));
    expect(error).toBeInstanceOf(ContentContractError);
    expect((error as ContentContractError).path).toBe(`logic[${LOGIC_IDS.mission}].payload`);
  });
});

describe('craft info input', () => {
  it('decodes the craft-info Asset of the same group with the rule-data payload reader', () => {
    const logic = imported('logic');
    const input = craftInfoInput(logic);
    expect(input).toEqual({ id: 'data/craft-info', content: readCraftInfo(syntheticCraftInfo()) });
    expect(Object.isFrozen(input?.content)).toBe(true);
    // The mission input of the same group is unaffected by it.
    expect(missionInput(logic).mission?.id).toBe(LOGIC_IDS.mission);
  });

  it('places a decoding error under the craft-info Asset, and leaves a group without one to world creation', () => {
    const craftInfoBytes = new TextEncoder().encode('{"craft":');
    const error = thrownBy(() => craftInfoInput(imported('logic', logicGroupInput({ craftInfoBytes }))));
    expect(error).toBeInstanceOf(ContentContractError);
    expect((error as ContentContractError).path).toBe('logic[data/craft-info].payload');
    // The mission input does not read the craft info.
    expect(() => missionInput(imported('logic', logicGroupInput({ craftInfoBytes })))).not.toThrow();

    const input = logicGroupInput();
    const manifest = input.manifest as { assets: { role: string }[] };
    const without = { ...input, manifest: { ...manifest, assets: manifest.assets.filter(({ role }) => role !== 'craft-info') } };
    expect(craftInfoInput(imported('logic', without))).toBeUndefined();
  });
});
