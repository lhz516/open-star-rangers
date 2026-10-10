import { describe, expect, it } from 'vitest';
import type { AssetDescriptor } from '../../content/asset-contract.ts';
import { addBudgets, BUDGET_DIMENSIONS, EMPTY_BUDGET_USAGE, type BudgetRecord } from '../../content/budget.ts';
import { compareText } from '../../content/contract-validation.ts';
import { readImagePayload } from '../../content/graphics/image-payload.ts';
import { palettePayloadLength, readPalettePayload } from '../../content/graphics/palette-payload.ts';
import { decodeViewLabelsPayload } from '../../content/hud/view-labels-payload.ts';
import type { PayloadRecord } from '../../content/payload.ts';
import { expectedFrame } from '../formats/anim.test-support.ts';
import { diagnoseSourceMappings, isRegionLocator, readSourceMappingTable } from '../source-mapping.ts';
import { verifySourceMappings } from '../source/verify-source-mappings.ts';
import { animEntry, countedVerifiedSource, imageDeclaration } from './conversion.test-support.ts';
import { readGraphicsDeclarations } from './graphics-declarations.ts';
import { runGraphicsStep } from './graphics-step.ts';
import {
  explosionFrameImageId, nebulaImageId, PRODUCTION_EXPLOSION_ANIMATIONS, PRODUCTION_FLIGHT_GRAPHICS_DECLARATIONS, PRODUCTION_FLIGHT_GRAPHICS_MAPPINGS,
  PRODUCTION_NEBULA_IMAGES,
} from './production-flight-graphics.ts';
import {
  FLIGHT_GRAPHICS_USAGE, FLIGHT_PALETTE_ENTRY, productionFlightGraphicsFiles, SYNTHETIC_HIT_SHIMMER, SYNTHETIC_TARGET_DISPLAY, SYNTHETIC_VIEW_LABEL,
  syntheticExplosionFrame, syntheticNebula,
} from './production-flight-graphics.test-support.ts';
import { PRODUCTION_GRAPHICS_DECLARATIONS, PRODUCTION_GRAPHICS_MAPPINGS } from './production-graphics.ts';

// The spec's Asset table (docs/plan/p3/03/spec.md, Asset 与角色) with the P3-03/05 representation the goal's execution
// record adopts, written here as an oracle independent of the production module.

/** EXIC 10211's three lists as {EXPL, ANIM} pairs in list and position order (textures §7). */
const EXIC_LISTS: readonly (readonly (readonly [number, number])[])[] = [
  [[10_223, 10_183], [10_227, 10_187], [10_231, 10_191], [10_235, 10_195], [10_239, 10_199], [10_243, 10_203], [10_247, 10_207]],
  [[10_225, 10_185], [10_229, 10_189], [10_233, 10_193], [10_237, 10_197], [10_241, 10_201], [10_245, 10_205], [10_249, 10_209]],
  [[11_389, 11_383], [11_391, 11_385], [11_393, 11_387]],
];
/** Frames per ANIM: 12 in the entries of lists 1 and 2, 6 in those of list 3 (textures §6, §7). */
const FRAME_COUNTS = [12, 12, 6];
const NEBC_LIST = [10_379, 10_381, 10_453, 10_653, 10_651, 10_655, 10_657, 10_659, 10_105, 11_077, 11_079, 11_081, 11_083, 11_373, 11_377];

const two = (index: number) => String(index + 1).padStart(2, '0');
const textures = 'docs/original/formats/textures.md';

/** Animations by their EXPL's first appearance in the lists; every EXPL, and so every ANIM, appears once. */
const ANIMATIONS = EXIC_LISTS.flatMap((list, index) => list.map(([, anim]) => ({ anim, frames: FRAME_COUNTS[index] })));

/** An image of its stored indices in stored row order, transparent only where its encoding says. */
const image = (id: string, role: string, group: string, palette: string, display: unknown = 'direct') => imageDeclaration(id, palette, { role, group, display });

interface ExpectedMapping { id: string; locator: string; confidence: string; unknowns: string[]; evidence: string[] }

const EXPECTED: readonly { declaration: unknown; mapping: ExpectedMapping }[] = [
  {
    declaration: image('image/hit-shimmer', 'hit-shimmer', 'models', 'palette/flight/models'),
    mapping: { id: 'image/hit-shimmer', locator: 'TEX:11069/', confidence: 'likely', unknowns: ['U-027'], evidence: [`${textures}#tex-11069-hit-shimmer-band-map-confirmed`] },
  },
  {
    declaration: { asset: { id: 'palette/hud/target-display/background', kind: 'palette' }, role: 'texture-palette', group: 'cockpit-hud-map' },
    mapping: {
      id: 'palette/hud/target-display/background', locator: 'TEX:11089/palette', confidence: 'likely', unknowns: ['U-030'],
      evidence: [`${textures}#tex-11089-right-display-background-confirmed-structure-display-likely`],
    },
  },
  {
    declaration: image(
      'image/hud/target-display/background', 'target-display', 'cockpit-hud-map', 'palette/hud/target-display/background', { nearest: 'palette/flight/cockpit-hud-map' },
    ),
    mapping: {
      id: 'image/hud/target-display/background', locator: 'TEX:11089/', confidence: 'likely', unknowns: ['U-030'],
      evidence: [`${textures}#nearest-colour-metric-and-tie-rule-confirmed`, `${textures}#tex-11089-right-display-background-confirmed-structure-display-likely`],
    },
  },
  ...NEBC_LIST.map((entry, index) => ({
    declaration: image(`image/nebula/${two(index)}`, 'nebula-background', 'models', 'palette/flight/models'),
    mapping: {
      id: `image/nebula/${two(index)}`, locator: `BITM:${entry}/`, confidence: 'likely', unknowns: ['U-018'],
      evidence: ['docs/original/formats/hud.md#3-id-lists-confirmed-structure', `${textures}#4-bitm-bitmaps-confirmed-structure`],
    },
  })),
  ...ANIMATIONS.flatMap(({ anim, frames }, animation) => Array.from({ length: frames }, (_, frame) => ({
    declaration: image(`image/explosion/${two(animation)}/${two(frame)}`, 'explosion-frame', 'models', 'palette/flight/models'),
    mapping: {
      id: `image/explosion/${two(animation)}/${two(frame)}`, locator: `ANIM:${anim}/frames/${frame}`, confidence: 'confirmed', unknowns: ['U-001'],
      evidence: [`${textures}#6-anim-explosion-animations-confirmed`, `${textures}#7-expl-explosion-records-confirmed`],
    },
  }))),
  {
    declaration: { asset: { id: 'data/hud/view-labels', kind: 'data' }, role: 'view-labels', group: 'cockpit-hud-map' },
    mapping: {
      id: 'data/hud/view-labels', locator: 'TABL:10399/labels/8', confidence: 'confirmed', unknowns: [],
      evidence: ['docs/original/formats/hud.md#tabl-10165-selectors-and-tabl-10399-labels-p3-0304'],
    },
  },
];

/** The production flight palettes the flight graphics bind, with their mappings, from the production graphics tables. */
const FLIGHT_PALETTE_IDS = new Set(['palette/flight/models', 'palette/flight/cockpit-hud-map']);
const withFlightPalettes = () => ({
  mappings: {
    sourceFingerprint: null,
    mappings: [...PRODUCTION_FLIGHT_GRAPHICS_MAPPINGS.mappings, ...PRODUCTION_GRAPHICS_MAPPINGS.mappings.filter(({ asset }) => FLIGHT_PALETTE_IDS.has(asset.id))]
      .sort((left, right) => compareText(left.asset.id, right.asset.id)),
  },
  declarations: [...PRODUCTION_GRAPHICS_DECLARATIONS.filter(({ asset }) => FLIGHT_PALETTE_IDS.has(asset.id)), ...PRODUCTION_FLIGHT_GRAPHICS_DECLARATIONS],
});

/** The usage of the flight graphics and the two 256-entry flight palettes they are converted with. */
const STEP_USAGE: BudgetRecord = addBudgets(FLIGHT_GRAPHICS_USAGE, {
  ...EMPTY_BUDGET_USAGE, assets: 2, paletteEntries: 2 * 256, payloadBytes: 2 * palettePayloadLength(256),
}, 'usage');

const CHARGED = ['assets', 'dependencyEdges', 'paletteEntries', 'imagePixels', 'payloadBytes'] as const;

describe('production flight graphics', () => {
  it('declares the spec Asset table with the researched representation and no frame or hit-shimmer palette', () => {
    expect(PRODUCTION_FLIGHT_GRAPHICS_DECLARATIONS).toEqual(EXPECTED.map(({ declaration }) => declaration));
    expect(PRODUCTION_FLIGHT_GRAPHICS_DECLARATIONS).toHaveLength(1 + 2 + 15 + 186 + 1);
    expect(Object.isFrozen(PRODUCTION_FLIGHT_GRAPHICS_DECLARATIONS)).toBe(true);
    const ids = PRODUCTION_FLIGHT_GRAPHICS_DECLARATIONS.map(({ asset }) => asset.id);
    expect(ids.filter(id => /^palette\/(hit-shimmer|explosion)/.test(id))).toEqual([]);
  });

  it('numbers animations by their first appearance in the EXIC lists and frames by frame order', () => {
    expect(PRODUCTION_EXPLOSION_ANIMATIONS).toEqual(ANIMATIONS.map(({ anim, frames }) => ({ entry: anim, frames })));
    expect(PRODUCTION_EXPLOSION_ANIMATIONS.reduce((total, { frames }) => total + frames, 0)).toBe(186);
    expect([explosionFrameImageId(0, 0), explosionFrameImageId(13, 11), explosionFrameImageId(16, 5)]).toEqual(['image/explosion/01/01', 'image/explosion/14/12', 'image/explosion/17/06']);
    expect(PRODUCTION_NEBULA_IMAGES).toEqual(NEBC_LIST);
    expect([nebulaImageId(0), nebulaImageId(14)]).toEqual(['image/nebula/01', 'image/nebula/15']);
  });

  it('maps each Asset to its entry and subresource with the confidence, unknowns and evidence of the Asset table', () => {
    const { mappings } = PRODUCTION_FLIGHT_GRAPHICS_MAPPINGS;
    expect(PRODUCTION_FLIGHT_GRAPHICS_MAPPINGS.sourceFingerprint).toBeNull();
    const projected = mappings.map(({ asset, parts, confidence, unknowns, evidence, resolution }) => ({
      id: asset.id,
      locators: parts.map(({ alternatives }) => alternatives.map(locator => (isRegionLocator(locator) ? 'region' : `${locator.discPath}#${locator.entry.type}:${locator.entry.id}/${locator.subresource ?? ''}`))),
      confidence, unknowns, evidence, resolution,
    }));
    expect(projected).toEqual(EXPECTED.map(({ mapping: { id, locator, confidence, unknowns, evidence } }) => ({
      id, locators: [[`MAIN/SR.NOB#${locator}`]], confidence, unknowns, evidence: [...evidence].sort(), resolution: 'declared',
    })).sort((left, right) => compareText(left.id, right.id)));
    expect(mappings.map(({ asset }) => asset.id)).toEqual(PRODUCTION_FLIGHT_GRAPHICS_DECLARATIONS.map(({ asset }) => asset.id).sort(compareText));
    const diagnostics = diagnoseSourceMappings(PRODUCTION_FLIGHT_GRAPHICS_MAPPINGS, mappings.map(({ asset }) => asset));
    expect(diagnostics.map(({ code }) => code)).toEqual(new Array(mappings.length).fill('source-unverified'));
  });

  it('is part of the production graphics tables, without a repeated Asset or an unbound palette', () => {
    const flight = new Set(PRODUCTION_FLIGHT_GRAPHICS_MAPPINGS.mappings.map(({ asset }) => asset.id));
    expect(PRODUCTION_GRAPHICS_DECLARATIONS.filter(({ asset }) => flight.has(asset.id))).toEqual(PRODUCTION_FLIGHT_GRAPHICS_DECLARATIONS);
    expect(PRODUCTION_GRAPHICS_MAPPINGS.mappings.filter(({ asset }) => flight.has(asset.id))).toEqual(PRODUCTION_FLIGHT_GRAPHICS_MAPPINGS.mappings);
    // The merged tables read as one: unique IDs, every bound palette declared, one mapping per declaration.
    const declarations = readGraphicsDeclarations(PRODUCTION_GRAPHICS_DECLARATIONS);
    const table = readSourceMappingTable(PRODUCTION_GRAPHICS_MAPPINGS);
    expect(table.mappings.map(({ asset }) => asset.id)).toEqual(declarations.map(({ asset }) => asset.id).sort(compareText));
  });

  it('converts every flight graphic on a disc in the production structure, reading each entry once', async () => {
    const { source, reads } = await countedVerifiedSource(productionFlightGraphicsFiles());
    const { mappings, declarations } = withFlightPalettes();
    const result = await runGraphicsStep(source, mappings, declarations, STEP_USAGE);
    expect(Object.fromEntries(reads)).toEqual(Object.fromEntries([
      FLIGHT_PALETTE_ENTRY, 11_069, 11_089, 10_399, ...NEBC_LIST, ...ANIMATIONS.map(({ anim }) => anim),
    ].map(entry => [entry, 1])));
    expect(result.usage).toEqual(STEP_USAGE);
    const unknownsOf = new Map(EXPECTED.map(({ mapping }) => [mapping.id, mapping.unknowns.join()]));
    const [models, hud] = result.groups;
    expect([models.group, hud.group]).toEqual(['models', 'cockpit-hud-map']);
    expect(hud.descriptors.map(({ id }) => id)).toEqual(['data/hud/view-labels', 'image/hud/target-display/background', 'palette/flight/cockpit-hud-map', 'palette/hud/target-display/background']);
    expect(result.groups.flatMap(({ sources }) => sources.map(({ id, state, unknowns }) => [id, state, unknowns.join()])))
      .toEqual(result.groups.flatMap(({ descriptors }) => descriptors.map(({ id }) => [id, 'verified', unknownsOf.get(id) ?? ''])));

    const payloads = new Map<string, PayloadRecord>(result.groups.flatMap(({ payloads: items }) => items.map(payload => [payload.id, payload])));
    const descriptors = new Map<string, AssetDescriptor>(result.groups.flatMap(({ descriptors: items }) => items.map(descriptor => [descriptor.id, descriptor])));
    const imageOf = (id: string) => {
      const { bytes, schemaVersion } = payloads.get(id)!;
      const image = readImagePayload(bytes, schemaVersion);
      return { ...image, indices: [...image.indices], mask: image.mask && [...image.mask] };
    };
    const modelsBinding = [{ id: 'palette/flight/models', kind: 'palette' }];
    ANIMATIONS.forEach(({ frames }, animation) => {
      for (let frame = 0; frame < frames; frame++) {
        const id = explosionFrameImageId(animation, frame);
        expect(imageOf(id)).toEqual({ kind: 'image', palette: 'palette/flight/models', display: 'direct', ...expectedFrame(syntheticExplosionFrame(animation, frame)) });
        expect(descriptors.get(id)).toMatchObject({ role: 'explosion-frame', group: 'models', dependencies: modelsBinding });
      }
    });
    NEBC_LIST.forEach((_, index) => {
      const { width, height, indices } = syntheticNebula(index);
      expect(imageOf(nebulaImageId(index))).toEqual({ kind: 'image', width, height, palette: 'palette/flight/models', display: 'direct', indices, mask: null });
      expect(descriptors.get(nebulaImageId(index))).toMatchObject({ role: 'nebula-background', group: 'models', dependencies: modelsBinding });
    });
    // The thresholds are kept value for value, not mapped to colours.
    expect(imageOf('image/hit-shimmer')).toEqual({ kind: 'image', ...SYNTHETIC_HIT_SHIMMER, palette: 'palette/flight/models', display: 'direct', mask: null });
    expect(descriptors.get('image/hit-shimmer')).toMatchObject({ role: 'hit-shimmer', group: 'models', dependencies: modelsBinding });

    const { width, height, indices, bgr } = SYNTHETIC_TARGET_DISPLAY;
    expect(imageOf('image/hud/target-display/background')).toEqual({
      kind: 'image', width, height, indices, mask: null, palette: 'palette/hud/target-display/background', display: { nearest: 'palette/flight/cockpit-hud-map' },
    });
    expect(descriptors.get('image/hud/target-display/background')).toMatchObject({
      role: 'target-display', dependencies: [{ id: 'palette/flight/cockpit-hud-map', kind: 'palette' }, { id: 'palette/hud/target-display/background', kind: 'palette' }],
    });
    const palette = payloads.get('palette/hud/target-display/background')!;
    // Each stored B, G, R triple reversed.
    const rgb = Array.from({ length: bgr.length }, (_, component) => bgr[3 * Math.floor(component / 3) + 2 - (component % 3)]);
    expect([...readPalettePayload(palette.bytes, palette.schemaVersion).entries]).toEqual(rgb);
    expect(descriptors.get('palette/hud/target-display/background')).toMatchObject({ role: 'texture-palette', dependencies: [] });

    expect(decodeViewLabelsPayload(payloads.get('data/hud/view-labels')!.bytes, descriptors.get('data/hud/view-labels')!))
      .toEqual({ labels: [{ subMode: 8, text: SYNTHETIC_VIEW_LABEL }] });
  });

  it('passes a budget equal to its usage on top of earlier steps and rejects one more in each charged dimension', async () => {
    const { source } = await countedVerifiedSource(productionFlightGraphicsFiles());
    const { mappings, declarations } = withFlightPalettes();
    const earlier: BudgetRecord = { ...EMPTY_BUDGET_USAGE, assets: 7, dependencyEdges: 5, paletteEntries: 300, imagePixels: 1_000, glyphs: 9, payloadBytes: 4_096 };
    const exact = addBudgets(earlier, STEP_USAGE, 'limits');
    expect((await runGraphicsStep(source, mappings, declarations, exact, earlier)).usage).toEqual(exact);
    expect(BUDGET_DIMENSIONS.filter(dimension => !(CHARGED as readonly string[]).includes(dimension)).every(dimension => STEP_USAGE[dimension] === 0)).toBe(true);
    for (const dimension of CHARGED) {
      await expect(runGraphicsStep(source, mappings, declarations, { ...exact, [dimension]: exact[dimension] - 1 }, earlier)).rejects.toMatchObject({
        name: 'SourceError', code: 'budget-exceeded', limit: { name: dimension, limit: exact[dimension] - 1, observed: exact[dimension] },
      });
    }
  });

  it('leaves frame, palette and label subresources declared until conversion and fails the step on a missing frame', async () => {
    const { source } = await countedVerifiedSource(productionFlightGraphicsFiles());
    const { mappings, declarations } = withFlightPalettes();
    const verified = await verifySourceMappings(mappings, source);
    for (const { parts, resolution } of verified.mappings) {
      expect(resolution).toBe(parts[0].alternatives[0].subresource === null ? 'verified' : 'declared');
    }
    const [{ entry, frames }] = PRODUCTION_EXPLOSION_ANIMATIONS;
    const short = await countedVerifiedSource(productionFlightGraphicsFiles({
      [entry]: animEntry(entry, Array.from({ length: frames - 1 }, (_, frame) => syntheticExplosionFrame(0, frame))),
    }));
    await expect(runGraphicsStep(short.source, mappings, declarations, STEP_USAGE))
      .rejects.toMatchObject({ name: 'SourceError', code: 'subresource-not-found', location: `archive:/MAIN/SR.NOB#${entry}/frames` });
  });
});
