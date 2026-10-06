import { describe, expect, it } from 'vitest';
import type { ResourceGroup } from '../../content/asset-contract.ts';
import { validateGroup } from '../../content/completeness.ts';
import { LOGIC_IDS, MARKER, syntheticMission, syntheticRoster } from '../../content/logic/logic-content.test-support.ts';
import { CLASSIC_P2_SLICE } from '../../content/slice-definition.ts';
import { SYNTHETIC_ASSETS, syntheticGroup } from '../../content/synthetic-content.test-support.ts';
import { diagnoseMission } from './mission-diagnostics.ts';
import type { HeldGroup } from './resource-holder.ts';
import {
  allGroups, committed, finishedJob, flush, imported, logicGroupInput, packageCraftTypes, testHolder, type LogicContents,
} from './resource-holder.test-support.ts';
import { resourceStatuses } from './resource-status.ts';

const logic = (contents: LogicContents = {}): HeldGroup => imported('logic', logicGroupInput(contents));
const models = (): HeldGroup => imported('models');
const ascii = (text: string) => Uint8Array.from(text, character => character.charCodeAt(0));

/** The logic group without its `role` Asset. */
function without(role: string): HeldGroup {
  const input = logicGroupInput();
  const manifest = input.manifest as { readonly assets: readonly { readonly id: string; readonly role: string }[] };
  const removed = manifest.assets.find(asset => asset.role === role)!.id;
  return imported('logic', {
    ...input,
    manifest: { ...manifest, assets: manifest.assets.filter(({ id }) => id !== removed) },
    payloads: (input.payloads as readonly { readonly id: string }[]).filter(({ id }) => id !== removed),
  });
}

describe('mission diagnostics', () => {
  it('summarizes the loaded mission exactly as computed from the same synthetic content', () => {
    const mission = syntheticMission();
    const craftTypes = packageCraftTypes();
    const roster = syntheticRoster();
    const side = new Map(craftTypes.entries.map(entry => [entry.craftType, entry]));
    const sides = { player: 0, friendly: 0, enemy: 0, none: 0 };
    for (const { craftType } of mission.declarations) sides[craftType === null ? 'none' : side.get(craftType)!.side as keyof typeof sides] += 1;
    const referenced = [...mission.declarations, ...roster.options].flatMap(({ craftType }) => (craftType === null ? [] : [side.get(craftType)!.model.id]));
    expect(diagnoseMission([logic(), models()])).toEqual({
      status: 'loaded',
      summary: {
        mission: LOGIC_IDS.mission,
        campaign: mission.campaign,
        mapAxes: { right: mission.mapFrame.rightAxis, up: mission.mapFrame.upAxis },
        units: { coordinates: mission.coordinates.unit, layout: mission.coordinates.layoutUnit },
        player: mission.declarations.findIndex(({ craftType }) => craftType !== null && side.get(craftType)!.side === 'player'),
        counts: {
          declarations: mission.declarations.length,
          groups: mission.groups.length,
          spawnRegions: mission.spawnRegions.length,
          wingmanOptions: roster.options.length,
          namePool: mission.namePool.length,
        },
        sides,
      },
      references: {
        declarationsWithModel: mission.declarations.filter(({ craftType }) => craftType !== null).length,
        wingmanOptionsWithModel: roster.options.length,
        modelsGroup: 'held',
        models: [...new Set(referenced)].sort().map(id => ({ id, present: true })),
      },
    });
  });

  it('marks every model absent without a models group, and each one the held models group lacks', () => {
    const none = diagnoseMission([logic()]);
    expect(none).toMatchObject({ status: 'loaded', references: { modelsGroup: 'not-held' } });
    expect(none.status === 'loaded' && none.references.models.every(({ present }) => !present)).toBe(true);
    const partial = imported('models', syntheticGroup('models', SYNTHETIC_ASSETS.models.filter(({ id }) => id !== 'model/synthetic-enemy-b')));
    const result = diagnoseMission([logic(), partial]);
    expect(result.status === 'loaded' && result.references.models).toEqual([
      { id: 'model/synthetic-base', present: true },
      { id: 'model/synthetic-enemy-a', present: true },
      { id: 'model/synthetic-enemy-b', present: false },
      { id: 'model/synthetic-player', present: true },
    ]);
  });

  it('reports a second player declaration as a Core input failure', () => {
    const mission = syntheticMission();
    mission.declarations[4].craftType = 0;
    expect(diagnoseMission([logic({ mission }), models()])).toEqual({
      status: 'failed',
      failure: { kind: 'core-input', path: 'input.mission.content.declarations[4].craftType', reason: 'is a second player declaration' },
    });
  });

  it('reports a craft type table lacking a referenced craft type as a Core input failure', () => {
    const craftTypes = packageCraftTypes();
    craftTypes.entries = craftTypes.entries.filter(({ craftType }) => craftType !== 8);
    expect(diagnoseMission([logic({ craftTypes }), models()])).toEqual({
      status: 'failed',
      failure: { kind: 'core-input', path: 'input.mission.content.declarations[5].craftType', reason: 'references a craft type the table lacks' },
    });
  });

  it('reports a damaged mission payload as a content failure at its Asset', () => {
    expect(diagnoseMission([logic({ missionBytes: ascii('{"campaign":') }), models()])).toEqual({
      status: 'failed',
      failure: { kind: 'content', path: `logic[${LOGIC_IDS.mission}].payload`, reason: 'must be JSON text' },
    });
  });

  it('reports a logic group without its craft type table at the missing input', () => {
    expect(diagnoseMission([without('craft-types'), models()])).toEqual({
      status: 'failed',
      failure: { kind: 'core-input', path: 'input.craftTypes', reason: 'must be an object' },
    });
  });

  it.each([['craft-types'], ['wingman-roster'], ['craft-types', 'wingman-roster']] as const)(
    'loads the Assets the mission references when the complete group also holds another %s Asset',
    (...duplicates) => {
      const group = logic({ duplicates });
      expect(validateGroup(CLASSIC_P2_SLICE, group)).toMatchObject({ status: 'group-complete' });
      expect(diagnoseMission([group, models()])).toEqual(diagnoseMission([logic(), models()]));
    },
  );

  it('does not attempt a mission without a logic group', () => {
    expect(diagnoseMission([models()])).toEqual({ status: 'not-attempted' });
  });

  it('keeps every name and other text out of the results', () => {
    const mission = syntheticMission();
    mission.declarations[4].craftType = 0;
    for (const groups of [[logic(), models()], [logic({ mission })], [logic({ missionBytes: ascii(`"${MARKER}"`) })]]) {
      const result = JSON.stringify(diagnoseMission(groups));
      expect(result).not.toContain(MARKER);
      expect(result).not.toContain('pool');
    }
    expect(syntheticMission().namePool.join()).toContain(MARKER);
  });
});

describe('mission diagnostics in the holder', () => {
  const groupsWith = (group: ResourceGroup, input: HeldGroup) => allGroups().map(entry => (entry.group === group ? input : entry));

  it('loads the mission once per held package, keeping the result across cache changes', async () => {
    const { holder, cache } = testHolder();
    holder.acceptImport(finishedJob(allGroups()));
    const { mission } = holder.getSnapshot().package!;
    expect(mission).toEqual(diagnoseMission(allGroups()));
    expect(resourceStatuses(holder.getSnapshot())).toContain('mission-loadable');
    cache.commits[0].result.resolve(committed(allGroups()));
    await flush();
    expect(holder.getSnapshot().package).toMatchObject({ cache: { status: 'saved' } });
    expect(holder.getSnapshot().package!.mission).toBe(mission);
  });

  it('shows a package whose mission fails as not loadable, even when the package is complete', () => {
    const mission = syntheticMission();
    mission.declarations[4].craftType = 0;
    const { holder } = testHolder();
    holder.acceptImport(finishedJob(groupsWith('logic', logic({ mission }))));
    expect(holder.getSnapshot().package).toMatchObject({ completeness: { status: 'complete' }, mission: { status: 'failed', failure: { kind: 'core-input' } } });
    expect(resourceStatuses(holder.getSnapshot())).toEqual(['complete-viewable', 'memory-only', 'saving', 'mission-not-loadable']);
  });
});
