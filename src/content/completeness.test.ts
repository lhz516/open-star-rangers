import { describe, expect, expectTypeOf, it } from 'vitest';
import type { ResourceGroup } from './asset-contract.ts';
import { validateGroup, validatePackage, type GroupCompletenessResult, type GroupInput, type PackageCompletenessResult } from './completeness.ts';
import { CLASSIC_P2_SLICE } from './slice-definition.ts';
import {
  diagnosticCodes, kindOf, SYNTHETIC_ASSETS, syntheticBytes, syntheticGroup, syntheticIdentity, syntheticOriginalGroup, syntheticPackage,
} from './synthetic-content.test-support.ts';

describe('group completeness', () => {
  it.each(CLASSIC_P2_SLICE.groups)('%s is independently complete with typed external requirements', group => {
    const result = validateGroup(CLASSIC_P2_SLICE, syntheticGroup(group));
    expect(result.status).toBe('group-complete');
    if (result.status !== 'group-complete') return;
    expect(result.identity).toEqual(syntheticIdentity());
    expect(result.externalRequirements).toEqual({
      logic: ['model/synthetic-base', 'model/synthetic-enemy-a', 'model/synthetic-enemy-b', 'model/synthetic-player'],
      models: ['sound/synthetic-engine'],
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

  const mutations: [string, (input: ReturnType<typeof syntheticGroup>) => void, string[]][] = [
    ['a missing in-group dependency', input => { input.manifest.assets[2].dependencies = [{ id: 'image/synthetic-absent', kind: 'image' }]; },
      ['missing-dependency@manifest.assets[2].dependencies[0]']],
    ['a self-dependency', input => { input.manifest.assets[1].dependencies = [{ id: 'image/synthetic-hull', kind: 'image' }]; },
      ['self-dependency@manifest.assets[1].dependencies[0]']],
    ['a dependency cycle', input => {
      input.manifest.assets[0].dependencies = [{ id: 'image/synthetic-hull', kind: 'image' }];
      input.manifest.assets[1].dependencies = [{ id: 'image/synthetic-debris', kind: 'image' }];
    }, ['dependency-cycle@manifest.assets[1].dependencies[0]']],
    ['a duplicate Asset ID', input => { input.manifest.assets[1] = { ...input.manifest.assets[0] }; }, ['duplicate-asset@manifest.assets[1]']],
    ['unordered Assets', input => { input.manifest.assets.reverse(); }, ['asset-order@manifest.assets[1]']],
    ['a kind the group does not own', input => {
      input.manifest.assets[1] = { ...input.manifest.assets[1], id: 'layout/synthetic-hull', kind: 'layout' };
      input.payloads[1] = { ...input.payloads[1], id: 'layout/synthetic-hull' };
    }, ['kind-mismatch@manifest.assets[1].kind', 'missing-dependency@manifest.assets[2].dependencies[0]', 'missing-dependency@manifest.assets[3].dependencies[0]', 'missing-dependency@manifest.assets[6].dependencies[0]']],
    ['a role with a disallowed kind', input => { input.manifest.assets[0].role = 'enemy-ship'; },
      ['kind-mismatch@manifest.assets[0].kind', 'role-cardinality@roles.debris', 'role-cardinality@roles.enemy-ship']],
    ['a role from another group', input => { input.manifest.assets[1].role = 'hud-mfd'; }, ['group-mismatch@manifest.assets[1].role']],
    ['an Asset from another group', input => { input.manifest.assets[1].group = 'cockpit-hud-map'; }, ['group-mismatch@manifest.assets[1].group']],
    ['a missing payload', input => { input.payloads.splice(1, 1); }, ['payload-missing@manifest.assets[1]']],
    ['swapped payloads', input => { [input.payloads[0].bytes, input.payloads[1].bytes] = [input.payloads[1].bytes, input.payloads[0].bytes]; },
      ['payload-mismatch@payloads[0]', 'payload-mismatch@payloads[1]']],
    ['a truncated payload', input => { input.payloads[1].bytes = input.payloads[1].bytes.subarray(1); }, ['payload-mismatch@payloads[1]']],
    ['a same-length wrong payload', input => { input.payloads[1].bytes = input.payloads[1].bytes.map(value => value ^ 1); }, ['payload-mismatch@payloads[1]']],
    ['another payload version', input => { input.payloads[1].schemaVersion = 2; }, ['payload-mismatch@payloads[1]']],
    ['an unexpected payload', input => { input.payloads.push({ id: 'model/synthetic-zz-extra', schemaVersion: 1, bytes: syntheticBytes('extra') }); }, ['payload-unexpected@payloads[8]']],
    ['a duplicate payload record', input => { input.payloads.splice(2, 0, { ...input.payloads[1], bytes: syntheticBytes('forged') }); }, ['duplicate-payload@payloads[2]']],
    ['unordered payload records', input => { input.payloads.reverse(); }, ['payload-order@payloads[1]']],
    ['a malformed dependency', input => { input.manifest.assets[3].dependencies = [{ id: 'Image/Hull', kind: 'image' }]; },
      ['invalid-asset-id@manifest.assets[3].dependencies[0].id']],
    ['a duplicate dependency', input => {
      input.manifest.assets[3].dependencies = [{ id: 'image/synthetic-hull', kind: 'image' }, { id: 'image/synthetic-hull', kind: 'image' }];
    }, ['duplicate-dependency@manifest.assets[3].dependencies[1]']],
    ['another definition version', input => { input.manifest.identity.sliceDefinitionVersion = 2; },
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
    expect(diagnosticCodes(validatePackage(CLASSIC_P2_SLICE, groups))).toEqual(['payload-missing@groups[3].manifest.assets[4]']);
  });

  it.each([
    ['manifest identity', { manifestIdentity: 'manifest:synthetic-2' }, 'package-identity-mismatch@groups[2].manifest.identity'],
    ['converter version', { converterVersion: 'synthetic-converter.2' }, 'package-identity-mismatch@groups[2].manifest.identity'],
    ['origin', { origin: { type: 'synthetic', fixtureId: 'p2-01-other' } }, 'package-identity-mismatch@groups[2].manifest.identity'],
    ['slice definition version', { sliceDefinitionVersion: 2 }, 'definition-version-mismatch@groups[2].manifest.identity.sliceDefinitionVersion'],
    ['content schema', { schemaVersion: 2 }, 'unsupported-schema@groups[2].manifest.identity.schemaVersion'],
    ['slice identity', { sliceId: 'another-slice' }, 'invalid-slice-id@groups[2].manifest.identity.sliceId'],
  ])('rejects groups mixed across %s', (_name, overrides, expected) => {
    const groups = syntheticPackage();
    groups[2] = syntheticGroup(CLASSIC_P2_SLICE.groups[2], undefined, overrides);
    expect(diagnosticCodes(validatePackage(CLASSIC_P2_SLICE, groups))).toEqual([expected]);
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
    expect(diagnosticCodes(validatePackage(CLASSIC_P2_SLICE, duplicate))).toEqual(['duplicate-asset@groups[2].manifest.assets[3]']);
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
