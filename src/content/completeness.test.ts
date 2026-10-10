import { describe, expect, expectTypeOf, it } from 'vitest';
import type { ResourceGroup } from './asset-contract.ts';
import { validateGroup, validatePackage, type GroupCompletenessResult, type GroupInput, type PackageCompletenessResult } from './completeness.ts';
import { CLASSIC_P2_SLICE } from './slice-definition.ts';
import {
  diagnosticCodes, kindOf, SYNTHETIC_ASSETS, syntheticBytes, syntheticGroup, syntheticIdentity, syntheticOriginalGroup, syntheticPackage,
  VERSION_4_ROLES, type SyntheticAssetSpec,
} from './synthetic-content.test-support.ts';

describe('group completeness', () => {
  it.each(CLASSIC_P2_SLICE.groups)('%s is independently complete with typed external requirements', group => {
    const result = validateGroup(CLASSIC_P2_SLICE, syntheticGroup(group));
    expect(result.status).toBe('group-complete');
    if (result.status !== 'group-complete') return;
    expect(result.identity).toEqual(syntheticIdentity());
    expect(result.externalRequirements).toEqual({
      logic: ['model/synthetic-base', 'model/synthetic-enemy-a', 'model/synthetic-enemy-b', 'model/synthetic-player'],
      models: ['sound/synthetic-engine', 'sound/synthetic-explosion'],
      'cockpit-hud-map': [],
      audio: [],
    }[group].map(id => ({ id, kind: kindOf(id) })));
    expect(Object.isFrozen(result) && Object.isFrozen(result.externalRequirements) && Object.isFrozen(result.assets)).toBe(true);
  });

  it.each(CLASSIC_P2_SLICE.roles.map(({ role, group }) => [role, group] as const))('reports a missing %s role', (role, group) => {
    const specs = SYNTHETIC_ASSETS[group].filter(spec => spec.role !== role)
      .map(spec => ({ ...spec, dependencies: (spec.dependencies ?? []).filter(id => SYNTHETIC_ASSETS[group].find(other => other.id === id)?.role !== role) }));
    expect(diagnosticCodes(validateGroup(CLASSIC_P2_SLICE, syntheticGroup(group, specs)))).toContain(`role-cardinality@roles.${role}`);
  });

  it('rejects zero and three enemy models without trimming the list', () => {
    const enemies = (count: number) => [
      ...SYNTHETIC_ASSETS.models.filter(spec => spec.role !== 'enemy-ship'),
      ...Array.from({ length: count }, (_, index) => ({ id: `model/synthetic-enemy-${index}`, role: 'enemy-ship' })),
    ].sort((left, right) => (left.id < right.id ? -1 : 1));
    for (const count of [0, 3]) {
      const input = syntheticGroup('models', enemies(count));
      const result = validateGroup(CLASSIC_P2_SLICE, input);
      expect(diagnosticCodes(result)).toEqual(['role-cardinality@roles.enemy-ship']);
      expect(input.manifest.assets.filter(asset => asset.role === 'enemy-ship')).toHaveLength(count);
    }
  });

  /** The position of a synthetic models Asset, by the name after `synthetic-`. */
  const at = (name: string): number => SYNTHETIC_ASSETS.models.findIndex(({ id }) => id.endsWith(`/synthetic-${name}`));
  const [DEBRIS, HULL, SPARK, ANIMATION, BASE] = ['debris', 'hull', 'spark', 'animation', 'base'].map(at);
  const mutations: [string, (input: ReturnType<typeof syntheticGroup>) => void, string[]][] = [
    ['a missing in-group dependency', input => { input.manifest.assets[BASE].dependencies = [{ id: 'image/synthetic-absent', kind: 'image' }]; },
      [`missing-dependency@manifest.assets[${BASE}].dependencies[0]`]],
    ['a self-dependency', input => { input.manifest.assets[HULL].dependencies = [{ id: 'image/synthetic-hull', kind: 'image' }]; },
      [`self-dependency@manifest.assets[${HULL}].dependencies[0]`]],
    ['a dependency cycle', input => {
      input.manifest.assets[DEBRIS].dependencies = [{ id: 'image/synthetic-hull', kind: 'image' }];
      input.manifest.assets[HULL].dependencies = [{ id: 'image/synthetic-debris', kind: 'image' }];
    }, [`dependency-cycle@manifest.assets[${HULL}].dependencies[0]`]],
    ['a duplicate Asset ID', input => { input.manifest.assets[HULL] = { ...input.manifest.assets[DEBRIS] }; }, [`duplicate-asset@manifest.assets[${HULL}]`]],
    ['unordered Assets', input => { input.manifest.assets.reverse(); }, ['asset-order@manifest.assets[1]']],
    // The last image, so the layout ID keeps the Asset order.
    ['a kind the group does not own', input => {
      input.manifest.assets[SPARK] = { ...input.manifest.assets[SPARK], id: 'layout/synthetic-spark', kind: 'layout' };
      input.payloads[SPARK] = { ...input.payloads[SPARK], id: 'layout/synthetic-spark' };
    }, [`missing-dependency@manifest.assets[${ANIMATION}].dependencies[0]`, `kind-mismatch@manifest.assets[${SPARK}].kind`]],
    ['a role with a disallowed kind', input => { input.manifest.assets[DEBRIS].role = 'enemy-ship'; },
      [`kind-mismatch@manifest.assets[${DEBRIS}].kind`, 'role-cardinality@roles.debris', 'role-cardinality@roles.enemy-ship']],
    ['a role from another group', input => { input.manifest.assets[HULL].role = 'hud-mfd'; }, [`group-mismatch@manifest.assets[${HULL}].role`]],
    ['an Asset from another group', input => { input.manifest.assets[HULL].group = 'cockpit-hud-map'; }, [`group-mismatch@manifest.assets[${HULL}].group`]],
    ['a missing payload', input => { input.payloads.splice(HULL, 1); }, [`payload-missing@manifest.assets[${HULL}]`]],
    ['swapped payloads', input => { [input.payloads[0].bytes, input.payloads[1].bytes] = [input.payloads[1].bytes, input.payloads[0].bytes]; },
      ['payload-mismatch@payloads[0]', 'payload-mismatch@payloads[1]']],
    ['a truncated payload', input => { input.payloads[1].bytes = input.payloads[1].bytes.subarray(1); }, ['payload-mismatch@payloads[1]']],
    ['a same-length wrong payload', input => { input.payloads[1].bytes = input.payloads[1].bytes.map(value => value ^ 1); }, ['payload-mismatch@payloads[1]']],
    ['another payload version', input => { input.payloads[1].schemaVersion = 2; }, ['payload-mismatch@payloads[1]']],
    ['an unexpected payload', input => { input.payloads.push({ id: 'model/synthetic-zz-extra', schemaVersion: 1, bytes: syntheticBytes('extra') }); },
      [`payload-unexpected@payloads[${SYNTHETIC_ASSETS.models.length}]`]],
    ['a duplicate payload record', input => { input.payloads.splice(2, 0, { ...input.payloads[1], bytes: syntheticBytes('forged') }); }, ['duplicate-payload@payloads[2]']],
    ['unordered payload records', input => { input.payloads.reverse(); }, ['payload-order@payloads[1]']],
    ['a malformed dependency', input => { input.manifest.assets[3].dependencies = [{ id: 'Image/Hull', kind: 'image' }]; },
      ['invalid-asset-id@manifest.assets[3].dependencies[0].id']],
    ['a duplicate dependency', input => {
      input.manifest.assets[3].dependencies = [{ id: 'image/synthetic-hull', kind: 'image' }, { id: 'image/synthetic-hull', kind: 'image' }];
    }, ['duplicate-dependency@manifest.assets[3].dependencies[1]']],
    ['the previous definition version', input => { (input.manifest.identity as { sliceDefinitionVersion: number }).sliceDefinitionVersion = 3; },
      ['definition-version-mismatch@manifest.identity.sliceDefinitionVersion']],
    ['definition version 2', input => { (input.manifest.identity as { sliceDefinitionVersion: number }).sliceDefinitionVersion = 2; },
      ['definition-version-mismatch@manifest.identity.sliceDefinitionVersion']],
    ['the first definition version', input => { (input.manifest.identity as { sliceDefinitionVersion: number }).sliceDefinitionVersion = 1; },
      ['definition-version-mismatch@manifest.identity.sliceDefinitionVersion']],
    ['a forged complete flag', input => { Object.assign(input.manifest, { complete: true }); }, ['invalid-record@manifest']],
    ['an unknown schema', input => { input.manifest.identity.schemaVersion = 2; }, ['unsupported-schema@manifest.identity.schemaVersion']],
    ['source states on synthetic content', input => { input.sources = { sourceFingerprint: null, states: [] }; },
      ['source-unexpected@sources']],
  ];

  it.each(mutations)('rejects %s with stable codes', (_name, mutate, expected) => {
    const input = syntheticGroup('models');
    mutate(input);
    expect(diagnosticCodes(validateGroup(CLASSIC_P2_SLICE, input))).toEqual(expected);
  });

  it('requires a verified source for every original-import Asset and reports research blockers', () => {
    expect(validateGroup(CLASSIC_P2_SLICE, syntheticOriginalGroup('audio')).status).toBe('group-complete');
    const input = syntheticOriginalGroup('audio');
    const states = input.sources!.states.filter(source => source.id !== 'sound/synthetic-fire');
    states[0] = { id: 'sound/synthetic-engine', state: 'unconfirmed', unknowns: ['U-027'] };
    input.sources = { ...input.sources!, states };
    const result = validateGroup(CLASSIC_P2_SLICE, input);
    expect(diagnosticCodes(result)).toEqual(['source-not-ready@manifest.assets[0]', 'source-missing@manifest.assets[2]']);
    expect(result.status === 'incomplete' && result.diagnostics[0]).toMatchObject({ assetId: 'sound/synthetic-engine', unknowns: ['U-027'] });
  });

  it('binds source states to the manifest source fingerprint', () => {
    const other = syntheticOriginalGroup('audio');
    other.sources = { ...other.sources!, sourceFingerprint: 'source:another-disc' };
    expect(diagnosticCodes(validateGroup(CLASSIC_P2_SLICE, other))).toEqual(['source-fingerprint-mismatch@sources.sourceFingerprint']);
    const unverified = syntheticOriginalGroup('audio');
    unverified.sources = { ...unverified.sources!, sourceFingerprint: null };
    expect(diagnosticCodes(validateGroup(CLASSIC_P2_SLICE, unverified))).toEqual(['source-fingerprint-mismatch@sources.sourceFingerprint']);
    const absent = syntheticOriginalGroup('audio');
    absent.sources = null;
    expect(diagnosticCodes(validateGroup(CLASSIC_P2_SLICE, absent))).toEqual(['source-missing@sources']);
  });
});

describe('package completeness', () => {
  it('is complete only with all four consistent groups and resolved requirements', () => {
    const result = validatePackage(CLASSIC_P2_SLICE, syntheticPackage());
    expect(result).toEqual({ status: 'complete', identity: syntheticIdentity(), groups: [...CLASSIC_P2_SLICE.groups] });
    expect(validatePackage(CLASSIC_P2_SLICE, CLASSIC_P2_SLICE.groups.map(syntheticOriginalGroup)).status).toBe('complete');
  });

  it.each(CLASSIC_P2_SLICE.groups)('rejects a package without the %s group', group => {
    expect(diagnosticCodes(validatePackage(CLASSIC_P2_SLICE, syntheticPackage().filter(input => input.manifest.group !== group))))
      .toContain(`group-missing@groups.${group}`);
  });

  it('rejects a duplicated group and an incomplete group instead of returning a partial success', () => {
    expect(diagnosticCodes(validatePackage(CLASSIC_P2_SLICE, [...syntheticPackage(), syntheticGroup('audio')]))).toEqual(['group-duplicate@groups.audio']);
    const groups = syntheticPackage();
    groups[3].payloads.pop();
    expect(diagnosticCodes(validatePackage(CLASSIC_P2_SLICE, groups))).toEqual([`payload-missing@groups[3].manifest.assets[${SYNTHETIC_ASSETS.audio.length - 1}]`]);
  });

  it.each([
    ['manifest identity', { manifestIdentity: 'manifest:synthetic-other' }, 'package-identity-mismatch@groups[2].manifest.identity'],
    ['converter version', { converterVersion: 'synthetic-converter.2' }, 'package-identity-mismatch@groups[2].manifest.identity'],
    ['origin', { origin: { type: 'synthetic', fixtureId: 'p2-01-other' } }, 'package-identity-mismatch@groups[2].manifest.identity'],
    ['slice definition version 1', { sliceDefinitionVersion: 1 }, 'definition-version-mismatch@groups[2].manifest.identity.sliceDefinitionVersion'],
    ['slice definition version 2', { sliceDefinitionVersion: 2 }, 'definition-version-mismatch@groups[2].manifest.identity.sliceDefinitionVersion'],
    ['slice definition version 3', { sliceDefinitionVersion: 3 }, 'definition-version-mismatch@groups[2].manifest.identity.sliceDefinitionVersion'],
    ['content schema', { schemaVersion: 2 }, 'unsupported-schema@groups[2].manifest.identity.schemaVersion'],
    ['slice identity', { sliceId: 'another-slice' }, 'invalid-slice-id@groups[2].manifest.identity.sliceId'],
  ])('rejects groups mixed across %s', (_name, overrides, expected) => {
    const groups = syntheticPackage();
    groups[2] = syntheticGroup(CLASSIC_P2_SLICE.groups[2], undefined, overrides);
    expect(diagnosticCodes(validatePackage(CLASSIC_P2_SLICE, groups))).toEqual([expected]);
  });

  // P3-03 spec AC-12: the version 4 roles and their dependency closure.
  const groupOf = (role: string): ResourceGroup => CLASSIC_P2_SLICE.roles.find(requirement => requirement.role === role)!.group;
  /** The package with `group`'s Assets replaced by `specs`. */
  const packageWith = (group: ResourceGroup, specs: readonly SyntheticAssetSpec[]) =>
    syntheticPackage().map(input => (input.manifest.group === group ? syntheticGroup(group, specs) : input));

  it('covers every version 4 role in the complete synthetic package', () => {
    expect(VERSION_4_ROLES).toEqual(CLASSIC_P2_SLICE.roles.slice(15).map(({ role }) => role));
    for (const role of VERSION_4_ROLES) expect(SYNTHETIC_ASSETS[groupOf(role)].some(spec => spec.role === role), role).toBe(true);
  });

  it.each(VERSION_4_ROLES)('is incomplete without one %s Asset, by its role cardinality', role => {
    const group = groupOf(role);
    const removed = SYNTHETIC_ASSETS[group].find(spec => spec.role === role)!.id;
    const specs = SYNTHETIC_ASSETS[group].filter(({ id }) => id !== removed)
      .map(spec => ({ ...spec, dependencies: (spec.dependencies ?? []).filter(id => id !== removed) }));
    const result = validatePackage(CLASSIC_P2_SLICE, packageWith(group, specs));
    expect(result.status).toBe('incomplete');
    expect(diagnosticCodes(result)).toContain(`role-cardinality@groups[${CLASSIC_P2_SLICE.groups.indexOf(group)}].roles.${role}`);
  });

  it.each([
    ['an explosion animation', 'data/synthetic-animation', 'missing-dependency@groups[1].manifest.assets[0].dependencies[0]'],
    ['an explosion frame', 'image/synthetic-spark', 'missing-dependency@groups[1].manifest.assets[0].dependencies[0]'],
    ['a nebula image', 'image/synthetic-nebula', 'missing-dependency@groups[1].manifest.assets[2].dependencies[0]'],
  ])('is incomplete without %s the required Assets depend on', (_name, removed, expected) => {
    const result = validatePackage(CLASSIC_P2_SLICE, packageWith('models', SYNTHETIC_ASSETS.models.filter(({ id }) => id !== removed)));
    expect(diagnosticCodes(result)).toEqual([expected]);
  });

  it('is incomplete without an explosion sound the explosion table requires from the audio group', () => {
    const specs = SYNTHETIC_ASSETS.audio.filter(({ id }) => id !== 'sound/synthetic-explosion');
    // Another explosion sound keeps the role; only the cross-group requirement fails.
    const result = validatePackage(CLASSIC_P2_SLICE, packageWith('audio', [...specs, { id: 'sound/synthetic-zz-blast', role: 'explosion-sound' }]));
    expect(diagnosticCodes(result)).toEqual(['missing-dependency@groups[1].externalRequirements[1]']);
  });

  it.each([
    ['nine event sounds', 'event-sound', 9],
    ['seven event sounds', 'event-sound', 7],
    ['four HUD sounds', 'hud-sound', 4],
    ['two HUD sounds', 'hud-sound', 2],
  ])('is incomplete with %s', (_name, role, count) => {
    const specs = [
      ...SYNTHETIC_ASSETS.audio.filter(spec => spec.role !== role),
      ...Array.from({ length: count }, (_, index) => ({ id: `sound/synthetic-${role}-${index}`, role })),
    ].sort((left, right) => (left.id < right.id ? -1 : 1));
    expect(diagnosticCodes(validatePackage(CLASSIC_P2_SLICE, packageWith('audio', specs)))).toEqual([`role-cardinality@groups[3].roles.${role}`]);
  });

  it('reports a whole package of definition version 3 as a definition version mismatch', () => {
    const groups = CLASSIC_P2_SLICE.groups.map(group => syntheticGroup(group, undefined, { sliceDefinitionVersion: 3 }));
    const result = validatePackage(CLASSIC_P2_SLICE, groups);
    expect(result.status).toBe('incomplete');
    expect(diagnosticCodes(result)).toEqual(CLASSIC_P2_SLICE.groups.map((_, index) => `definition-version-mismatch@groups[${index}].manifest.identity.sliceDefinitionVersion`));
  });

  it('rejects an unresolved cross-group requirement such as a mission enemy left out', () => {
    const groups = syntheticPackage();
    groups[1] = syntheticGroup('models', SYNTHETIC_ASSETS.models.filter(spec => spec.id !== 'model/synthetic-enemy-b'));
    expect(validateGroup(CLASSIC_P2_SLICE, groups[1]).status).toBe('group-complete');
    expect(diagnosticCodes(validatePackage(CLASSIC_P2_SLICE, groups))).toEqual(['missing-dependency@groups[0].externalRequirements[2]']);
  });

  it('rejects an Asset in two groups and a cross-group cycle', () => {
    const withAsset = (group: ResourceGroup, role: string) =>
      syntheticGroup(group, [...SYNTHETIC_ASSETS[group], { id: 'image/synthetic-zz-hull', role }].sort((left, right) => (left.id < right.id ? -1 : 1)));
    const duplicate = syntheticPackage();
    duplicate[1] = withAsset('models', 'model-texture');
    duplicate[2] = withAsset('cockpit-hud-map', 'cockpit-image');
    const index = duplicate[2].manifest.assets.findIndex(({ id }) => id === 'image/synthetic-zz-hull');
    expect(diagnosticCodes(validatePackage(CLASSIC_P2_SLICE, duplicate))).toEqual([`duplicate-asset@groups[2].manifest.assets[${index}]`]);
    const cycle = syntheticPackage();
    cycle[3] = syntheticGroup('audio', SYNTHETIC_ASSETS.audio.map(spec => spec.id === 'sound/synthetic-engine' ? { ...spec, dependencies: ['model/synthetic-player'] } : spec));
    expect(diagnosticCodes(validatePackage(CLASSIC_P2_SLICE, cycle))).toEqual(['dependency-cycle@groups[3].manifest.assets[0].dependencies[0]']);
  });

  it('derives results only from raw inputs, isolated from later caller changes', () => {
    const groups = syntheticPackage();
    const forged = { status: 'group-complete', group: 'audio', identity: syntheticIdentity(), assets: [], externalRequirements: [] };
    expect(diagnosticCodes(validatePackage(CLASSIC_P2_SLICE, [...groups.slice(0, 3), forged as unknown as GroupInput])))
      .toEqual(['group-missing@groups.audio', 'invalid-record@groups[3].manifest']);
    const result = validatePackage(CLASSIC_P2_SLICE, groups);
    groups[0].manifest.identity.manifestIdentity = 'manifest:changed';
    groups[1].payloads[0].bytes.fill(0);
    expect(result).toEqual({ status: 'complete', identity: syntheticIdentity(), groups: [...CLASSIC_P2_SLICE.groups] });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('copies the defined groups into the result, isolated from a mutable copy of the definition', () => {
    const definition = structuredClone(CLASSIC_P2_SLICE);
    const result = validatePackage(definition, syntheticPackage());
    (definition.groups as ResourceGroup[]).reverse();
    expect(result).toEqual({ status: 'complete', identity: syntheticIdentity(), groups: [...CLASSIC_P2_SLICE.groups] });
    expect(result.status === 'complete' && Object.isFrozen(result.groups)).toBe(true);
  });

  it('keeps group and package success distinct, so a group result never passes as a whole package', () => {
    expectTypeOf<GroupCompletenessResult['status']>().toEqualTypeOf<'group-complete' | 'incomplete'>();
    expectTypeOf<PackageCompletenessResult['status']>().toEqualTypeOf<'complete' | 'incomplete'>();
    expectTypeOf<Extract<GroupCompletenessResult, { status: 'group-complete' }>>().not.toExtend<PackageCompletenessResult>();
  });
});
