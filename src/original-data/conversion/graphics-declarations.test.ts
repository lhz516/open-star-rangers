import { describe, expect, it } from 'vitest';
import { expectSourceError, fontDeclaration, imageDeclaration, paletteDeclaration } from './conversion.test-support.ts';
import { readGraphicsDeclarations } from './graphics-declarations.ts';

const validSet = () => [
  paletteDeclaration('palette/flight'),
  paletteDeclaration('palette/texture'),
  imageDeclaration('image/panel', 'palette/texture', {
    display: { nearest: 'palette/flight' }, alpha: { colourKey: 0 }, rowOrder: 'reversed',
  }),
  fontDeclaration('font/hud', {
    cell: { width: 4, height: 6 }, glyphRows: 8, charMap: [{ firstCode: 0x41, firstGlyph: 10, count: 26 }, { firstCode: 0x30, firstGlyph: 181, count: 11 }],
  }),
];

type Mutation = (set: Record<string, unknown>[]) => unknown;

describe('graphics conversion declarations', () => {
  it('reads a valid set into frozen data equal to the input', () => {
    const input = validSet();
    const declarations = readGraphicsDeclarations(input);
    expect(declarations).toEqual(input);
    for (const declaration of declarations) expect(Object.isFrozen(declaration)).toBe(true);
    expect(Object.isFrozen(declarations)).toBe(true);
    expect(readGraphicsDeclarations([])).toEqual([]);
  });

  it.each<[string, Mutation, string]>([
    ['a non-array set', () => ({}), 'graphics.declarations'],
    ['an unknown field', set => { set[2].secretField = 1; }, 'graphics.declarations[2]'],
    ['a missing field', set => { delete set[2].rowOrder; }, 'graphics.declarations[2].rowOrder'],
    ['a non-graphics kind', set => { set[0] = { ...set[0], asset: { id: 'model/flight', kind: 'model' } }; }, 'graphics.declarations[0].asset.kind'],
    ['a kind that differs from its ID', set => { set[0].asset = { id: 'palette/flight', kind: 'image' }; }, 'graphics.declarations[0].asset.kind'],
    ['an invalid role', set => { set[0].role = 'Flight'; }, 'graphics.declarations[0].role'],
    ['an unknown group', set => { set[0].group = 'hud'; }, 'graphics.declarations[0].group'],
    ['a group that does not own the kind', set => { set[3].group = 'models'; }, 'graphics.declarations[3].group'],
    ['a duplicate Asset ID', set => { set.push(paletteDeclaration('palette/flight')); }, 'graphics.declarations[4].asset.id'],
    ['a binding to a non-palette Asset', set => { set[2].palette = 'font/hud'; }, 'graphics.declarations[2].palette'],
    ['a binding outside the set', set => { set[2].palette = 'palette/other'; }, 'graphics.declarations[2].palette'],
    ['a binding to another group', set => { set[1].group = 'models'; }, 'graphics.declarations[2].palette'],
    ['a nearest target outside the set', set => { set[2].display = { nearest: 'palette/other' }; }, 'graphics.declarations[2].display.nearest'],
    ['an unknown display', set => { set[2].display = 'nearest'; }, 'graphics.declarations[2].display'],
    ['a colour key of 256', set => { set[2].alpha = { colourKey: 256 }; }, 'graphics.declarations[2].alpha.colourKey'],
    ['an unknown alpha', set => { set[2].alpha = 'mask'; }, 'graphics.declarations[2].alpha'],
    ['an unknown row order', set => { set[2].rowOrder = 'flipped'; }, 'graphics.declarations[2].rowOrder'],
    ['a cell width of 0', set => { set[3].cell = { width: 0, height: 6 }; }, 'graphics.declarations[3].cell.width'],
    ['a cell height of 9', set => { set[3].cell = { width: 4, height: 9 }; }, 'graphics.declarations[3].cell.height'],
    ['overlapping ranges', set => { set[3].charMap = [{ firstCode: 0x41, firstGlyph: 0, count: 2 }, { firstCode: 0x42, firstGlyph: 5, count: 1 }]; }, 'graphics.declarations[3].charMap[1]'],
    ['codes past 255', set => { set[3].charMap = [{ firstCode: 250, firstGlyph: 0, count: 10 }]; }, 'graphics.declarations[3].charMap[0].count'],
    ['a missing glyph row count', set => { delete set[3].glyphRows; }, 'graphics.declarations[3].glyphRows'],
    ['glyph rows below the cell height', set => { set[3].glyphRows = 5; }, 'graphics.declarations[3].glyphRows'],
    ['glyph rows of 9', set => { set[3].glyphRows = 9; }, 'graphics.declarations[3].glyphRows'],
    ['glyph rows that leave a partial glyph', set => { set[3].cell = { width: 4, height: 5 }; set[3].glyphRows = 6; }, 'graphics.declarations[3].glyphRows'],
    ['a first glyph past the glyph count', set => { set[3].charMap = [{ firstCode: 0, firstGlyph: 192, count: 1 }]; }, 'graphics.declarations[3].charMap[0].firstGlyph'],
    ['glyphs past the glyph count', set => { set[3].charMap = [{ firstCode: 0, firstGlyph: 190, count: 3 }]; }, 'graphics.declarations[3].charMap[0].count'],
    ['an empty range', set => { set[3].charMap = [{ firstCode: 0, firstGlyph: 0, count: 0 }]; }, 'graphics.declarations[3].charMap[0].count'],
  ])('rejects %s as invalid-declaration', (_, mutate, location) => {
    const set = validSet();
    const value = mutate(set) ?? set;
    expectSourceError(() => readGraphicsDeclarations(value), 'invalid-declaration', location);
    try {
      readGraphicsDeclarations(value);
    } catch (error) {
      expect((error as Error).message).not.toMatch(/secretField|palette\/other|flipped|Flight/);
    }
  });
});
