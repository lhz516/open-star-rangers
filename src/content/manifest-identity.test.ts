import { describe, expect, it } from 'vitest';
import { RESOURCE_GROUPS } from './asset-contract.ts';
import { validateGroup, validatePackage } from './completeness.ts';
import { readContentIdentity, type ContentIdentityBasis } from './content-identity.ts';
import { applyManifestIdentity, deriveManifestIdentity, type GroupDraft } from './manifest-identity.ts';
import { payloadTransferList } from './ownership.ts';
import { CLASSIC_P2_SLICE } from './slice-definition.ts';
import { syntheticSourceGroup } from './synthetic-content.test-support.ts';

const FINGERPRINT = 'source:synthetic-disc';

const basis = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  sliceId: 'classic-p2-slice',
  sliceDefinitionVersion: CLASSIC_P2_SLICE.version,
  converterVersion: 'synthetic-converter.1',
  origin: { type: 'original-import', sourceFingerprint: FINGERPRINT },
  ...overrides,
}) as unknown as ContentIdentityBasis;

/** Fresh mutable drafts of the synthetic original-import package, one per group in definition order. */
const drafts = () => RESOURCE_GROUPS.map(group => {
  const { manifest, payloads, sources } = syntheticSourceGroup(group, FINGERPRINT);
  return { group, assets: manifest.assets, payloads, sources };
});
type MutableDrafts = ReturnType<typeof drafts>;
const logic = (list: MutableDrafts) => list[0].assets[0];

// The functions read their input strictly, so tests pass deliberately malformed plain data through these helpers.
const derive = (draftList: unknown = drafts(), identityBasis = basis()) =>
  deriveManifestIdentity(identityBasis, draftList as GroupDraft[]);
const apply = (draftList: unknown = drafts(), identityBasis = basis()) =>
  applyManifestIdentity(identityBasis, draftList as GroupDraft[]);
const contractError = (code: string, path: string) => expect.objectContaining({ name: 'ContentContractError', code, path });

describe('manifest identity derivation', () => {
  it('is deterministic and a manifest token the content identity reader accepts', () => {
    const identity = derive();
    expect(identity).toMatch(/^manifest:sha256:[0-9a-f]{64}$/);
    expect(derive()).toBe(identity);
    expect(readContentIdentity({ ...basis(), manifestIdentity: identity }).manifestIdentity).toBe(identity);
  });

  it('matches the version-1 encoding vector, which fixes every field position including kinds', () => {
    // Independently computed: SHA-256 of the compact JSON array in the order `encode` documents.
    // The vector was computed with slice definition version 1, so it names that version explicitly.
    const vectorBasis = basis({ sliceDefinitionVersion: 1, converterVersion: 'vector-converter.1', origin: { type: 'original-import', sourceFingerprint: 'source:vector-disc' } });
    const vectorDrafts = [{
      group: 'logic',
      assets: [{
        id: 'data/vector-table', kind: 'data', role: 'craft-types', group: 'logic',
        dependencies: [{ id: 'model/vector-ship', kind: 'model' }],
        payloadIdentity: { schemaVersion: 1, byteLength: 3, fingerprint: `sha256:${'ab'.repeat(32)}` },
      }],
      payloads: [{ id: 'data/vector-table', schemaVersion: 1, bytes: new Uint8Array([1, 2, 3]) }],
      sources: { sourceFingerprint: 'source:vector-disc', states: [{ id: 'data/vector-table', state: 'verified', unknowns: ['U-022'] }] },
    }];
    expect(derive(vectorDrafts, vectorBasis)).toBe('manifest:sha256:ce7024002d0c3d9e65814990a2aa714a6cf53b965822540986e81b215773916d');
  });

  it('does not depend on the order in which groups are passed', () => {
    expect(derive(drafts().reverse())).toBe(derive());
  });

  const models = (list: MutableDrafts) => list[1];
  const changes: readonly (readonly [string, (list: MutableDrafts) => void])[] = [
    ['an Asset ID', list => { logic(list).id = 'mission/synthetic-second'; }],
    ['a role', list => { logic(list).role = 'mission-variant'; }],
    ['a descriptor group', list => { logic(list).group = 'models'; }],
    ['a dependency ID', list => { logic(list).dependencies[0] = { id: 'model/synthetic-aaa', kind: 'model' }; }],
    ['a removed dependency', list => { logic(list).dependencies.pop(); }],
    ['a payload schema version', list => { logic(list).payloadIdentity.schemaVersion = 2; }],
    ['a payload byte length', list => { logic(list).payloadIdentity.byteLength += 1; }],
    ['a payload fingerprint', list => { logic(list).payloadIdentity.fingerprint = `sha256:${'0'.repeat(64)}`; }],
    ['a removed Asset', list => { models(list).assets.pop(); }],
    ['a removed group', list => { list.pop(); }],
    ['a source state', list => { list[0].sources!.states[0].state = 'unverified'; }],
    ['a source state Asset ID', list => { list[0].sources!.states[0].id = 'mission/synthetic-second'; }],
    ['a source unknown item', list => { list[0].sources!.states[0].unknowns.push('U-022'); }],
    ['a source state fingerprint', list => { list[0].sources!.sourceFingerprint = 'source:other-disc'; }],
    ['sources replaced by null', list => { list[0].sources = null; }],
  ];

  it.each(changes)('changes with %s', (_, change) => {
    const changed = drafts();
    change(changed);
    expect(derive(changed)).not.toBe(derive());
  });

  it.each([
    ['the converter version', { converterVersion: 'synthetic-converter.2' }],
    ['the slice definition version', { sliceDefinitionVersion: 1 }],
    ['the source fingerprint', { origin: { type: 'original-import', sourceFingerprint: 'source:other-disc' } }],
    ['the origin type', { origin: { type: 'synthetic', fixtureId: 'synthetic-disc' } }],
  ])('changes with %s', (_, overrides) => {
    expect(derive(drafts(), basis(overrides))).not.toBe(derive());
  });

  it('changes with the synthetic fixture token', () => {
    const synthetic = (fixtureId: string) => basis({ origin: { type: 'synthetic', fixtureId } });
    expect(derive(drafts(), synthetic('fixture-a'))).not.toBe(derive(drafts(), synthetic('fixture-b')));
  });

  it('does not read payloads', () => {
    const changed = drafts();
    changed[0].payloads[0].bytes = new Uint8Array([1, 2, 3]);
    expect(derive(changed)).toBe(derive());
    expect(derive(drafts().map(draft => ({ ...draft, payloads: 'not read' })))).toBe(derive());
  });

  it.each([
    ['no group', () => [], 'invalid-record', 'drafts'],
    ['a repeated group', () => [...drafts(), drafts()[2]], 'invalid-resource-group', 'drafts[4].group'],
    ['an unknown group', () => { const list = drafts(); (list[3] as { group: string }).group = 'extras'; return list; }, 'invalid-resource-group', 'drafts[3].group'],
    ['an unknown draft field', () => drafts().map((draft, index) => (index === 1 ? { ...draft, extra: 1 } : draft)), 'invalid-record', 'drafts[1]'],
    ['a malformed Asset ID', () => { const list = drafts(); logic(list).id = 'Mission/First'; return list; }, 'invalid-asset-id', 'drafts[0].assets[0].id'],
    ['descending Assets', () => { const list = drafts(); models(list).assets.reverse(); return list; }, 'asset-order', 'drafts[1].assets[1]'],
    ['a malformed source state set', () => { const list = drafts(); list[0].sources!.states[0].state = 'ready'; return list; }, 'invalid-source-mapping', 'drafts[0].sources.states[0].state'],
  ] as const)('rejects %s', (_, build, code, path) => {
    expect(() => derive(build())).toThrowError(contractError(code, path));
  });

  it.each([
    ['a manifest identity in the basis', { manifestIdentity: 'manifest:sha256:0' }, 'invalid-record', 'basis'],
    ['a malformed converter version', { converterVersion: 'Converter 1' }, 'invalid-identity', 'basis.converterVersion'],
    ['an unsupported schema', { schemaVersion: 2 }, 'unsupported-schema', 'basis.schemaVersion'],
  ] as const)('rejects a basis with %s', (_, overrides, code, path) => {
    expect(() => derive(drafts(), basis(overrides))).toThrowError(contractError(code, path));
  });
});

describe('writing the manifest identity', () => {
  it('gives every group the same derived identity and passes group and package validation', () => {
    const inputs = apply(drafts().reverse());
    const identity = readContentIdentity({ ...basis(), manifestIdentity: derive() });
    expect(inputs.map(input => input.manifest.group)).toEqual([...RESOURCE_GROUPS]);
    for (const input of inputs) {
      const result = validateGroup(CLASSIC_P2_SLICE, input);
      expect(result.status).toBe('group-complete');
      expect(result.status === 'group-complete' && result.identity).toEqual(identity);
    }
    const result = validatePackage(CLASSIC_P2_SLICE, inputs);
    expect(result).toEqual({ status: 'complete', identity, groups: [...RESOURCE_GROUPS] });
  });

  it('returns frozen copies that keep the caller payload views and leave the drafts unchanged', () => {
    const source = drafts();
    const before = structuredClone(source);
    const inputs = apply(source);
    expect(source).toEqual(before);
    const [logicInput] = inputs;
    const sources = logicInput.sources!;
    expect(logicInput.payloads[0].bytes).toBe(source[0].payloads[0].bytes);
    for (const value of [inputs, logicInput, logicInput.manifest, logicInput.manifest.identity, logicInput.manifest.assets,
      logicInput.manifest.assets[0], logicInput.payloads, logicInput.payloads[0], sources, sources.states]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
    logic(source).id = 'mission/changed';
    source[0].sources!.states.pop();
    expect(logicInput.manifest.assets[0].id).toBe('mission/synthetic-first');
    expect(sources.states).toHaveLength(1);
  });

  it('rejects malformed drafts and payload records at the caller\'s draft index', () => {
    expect(() => apply([...drafts(), drafts()[0]])).toThrowError(contractError('invalid-resource-group', 'drafts[4].group'));
    const detached = drafts().reverse();
    const { bytes } = detached[3].payloads[0];
    structuredClone(bytes, { transfer: [...payloadTransferList([bytes])] });
    expect(() => apply(detached)).toThrowError(contractError('payload-detached', 'drafts[3].payloads[0].bytes'));
  });
});
