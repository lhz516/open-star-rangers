import { describe, expect, it } from 'vitest';
import { readAssetDescriptor, readAssetReference, readResourceGroup, RESOURCE_GROUPS } from './asset-contract.ts';
import { ContentContractError } from './contract-validation.ts';

const descriptor = () => ({
  id: 'model/synthetic-player',
  kind: 'model',
  role: 'player-ship',
  group: 'models',
  dependencies: [
    { id: 'image/synthetic-surface', kind: 'image' },
    { id: 'palette/synthetic-colors', kind: 'palette' },
  ],
  payloadIdentity: { schemaVersion: 1, byteLength: 0, fingerprint: `sha256:${'0'.repeat(64)}` },
});

describe('Asset descriptor and reference primitives', () => {
  it('returns deeply frozen, isolated plain metadata with typed canonical dependencies', () => {
    const input = descriptor();
    const result = readAssetDescriptor(input);
    expect(result).toEqual(input);
    expect(structuredClone(result)).toEqual(input);
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    for (const container of [result, result.dependencies, ...result.dependencies, result.payloadIdentity]) {
      expect(Object.isFrozen(container)).toBe(true);
      expect(Reflect.set(container, 'extra', 1)).toBe(false);
    }
    input.dependencies[0].id = 'image/changed';
    input.dependencies.push({ id: 'sound/new', kind: 'sound' });
    input.payloadIdentity.byteLength = 9;
    expect(result).toEqual(readAssetDescriptor(descriptor()));
    const clone = structuredClone(result);
    Reflect.set(clone.dependencies[0], 'id', 'image/changed');
    expect(result.dependencies[0].id).toBe('image/synthetic-surface');
    expect(readAssetDescriptor(descriptor())).toEqual(result);
    expect(readAssetReference({ id: 'model/synthetic-player', kind: 'model' })).toEqual({ id: result.id, kind: result.kind });
    expect(readAssetDescriptor({ ...descriptor(), dependencies: [] }).dependencies).toEqual([]);
  });

  it.each(RESOURCE_GROUPS)('accepts the closed %s group without imposing later slice membership', group => {
    expect(readResourceGroup(group)).toBe(group);
    expect(readAssetDescriptor({ ...descriptor(), group }).group).toBe(group);
    expect(Object.isFrozen(RESOURCE_GROUPS)).toBe(true);
  });

  it.each(['other', 'Models', '', null, 1, {}, () => 'logic'])('rejects unknown resource group %#', group => {
    expect(() => readAssetDescriptor({ ...descriptor(), group }))
      .toThrowError(expect.objectContaining({ code: 'invalid-resource-group', path: 'asset.group' }));
  });

  it('rejects kind mismatch both on owners and on typed references', () => {
    expect(() => readAssetDescriptor({ ...descriptor(), kind: 'image' }))
      .toThrowError(expect.objectContaining({ code: 'kind-mismatch', path: 'asset.kind' }));
    expect(() => readAssetReference({ id: 'image/test', kind: 'model' }))
      .toThrowError(expect.objectContaining({ code: 'kind-mismatch', path: 'reference.kind' }));
    expect(() => readAssetDescriptor({ ...descriptor(), dependencies: [{ id: 'image/test', kind: 'model' }] }))
      .toThrowError(expect.objectContaining({ code: 'kind-mismatch', path: 'asset.dependencies[0].kind' }));
    expect(() => readAssetDescriptor({ ...descriptor(), kind: 'mesh' }))
      .toThrowError(expect.objectContaining({ code: 'invalid-kind', path: 'asset.kind' }));
  });

  it.each([null, 1, '', 'player--ship', '-player', 'player-', 'player/ship', '\u0430', 'player\n', () => 'player'])('rejects invalid role token %#', role => {
    expect(() => readAssetDescriptor({ ...descriptor(), role }))
      .toThrowError(expect.objectContaining({ code: 'invalid-role', path: 'asset.role' }));
  });

  it('rejects noncanonical dependency order and duplicate IDs without rewriting input', () => {
    const duplicate = descriptor();
    duplicate.dependencies.push({ ...duplicate.dependencies[0] });
    expect(() => readAssetDescriptor(duplicate))
      .toThrowError(expect.objectContaining({ code: 'duplicate-dependency', path: 'asset.dependencies[2]' }));
    const reversed = descriptor();
    reversed.dependencies.reverse();
    const before = structuredClone(reversed);
    expect(() => readAssetDescriptor(reversed))
      .toThrowError(expect.objectContaining({ code: 'dependency-order', path: 'asset.dependencies[1]' }));
    expect(reversed).toEqual(before);
    const earlierProblem = descriptor();
    earlierProblem.dependencies.reverse();
    earlierProblem.dependencies.push({ id: 'Bad', kind: 'image' });
    expect(() => readAssetDescriptor(earlierProblem))
      .toThrowError(expect.objectContaining({ code: 'dependency-order', path: 'asset.dependencies[1]' }));
  });

  it('rejects classes, functions, sparse/accessor/extended arrays and non-DTO metadata', () => {
    class DescriptorRecord { constructor() { Object.assign(this, descriptor()); } }
    class ReferenceRecord { id = 'model/test'; kind = 'model'; }
    class Dependencies extends Array {}
    for (const value of [new DescriptorRecord(), null, [], () => descriptor()]) {
      expect(() => readAssetDescriptor(value)).toThrowError(ContentContractError);
    }
    expect(() => readAssetReference(new ReferenceRecord())).toThrowError(ContentContractError);
    const accessor = [{ id: 'image/test', kind: 'image' }];
    Object.defineProperty(accessor, '0', { get: () => { throw new Error('Getter must not run'); } });
    const extended = Object.assign([], { extra: () => 1 });
    const symbolArray = Object.assign([], { [Symbol('extra')]: 1 });
    for (const dependencies of [undefined, {}, () => [], new Dependencies(), new Array(1), accessor, extended, symbolArray, [() => 1]]) {
      expect(() => readAssetDescriptor({ ...descriptor(), dependencies })).toThrowError(ContentContractError);
    }
    expect(() => readAssetDescriptor({ ...descriptor(), payloadIdentity: new Uint8Array(0) })).toThrowError(ContentContractError);
    expect(() => readAssetDescriptor({ ...descriptor(), complete: true })).toThrowError(ContentContractError);
    expect(() => readAssetReference({ id: 'image/test', kind: 'image', sourcePath: '/private/source' }))
      .toThrowError(expect.objectContaining({ code: 'invalid-record', path: 'reference', reason: 'contains unknown fields' }));
    for (const field of Object.keys(descriptor())) {
      const input: Record<string, unknown> = descriptor();
      delete input[field];
      expect(() => readAssetDescriptor(input)).toThrowError(expect.objectContaining({ code: 'invalid-record', path: `asset.${field}` }));
    }
  });
});
