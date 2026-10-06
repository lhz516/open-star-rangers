import { describe, expect, it } from 'vitest';
import { EMPTY_BUDGET_USAGE } from '../../content/budget.ts';
import { fontPayloadLength } from '../../content/graphics/font-payload.ts';
import { GRAPHICS_LIMITS } from '../../content/graphics/graphics-format.ts';
import { palettePayloadLength } from '../../content/graphics/palette-payload.ts';
import { diagnoseSourceMappings } from '../source-mapping.ts';
import { countedVerifiedSource } from './conversion.test-support.ts';
import { runGraphicsStep } from './graphics-step.ts';
import { PRODUCTION_GRAPHICS_DECLARATIONS, PRODUCTION_GRAPHICS_MAPPINGS, PRODUCTION_GRAPHICS_SHARE } from './production-graphics.ts';
import { productionGraphicsFiles } from './production-graphics.test-support.ts';

describe('production graphics', () => {
  it('declares the five spec Assets with their roles, groups and expected font cells', () => {
    expect(PRODUCTION_GRAPHICS_DECLARATIONS.map(({ asset, role, group, ...rest }) => ({ id: asset.id, kind: asset.kind, role, group, ...rest }))).toEqual([
      { id: 'palette/flight/models', kind: 'palette', role: 'flight-palette', group: 'models' },
      { id: 'palette/flight/cockpit-hud-map', kind: 'palette', role: 'flight-palette', group: 'cockpit-hud-map' },
      { id: 'font/hud/8x8-1', kind: 'font', role: 'font', group: 'cockpit-hud-map', cell: { width: 8, height: 8 }, charMap: [] },
      { id: 'font/hud/8x8-2', kind: 'font', role: 'font', group: 'cockpit-hud-map', cell: { width: 8, height: 8 }, charMap: [] },
      { id: 'font/hud/4x6', kind: 'font', role: 'font', group: 'cockpit-hud-map', cell: { width: 4, height: 6 }, charMap: [] },
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
      { id: 'font/hud/4x6', locators: [['MAIN/SR.NOB#CCKD:10103/fonts/2']], confidence: 'likely', unknowns: ['U-029', 'U-030'], evidence: [cockpitEvidence, hudEvidence], resolution: 'declared' },
      { id: 'font/hud/8x8-1', locators: [['MAIN/SR.NOB#CCKD:10103/fonts/0']], confidence: 'likely', unknowns: ['U-029'], evidence: [cockpitEvidence, hudEvidence], resolution: 'declared' },
      { id: 'font/hud/8x8-2', locators: [['MAIN/SR.NOB#CCKD:10103/fonts/1']], confidence: 'likely', unknowns: ['U-029'], evidence: [cockpitEvidence, hudEvidence], resolution: 'declared' },
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
      + 3 * fontPayloadLength(GRAPHICS_LIMITS.fontHeight, GRAPHICS_LIMITS.charMapEntries);
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
      'font/hud/4x6:verified:U-029,U-030', 'font/hud/8x8-1:verified:U-029', 'font/hud/8x8-2:verified:U-029', 'palette/flight/cockpit-hud-map:verified:',
    ]);
    const payloadBytes = result.groups.flatMap(({ payloads }) => payloads).reduce((total, { bytes }) => total + bytes.length, 0);
    expect(result.usage).toMatchObject({ assets: 5, dependencyEdges: 0, paletteEntries: 512, glyphs: 768, imagePixels: 0, payloadBytes, sourceReadBytes: 0 });
    expect(Object.fromEntries(reads)).toEqual({ 10103: 1, 11075: 1 });
  });
});

const cockpitEvidence = 'docs/original/formats/cockpit.md#1-cckd-cockpit-layouts';
const hudEvidence = 'docs/original/formats/hud.md#1-bitmap-fonts-confirmed';
const paletteEvidence = 'docs/original/formats/textures.md#1-data-global-palette-confirmed';
