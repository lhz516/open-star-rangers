import { describe, expect, it } from 'vitest';
import { ContentContractError } from '../../content/contract-validation.ts';
import { LOGIC_IDS, syntheticMission, syntheticRoster } from '../../content/logic/logic-content.test-support.ts';
import { loadMission } from '../../core/mission/load-mission.ts';
import { imported, logicGroupInput, packageCraftTypes } from './resource-holder.test-support.ts';
import { missionInput } from './mission-input.ts';

// The mission input shared by the mission diagnostics and the mission owner (P3-04 subtask 05): the three logic Assets
// of a held logic group, decoded as the diagnostics always did.

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
    let error: unknown;
    try {
      missionInput(imported('logic', logicGroupInput({ missionBytes })));
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(ContentContractError);
    expect((error as ContentContractError).path).toBe(`logic[${LOGIC_IDS.mission}].payload`);
  });
});
