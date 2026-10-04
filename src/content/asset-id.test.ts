import { describe, expect, expectTypeOf, it } from 'vitest';
import { ASSET_ID_LIMITS, ASSET_KINDS, readAssetId, readAssetKind, type AssetId } from './asset-id.ts';
import { ContentContractError } from './contract-validation.ts';

describe('Asset ID', () => {
  it.each(ASSET_KINDS)('accepts the closed %s kind and a semantic path', kind => {
    expect(readAssetKind(kind)).toBe(kind);
    expect(readAssetId(`${kind}/synthetic-test/part-2`)).toBe(`${kind}/synthetic-test/part-2`);
  });

  it('accepts exact segment, count and total-length boundaries', () => {
    const segment32 = `model/${'a'.repeat(32)}`;
    const segments8 = 'model/a/b/c/d/e/f/g';
    const total128 = `model/${'a'.repeat(32)}/${'b'.repeat(32)}/${'c'.repeat(32)}/${'d'.repeat(23)}`;
    expect(total128).toHaveLength(128);
    for (const value of [segment32, segments8, total128, 'data/0']) expect(readAssetId(value)).toBe(value);
    expect(ASSET_ID_LIMITS).toEqual({ segments: 8, segmentLength: 32, totalLength: 128 });
    expect(Object.isFrozen(ASSET_ID_LIMITS)).toBe(true);
    expect(Object.isFrozen(ASSET_KINDS)).toBe(true);
    expectTypeOf<string>().not.toExtend<AssetId>();
  });

  const invalid: unknown[] = [
    undefined, null, 1, true, {}, [], () => 'model/test', new String('model/test'),
    '', 'model', '/model/test', 'model/test/', 'model//test',
    'model/-test', 'model/test-', 'model/te--st', 'model/./test', 'model/../test',
    'model\\test', 'model/test?x', 'model/test#x', 'https://model/test', 'model/test.ext',
    'MODEL/test', 'model/Test', 'model/t_est', 'model/ test', 'model/test ', 'model/test\n',
    'model/\u0430', 'model/test\u200b', 'model/\uff41', 'model/test\u0000', 'model/\ud800',
    '123', '550e8400-e29b-41d4-a716-446655440000', 'SR.NOB', 'model/a%2fb',
    `model/${'a'.repeat(33)}`, 'model/a/b/c/d/e/f/g/h',
    `model/${'a'.repeat(32)}/${'b'.repeat(32)}/${'c'.repeat(32)}/${'d'.repeat(24)}`,
  ];

  it.each(invalid)('rejects invalid ID %# with a safe stable diagnostic', value => {
    expect(() => readAssetId(value)).toThrowError(ContentContractError);
    expect(() => readAssetId(value)).toThrowError(expect.objectContaining({ code: 'invalid-asset-id', path: 'assetId' }));
  });

  it.each(['mesh', 'MESH', 'texture', 'unknown', 1, null, undefined, {}, () => 'model'])('rejects unknown kind %#', kind => {
    expect(() => readAssetKind(kind)).toThrowError(expect.objectContaining({ code: 'invalid-kind', path: 'kind' }));
  });

  it.each(['mesh/test', 'texture/test', 'unknown/test'])('rejects a grammatically valid ID with an unknown kind: %s', value => {
    expect(() => readAssetId(value)).toThrowError(expect.objectContaining({ code: 'invalid-kind', path: 'assetId' }));
  });
});
