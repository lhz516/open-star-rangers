import { describe, expect, it } from 'vitest';
import { readAssetId } from '../../content/asset-id.ts';
import { EMPTY_BUDGET_USAGE } from '../../content/budget.ts';
import { fontPayloadLength, readFontPayload } from '../../content/graphics/font-payload.ts';
import { glyphsFor } from '../../content/graphics/glyph-lookup.ts';
import { GRAPHICS_LIMITS, asciiBytes } from '../../content/graphics/graphics-format.ts';
import { expectContractError } from '../../content/graphics/graphics.test-support.ts';
import { imagePayloadLength, readImagePayload } from '../../content/graphics/image-payload.ts';
import { palettePayloadLength } from '../../content/graphics/palette-payload.ts';
import { diagnoseSourceMappings } from '../source-mapping.ts';
import { countedVerifiedSource, hudFontTables } from './conversion.test-support.ts';
import { runGraphicsStep } from './graphics-step.ts';
import { PRODUCTION_GRAPHICS_DECLARATIONS, PRODUCTION_GRAPHICS_MAPPINGS, PRODUCTION_GRAPHICS_SHARE } from './production-graphics.ts';
import { MODEL_TEXTURE_USAGE, productionGraphicsFiles } from './production-graphics.test-support.ts';
import { PRODUCTION_MODEL_TEXTURE_SHARE } from './production-model-textures.ts';

describe('production graphics', () => {
  it('declares the five P2-05 Assets with their roles, groups, font cells and the hud §1.1 character maps', () => {
    expect(PRODUCTION_GRAPHICS_DECLARATIONS.slice(0, 5).map(({ asset, role, group, ...rest }) => ({ id: asset.id, kind: asset.kind, role, group, ...rest }))).toEqual([
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

  it('declares each slice texture and effect image as a models-group palette and an image shown through the nearest flight colours', () => {
    const declarations = (image: string, palette: string, role: string) => [
      { asset: { id: palette, kind: 'palette' }, role: 'texture-palette', group: 'models' },
      { asset: { id: image, kind: 'image' }, role, group: 'models', palette, display: { nearest: 'palette/flight/models' }, alpha: 'encoding', rowOrder: 'stored' },
    ];
    expect(PRODUCTION_GRAPHICS_DECLARATIONS.slice(5)).toEqual([
      ...TEXTURE_NUMBERS.flatMap(number => declarations(`image/model-texture/${number}`, `palette/model-texture/${number}`, 'model-texture')),
      ...EFFECTS.flatMap(([role]) => declarations(`image/${role}`, `palette/${role}`, role)),
    ]);
  });

  it('maps the flight palettes to the DATA entry, the fonts to the HI cockpit font directory and each texture to its TEX entry', () => {
    const { sourceFingerprint, mappings } = PRODUCTION_GRAPHICS_MAPPINGS;
    expect(sourceFingerprint).toBeNull();
    const textures = TEXTURES.flatMap(([entry, ambiguous], index) => [
      { id: `image/model-texture/${TEXTURE_NUMBERS[index]}`, locators: [[`MAIN/SR.NOB#TEX:${entry}/`]], confidence: ambiguous ? 'unconfirmed' : 'likely', unknowns: ['U-028'], evidence: [textureEvidence, nearestEvidence], resolution: 'declared' },
      { id: `palette/model-texture/${TEXTURE_NUMBERS[index]}`, locators: [[`MAIN/SR.NOB#TEX:${entry}/palette`]], confidence: 'confirmed', unknowns: [], evidence: [textureEvidence], resolution: 'declared' },
    ]);
    // An effect image carries the effects research as well as the texture rule.
    const effects = EFFECTS.flatMap(([role, entry, ambiguous]) => [
      { id: `image/${role}`, locators: [[`MAIN/SR.NOB#TEX:${entry}/`]], confidence: ambiguous ? 'unconfirmed' : 'likely', unknowns: ['U-027', 'U-028'], evidence: [effectEvidence, textureEvidence, nearestEvidence], resolution: 'declared' },
      { id: `palette/${role}`, locators: [[`MAIN/SR.NOB#TEX:${entry}/palette`]], confidence: 'confirmed', unknowns: [], evidence: [textureEvidence], resolution: 'declared' },
    ]);
    expect(mappings.map(({ asset, parts, confidence, unknowns, evidence, resolution }) => ({
      id: asset.id,
      locators: parts.map(({ alternatives }) => alternatives.map(({ discPath, entry, subresource }) => `${discPath}#${entry.type}:${entry.id}/${subresource ?? ''}`)),
      confidence, unknowns, evidence, resolution,
    }))).toEqual([
      { id: 'font/hud/4x6', locators: [['MAIN/SR.NOB#CCKD:10103/fonts/2']], confidence: 'likely', unknowns: ['U-029', 'U-030'], evidence: fontEvidence, resolution: 'declared' },
      { id: 'font/hud/8x8-1', locators: [['MAIN/SR.NOB#CCKD:10103/fonts/0']], confidence: 'likely', unknowns: ['U-029', 'U-030'], evidence: fontEvidence, resolution: 'declared' },
      { id: 'font/hud/8x8-2', locators: [['MAIN/SR.NOB#CCKD:10103/fonts/1']], confidence: 'likely', unknowns: ['U-029', 'U-030'], evidence: fontEvidence, resolution: 'declared' },
      ...effects.filter(({ id }) => id.startsWith('image/')),
      ...textures.filter(({ id }) => id.startsWith('image/')),
      { id: 'palette/flight/cockpit-hud-map', locators: [['MAIN/SR.NOB#DATA:11075/']], confidence: 'confirmed', unknowns: [], evidence: [paletteEvidence], resolution: 'declared' },
      { id: 'palette/flight/models', locators: [['MAIN/SR.NOB#DATA:11075/']], confidence: 'confirmed', unknowns: [], evidence: [paletteEvidence], resolution: 'declared' },
      ...effects.filter(({ id }) => id.startsWith('palette/')),
      ...textures.filter(({ id }) => id.startsWith('palette/')),
    ]);
    expect(mappings.map(({ asset }) => asset.id)).toEqual([...PRODUCTION_GRAPHICS_DECLARATIONS.map(({ asset }) => asset.id)].sort());
    const diagnostics = diagnoseSourceMappings(PRODUCTION_GRAPHICS_MAPPINGS, mappings.map(({ asset }) => asset));
    expect(diagnostics.map(({ code }) => code).sort()).toEqual([...new Array(9).fill('source-unconfirmed'), ...new Array(39).fill('source-unverified')].sort());
  });

  it('exports the approved P2-05 and slice texture shares, each bounding its payloads at the structural limits', () => {
    expect(PRODUCTION_MODEL_TEXTURE_SHARE).toEqual({ ...EMPTY_BUDGET_USAGE, assets: 40, dependencyEdges: 64, paletteEntries: 1_024, imagePixels: 524_288, payloadBytes: 655_360 });
    expect(PRODUCTION_GRAPHICS_SHARE).toEqual({
      ...EMPTY_BUDGET_USAGE, assets: 5 + 40, dependencyEdges: 64, paletteEntries: 512 + 1_024, glyphs: 768, imagePixels: 524_288, payloadBytes: 16_384 + 655_360,
    });
    const p205Bound = 2 * palettePayloadLength(GRAPHICS_LIMITS.paletteEntryCount)
      + 3 * fontPayloadLength(GRAPHICS_LIMITS.glyphCount, GRAPHICS_LIMITS.fontHeight, GRAPHICS_LIMITS.charMapEntries);
    expect(p205Bound).toBeLessThanOrEqual(16_384);
    // Worst case within the texture share: every Asset an image with the longest IDs, a mask byte per 8 pixels plus one
    // per row of the tallest image, and palettes holding every palette entry the share allows.
    const { assets, imagePixels, paletteEntries, payloadBytes } = PRODUCTION_MODEL_TEXTURE_SHARE;
    const header = imagePayloadLength({ width: 0, height: 0, palette: readAssetId('palette/model-texture/99'), display: { nearest: readAssetId('palette/flight/models') } }, false);
    const textureBound = assets * header + imagePixels + imagePixels / 8 + assets * GRAPHICS_LIMITS.imageHeight
      + assets * palettePayloadLength(0) + 3 * paletteEntries;
    expect(textureBound).toBeLessThanOrEqual(payloadBytes);
  });

  it('converts every Asset within the share on a disc in the production structure, reading each entry once', async () => {
    const { source, reads } = await countedVerifiedSource(productionGraphicsFiles());
    const result = await runGraphicsStep(source, PRODUCTION_GRAPHICS_MAPPINGS, PRODUCTION_GRAPHICS_DECLARATIONS, PRODUCTION_GRAPHICS_SHARE);
    const images = TEXTURE_NUMBERS.map(number => `image/model-texture/${number}`);
    const palettes = TEXTURE_NUMBERS.map(number => `palette/model-texture/${number}`);
    expect(result.groups.map(({ group, descriptors }) => [group, descriptors.map(({ id }) => id)])).toEqual([
      ['models', ['image/missile', ...images, 'palette/flight/models', 'palette/missile', ...palettes]],
      ['cockpit-hud-map', ['font/hud/4x6', 'font/hud/8x8-1', 'font/hud/8x8-2', 'palette/flight/cockpit-hud-map']],
    ]);
    const states = result.groups.flatMap(({ sources }) => sources.map(({ id, state, unknowns }) => `${id}:${state}:${unknowns.join()}`));
    expect(states).toEqual([
      'image/missile:unconfirmed:U-027,U-028',
      ...TEXTURES.map(([, ambiguous], index) => `${images[index]}:${ambiguous ? 'unconfirmed' : 'verified'}:U-028`),
      'palette/flight/models:verified:', 'palette/missile:verified:',
      ...palettes.map(id => `${id}:verified:`),
      'font/hud/4x6:verified:U-029,U-030', 'font/hud/8x8-1:verified:U-029,U-030', 'font/hud/8x8-2:verified:U-029,U-030', 'palette/flight/cockpit-hud-map:verified:',
    ]);
    const models = result.groups[0];
    images.forEach((id, index) => {
      expect(models.descriptors.find(descriptor => descriptor.id === id)).toMatchObject({
        kind: 'image', role: 'model-texture', group: 'models',
        dependencies: [{ id: 'palette/flight/models', kind: 'palette' }, { id: palettes[index], kind: 'palette' }],
      });
      const { schemaVersion, bytes } = models.payloads.find(payload => payload.id === id)!;
      expect(readImagePayload(bytes, schemaVersion)).toMatchObject({ palette: palettes[index], display: { nearest: 'palette/flight/models' }, mask: null });
    });
    expect(models.descriptors.find(descriptor => descriptor.id === 'image/missile')).toMatchObject({
      kind: 'image', role: 'missile', dependencies: [{ id: 'palette/flight/models', kind: 'palette' }, { id: 'palette/missile', kind: 'palette' }],
    });
    expect(models.descriptors.filter(({ role }) => role === 'texture-palette').map(({ id, dependencies }) => [id, dependencies]))
      .toEqual(['palette/missile', ...palettes].map(id => [id, []]));
    const payloadBytes = result.groups.flatMap(({ payloads }) => payloads).reduce((total, { bytes }) => total + bytes.length, 0);
    expect(result.usage).toEqual({
      ...EMPTY_BUDGET_USAGE, assets: 5 + MODEL_TEXTURE_USAGE.assets, dependencyEdges: MODEL_TEXTURE_USAGE.dependencyEdges,
      paletteEntries: 512 + MODEL_TEXTURE_USAGE.paletteEntries, glyphs: 256 + 256 + 192, imagePixels: MODEL_TEXTURE_USAGE.imagePixels, payloadBytes,
    });
    // An image and its palette subresource share the one read of their TEX entry.
    expect(Object.fromEntries(reads)).toEqual({ 10103: 1, 11075: 1, ...Object.fromEntries([...TEXTURES, ...EFFECTS.map(([, entry]) => [entry])].map(([entry]) => [entry, 1])) });
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

/**
 * The production texture table as recorded by the P2-06/04 local check, with row 16 appended for the debris model by
 * the P2-06/11 research: TEX entry and whether it uses an ambiguous entry.
 */
const TEXTURES: readonly (readonly [number, boolean])[] = [
  [10_613, true], [10_615, false], [10_617, true], [10_619, false], [11_073, false], [11_067, true], [10_003, true], [10_001, true],
  [10_147, false], [10_321, true], [10_747, false], [10_749, false], [10_681, true], [11_009, false], [10_149, true], [10_151, false],
];
/** The effect images the P2-06/11 research recorded: role, TEX entry and whether it uses an ambiguous entry. */
const EFFECTS: readonly (readonly [string, number, boolean])[] = [['missile', 10_377, true]];
const TEXTURE_NUMBERS = TEXTURES.map((_, index) => String(index + 1).padStart(2, '0'));

/** Codes `firstCode` … `firstCode + count − 1` mapped to the glyphs of the same numbers. */
const range = (firstCode: number, count: number) => ({ firstCode, firstGlyph: firstCode, count });

const fontEvidence = [
  'docs/original/formats/cockpit.md#1-cckd-cockpit-layouts',
  'docs/original/formats/hud.md#1-bitmap-fonts-confirmed',
  'docs/original/formats/hud.md#11-glyph-layout-and-character-maps-likely',
];
const paletteEvidence = 'docs/original/formats/textures.md#1-data-global-palette-confirmed';
const textureEvidence = 'docs/original/formats/textures.md#3-tex-textures-confirmed';
const nearestEvidence = 'docs/original/formats/textures.md#nearest-colour-metric-and-tie-rule-unconfirmed';
const effectEvidence = 'docs/original/formats/executable.md#effect-presentation-sources';
