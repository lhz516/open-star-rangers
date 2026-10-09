import { describe, expect, it } from 'vitest';
import { expectSourceError } from '../conversion/conversion.test-support.ts';
import type { SourceLimit } from '../source-error.ts';
import { syntheticModl, type SyntheticModlFields, type SyntheticModlPart } from '../synthetic.test-support.ts';
import { readModel } from './modl.ts';

const PATH = 'models[model/synthetic-ship].model';

const part = (mesh: number, fields: Partial<SyntheticModlPart> = {}): SyntheticModlPart => ({ mesh, ...fields });

// List 0 with a textured and an untextured part, list 1 with one part, list 2 empty; slots both empty and set.
const MODEL: SyntheticModlFields = {
  partLists: [
    [part(10_001, { texture: 10_005, flags: 1, colour: [255, 0, 12] }), part(10_002, { flags: 0xffff_ffff, colour: [0, 0, 0] })],
    [part(10_001, { flags: 3, colour: [252, 128, 1] })],
    [],
  ],
  sounds: [11_000, 0, 11_001, 0, 11_000],
};

const block = (fields: Partial<SyntheticModlFields> = {}): Uint8Array => syntheticModl({ ...MODEL, ...fields }).data;

const expectFailure = (action: () => unknown, code: string, reason: string, limit: SourceLimit | null = null): void =>
  expectSourceError(action, code, PATH, limit, reason);

describe('MODL source reading', () => {
  it('reads the three part lists, every part field and the five sound slots', () => {
    const data = block();
    expect(data.length).toBe(44 + 3 * 28);
    expect(syntheticModl(MODEL).relocations).toEqual([0, 8]);
    const model = readModel(data, PATH);
    expect(model).toEqual({
      partLists: [
        [
          { sourceFlags: 1, colour: [255, 0, 12], meshEntry: 10_001, textureEntry: 10_005 },
          { sourceFlags: 0xffff_ffff, colour: [0, 0, 0], meshEntry: 10_002, textureEntry: 0 },
        ],
        [{ sourceFlags: 3, colour: [252, 128, 1], meshEntry: 10_001, textureEntry: 0 }],
        [],
      ],
      soundEntries: [11_000, 0, 11_001, 0, 11_000],
    });
    for (const value of [model, model.partLists, ...model.partLists, model.partLists[0][0], model.partLists[0][0].colour, model.soundEntries]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
  });

  it('reads a model whose only parts are in list 1, and 256 parts', () => {
    expect(readModel(block({ partLists: [[], [part(1)], []] }), PATH).partLists.map(list => list.length)).toEqual([0, 1, 0]);
    const many = Array.from({ length: 256 }, (_, index) => part(index + 1));
    expect(readModel(block({ partLists: [many.slice(0, 200), many.slice(200, 255), many.slice(255)] }), PATH).partLists.map(list => list.length))
      .toEqual([200, 55, 1]);
  });

  it.each<[string, () => Uint8Array, string]>([
    ['a truncated header', () => block().subarray(0, 43), 'the model header is truncated'],
    ['a list pointer past the parts before it', () => block({ listHeaders: [[44, 2], [128, 1], [0, 0]] }), 'the part lists must follow the header contiguously in list order'],
    ['a list pointer into the header', () => block({ listHeaders: [[16, 2], [100, 1], [0, 0]] }), 'the part lists must follow the header contiguously in list order'],
    ['overlapping lists', () => block({ listHeaders: [[44, 2], [44, 1], [0, 0]] }), 'the part lists must follow the header contiguously in list order'],
    ['an empty list with a pointer', () => block({ listHeaders: [[44, 2], [100, 1], [128, 0]] }), 'an empty part list must have a null pointer'],
    ['a list count past the block', () => block({ listHeaders: [[44, 2], [100, 2], [0, 0]] }), 'a part list extends past the block'],
    ['a huge list count', () => block({ listHeaders: [[44, 0xffff_ffff], [0, 0], [0, 0]] }), 'a part list extends past the block'],
    ['a trailing word', () => Uint8Array.of(...block(), 0, 0, 0, 0), 'the model length must be 44 + 28 bytes per part'],
    ['a non-zero reserved part field', () => block({ partLists: [[part(1, { reserved: 1 })], [], []] }), 'the reserved part field must be 0'],
    ['colour channel 256', () => block({ partLists: [[part(1)], [part(2, { colour: [0, 256, 0] })], []] }), 'a part colour channel must be at most 255'],
  ])('rejects %s as an invalid payload', (_, data, reason) => expectFailure(() => readModel(data(), PATH), 'invalid-payload', reason));

  it.each([
    ['no parts', [[], [], []] as const, 0],
    ['257 parts', [Array.from({ length: 200 }, () => part(1)), Array.from({ length: 57 }, () => part(2)), []] as const, 257],
  ])('rejects %s with the modelParts limit', (_, partLists, observed) => {
    expectFailure(() => readModel(block({ partLists }), PATH), 'limit-exceeded', 'the part count is outside the supported range',
      { name: 'modelParts', limit: 256, observed });
  });
});
