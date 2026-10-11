import { describe, expect, it } from 'vitest';
import type { AssetDescriptor } from '../../content/asset-contract.ts';
import type { AssetId } from '../../content/asset-id.ts';
import { ContentContractError } from '../../content/contract-validation.ts';
import type { ExplosionTable } from '../../content/flight/flight-data-content.ts';
import { LOGIC_IDS, syntheticMission, syntheticRoster } from '../../content/logic/logic-content.test-support.ts';
import { readCraftInfo } from '../../content/rule-data/craft-info.ts';
import { syntheticCraftInfo } from '../../content/rule-data/rule-data.test-support.ts';
import { loadMission } from '../../core/mission/load-mission.ts';
import { thrownBy } from '../../core/world/world.test-support.ts';
import { missionGroups } from '../mission/mission.test-support.ts';
import { imported, logicGroupInput, packageCraftTypes } from './resource-holder.test-support.ts';
import { craftInfoInput, missionInput, modelInputs, ruleDataInputs, type PackageGroup } from './mission-input.ts';

// The mission input shared by the mission diagnostics and the mission owner (P3-04 subtask 05): the three logic Assets
// of a held logic group, decoded as the diagnostics always did; and the craft info (P3-06 D-01, subtask 24) and the
// rule-data inputs and models (P3-07 CR-01, subtask 33) the mission owner adds for world creation.

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

describe('rule-data inputs and models (P3-07 CR-01)', () => {
  const groupsOf = async () => (await missionGroups('mission-startable')).filter(({ group }) => group !== 'audio');
  /** `groups` with `change` applied to a copy of the models group's manifest. */
  const withModelsManifest = (groups: readonly PackageGroup[], change: (assets: AssetDescriptor[]) => AssetDescriptor[]): PackageGroup[] =>
    groups.map((group) => {
      if (group.group !== 'models') return group;
      const manifest = structuredClone(group.manifest) as { assets: AssetDescriptor[] };
      return { ...group, manifest: { ...manifest, assets: change(manifest.assets) } };
    });

  it('decodes the DEBRIS table, the AI programs, the projectile visuals, the explosion table and exactly the animations it names, in ascending ID order', async () => {
    const groups = await groupsOf();
    const inputs = ruleDataInputs(groups);
    expect(inputs.debrisParameters?.id).toBe('data/debris-parameters');
    expect(inputs.aiPrograms).toMatchObject({ id: 'data/ai-programs', content: { builtInPrograms: expect.any(Array) } });
    expect(inputs.projectileVisuals).toMatchObject({ id: 'data/projectile-visuals', content: { kind: 'projectile' } });
    expect(inputs.explosions?.id).toBe('data/explosions');
    const named = (inputs.explosions!.content as ExplosionTable).lists.flat().map(({ animation }) => animation.id as string);
    const ids = inputs.explosionAnimations.map(({ id }) => id as string);
    expect(ids).toEqual([...new Set(named)].sort());
    expect(Object.isFrozen(inputs) && Object.isFrozen(inputs.explosionAnimations)).toBe(true);
  });

  it('leaves out what a package lacks, and a projectile data Asset that is not the only one, for world creation to reject', async () => {
    const groups = await groupsOf();
    expect(ruleDataInputs(groups.filter(({ group }) => group !== 'models'))).toEqual({
      debrisParameters: expect.objectContaining({ id: 'data/debris-parameters' }), projectileVisuals: undefined, explosions: undefined, explosionAnimations: [],
      aiPrograms: expect.objectContaining({ id: 'data/ai-programs' }),
    });
    const withoutAi = groups.map((group) => {
      if (group.group !== 'logic') return group;
      const manifest = group.manifest as { assets: AssetDescriptor[] };
      return { ...group, manifest: { ...manifest, assets: manifest.assets.filter(({ role }) => role !== 'ai-programs') } };
    });
    expect(ruleDataInputs(withoutAi).aiPrograms).toBeUndefined();
    expect(ruleDataInputs(groups.filter(({ group }) => group !== 'logic'))).toMatchObject({ debrisParameters: undefined, aiPrograms: undefined });
    const twice = withModelsManifest(groups, (assets) => [...assets, { ...assets.find(({ id }) => id === 'data/projectile-visuals')!, id: 'data/projectile-copy' as AssetId }]
      .sort((left, right) => (left.id < right.id ? -1 : 1)));
    expect(ruleDataInputs(twice).projectileVisuals).toBeUndefined();
    expect(modelInputs(groups.filter(({ group }) => group !== 'models'), ['model/player-ship' as AssetId])).toEqual([]);
  });

  it('decodes the models of the given IDs in their order, leaving out an ID the group lacks', async () => {
    const groups = await groupsOf();
    const models = modelInputs(groups, ['model/player-ship', 'model/missing', 'model/base-1'] as AssetId[]);
    expect(models.map(({ id }) => id)).toEqual(['model/player-ship', 'model/base-1']);
    expect(models[0].content).toMatchObject({ kind: 'model', partLists: expect.any(Array) });
  });

  it('places a decoding error under the Asset and group it came from', async () => {
    const groups = await groupsOf();
    const broken = withModelsManifest(groups, (assets) => assets.map((asset) =>
      (asset.id === 'model/player-ship' || asset.id === 'data/explosions' ? { ...asset, payloadIdentity: { ...asset.payloadIdentity, schemaVersion: 9 } } as AssetDescriptor : asset)));
    const table = thrownBy(() => ruleDataInputs(broken));
    expect(table).toBeInstanceOf(ContentContractError);
    expect((table as ContentContractError).path).toBe('models[data/explosions].descriptor.payloadIdentity.schemaVersion');
    const model = thrownBy(() => modelInputs(broken, ['model/player-ship'] as AssetId[]));
    expect((model as ContentContractError).path).toBe('models[model/player-ship].payload.schemaVersion');
  });
});
