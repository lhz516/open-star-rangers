import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { validateGroup, validatePackage, type GroupCompletenessResult, type GroupInput, type PackageCompletenessResult } from './completeness.ts';
import { SLICE_ID } from './content-identity.ts';
import { CLASSIC_P2_SLICE } from './slice-definition.ts';

// Synthetic package covering every CLASSIC_P2_SLICE role; roles come from the definition, not a copied list.
type Spec = { id: string; role: string; dependencies?: string[] };
const GROUP_ASSETS: Record<string, Spec[]> = {
  logic: [{ id: 'mission/synthetic-first', role: 'mission', dependencies: ['model/synthetic-base', 'model/synthetic-enemy-a', 'model/synthetic-enemy-b', 'model/synthetic-player'] }],
  models: [
    { id: 'image/synthetic-debris', role: 'debris' },
    { id: 'image/synthetic-hull', role: 'model-texture' },
    { id: 'model/synthetic-base', role: 'base', dependencies: ['image/synthetic-hull'] },
    { id: 'model/synthetic-enemy-a', role: 'enemy-ship', dependencies: ['image/synthetic-hull'] },
    { id: 'model/synthetic-enemy-b', role: 'enemy-ship' },
    { id: 'model/synthetic-missile', role: 'missile' },
    { id: 'model/synthetic-player', role: 'player-ship', dependencies: ['image/synthetic-hull', 'sound/synthetic-engine'] },
    { id: 'model/synthetic-projectile', role: 'projectile' },
  ],
  'cockpit-hud-map': [
    { id: 'font/synthetic-hud', role: 'font' },
    { id: 'image/synthetic-mfd', role: 'hud-mfd' },
    { id: 'image/synthetic-panel', role: 'cockpit-image' },
    { id: 'layout/synthetic-front', role: 'front-cockpit', dependencies: ['font/synthetic-hud', 'image/synthetic-panel'] },
    { id: 'layout/synthetic-map', role: 'strategic-map', dependencies: ['font/synthetic-hud'] },
  ],
  audio: [
    { id: 'sound/synthetic-engine', role: 'model-sound' },
    { id: 'sound/synthetic-explosion', role: 'explosion-sound' },
    { id: 'sound/synthetic-fire', role: 'fire-sound' },
    { id: 'sound/synthetic-missile', role: 'missile-sound' },
    { id: 'sound/synthetic-warp', role: 'warp-sound' },
  ],
};

const kindOf = (id: string) => id.split('/')[0];
const bytesOf = (id: string) => new TextEncoder().encode(`payload:${id}`);
const identityOf = (bytes: Uint8Array) =>
  ({ schemaVersion: 1, byteLength: bytes.length, fingerprint: `sha256:${createHash('sha256').update(bytes).digest('hex')}` });

const identity = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  sliceId: SLICE_ID,
  sliceDefinitionVersion: 1,
  converterVersion: 'synthetic-converter.1',
  manifestIdentity: 'manifest:synthetic-1',
  origin: { type: 'synthetic', fixtureId: 'p2-01-completeness' },
  ...overrides,
});

const groupInput = (group: string, specs = GROUP_ASSETS[group], identityOverrides: Record<string, unknown> = {}) => ({
  manifest: {
    identity: identity(identityOverrides),
    group,
    assets: specs.map(({ id, role, dependencies = [] }) => ({
      id, kind: kindOf(id), role, group,
      dependencies: dependencies.map(dependency => ({ id: dependency, kind: kindOf(dependency) })),
      payloadIdentity: identityOf(bytesOf(id)),
    })),
  },
  payloads: specs.map(({ id }) => ({ id, schemaVersion: 1, bytes: bytesOf(id) })),
  sources: null as null | { sourceFingerprint: string | null; states: { id: string; state: string; unknowns: string[] }[] },
});

const original = (group: string) => {
  const input = groupInput(group, GROUP_ASSETS[group], { origin: { type: 'original-import', sourceFingerprint: 'source:synthetic-disc' } });
  input.sources = { sourceFingerprint: 'source:synthetic-disc', states: GROUP_ASSETS[group].map(({ id }) => ({ id, state: 'verified', unknowns: [] as string[] })) };
  return input;
};

const allGroups = () => CLASSIC_P2_SLICE.groups.map(group => groupInput(group));
const codes = (result: GroupCompletenessResult | PackageCompletenessResult) =>
  ('diagnostics' in result ? result.diagnostics : []).map(({ code, path }) => `${code}@${path}`);

describe('group completeness', () => {
  it.each(CLASSIC_P2_SLICE.groups)('%s is independently complete with typed external requirements', group => {
    const result = validateGroup(CLASSIC_P2_SLICE, groupInput(group));
    expect(result.status).toBe('group-complete');
    if (result.status !== 'group-complete') return;
    expect(result.identity).toEqual(identity());
    expect(result.externalRequirements).toEqual({
      logic: ['model/synthetic-base', 'model/synthetic-enemy-a', 'model/synthetic-enemy-b', 'model/synthetic-player'],
      models: ['sound/synthetic-engine'],
      'cockpit-hud-map': [],
      audio: [],
    }[group].map(id => ({ id, kind: kindOf(id) })));
    expect(Object.isFrozen(result) && Object.isFrozen(result.externalRequirements) && Object.isFrozen(result.assets)).toBe(true);
  });

  it.each(CLASSIC_P2_SLICE.roles.map(({ role, group }) => [role, group] as const))('reports a missing %s role', (role, group) => {
    const specs = GROUP_ASSETS[group].filter(spec => spec.role !== role)
      .map(spec => ({ ...spec, dependencies: (spec.dependencies ?? []).filter(id => GROUP_ASSETS[group].find(other => other.id === id)?.role !== role) }));
    expect(codes(validateGroup(CLASSIC_P2_SLICE, groupInput(group, specs)))).toContain(`role-cardinality@roles.${role}`);
  });

  it('rejects zero and three enemy models without trimming the list', () => {
    const enemies = (count: number) => [
      ...GROUP_ASSETS.models.filter(spec => spec.role !== 'enemy-ship'),
      ...Array.from({ length: count }, (_, index) => ({ id: `model/synthetic-enemy-${index}`, role: 'enemy-ship' })),
    ].sort((left, right) => (left.id < right.id ? -1 : 1));
    for (const count of [0, 3]) {
      const input = groupInput('models', enemies(count));
      const result = validateGroup(CLASSIC_P2_SLICE, input);
      expect(codes(result)).toEqual(['role-cardinality@roles.enemy-ship']);
      expect(input.manifest.assets.filter(asset => asset.role === 'enemy-ship')).toHaveLength(count);
    }
  });

  const mutations: [string, (input: ReturnType<typeof groupInput>) => void, string[]][] = [
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
    ['an unexpected payload', input => { input.payloads.push({ id: 'model/synthetic-zz-extra', schemaVersion: 1, bytes: bytesOf('extra') }); }, ['payload-unexpected@payloads[8]']],
    ['a duplicate payload record', input => { input.payloads.splice(2, 0, { ...input.payloads[1], bytes: bytesOf('forged') }); }, ['duplicate-payload@payloads[2]']],
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
    const input = groupInput('models');
    mutate(input);
    expect(codes(validateGroup(CLASSIC_P2_SLICE, input))).toEqual(expected);
  });

  it('requires a verified source for every original-import Asset and reports research blockers', () => {
    expect(validateGroup(CLASSIC_P2_SLICE, original('audio')).status).toBe('group-complete');
    const input = original('audio');
    const states = input.sources!.states.filter(source => source.id !== 'sound/synthetic-fire');
    states[0] = { id: 'sound/synthetic-engine', state: 'unconfirmed', unknowns: ['U-027'] };
    input.sources = { ...input.sources!, states };
    const result = validateGroup(CLASSIC_P2_SLICE, input);
    expect(codes(result)).toEqual(['source-not-ready@manifest.assets[0]', 'source-missing@manifest.assets[2]']);
    expect(result.status === 'incomplete' && result.diagnostics[0]).toMatchObject({ assetId: 'sound/synthetic-engine', unknowns: ['U-027'] });
  });

  it('binds source states to the manifest source fingerprint', () => {
    const other = original('audio');
    other.sources = { ...other.sources!, sourceFingerprint: 'source:another-disc' };
    expect(codes(validateGroup(CLASSIC_P2_SLICE, other))).toEqual(['source-fingerprint-mismatch@sources.sourceFingerprint']);
    const unverified = original('audio');
    unverified.sources = { ...unverified.sources!, sourceFingerprint: null };
    expect(codes(validateGroup(CLASSIC_P2_SLICE, unverified))).toEqual(['source-fingerprint-mismatch@sources.sourceFingerprint']);
    const absent = original('audio');
    absent.sources = null;
    expect(codes(validateGroup(CLASSIC_P2_SLICE, absent))).toEqual(['source-missing@sources']);
  });
});

describe('package completeness', () => {
  it('is complete only with all four consistent groups and resolved requirements', () => {
    const result = validatePackage(CLASSIC_P2_SLICE, allGroups());
    expect(result).toEqual({ status: 'complete', identity: identity(), groups: [...CLASSIC_P2_SLICE.groups] });
    expect(validatePackage(CLASSIC_P2_SLICE, CLASSIC_P2_SLICE.groups.map(original)).status).toBe('complete');
  });

  it.each(CLASSIC_P2_SLICE.groups)('rejects a package without the %s group', group => {
    expect(codes(validatePackage(CLASSIC_P2_SLICE, allGroups().filter(input => input.manifest.group !== group))))
      .toContain(`group-missing@groups.${group}`);
  });

  it('rejects a duplicated group and an incomplete group instead of returning a partial success', () => {
    expect(codes(validatePackage(CLASSIC_P2_SLICE, [...allGroups(), groupInput('audio')]))).toEqual(['group-duplicate@groups.audio']);
    const groups = allGroups();
    groups[3].payloads.pop();
    expect(codes(validatePackage(CLASSIC_P2_SLICE, groups))).toEqual(['payload-missing@groups[3].manifest.assets[4]']);
  });

  it.each([
    ['manifest identity', { manifestIdentity: 'manifest:synthetic-2' }, 'package-identity-mismatch@groups[2].manifest.identity'],
    ['converter version', { converterVersion: 'synthetic-converter.2' }, 'package-identity-mismatch@groups[2].manifest.identity'],
    ['origin', { origin: { type: 'synthetic', fixtureId: 'p2-01-other' } }, 'package-identity-mismatch@groups[2].manifest.identity'],
    ['slice definition version', { sliceDefinitionVersion: 2 }, 'definition-version-mismatch@groups[2].manifest.identity.sliceDefinitionVersion'],
    ['content schema', { schemaVersion: 2 }, 'unsupported-schema@groups[2].manifest.identity.schemaVersion'],
    ['slice identity', { sliceId: 'another-slice' }, 'invalid-slice-id@groups[2].manifest.identity.sliceId'],
  ])('rejects groups mixed across %s', (_name, overrides, expected) => {
    const groups = allGroups();
    groups[2] = groupInput(CLASSIC_P2_SLICE.groups[2], undefined, overrides);
    expect(codes(validatePackage(CLASSIC_P2_SLICE, groups))).toEqual([expected]);
  });

  it('rejects an unresolved cross-group requirement such as a mission enemy left out', () => {
    const groups = allGroups();
    groups[1] = groupInput('models', GROUP_ASSETS.models.filter(spec => spec.id !== 'model/synthetic-enemy-b'));
    expect(validateGroup(CLASSIC_P2_SLICE, groups[1]).status).toBe('group-complete');
    expect(codes(validatePackage(CLASSIC_P2_SLICE, groups))).toEqual(['missing-dependency@groups[0].externalRequirements[2]']);
  });

  it('rejects an Asset in two groups and a cross-group cycle', () => {
    const withAsset = (group: string, role: string) =>
      groupInput(group, [...GROUP_ASSETS[group], { id: 'image/synthetic-zz-hull', role }].sort((left, right) => (left.id < right.id ? -1 : 1)));
    const duplicate = allGroups();
    duplicate[1] = withAsset('models', 'model-texture');
    duplicate[2] = withAsset('cockpit-hud-map', 'cockpit-image');
    expect(codes(validatePackage(CLASSIC_P2_SLICE, duplicate))).toEqual(['duplicate-asset@groups[2].manifest.assets[3]']);
    const cycle = allGroups();
    cycle[3] = groupInput('audio', GROUP_ASSETS.audio.map(spec => spec.id === 'sound/synthetic-engine' ? { ...spec, dependencies: ['model/synthetic-player'] } : spec));
    expect(codes(validatePackage(CLASSIC_P2_SLICE, cycle))).toEqual(['dependency-cycle@groups[3].manifest.assets[0].dependencies[0]']);
  });

  it('derives results only from raw inputs, isolated from later caller changes', () => {
    const groups = allGroups();
    const forged = { status: 'group-complete', group: 'audio', identity: identity(), assets: [], externalRequirements: [] };
    expect(validatePackage(CLASSIC_P2_SLICE, [...groups.slice(0, 3), forged as unknown as GroupInput]).status).toBe('incomplete');
    const result = validatePackage(CLASSIC_P2_SLICE, groups);
    groups[0].manifest.identity.manifestIdentity = 'manifest:changed';
    groups[1].payloads[0].bytes.fill(0);
    expect(result).toEqual({ status: 'complete', identity: identity(), groups: [...CLASSIC_P2_SLICE.groups] });
    expect(Object.isFrozen(result)).toBe(true);
  });
});
