import { buildImfat, type SyntheticEntry } from '../synthetic.ts';
import { cockpitBlock, dataPaletteBlock, hudFontTables } from './conversion.test-support.ts';
import { PRODUCTION_GRAPHICS_MAPPINGS } from './production-graphics.ts';

// A synthetic archive in the production graphics structure, generated in code; never original data.

const locators = PRODUCTION_GRAPHICS_MAPPINGS.mappings.flatMap(({ parts }) => parts.flatMap(({ alternatives }) => alternatives));

/**
 * The disc files of a source holding only the production graphics archive, with synthetic content at the mapped
 * entries: a DATA palette and a CCKD entry whose font directory holds two 8×8 fonts and one 4×6 font at the mapped
 * indices. `blocks` replaces an entry's content by type, or omits the entry when null.
 */
export function productionGraphicsFiles(blocks: { DATA?: Uint8Array | null; CCKD?: Uint8Array | null } = {}): Record<string, Uint8Array> {
  const content: Record<string, Uint8Array | null> = {
    DATA: blocks.DATA === undefined ? dataPaletteBlock() : blocks.DATA,
    CCKD: blocks.CCKD === undefined ? cockpitBlock(hudFontTables()) : blocks.CCKD,
  };
  const entries = new Map<number, SyntheticEntry>();
  for (const { entry: { id, type } } of locators) {
    const data = content[type];
    if (data && !entries.has(id)) entries.set(id, { id, type, data });
  }
  return { [locators[0].discPath]: buildImfat(10_000, [...entries.values()].sort((left, right) => left.id - right.id)) };
}
