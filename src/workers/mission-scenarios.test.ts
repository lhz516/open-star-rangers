import { describe, expect, it } from 'vitest';
import { TEST_ENTRY_QUERY } from '../../tools/e2e-network-policy.ts';
import { diagnoseMission, type MissionLoadState } from '../app/resources/mission-diagnostics.ts';
import { ruleDataInputs, runModelInputs, type RuleDataInputs } from '../app/resources/mission-input.ts';
import { RESOURCE_GROUPS } from '../content/asset-contract.ts';
import { validateGroup, validatePackage, type PackageCompletenessResult } from '../content/completeness.ts';
import type { ContentIdentity } from '../content/content-identity.ts';
import type { MissionContent, WingmanRoster } from '../content/logic/logic-content.ts';
import { decodeLogicPayload } from '../content/logic/logic-payload.ts';
import { readGroupManifest } from '../content/manifest.ts';
import { readPayloadRecords } from '../content/payload.ts';
import type { CommMenus } from '../content/rule-data/comm-menus.ts';
import type { CommMessages } from '../content/rule-data/comm-messages.ts';
import type { CraftInfo } from '../content/rule-data/craft-info.ts';
import { decodeRuleDataPayload } from '../content/rule-data/rule-data-payload.ts';
import { CLASSIC_P2_SLICE } from '../content/slice-definition.ts';
import type { DomainEvent } from '../core/contracts/domain-events.ts';
import type { Command } from '../core/contracts/tick-input.ts';
import { DEFAULT_CLOCK_UNITS_PER_TICK } from '../core/contracts/time.ts';
import { CoreInputError } from '../core/errors.ts';
import { createWorld, type CreateWorldInput } from '../core/world/create-world.ts';
import { PRODUCTION_MISSION, PRODUCTION_RAW_DIFFICULTY } from '../core/world/run-config.ts';
import { thrownBy, tickInput } from '../core/world/world.test-support.ts';
import { PRODUCTION_CONVERTER_VERSION } from '../original-data/conversion/converter-version.ts';
import { FIVE_WINGMAN_NAMES, MARKER } from '../original-data/formats/formats.test-support.ts';
import {
  IMPORT_SCENARIOS, MISSION_SCENARIOS, scenarioEntryProfile, scenarioGroups, type MissionScenario, type ScenarioGroup,
} from './import-scenarios.test-support.ts';
import { PRODUCTION_PACKAGE } from './production-package.ts';
import { DOCKING_BASE_KIND_MASK, DOCKING_COMMAND_CODES, DOCKING_STILL_KINDS, DOCKING_STILL_SPEEDS } from './synthetic-import.test-support.ts';

// P3-04 subtask 01 (S-09): each mission scenario runs its production import job in Node; the groups it sends are kept
// as the import job owner and resource holder keep them (complete groups only, in slice definition order), judged as a
// whole package and diagnosed, and the startable and create-rejected missions go to `createWorld` with the package's
// craft info (P3-06 D-01), its rule-data inputs and the models of the craft each run instantiates (P3-07 CR-01), and
// the production run configuration.

/** Every run configuration the start page offers: no wingman and each of the five roster options. */
const WINGMEN = [null, 0, 1, 2, 3, 4] as const;
const SEED = 0x9e37_79b9;

interface Imported {
  /** Each sent group's own judgement, by group. */
  readonly groups: ReadonlyMap<string, ReturnType<typeof validateGroup>>;
  readonly held: readonly ScenarioGroup[];
  readonly completeness: PackageCompletenessResult;
  readonly mission: MissionLoadState;
}

async function imported(name: MissionScenario): Promise<Imported> {
  const sent = await scenarioGroups(name);
  const groups = new Map(sent.map(({ group, ...input }) => [group, validateGroup(CLASSIC_P2_SLICE, input)] as const));
  const held = sent.filter(({ group }) => groups.get(group)!.status === 'group-complete')
    .sort((left, right) => RESOURCE_GROUPS.indexOf(left.group) - RESOURCE_GROUPS.indexOf(right.group));
  return { groups, held, completeness: validatePackage(CLASSIC_P2_SLICE, held), mission: diagnoseMission(held) };
}

type LogicAssets = Pick<CreateWorldInput, 'mission' | 'craftTypes' | 'wingmanRoster' | 'craftInfo'> & RuleDataInputs;

/**
 * The held logic group's mission and the craft type table and roster it references, decoded as mission diagnostics
 * does, its craft info (P3-06 D-01), decoded with the rule-data payload reader, and the package's run-independent
 * rule-data inputs as the mission owner decodes them (P3-07 CR-01).
 */
function logicAssets(held: readonly ScenarioGroup[]): LogicAssets {
  const logic = held.find(({ group }) => group === 'logic')!;
  const { assets } = readGroupManifest(logic.manifest);
  const payloads = readPayloadRecords(logic.payloads);
  const asset = (found: (typeof assets)[number] | undefined, decode: typeof decodeLogicPayload | typeof decodeRuleDataPayload) => {
    if (!found) throw new Error('The logic group lacks a referenced Asset');
    return { id: found.id, content: decode(payloads.find(({ id }) => id === found.id)!.bytes, found).content };
  };
  const mission = asset(assets.find(({ role }) => role === 'mission'), decodeLogicPayload);
  const { references } = mission.content as MissionContent;
  return {
    mission,
    craftTypes: asset(assets.find(({ id }) => id === references.craftTypes), decodeLogicPayload),
    wingmanRoster: asset(assets.find(({ id }) => id === references.wingmanRoster), decodeLogicPayload),
    craftInfo: asset(assets.find(({ role }) => role === 'craft-info'), decodeRuleDataPayload),
    ...ruleDataInputs(held),
  };
}

/**
 * A production run of the package: its content, and the models of the craft the run instantiates as the mission owner
 * decodes them. When Core refuses the run's setup it names no models, and world creation reports the same refusal.
 */
function productionRun(held: readonly ScenarioGroup[], assets: LogicAssets, identity: ContentIdentity, wingman: number | null): CreateWorldInput {
  const { mission, craftTypes, wingmanRoster } = assets;
  const run = { rawDifficulty: PRODUCTION_RAW_DIFFICULTY, wingman, seed: SEED };
  return { ...assets, models: runModelInputs(held, { mission, craftTypes, wingmanRoster, identity, run }), identity, run } as CreateWorldInput;
}

const complete = (result: PackageCompletenessResult): ContentIdentity => {
  if (result.status !== 'complete') throw new Error(`The package is ${result.status}`);
  return result.identity;
};

describe('P3-04 mission scenarios (S-09)', () => {
  it('registers each as a Worker scenario under a test entry name, with the production profile of its disc', () => {
    const profiles = new Map(Object.keys(MISSION_SCENARIOS).map(name => [name, scenarioEntryProfile(name)]));
    for (const [name, profile] of profiles) {
      expect(TEST_ENTRY_QUERY.worker.test(name), name).toBe(true);
      expect(Object.hasOwn(IMPORT_SCENARIOS, name), name).toBe(true);
      expect(profile, name).toMatchObject({ converterVersion: PRODUCTION_CONVERTER_VERSION, limits: PRODUCTION_PACKAGE.limits });
    }
    // The partial and load-failed scenarios differ from the startable one in the job only; the rejected one in its disc.
    const startable = profiles.get('mission-startable');
    expect(profiles.get('mission-partial')).toEqual(startable);
    expect(profiles.get('mission-load-failed')).toEqual(startable);
    expect(profiles.get('mission-create-rejected')!.sourceFingerprint).not.toBe(startable!.sourceFingerprint);
    expect(profiles.get('mission-docking')!.sourceFingerprint).not.toBe(startable!.sourceFingerprint);
  });

  it('mission-startable: a complete package whose mission creates a world under the production run configuration', async () => {
    const { groups, held, completeness, mission } = await imported('mission-startable');
    expect([...groups.values()].map(({ status }) => status)).toEqual(RESOURCE_GROUPS.map(() => 'group-complete'));
    const identity = complete(completeness);
    const profile = scenarioEntryProfile('mission-startable')!;
    expect(identity).toMatchObject({ converterVersion: profile.converterVersion, origin: { type: 'original-import', sourceFingerprint: profile.sourceFingerprint } });
    expect(mission.status).toBe('loaded');
    if (mission.status !== 'loaded') return;
    expect(mission.summary).toMatchObject({ mission: PRODUCTION_MISSION, campaign: { group: 0, slot: 1 }, counts: { wingmanOptions: 5 } });
    expect(mission.references.models.every(({ present }) => present)).toBe(true);
    // One, two, no, one and three name candidates, so a start page shows each case; display names carry no privacy marker.
    const assets = logicAssets(held);
    const roster = assets.wingmanRoster.content as WingmanRoster;
    expect(roster.options.map(({ nameCandidates }) => nameCandidates)).toEqual(FIVE_WINGMAN_NAMES);
    expect(FIVE_WINGMAN_NAMES.flat().some(name => name.includes(MARKER))).toBe(false);

    for (const wingman of WINGMEN) {
      const world = createWorld(productionRun(held, assets, identity, wingman));
      expect(world.projection()).toMatchObject({
        clock: { tick: 0, clock: 0, clockUnitsPerTick: DEFAULT_CLOCK_UNITS_PER_TICK },
        mission: { mission: PRODUCTION_MISSION, group: 0, slot: 1, rawDifficulty: PRODUCTION_RAW_DIFFICULTY, wingman },
      });
      // The first tick instantiates the player, and the wingman exactly when one is chosen.
      const kinds = world.step(tickInput()).flatMap(event => (event.type === 'object-instantiated' ? [event.kindBit] : []));
      expect(kinds.filter(kind => kind === 0), String(wingman)).toHaveLength(1);
      expect(kinds.filter(kind => kind === 1), String(wingman)).toHaveLength(wingman === null ? 0 : 1);
    }
  });

  it('mission-partial: the job finishes with an incomplete audio group, so the held package is not complete although the mission loads', async () => {
    const expected = MISSION_SCENARIOS['mission-partial'];
    const { groups, completeness, mission } = await imported('mission-partial');
    for (const group of RESOURCE_GROUPS) {
      const result = groups.get(group)!;
      if (group !== expected.group) {
        expect(result.status, group).toBe('group-complete');
        continue;
      }
      expect(result.status === 'incomplete' && result.diagnostics.map(({ code, path }) => ({ code, path }))).toEqual([expected.groupDiagnostic]);
    }
    expect(completeness.status === 'incomplete' && completeness.diagnostics.map(({ code, path }) => ({ code, path }))).toEqual([expected.packageDiagnostic]);
    expect(mission.status).toBe('loaded');
  });

  it('mission-load-failed: a complete package whose mission diagnosis fails at the roster', async () => {
    const { completeness, mission } = await imported('mission-load-failed');
    expect(completeness.status).toBe('complete');
    expect(mission).toEqual({ status: 'failed', failure: MISSION_SCENARIOS['mission-load-failed'].failure });
  });

  it('mission-create-rejected: a complete package whose mission loads and whose world creation is rejected for every wingman choice', async () => {
    const { held, completeness, mission } = await imported('mission-create-rejected');
    const identity = complete(completeness);
    expect(mission.status).toBe('loaded');
    const assets = logicAssets(held);
    for (const wingman of WINGMEN) {
      const error = thrownBy(() => createWorld(productionRun(held, assets, identity, wingman)));
      expect(error, String(wingman)).toBeInstanceOf(CoreInputError);
      expect({ path: (error as CoreInputError).path, reason: (error as CoreInputError).reason }).toEqual(MISSION_SCENARIOS['mission-create-rejected'].failure);
    }
  });

  // P3-10 subtask 23: the disc the browser docking flow imports. `c`, 2 (the base category, whose one base opens its
  // command menu at once) and 2 (the docking request) dock under any seed, as the base starts within the docking range
  // of a still player and each of its five possible faces has a docking reply.
  it('mission-docking: a complete package whose base answers the menu\'s docking request under any seed', async () => {
    const { held, completeness, mission } = await imported('mission-docking');
    const identity = complete(completeness);
    expect(mission.status).toBe('loaded');
    const assets = logicAssets(held);
    const menus = assets.commMenus!.content as CommMenus;
    expect(menus.categories.map(({ kindMask }) => kindMask)).toEqual([1, DOCKING_BASE_KIND_MASK, 0]);
    expect(menus.gatedTargetCommands.map(({ command }) => command)).toEqual([DOCKING_COMMAND_CODES.status, DOCKING_COMMAND_CODES.docking, 0]);
    // The base pool's five faces each have the docking reply (index 0) and the status reply (index 1) of TABL 20011.
    const [baseFaces] = (assets.commMessages!.content as CommMessages).faceTables;
    expect(baseFaces.map(subTable => [subTable[0]?.present, subTable[1]?.present])).toEqual(Array.from({ length: 5 }, () => [true, true]));
    expect(DOCKING_STILL_KINDS.map(kindBit => (assets.craftInfo.content as CraftInfo).craft[kindBit].atB8)).toEqual(DOCKING_STILL_SPEEDS);

    const request: readonly Command[] = [
      { type: 'communications', operation: 'open' }, { type: 'select-number', value: 2 }, { type: 'select-number', value: 2 },
    ];
    const input = productionRun(held, assets, identity, null);
    for (const seed of [0x0eed_0001, 0x0eed_0002, 0x0eed_0003, SEED]) {
      const label = seed.toString(16);
      const world = createWorld({ ...input, run: { ...input.run, seed } });
      const events: DomainEvent[] = [];
      for (let tick = 1; tick <= 1_000; tick++) {
        const stepped = world.step(tickInput(tick === 60 ? request : []));
        events.push(...stepped);
        if (stepped.some(({ type }) => type === 'docked')) break;
      }
      const types = events.map(({ type }) => type);
      expect(types, label).toContain('docking-requested');
      expect(types, label).not.toContain('docking-cancelled');
      expect(types.at(-1), label).toBe('transition');
      expect(events.find(event => event.type === 'docked'), label).toMatchObject({ baseEntityId: expect.any(Number), wingmanEntityId: null });
    }
  });
});
