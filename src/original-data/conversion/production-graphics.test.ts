import { describe, expect, it } from 'vitest';
import { readAssetId } from '../../content/asset-id.ts';
import { addBudgets, EMPTY_BUDGET_USAGE } from '../../content/budget.ts';
import { validateGroup } from '../../content/completeness.ts';
import { compareText } from '../../content/contract-validation.ts';
import { fontPayloadLength, readFontPayload } from '../../content/graphics/font-payload.ts';
import { glyphsFor } from '../../content/graphics/glyph-lookup.ts';
import { GRAPHICS_LIMITS, asciiBytes } from '../../content/graphics/graphics-format.ts';
import { expectContractError } from '../../content/graphics/graphics.test-support.ts';
import { imagePayloadLength, readImagePayload } from '../../content/graphics/image-payload.ts';
import { layoutPayloadLength, readLayoutPayload } from '../../content/graphics/layout-payload.ts';
import { palettePayloadLength, readPalettePayload } from '../../content/graphics/palette-payload.ts';
import { applyManifestIdentity } from '../../content/manifest-identity.ts';
import { CLASSIC_P2_SLICE } from '../../content/slice-definition.ts';
import { diagnoseSourceMappings } from '../source-mapping.ts';
import { countedVerifiedSource, hudFontTables } from './conversion.test-support.ts';
import { productionIdentityBasis } from './converter-version.ts';
import type { ImageDeclaration } from './graphics-declarations.ts';
import { runGraphicsStep, stepGroupDraft } from './graphics-step.ts';
import {
  PRODUCTION_COCKPIT_HUD_MAP_SHARE, PRODUCTION_GRAPHICS_DECLARATIONS, PRODUCTION_GRAPHICS_MAPPINGS, PRODUCTION_GRAPHICS_SHARE,
} from './production-graphics.ts';
import {
  COCKPIT_HUD_MAP_USAGE, MODEL_TEXTURE_USAGE, PRODUCTION_LAYOUT_POSITIONS, productionGraphicsFiles,
} from './production-graphics.test-support.ts';
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

  it('declares each slice texture as a models-group palette and an image shown through the nearest flight colours', () => {
    expect(PRODUCTION_GRAPHICS_DECLARATIONS.slice(5, COCKPIT_HUD_MAP_START)).toEqual(TEXTURE_NUMBERS.flatMap(number => [
      { asset: { id: `palette/model-texture/${number}`, kind: 'palette' }, role: 'texture-palette', group: 'models' },
      {
        asset: { id: `image/model-texture/${number}`, kind: 'image' }, role: 'model-texture', group: 'models',
        palette: `palette/model-texture/${number}`, display: { nearest: 'palette/flight/models' }, alpha: 'encoding', rowOrder: 'stored',
      },
    ]));
  });

  it('declares exactly the P2-07 cockpit, HUD and map Assets of the spec production table after the P2-05 and texture families', () => {
    expect(PRODUCTION_GRAPHICS_DECLARATIONS.slice(COCKPIT_HUD_MAP_START)).toEqual(COCKPIT_HUD_MAP.map(({ declaration }) => declaration));
    expect(PRODUCTION_GRAPHICS_DECLARATIONS).toHaveLength(5 + 2 * TEXTURES.length + 86);
    const kinds = COCKPIT_HUD_MAP.map(({ declaration }) => declaration.asset.kind);
    expect(['layout', 'image', 'palette'].map(kind => kinds.filter(item => item === kind).length)).toEqual([2, 83, 1]);
    // The front-cockpit, strategic-map and hud-mfd slice roles, and the element and map palette roles outside the slice definition.
    const roles = new Map<string, number>();
    for (const { declaration: { role } } of COCKPIT_HUD_MAP) roles.set(role, (roles.get(role) ?? 0) + 1);
    expect(Object.fromEntries(roles)).toEqual({ 'front-cockpit': 1, 'cockpit-element': 4, 'strategic-map': 1 + 29 + 29, 'map-frame-element': 4, 'map-palette': 1, 'hud-mfd': 3 + 9 + 1 + 4 });
  });

  it('maps the flight palettes to the DATA entry, the fonts to the HI cockpit font directory, each texture to its TEX entry and the P2-07 Assets to their records', () => {
    const { sourceFingerprint, mappings } = PRODUCTION_GRAPHICS_MAPPINGS;
    expect(sourceFingerprint).toBeNull();
    const textures = TEXTURES.flatMap(([entry, ambiguous], index) => [
      { id: `image/model-texture/${TEXTURE_NUMBERS[index]}`, locators: [[`MAIN/SR.NOB#TEX:${entry}/`]], confidence: ambiguous ? 'unconfirmed' : 'likely', unknowns: ['U-028'], evidence: [textureEvidence, nearestEvidence], resolution: 'declared' },
      { id: `palette/model-texture/${TEXTURE_NUMBERS[index]}`, locators: [[`MAIN/SR.NOB#TEX:${entry}/palette`]], confidence: 'confirmed', unknowns: [], evidence: [textureEvidence], resolution: 'declared' },
    ]);
    const projected = mappings.map(({ asset, parts, confidence, unknowns, evidence, resolution }) => ({
      id: asset.id,
      locators: parts.map(({ alternatives }) => alternatives.map(({ discPath, entry, subresource }) => `${discPath}#${entry.type}:${entry.id}/${subresource ?? ''}`)),
      confidence, unknowns, evidence, resolution,
    }));
    expect(projected).toEqual([
      { id: 'font/hud/4x6', locators: [['MAIN/SR.NOB#CCKD:10103/fonts/2']], confidence: 'likely', unknowns: ['U-029', 'U-030'], evidence: fontEvidence, resolution: 'declared' },
      { id: 'font/hud/8x8-1', locators: [['MAIN/SR.NOB#CCKD:10103/fonts/0']], confidence: 'likely', unknowns: ['U-029', 'U-030'], evidence: fontEvidence, resolution: 'declared' },
      { id: 'font/hud/8x8-2', locators: [['MAIN/SR.NOB#CCKD:10103/fonts/1']], confidence: 'likely', unknowns: ['U-029', 'U-030'], evidence: fontEvidence, resolution: 'declared' },
      ...textures.filter(({ id }) => id.startsWith('image/')),
      { id: 'palette/flight/cockpit-hud-map', locators: [['MAIN/SR.NOB#DATA:11075/']], confidence: 'confirmed', unknowns: [], evidence: [paletteEvidence], resolution: 'declared' },
      { id: 'palette/flight/models', locators: [['MAIN/SR.NOB#DATA:11075/']], confidence: 'confirmed', unknowns: [], evidence: [paletteEvidence], resolution: 'declared' },
      ...textures.filter(({ id }) => id.startsWith('palette/')),
      ...COCKPIT_HUD_MAP.map(({ mapping }) => mapping),
    ].sort((left, right) => compareText(left.id, right.id)));
    expect(mappings.map(({ asset }) => asset.id)).toEqual([...PRODUCTION_GRAPHICS_DECLARATIONS.map(({ asset }) => asset.id)].sort());
    // No P2-07 mapping is unconfirmed, so none keeps the group from being complete.
    const cockpitIds = new Set(COCKPIT_HUD_MAP.map(({ declaration }) => declaration.asset.id));
    expect(new Set(mappings.filter(({ asset }) => cockpitIds.has(asset.id)).map(({ confidence }) => confidence))).toEqual(new Set(['confirmed', 'likely']));
    const diagnostics = diagnoseSourceMappings(PRODUCTION_GRAPHICS_MAPPINGS, mappings.map(({ asset }) => asset));
    expect(diagnostics.map(({ code }) => code).sort()).toEqual([...new Array(8).fill('source-unconfirmed'), ...new Array(35 + 86).fill('source-unverified')].sort());
  });

  it('exports the approved P2-05, slice texture and P2-07 shares as the graphics step share, each bounding its payloads', () => {
    expect(PRODUCTION_MODEL_TEXTURE_SHARE).toEqual({ ...EMPTY_BUDGET_USAGE, assets: 40, dependencyEdges: 64, paletteEntries: 1_024, imagePixels: 524_288, payloadBytes: 655_360 });
    expect(PRODUCTION_COCKPIT_HUD_MAP_SHARE).toEqual({
      ...EMPTY_BUDGET_USAGE, assets: 96, dependencyEdges: 192, imagePixels: 524_288, paletteEntries: 1_024, glyphs: 0, payloadBytes: 786_432,
    });
    const p205Share = { ...EMPTY_BUDGET_USAGE, assets: 5, paletteEntries: 512, glyphs: 768, payloadBytes: 16_384 };
    expect(PRODUCTION_GRAPHICS_SHARE).toEqual(addBudgets(addBudgets(p205Share, PRODUCTION_MODEL_TEXTURE_SHARE), PRODUCTION_COCKPIT_HUD_MAP_SHARE));
    expect(PRODUCTION_GRAPHICS_SHARE).toEqual({
      ...EMPTY_BUDGET_USAGE, assets: 5 + 40 + 96, dependencyEdges: 64 + 192, paletteEntries: 512 + 1_024 + 1_024, glyphs: 768, imagePixels: 2 * 524_288,
      payloadBytes: 16_384 + 655_360 + 786_432,
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
    // The P2-07 estimate: the pixel bound in images with the longest P2-07 header and a mask, palettes holding every
    // palette entry the share allows, and the two layouts at 16 elements with the longest P2-07 image ID.
    const cockpit = PRODUCTION_COCKPIT_HUD_MAP_SHARE;
    const cockpitImages = COCKPIT_HUD_MAP.map(({ declaration }) => declaration).filter((declaration): declaration is ImageDeclaration => declaration.asset.kind === 'image');
    const cockpitHeader = Math.max(...cockpitImages.map(({ palette, display }) => imagePayloadLength({ width: 0, height: 0, palette, display }, false)));
    const longestImage = cockpitImages.reduce((longest, { asset }) => (asset.id.length > longest.length ? asset.id : longest), '');
    const layoutBound = layoutPayloadLength({ elements: new Array(GRAPHICS_LIMITS.layoutElements).fill({ image: longestImage, x: 0, y: 0 }) });
    const cockpitBound = cockpit.assets * cockpitHeader + cockpit.imagePixels + cockpit.imagePixels / 8 + cockpit.assets * GRAPHICS_LIMITS.imageHeight
      + (cockpit.paletteEntries / GRAPHICS_LIMITS.paletteEntryCount) * palettePayloadLength(GRAPHICS_LIMITS.paletteEntryCount) + 2 * layoutBound;
    expect(cockpitBound).toBeLessThanOrEqual(cockpit.payloadBytes);
  });

  it('converts every Asset within the share on a disc in the production structure, reading each entry once', async () => {
    const { source, reads } = await countedVerifiedSource(productionGraphicsFiles());
    const result = await runGraphicsStep(source, PRODUCTION_GRAPHICS_MAPPINGS, PRODUCTION_GRAPHICS_DECLARATIONS, PRODUCTION_GRAPHICS_SHARE);
    const images = TEXTURE_NUMBERS.map(number => `image/model-texture/${number}`);
    const palettes = TEXTURE_NUMBERS.map(number => `palette/model-texture/${number}`);
    const cockpitHudMap = [
      ...['font/hud/4x6', 'font/hud/8x8-1', 'font/hud/8x8-2'].map(id => ({ id, unknowns: ['U-029', 'U-030'] })),
      { id: 'palette/flight/cockpit-hud-map', unknowns: [] },
      ...COCKPIT_HUD_MAP.map(({ mapping: { id, unknowns } }) => ({ id, unknowns })),
    ].sort((left, right) => compareText(left.id, right.id));
    expect(result.groups.map(({ group, descriptors }) => [group, descriptors.map(({ id }) => id)])).toEqual([
      ['models', [...images, 'palette/flight/models', ...palettes]],
      ['cockpit-hud-map', cockpitHudMap.map(({ id }) => id)],
    ]);
    const states = result.groups.flatMap(({ sources }) => sources.map(({ id, state, unknowns }) => `${id}:${state}:${unknowns.join()}`));
    expect(states).toEqual([
      ...TEXTURES.map(([, ambiguous], index) => `${images[index]}:${ambiguous ? 'unconfirmed' : 'verified'}:U-028`),
      'palette/flight/models:verified:',
      ...palettes.map(id => `${id}:verified:`),
      ...cockpitHudMap.map(({ id, unknowns }) => `${id}:verified:${unknowns.join()}`),
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
    expect(models.descriptors.filter(({ role }) => role === 'texture-palette').map(({ id, dependencies }) => [id, dependencies])).toEqual(palettes.map(id => [id, []]));
    const payloadBytes = result.groups.flatMap(({ payloads }) => payloads).reduce((total, { bytes }) => total + bytes.length, 0);
    expect(result.usage).toEqual({
      ...EMPTY_BUDGET_USAGE, assets: 5 + MODEL_TEXTURE_USAGE.assets + COCKPIT_HUD_MAP_USAGE.assets,
      dependencyEdges: MODEL_TEXTURE_USAGE.dependencyEdges + COCKPIT_HUD_MAP_USAGE.dependencyEdges,
      paletteEntries: 512 + MODEL_TEXTURE_USAGE.paletteEntries + COCKPIT_HUD_MAP_USAGE.paletteEntries, glyphs: 256 + 256 + 192,
      imagePixels: MODEL_TEXTURE_USAGE.imagePixels + COCKPIT_HUD_MAP_USAGE.imagePixels, payloadBytes,
    });
    expect(COCKPIT_HUD_MAP_USAGE).toMatchObject({ assets: 86, dependencyEdges: 83 + 4 + 4, paletteEntries: 256 });
    // An image and its palette subresource share the one read of their TEX entry; the fonts, both layouts, their
    // elements and the map palette share the one read of the CCKD entry.
    expect(Object.fromEntries(reads)).toEqual({
      10103: 1, 11075: 1, 10461: 1, 10467: 1, 10473: 1, 10479: 1, 11401: 1, ...Object.fromEntries(TEXTURES.map(([entry]) => [entry, 1])),
    });
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

  it('converts the P2-07 Assets on the production structure into a cockpit-hud-map group that validates complete', async () => {
    const { source } = await countedVerifiedSource(productionGraphicsFiles());
    const result = await runGraphicsStep(source, PRODUCTION_GRAPHICS_MAPPINGS, PRODUCTION_GRAPHICS_DECLARATIONS, PRODUCTION_GRAPHICS_SHARE);
    const fingerprint = source.identity.fingerprint;
    const [group] = applyManifestIdentity(productionIdentityBasis(fingerprint), [stepGroupDraft('cockpit-hud-map', [result], fingerprint)]);
    expect(validateGroup(CLASSIC_P2_SLICE, group)).toMatchObject({ status: 'group-complete', group: 'cockpit-hud-map', externalRequirements: [] });

    const { descriptors, payloads } = result.groups.find(partition => partition.group === 'cockpit-hud-map')!;
    const payload = (id: string) => payloads.find(item => item.id === id)!;
    for (const { declaration } of COCKPIT_HUD_MAP) {
      const { asset: { id, kind } } = declaration;
      const { bytes, schemaVersion } = payload(id);
      const { dependencies } = descriptors.find(descriptor => descriptor.id === id)!;
      if (kind === 'layout') {
        const { elements } = declaration as unknown as { elements: string[] };
        // Element i of the declaration at the position of stored element i, inside the 640×480 frame.
        expect(readLayoutPayload(bytes, schemaVersion)).toMatchObject({
          frame: { width: 640, height: 480 }, elements: elements.map((image, index) => ({ image, ...PRODUCTION_LAYOUT_POSITIONS[id][index] })),
        });
        expect(dependencies).toEqual([...elements].sort().map(image => ({ id: image, kind: 'image' })));
      } else if (kind === 'image') {
        const { palette, alpha } = declaration as unknown as ImageDeclaration;
        const image = readImagePayload(bytes, schemaVersion);
        expect(image).toMatchObject({ palette, display: 'direct' });
        expect(dependencies).toEqual([{ id: palette, kind: 'palette' }]);
        // A colour key always masks; as encoded, only the synthetic front sprite element has transparent pixels.
        expect(image.mask !== null).toBe(alpha !== 'encoding' || id === 'image/cockpit/front/element-3');
      } else {
        expect(readPalettePayload(bytes, schemaVersion).entries).toHaveLength(256 * 3);
        expect(dependencies).toEqual([]);
      }
    }
    // The map frame group's palette differs from the flight palette it is converted alongside.
    expect(payload('palette/map/screen').bytes).not.toEqual(payload('palette/flight/cockpit-hud-map').bytes);
  });
});

/** The production texture table as recorded by the P2-06/04 local check: TEX entry and whether it uses an ambiguous entry. */
const TEXTURES: readonly (readonly [number, boolean])[] = [
  [10_613, true], [10_615, false], [10_617, true], [10_619, false], [11_073, false], [11_067, true], [10_003, true], [10_001, true],
  [10_147, false], [10_321, true], [10_747, false], [10_749, false], [10_681, true], [11_009, false], [10_149, true],
];
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

/** Where the P2-07 declarations start: after the five P2-05 Assets and each texture's palette and image. */
const COCKPIT_HUD_MAP_START = 5 + 2 * TEXTURES.length;

const FLIGHT_PALETTE = 'palette/flight/cockpit-hud-map';
const MAP_PALETTE = 'palette/map/screen';
const COLOUR_KEY_0 = { colourKey: 0 };
const indexed = (prefix: string, count: number) => Array.from({ length: count }, (_, index) => `${prefix}${index}`);

const cockpitR1 = 'docs/original/formats/cockpit.md#front-cockpit-source-r1';
const groupPalette = 'docs/original/formats/cockpit.md#group-palette-and-drawing-confirmed';
const mfdStructure = 'docs/original/formats/cockpit.md#2-mfdd-multi-function-display-images-confirmed-structure';
const hudPaths = 'docs/original/formats/hud.md#hud-and-map-drawing-paths-confirmed-exe';
const hudFamilies = 'docs/original/formats/hud.md#slice-screen-coverage-and-hud-image-families-r3-r4-r6';
const tableStructure = 'docs/original/formats/hud.md#tabl-image-lists-confirmed-structure';
const zoomIcons = 'docs/original/formats/hud.md#zoom-window-icons-by-craft-type-r8';

type MappingFields = { readonly confidence: string; readonly unknowns: string[]; readonly evidence: string[] };
const front: MappingFields = { confidence: 'likely', unknowns: ['U-029'], evidence: [cockpitR1, groupPalette] };
const mapFrame: MappingFields = { confidence: 'confirmed', unknowns: ['U-029'], evidence: [groupPalette] };
const hud = (...evidence: string[]): MappingFields => ({ confidence: 'confirmed', unknowns: ['U-030'], evidence: [...evidence].sort() });

/** One expected P2-07 Asset: its declaration and its mapping projected as in the mapping test, in the spec's terms. */
const expected = (declaration: Record<string, unknown> & { asset: { id: string; kind: string }; role: string }, locator: string, fields: MappingFields) => ({
  declaration: { ...declaration, group: 'cockpit-hud-map' },
  mapping: { id: declaration.asset.id, locators: [[`MAIN/SR.NOB#${locator}`]], ...fields, resolution: 'declared' },
});
const imageRows = (ids: string[], role: string, palette: string, alpha: unknown, locator: (index: number) => string, fields: MappingFields) =>
  ids.map((id, index) => expected({ asset: { id, kind: 'image' }, role, palette, display: 'direct', alpha, rowOrder: 'stored' }, locator(index), fields));

const FRONT_ELEMENTS = indexed('image/cockpit/front/element-', 4);
const MAP_FRAME_ELEMENTS = indexed('image/map/frame/element-', 4);

/** The spec's production table of P2-07 Assets, with the element and record counts of the local structure check. */
const COCKPIT_HUD_MAP = [
  expected({ asset: { id: 'layout/cockpit/front', kind: 'layout' }, role: 'front-cockpit', frame: { width: 640, height: 480 }, elements: FRONT_ELEMENTS }, 'CCKD:10103/groups/0', front),
  ...imageRows(FRONT_ELEMENTS, 'cockpit-element', FLIGHT_PALETTE, 'encoding', index => `CCKD:10103/groups/0/elements/${index}`, front),
  expected({ asset: { id: 'layout/map/frame', kind: 'layout' }, role: 'strategic-map', frame: { width: 640, height: 480 }, elements: MAP_FRAME_ELEMENTS }, 'CCKD:10103/groups/2', mapFrame),
  ...imageRows(MAP_FRAME_ELEMENTS, 'map-frame-element', MAP_PALETTE, 'encoding', index => `CCKD:10103/groups/2/elements/${index}`, mapFrame),
  expected({ asset: { id: MAP_PALETTE, kind: 'palette' }, role: 'map-palette' }, 'CCKD:10103/groups/2/palette', mapFrame),
  ...imageRows(indexed('image/hud/status-display/background-', 3), 'hud-mfd', FLIGHT_PALETTE, 'encoding', index => `MFDD:10473/lists/0/records/${index}`, hud(hudPaths, hudFamilies, mfdStructure)),
  ...imageRows(indexed('image/hud/status-display/overlay-', 9), 'hud-mfd', FLIGHT_PALETTE, COLOUR_KEY_0, index => `MFDD:10473/lists/1/records/${index}`, hud(hudPaths, hudFamilies, mfdStructure)),
  ...imageRows(['image/hud/display-page/background'], 'hud-mfd', FLIGHT_PALETTE, 'encoding', () => 'BITM:10467/', hud(hudPaths, hudFamilies)),
  ...imageRows(indexed('image/hud/gauge-bar-1/', 4), 'hud-mfd', FLIGHT_PALETTE, COLOUR_KEY_0, index => `TABL:10479/records/${index}`, hud(hudPaths, hudFamilies, tableStructure)),
  ...imageRows(indexed('image/map/unit-marker/', 29), 'strategic-map', MAP_PALETTE, COLOUR_KEY_0, index => `TABL:10461/records/${index}`, hud(hudPaths, hudFamilies, tableStructure)),
  ...imageRows(indexed('image/map/zoom-icon/', 29), 'strategic-map', MAP_PALETTE, COLOUR_KEY_0, index => `TABL:11401/records/${index}`, hud(hudPaths, hudFamilies, tableStructure, zoomIcons)),
];
