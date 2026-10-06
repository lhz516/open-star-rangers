import { describe, expect, it } from 'vitest';
import { EMPTY_BUDGET_USAGE } from '../../content/budget.ts';
import { fontPayloadLength, readFontPayload } from '../../content/graphics/font-payload.ts';
import { glyphsFor } from '../../content/graphics/glyph-lookup.ts';
import { GRAPHICS_LIMITS, asciiBytes } from '../../content/graphics/graphics-format.ts';
import { expectContractError } from '../../content/graphics/graphics.test-support.ts';
import { palettePayloadLength } from '../../content/graphics/palette-payload.ts';
import { diagnoseSourceMappings } from '../source-mapping.ts';
import { countedVerifiedSource, hudFontTables } from './conversion.test-support.ts';
import { runGraphicsStep } from './graphics-step.ts';
import { PRODUCTION_GRAPHICS_DECLARATIONS, PRODUCTION_GRAPHICS_MAPPINGS, PRODUCTION_GRAPHICS_SHARE } from './production-graphics.ts';
import { productionGraphicsFiles } from './production-graphics.test-support.ts';

describe('production graphics', () => {
  it('declares the five spec Assets with their roles, groups, font cells and the hud §1.1 character maps', () => {
    expect(PRODUCTION_GRAPHICS_DECLARATIONS.map(({ asset, role, group, ...rest }) => ({ id: asset.id, kind: asset.kind, role, group, ...rest }))).toEqual([
      { id: 'palette/flight/models', kind: 'palette', role: 'flight-palette', group: 'models' },
      { id: 'palette/flight/cockpit-hud-map', kind: 'palette', role: 'flight-palette', group: 'cockpit-hud-map' },
      { id: 'font/hud/8x8-1', kind: 'font', role: 'font', group: 'cockpit-hud-map', cell: { width: 8, height: 8 }, glyphRows: 8, charMap: [range(0x20, 91), range(0x7c, 3)] },
      { id: 'font/hud/8x8-2', kind: 'font', role: 'font', group: 'cockpit-hud-map', cell: { width: 8, height: 8 }, glyphRows: 8, charMap: [range(0x20, 95)] },
      {
        id: 'font/hud/4x6', kind: 'font', role: 'font', group: 'cockpit-hud-map', cell: { width: 4, height: 6 }, glyphRows: 8,
        charMap: [range(0x20, 1), range(0x25, 1), range(0x27, 25), range(0x41, 29)],
      },
    ]);
  });

  it('maps the flight palettes to the DATA entry and the fonts to the HI cockpit font directory', () => {
    const { sourceFingerprint, mappings } = PRODUCTION_GRAPHICS_MAPPINGS;
    expect(sourceFingerprint).toBeNull();
    expect(mappings.map(({ asset, parts, confidence, unknowns, evidence, resolution }) => ({
      id: asset.id,
      locators: parts.map(({ alternatives }) => alternatives.map(({ discPath, entry, subresource }) => `${discPath}#${entry.type}:${entry.id}/${subresource ?? ''}`)),
      confidence, unknowns, evidence, resolution,
    }))).toEqual([
      { id: 'font/hud/4x6', locators: [['MAIN/SR.NOB#CCKD:10103/fonts/2']], confidence: 'likely', unknowns: ['U-029', 'U-030'], evidence: fontEvidence, resolution: 'declared' },
      { id: 'font/hud/8x8-1', locators: [['MAIN/SR.NOB#CCKD:10103/fonts/0']], confidence: 'likely', unknowns: ['U-029', 'U-030'], evidence: fontEvidence, resolution: 'declared' },
      { id: 'font/hud/8x8-2', locators: [['MAIN/SR.NOB#CCKD:10103/fonts/1']], confidence: 'likely', unknowns: ['U-029', 'U-030'], evidence: fontEvidence, resolution: 'declared' },
      { id: 'palette/flight/cockpit-hud-map', locators: [['MAIN/SR.NOB#DATA:11075/']], confidence: 'confirmed', unknowns: [], evidence: [paletteEvidence], resolution: 'declared' },
      { id: 'palette/flight/models', locators: [['MAIN/SR.NOB#DATA:11075/']], confidence: 'confirmed', unknowns: [], evidence: [paletteEvidence], resolution: 'declared' },
    ]);
    expect(mappings.map(({ asset }) => asset.id)).toEqual([...PRODUCTION_GRAPHICS_DECLARATIONS.map(({ asset }) => asset.id)].sort());
    const diagnostics = diagnoseSourceMappings(PRODUCTION_GRAPHICS_MAPPINGS, mappings.map(({ asset }) => asset));
    expect(diagnostics.map(({ code }) => code)).toEqual(new Array(5).fill('source-unverified'));
  });

  it('exports the approved share, which bounds the payloads at the structural limits', () => {
    expect(PRODUCTION_GRAPHICS_SHARE).toEqual({ ...EMPTY_BUDGET_USAGE, assets: 5, paletteEntries: 512, glyphs: 768, payloadBytes: 16_384 });
    const bound = 2 * palettePayloadLength(GRAPHICS_LIMITS.paletteEntryCount)
      + 3 * fontPayloadLength(GRAPHICS_LIMITS.glyphCount, GRAPHICS_LIMITS.fontHeight, GRAPHICS_LIMITS.charMapEntries);
    expect(bound).toBeLessThanOrEqual(PRODUCTION_GRAPHICS_SHARE.payloadBytes);
  });

  it('converts five Assets within the share on a disc in the production structure', async () => {
    const { source, reads } = await countedVerifiedSource(productionGraphicsFiles());
    const result = await runGraphicsStep(source, PRODUCTION_GRAPHICS_MAPPINGS, PRODUCTION_GRAPHICS_DECLARATIONS, PRODUCTION_GRAPHICS_SHARE);
    expect(result.groups.map(({ group, descriptors }) => [group, descriptors.map(({ id }) => id)])).toEqual([
      ['models', ['palette/flight/models']],
      ['cockpit-hud-map', ['font/hud/4x6', 'font/hud/8x8-1', 'font/hud/8x8-2', 'palette/flight/cockpit-hud-map']],
    ]);
    expect(result.groups.flatMap(({ sources }) => sources.map(({ id, state, unknowns }) => `${id}:${state}:${unknowns.join()}`))).toEqual([
      'palette/flight/models:verified:',
      'font/hud/4x6:verified:U-029,U-030', 'font/hud/8x8-1:verified:U-029,U-030', 'font/hud/8x8-2:verified:U-029,U-030', 'palette/flight/cockpit-hud-map:verified:',
    ]);
    const payloadBytes = result.groups.flatMap(({ payloads }) => payloads).reduce((total, { bytes }) => total + bytes.length, 0);
    expect(result.usage).toMatchObject({ assets: 5, dependencyEdges: 0, paletteEntries: 512, glyphs: 256 + 256 + 192, imagePixels: 0, payloadBytes, sourceReadBytes: 0 });
    expect(Object.fromEntries(reads)).toEqual({ 10103: 1, 11075: 1 });
    const payloads = result.groups.flatMap(group => group.payloads);
    const font = (id: string) => {
      const { schemaVersion, bytes } = payloads.find(payload => payload.id === id)!;
      return readFontPayload(bytes, schemaVersion);
    };
    // The 4×6 table's 256 × 6 bytes, unchanged, as 192 glyphs of 8 rows.
    const small = font('font/hud/4x6');
    expect(small).toMatchObject({ cellWidth: 4, height: 6, glyphRows: 8, glyphs: hudFontTables()[2].subarray(4) });
    expect([...glyphsFor(small, asciiBytes(' %0A]'))]).toEqual([0x20, 0x25, 0x30, 0x41, 0x5d]);
    expectContractError(() => glyphsFor(small, asciiBytes('a')), 'unmapped-character', 'text[0]');
    expectContractError(() => glyphsFor(font('font/hud/8x8-1'), asciiBytes('{')), 'unmapped-character', 'text[0]');
    expect([...glyphsFor(font('font/hud/8x8-2'), asciiBytes('{~'))]).toEqual([0x7b, 0x7e]);
  });
});

/** Codes `firstCode` … `firstCode + count − 1` mapped to the glyphs of the same numbers. */
const range = (firstCode: number, count: number) => ({ firstCode, firstGlyph: firstCode, count });

const fontEvidence = [
  'docs/original/formats/cockpit.md#1-cckd-cockpit-layouts',
  'docs/original/formats/hud.md#1-bitmap-fonts-confirmed',
  'docs/original/formats/hud.md#11-glyph-layout-and-character-maps-likely',
];
const paletteEvidence = 'docs/original/formats/textures.md#1-data-global-palette-confirmed';
