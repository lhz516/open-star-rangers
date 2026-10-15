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
import { MAP_GEOMETRY_LIMITS, MAP_GEOMETRY_SCHEMA_VERSION, encodeMapGeometryPayload, decodeMapGeometryPayload } from '../../content/hud/map-geometry-payload.ts';
import { STATUS_MESSAGES_LIMITS, readStatusMessagesPayload, statusMessagesPayloadLength } from '../../content/hud/status-messages-payload.ts';
import { diagnoseSourceMappings, isRegionLocator } from '../source-mapping.ts';
import { countedVerifiedSource, hudFontTables } from './conversion.test-support.ts';
import { productionIdentityBasis } from './converter-version.ts';
import type { ImageDeclaration } from './graphics-declarations.ts';
import { runGraphicsStep, stepGroupDraft } from './graphics-step.ts';
import {
  PRODUCTION_FLIGHT_GRAPHICS_DECLARATIONS, PRODUCTION_FLIGHT_GRAPHICS_MAPPINGS, PRODUCTION_FLIGHT_GRAPHICS_SHARE,
} from './production-flight-graphics.ts';
import { FLIGHT_GRAPHICS_USAGE, productionFlightGraphicsEntries } from './production-flight-graphics.test-support.ts';
import { HUD_TEXT_ASSET, PRODUCTION_HUD_TEXT_DECLARATIONS, PRODUCTION_HUD_TEXT_MAPPINGS, PRODUCTION_HUD_TEXT_SHARE } from './production-hud-text.ts';
import { HUD_TEXT_USAGE } from './production-hud-text.test-support.ts';
import {
  PRODUCTION_COCKPIT_HUD_MAP_SHARE, PRODUCTION_GRAPHICS_DECLARATIONS, PRODUCTION_GRAPHICS_MAPPINGS, PRODUCTION_GRAPHICS_SHARE, PRODUCTION_MAP_GEOMETRY_SHARE,
} from './production-graphics.ts';
import {
  COCKPIT_HUD_MAP_USAGE, interferenceIndices, MAP_GEOMETRY_USAGE, MODEL_TEXTURE_USAGE, PRODUCTION_LAYOUT_POSITIONS, productionGraphicsFiles,
  SYNTHETIC_MAP_GEOMETRY, SYNTHETIC_STATUS_MESSAGES_PAYLOAD,
} from './production-graphics.test-support.ts';
import { PRODUCTION_MODEL_TEXTURE_SHARE } from './production-model-textures.ts';

/**
 * The P3-03 flight graphics and HUD text the production tables append, which production-flight-graphics.test.ts and
 * production-hud-text.test.ts check, and the P3-09 map geometry, which this file and map-geometry-step.test.ts check.
 */
const FLIGHT = new Set<string>(PRODUCTION_FLIGHT_GRAPHICS_MAPPINGS.mappings.map(({ asset }) => asset.id));
const MAP_GEOMETRY_ID = 'data/hud/map-geometry';
const notFlight = (id: string) => !FLIGHT.has(id) && id !== HUD_TEXT_ASSET.id && id !== MAP_GEOMETRY_ID;
const MAP_GEOMETRY_DECLARATION = { asset: { id: MAP_GEOMETRY_ID, kind: 'data' }, role: 'map-geometry', group: 'cockpit-hud-map' };

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
    expect(PRODUCTION_GRAPHICS_DECLARATIONS.slice(5, COCKPIT_HUD_MAP_START)).toEqual([
      ...TEXTURE_NUMBERS.flatMap(number => declarations(`image/model-texture/${number}`, `palette/model-texture/${number}`, 'model-texture')),
      ...EFFECTS.flatMap(([role]) => declarations(`image/${role}`, `palette/${role}`, role)),
    ]);
  });

  it('declares exactly the P2-07 cockpit, HUD and map Assets of the spec production table after the P2-05 and texture families, then the P3-03 flight graphics, HUD text and map geometry', () => {
    expect(PRODUCTION_GRAPHICS_DECLARATIONS.slice(COCKPIT_HUD_MAP_START, COCKPIT_HUD_MAP_START + 96)).toEqual(COCKPIT_HUD_MAP.map(({ declaration }) => declaration));
    expect(PRODUCTION_GRAPHICS_DECLARATIONS.slice(COCKPIT_HUD_MAP_START + 96))
      .toEqual([...PRODUCTION_FLIGHT_GRAPHICS_DECLARATIONS, ...PRODUCTION_HUD_TEXT_DECLARATIONS, MAP_GEOMETRY_DECLARATION]);
    const kinds = COCKPIT_HUD_MAP.map(({ declaration }) => declaration.asset.kind);
    expect(['layout', 'image', 'palette', 'data'].map(kind => kinds.filter(item => item === kind).length)).toEqual([2, 92, 1, 1]);
    // The front-cockpit, strategic-map and hud-mfd slice roles, and the element, map palette and messages roles outside the slice definition.
    const roles = new Map<string, number>();
    for (const { declaration: { role } } of COCKPIT_HUD_MAP) roles.set(role, (roles.get(role) ?? 0) + 1);
    expect(Object.fromEntries(roles)).toEqual({
      'front-cockpit': 1, 'cockpit-element': 4, 'strategic-map': 1 + 29 + 29, 'map-frame-element': 4, 'map-palette': 1, 'hud-mfd': 3 + 9 + 1 + 4 + 9,
      'status-messages': 1,
    });
  });

  it('maps the flight palettes to the DATA entry, the fonts to the HI cockpit font directory, each texture to its TEX entry and the P2-07 Assets to their records', () => {
    const { sourceFingerprint, mappings } = PRODUCTION_GRAPHICS_MAPPINGS;
    expect(sourceFingerprint).toBeNull();
    // Every image is likely: the nearest rule is confirmed and only runtime shading stays open (U-028).
    const textures = TEXTURES.flatMap((entry, index) => [
      { id: `image/model-texture/${TEXTURE_NUMBERS[index]}`, locators: [[`MAIN/SR.NOB#TEX:${entry}/`]], confidence: 'likely', unknowns: ['U-028'], evidence: [textureEvidence, nearestEvidence], resolution: 'declared' },
      { id: `palette/model-texture/${TEXTURE_NUMBERS[index]}`, locators: [[`MAIN/SR.NOB#TEX:${entry}/palette`]], confidence: 'confirmed', unknowns: [], evidence: [textureEvidence], resolution: 'declared' },
    ]);
    // An effect image carries the effects research as well as the texture rule.
    const effects = EFFECTS.flatMap(([role, entry]) => [
      { id: `image/${role}`, locators: [[`MAIN/SR.NOB#TEX:${entry}/`]], confidence: 'likely', unknowns: ['U-027', 'U-028'], evidence: [effectEvidence, textureEvidence, nearestEvidence], resolution: 'declared' },
      { id: `palette/${role}`, locators: [[`MAIN/SR.NOB#TEX:${entry}/palette`]], confidence: 'confirmed', unknowns: [], evidence: [textureEvidence], resolution: 'declared' },
    ]);
    const projected = mappings.map(({ asset, parts, confidence, unknowns, evidence, resolution }) => ({
      id: asset.id,
      locators: parts.map(({ alternatives }) => alternatives.map(locator => (isRegionLocator(locator)
        ? `${locator.discPath}#${locator.subresource}` : `${locator.discPath}#${locator.entry.type}:${locator.entry.id}/${locator.subresource ?? ''}`))),
      confidence, unknowns, evidence, resolution,
    }));
    expect(projected.filter(({ id }) => notFlight(id))).toEqual([
      { id: 'font/hud/4x6', locators: [['MAIN/SR.NOB#CCKD:10103/fonts/2']], confidence: 'likely', unknowns: ['U-029', 'U-030'], evidence: fontEvidence, resolution: 'declared' },
      { id: 'font/hud/8x8-1', locators: [['MAIN/SR.NOB#CCKD:10103/fonts/0']], confidence: 'likely', unknowns: ['U-029', 'U-030'], evidence: fontEvidence, resolution: 'declared' },
      { id: 'font/hud/8x8-2', locators: [['MAIN/SR.NOB#CCKD:10103/fonts/1']], confidence: 'likely', unknowns: ['U-029', 'U-030'], evidence: fontEvidence, resolution: 'declared' },
      ...effects.filter(({ id }) => id.startsWith('image/')),
      ...textures.filter(({ id }) => id.startsWith('image/')),
      { id: 'palette/flight/cockpit-hud-map', locators: [['MAIN/SR.NOB#DATA:11075/']], confidence: 'confirmed', unknowns: [], evidence: [paletteEvidence], resolution: 'declared' },
      { id: 'palette/flight/models', locators: [['MAIN/SR.NOB#DATA:11075/']], confidence: 'confirmed', unknowns: [], evidence: [paletteEvidence], resolution: 'declared' },
      ...effects.filter(({ id }) => id.startsWith('palette/')),
      ...textures.filter(({ id }) => id.startsWith('palette/')),
      ...COCKPIT_HUD_MAP.map(({ mapping }) => mapping),
    ].sort((left, right) => compareText(left.id, right.id)));
    expect(mappings.map(({ asset }) => asset.id)).toEqual([...PRODUCTION_GRAPHICS_DECLARATIONS.map(({ asset }) => asset.id)].sort());
    // No P2-07 mapping is unconfirmed, so none keeps the group from being complete.
    const cockpitIds = new Set(COCKPIT_HUD_MAP.map(({ declaration }) => declaration.asset.id));
    expect(new Set(mappings.filter(({ asset }) => cockpitIds.has(asset.id)).map(({ confidence }) => confidence))).toEqual(new Set(['confirmed', 'likely']));
    const diagnostics = diagnoseSourceMappings(PRODUCTION_GRAPHICS_MAPPINGS, mappings.map(({ asset }) => asset));
    // Every declared mapping is only unverified until the job verifies it; none is unconfirmed.
    expect(diagnostics.map(({ code }) => code)).toEqual(new Array(39 + 96 + FLIGHT.size + 2).fill('source-unverified'));
    expect(mappings.filter(({ asset }) => FLIGHT.has(asset.id))).toEqual(PRODUCTION_FLIGHT_GRAPHICS_MAPPINGS.mappings);
    expect(mappings.filter(({ asset }) => asset.id === HUD_TEXT_ASSET.id)).toEqual(PRODUCTION_HUD_TEXT_MAPPINGS.mappings);
    // The map geometry (P3-03 spec, P3-09 的修订): font 1 and the type-10 record of the layout-6 slot of the HI cockpit set.
    expect(projected.filter(({ id }) => id === MAP_GEOMETRY_ID)).toEqual([{
      id: MAP_GEOMETRY_ID,
      locators: [['MAIN/SR.NOB#CCKD:10103/fonts/1'], ['MAIN/SR.NOB#CCKD:10103/layouts/6/instruments/type-10']],
      confidence: 'confirmed',
      unknowns: [],
      evidence: [
        'docs/original/formats/cockpit.md#instrument-types-per-slot-confirmed-p3-0730',
        'docs/original/formats/executable.md#cursor-destination-and-marker-p3-0902',
        'docs/original/formats/executable.md#map-mouse-input-p3-0503',
        'docs/original/formats/executable.md#zoom-window-information-window-and-labels-p3-0904',
        'docs/original/formats/hud.md#1-bitmap-fonts-confirmed',
      ],
      resolution: 'declared',
    }]);
  });

  it('exports the approved P2-05, slice texture, P2-07, P3-03 flight, HUD text and map geometry shares as the graphics step share, each bounding its payloads', () => {
    expect(PRODUCTION_MODEL_TEXTURE_SHARE).toEqual({ ...EMPTY_BUDGET_USAGE, assets: 40, dependencyEdges: 64, paletteEntries: 1_024, imagePixels: 524_288, payloadBytes: 655_360 });
    expect(PRODUCTION_COCKPIT_HUD_MAP_SHARE).toEqual({
      ...EMPTY_BUDGET_USAGE, assets: 112, dependencyEdges: 192, imagePixels: 655_360, paletteEntries: 1_024, glyphs: 0, payloadBytes: 917_504,
    });
    const p205Share = { ...EMPTY_BUDGET_USAGE, assets: 5, paletteEntries: 512, glyphs: 768, payloadBytes: 16_384 };
    // The map geometry share is one Asset and its payload at the byte limit (P3-03 spec, P3-09 的修订), which bounds it.
    expect(PRODUCTION_MAP_GEOMETRY_SHARE).toEqual({ ...EMPTY_BUDGET_USAGE, assets: 1, payloadBytes: 256 });
    expect(MAP_GEOMETRY_LIMITS.payloadBytes).toBe(256);
    expect(PRODUCTION_GRAPHICS_SHARE).toEqual([
      PRODUCTION_MODEL_TEXTURE_SHARE, PRODUCTION_COCKPIT_HUD_MAP_SHARE, PRODUCTION_FLIGHT_GRAPHICS_SHARE, PRODUCTION_HUD_TEXT_SHARE, PRODUCTION_MAP_GEOMETRY_SHARE,
    ].reduce((total, share) => addBudgets(total, share), p205Share));
    expect(PRODUCTION_GRAPHICS_SHARE).toEqual({
      ...EMPTY_BUDGET_USAGE, assets: 5 + 40 + 112 + 512 + 2 + 1, dependencyEdges: 64 + 192 + 512, paletteEntries: 512 + 1_024 + 1_024 + 512, glyphs: 768,
      imagePixels: 524_288 + 655_360 + 4_194_304, payloadBytes: 16_384 + 655_360 + 917_504 + 4_194_304 + 4_096 + 256,
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
    // palette entry the share allows, the two layouts at 16 elements with the longest P2-07 image ID, and the status
    // display messages with every text at its longest and the most startup messages.
    const cockpit = PRODUCTION_COCKPIT_HUD_MAP_SHARE;
    const cockpitImages = COCKPIT_HUD_MAP.map(({ declaration }) => declaration).filter((declaration): declaration is ImageDeclaration => declaration.asset.kind === 'image');
    const cockpitHeader = Math.max(...cockpitImages.map(({ palette, display }) => imagePayloadLength({ width: 0, height: 0, palette, display }, false)));
    const longestImage = cockpitImages.reduce((longest, { asset }) => (asset.id.length > longest.length ? asset.id : longest), '');
    const layoutBound = layoutPayloadLength({ elements: new Array(GRAPHICS_LIMITS.layoutElements).fill({ image: longestImage, x: 0, y: 0 }) });
    const longest = 'x'.repeat(STATUS_MESSAGES_LIMITS.textBytes);
    const messagesBound = statusMessagesPayloadLength({
      ...SYNTHETIC_STATUS_MESSAGES_PAYLOAD, statusFormats: new Array(4).fill(longest), ratings: new Array(5).fill({ text: longest, maximum: 0 }),
      subsystemNames: new Array(15).fill(longest), stateWords: new Array(3).fill(longest), subsystemFormat: longest,
      startupMessages: new Array(STATUS_MESSAGES_LIMITS.startupMessages).fill(longest),
    });
    const cockpitBound = cockpit.assets * cockpitHeader + cockpit.imagePixels + cockpit.imagePixels / 8 + cockpit.assets * GRAPHICS_LIMITS.imageHeight
      + (cockpit.paletteEntries / GRAPHICS_LIMITS.paletteEntryCount) * palettePayloadLength(GRAPHICS_LIMITS.paletteEntryCount) + 2 * layoutBound + messagesBound;
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
    expect(result.groups.map(({ group, descriptors }) => [group, descriptors.map(({ id }) => id).filter(notFlight)])).toEqual([
      ['models', ['image/missile', ...images, 'palette/flight/models', 'palette/missile', ...palettes]],
      ['cockpit-hud-map', cockpitHudMap.map(({ id }) => id)],
    ]);
    // The flight graphics, the HUD text and the map geometry join their declared groups, verified with their unknowns.
    expect(result.groups.flatMap(({ group, descriptors }) => descriptors.filter(({ id }) => !notFlight(id)).map(({ id }) => `${group}:${id}`)).sort())
      .toEqual([...PRODUCTION_FLIGHT_GRAPHICS_DECLARATIONS, ...PRODUCTION_HUD_TEXT_DECLARATIONS, MAP_GEOMETRY_DECLARATION].map(({ group, asset }) => `${group}:${asset.id}`).sort());
    expect(result.groups[1].sources.find(({ id }) => id === HUD_TEXT_ASSET.id)).toEqual({ id: HUD_TEXT_ASSET.id, state: 'verified', unknowns: ['U-026', 'U-030'] });
    expect(result.groups[1].sources.find(({ id }) => id === MAP_GEOMETRY_ID)).toEqual({ id: MAP_GEOMETRY_ID, state: 'verified', unknowns: [] });
    const mapGeometry = result.groups[1].payloads.find(({ id }) => id === MAP_GEOMETRY_ID)!;
    const mapDescriptor = result.groups[1].descriptors.find(({ id }) => id === MAP_GEOMETRY_ID)!;
    expect(mapGeometry.schemaVersion).toBe(MAP_GEOMETRY_SCHEMA_VERSION);
    expect(decodeMapGeometryPayload(mapGeometry.bytes, mapDescriptor)).toEqual(SYNTHETIC_MAP_GEOMETRY);
    expect(mapGeometry.bytes).toEqual(encodeMapGeometryPayload(SYNTHETIC_MAP_GEOMETRY));
    const states = result.groups.flatMap(({ sources }) => sources.filter(({ id }) => notFlight(id)).map(({ id, state, unknowns }) => `${id}:${state}:${unknowns.join()}`));
    expect(states).toEqual([
      'image/missile:verified:U-027,U-028',
      ...TEXTURES.map((_, index) => `${images[index]}:verified:U-028`),
      'palette/flight/models:verified:', 'palette/missile:verified:',
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
    expect(models.descriptors.find(descriptor => descriptor.id === 'image/missile')).toMatchObject({
      kind: 'image', role: 'missile', dependencies: [{ id: 'palette/flight/models', kind: 'palette' }, { id: 'palette/missile', kind: 'palette' }],
    });
    expect(models.descriptors.filter(({ role }) => role === 'texture-palette').map(({ id, dependencies }) => [id, dependencies]))
      .toEqual(['palette/missile', ...palettes].map(id => [id, []]));
    const payloadBytes = result.groups.flatMap(({ payloads }) => payloads).reduce((total, { bytes }) => total + bytes.length, 0);
    expect(result.usage).toEqual({
      ...EMPTY_BUDGET_USAGE,
      assets: 5 + MODEL_TEXTURE_USAGE.assets + COCKPIT_HUD_MAP_USAGE.assets + FLIGHT_GRAPHICS_USAGE.assets + HUD_TEXT_USAGE.assets + MAP_GEOMETRY_USAGE.assets,
      dependencyEdges: MODEL_TEXTURE_USAGE.dependencyEdges + COCKPIT_HUD_MAP_USAGE.dependencyEdges + FLIGHT_GRAPHICS_USAGE.dependencyEdges,
      paletteEntries: 512 + MODEL_TEXTURE_USAGE.paletteEntries + COCKPIT_HUD_MAP_USAGE.paletteEntries + FLIGHT_GRAPHICS_USAGE.paletteEntries, glyphs: 256 + 256 + 192,
      imagePixels: MODEL_TEXTURE_USAGE.imagePixels + COCKPIT_HUD_MAP_USAGE.imagePixels + FLIGHT_GRAPHICS_USAGE.imagePixels, payloadBytes,
    });
    expect(result.groups.flatMap(({ payloads }) => payloads).filter(({ id }) => FLIGHT.has(id)).reduce((total, { bytes }) => total + bytes.length, 0))
      .toBe(FLIGHT_GRAPHICS_USAGE.payloadBytes);
    expect(result.groups.flatMap(({ payloads }) => payloads).find(({ id }) => id === HUD_TEXT_ASSET.id)!.bytes).toHaveLength(HUD_TEXT_USAGE.payloadBytes);
    expect(COCKPIT_HUD_MAP_USAGE).toMatchObject({ assets: 96, dependencyEdges: 92 + 4 + 4, paletteEntries: 256 });
    // An image and its palette subresource share the one read of their TEX entry; the fonts, both layouts, their
    // elements, the map palette and the map geometry share the one read of the CCKD entry; the nine frames the one read
    // of the SNIP.
    expect(Object.fromEntries(reads)).toEqual({
      10103: 1, 11075: 1, 10461: 1, 10467: 1, 10473: 1, 10479: 1, 11401: 1, 10487: 1, 10489: 1,
      ...Object.fromEntries([...TEXTURES, ...EFFECTS.map(([, entry]) => entry)].map(entry => [entry, 1])),
      ...Object.fromEntries(productionFlightGraphicsEntries().map(({ id }) => [id, 1])),
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
        // Each interference frame's 2-bit values come out as the executable colour table's palette indices.
        const frame = /^image\/hud\/display-interference\/frame-(\d)$/.exec(id);
        if (frame) expect(image.indices).toEqual(interferenceIndices(Number(frame[1])));
      } else if (kind === 'data') {
        expect(readStatusMessagesPayload(bytes, schemaVersion)).toEqual(SYNTHETIC_STATUS_MESSAGES_PAYLOAD);
        expect(dependencies).toEqual([]);
      } else {
        expect(readPalettePayload(bytes, schemaVersion).entries).toHaveLength(256 * 3);
        expect(dependencies).toEqual([]);
      }
    }
    // The map frame group's palette differs from the flight palette it is converted alongside.
    expect(payload('palette/map/screen').bytes).not.toEqual(payload('palette/flight/cockpit-hud-map').bytes);
  });
});

/**
 * The production texture table's TEX entries as recorded by the P2-06/04 local check, with row 16 appended for the
 * debris model by the P2-06/11 research.
 */
const TEXTURES: readonly number[] = [
  10_613, 10_615, 10_617, 10_619, 11_073, 11_067, 10_003, 10_001, 10_147, 10_321, 10_747, 10_749, 10_681, 11_009, 10_149, 10_151,
];
/** The effect images the P2-06/11 research recorded: role and TEX entry. */
const EFFECTS: readonly (readonly [string, number])[] = [['missile', 10_377]];
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
const nearestEvidence = 'docs/original/formats/textures.md#nearest-colour-metric-and-tie-rule-confirmed';
const effectEvidence = 'docs/original/formats/executable.md#effect-presentation-sources';

/** Where the P2-07 declarations start: after the five P2-05 Assets and each texture's and effect image's palette and image. */
const COCKPIT_HUD_MAP_START = 5 + 2 * (TEXTURES.length + EFFECTS.length);

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
const snipStructure = 'docs/original/formats/hud.md#snip-10487-confirmed-structure-p2-1227';
const diagStructure = 'docs/original/formats/hud.md#diag-10489-confirmed-structure-p2-07-revision';

type MappingFields = { readonly confidence: string; readonly unknowns: string[]; readonly evidence: string[] };
const front: MappingFields = { confidence: 'likely', unknowns: ['U-029'], evidence: [cockpitR1, groupPalette] };
const mapFrame: MappingFields = { confidence: 'confirmed', unknowns: ['U-029'], evidence: [groupPalette] };
const hud = (...evidence: string[]): MappingFields => ({ confidence: 'confirmed', unknowns: ['U-030'], evidence: [...evidence].sort() });

/**
 * One expected P2-07 Asset: its declaration and its mapping projected as in the mapping test, in the spec's terms;
 * `region` is the executable region part of a SNIP frame or the DIAG messages.
 */
const expected = (
  declaration: Record<string, unknown> & { asset: { id: string; kind: string }; role: string }, locator: string, fields: MappingFields, region?: string,
) => ({
  declaration: { ...declaration, group: 'cockpit-hud-map' },
  mapping: { id: declaration.asset.id, locators: [[`MAIN/SR.NOB#${locator}`], ...(region ? [[`MAIN/SRANGERS.EXE#${region}`]] : [])], ...fields, resolution: 'declared' },
});
const imageRows = (ids: string[], role: string, palette: string, alpha: unknown, locator: (index: number) => string, fields: MappingFields, region?: string) =>
  ids.map((id, index) => expected({ asset: { id, kind: 'image' }, role, palette, display: 'direct', alpha, rowOrder: 'stored' }, locator(index), fields, region));

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
  // 2026-10-08 revision: the colour table at 0x175ed8 and the lower line's format at 0x171e58, in LE object 4.
  ...imageRows(indexed('image/hud/display-interference/frame-', 9), 'hud-mfd', FLIGHT_PALETTE, 'encoding', index => `SNIP:10487/frames/${index}`, hud(snipStructure), 'le/4/0x5ed8/4'),
  expected({ asset: { id: 'data/hud/status-display/messages', kind: 'data' }, role: 'status-messages' }, 'DIAG:10489/', hud(diagStructure), 'le/4/0x1e58/6'),
];
