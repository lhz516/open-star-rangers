import { describe, expect, it } from 'vitest';
import { addBudgets, BUDGET_DIMENSIONS, EMPTY_BUDGET_USAGE, readBudgetRecord, type BudgetRecord } from '../../content/budget.ts';
import { compareText } from '../../content/contract-validation.ts';
import { encodeEffectPayload } from '../../content/effects/effect-payload.ts';
import { decodeFlightDataPayload } from '../../content/flight/flight-data-payload.ts';
import type { SceneSettings } from '../../content/flight/flight-data-content.ts';
import { diagnoseSourceMappings, isRegionLocator, readSourceMappingTable } from '../source-mapping.ts';
import { verifySourceMappings } from '../source/verify-source-mappings.ts';
import { buildImfat } from '../synthetic.test-support.ts';
import { countedVerifiedSource, UNLIMITED_BUDGET } from './conversion.test-support.ts';
import { runEffectStep } from './effect-step.ts';
import {
  flightDataFailure, PRODUCTION_FLIGHT_DATA_USAGE, PRODUCTION_FLIGHT_PAYLOADS, PRODUCTION_SCENE, productionFlightDataEntries, productionFlightDataFiles,
  productionRensEntry,
} from './flight-data.test-support.ts';
import { runFlightDataStep } from './flight-data-step.ts';
import { PRODUCTION_EFFECT_DECLARATIONS, PRODUCTION_EFFECT_MAPPINGS } from './production-effects.ts';
import { syntheticEffectExecutable, syntheticProjectileSource } from './production-effects.test-support.ts';
import {
  explosionAnimationId, PRODUCTION_EXPLOSION_RECORDS, PRODUCTION_FLIGHT_DATA_DECLARATIONS, PRODUCTION_FLIGHT_DATA_MAPPINGS, PRODUCTION_FLIGHT_DATA_SHARE,
} from './production-flight-data.ts';
import { PRODUCTION_FLIGHT_GRAPHICS_MAPPINGS } from './production-flight-graphics.ts';
import { PRODUCTION_SOUND_TABLE } from './production-sounds.ts';

// The spec's Asset table (docs/plan/p3/03/spec.md, Asset 与角色) and textures §6–§7, written here as an oracle
// independent of the production module.

/** EXIC 10211's three lists as {EXPL, ANIM, frames} in list and position order (textures §6, §7). */
const EXIC_LISTS: readonly (readonly (readonly [number, number])[])[] = [
  [[10_223, 10_183], [10_227, 10_187], [10_231, 10_191], [10_235, 10_195], [10_239, 10_199], [10_243, 10_203], [10_247, 10_207]],
  [[10_225, 10_185], [10_229, 10_189], [10_233, 10_193], [10_237, 10_197], [10_241, 10_201], [10_245, 10_205], [10_249, 10_209]],
  [[11_389, 11_383], [11_391, 11_385], [11_393, 11_387]],
];
const FRAME_COUNTS = [12, 12, 6];
const ANIMATIONS = EXIC_LISTS.flatMap((list, index) => list.map(([expl, anim]) => ({ expl, anim, frames: FRAME_COUNTS[index] })));
const NEBC_LIST = [10_379, 10_381, 10_453, 10_653, 10_651, 10_655, 10_657, 10_659, 10_105, 11_077, 11_079, 11_081, 11_083, 11_373, 11_377];

const two = (index: number) => String(index + 1).padStart(2, '0');
const executable = 'docs/original/formats/executable.md';
const hud = 'docs/original/formats/hud.md#3-id-lists-confirmed-structure';
const textures = 'docs/original/formats/textures.md';
const BLASTS = [1, 2, 3, 4].map(variant => `sound/explosion/blast-v${variant}`);

interface ExpectedMapping { id: string; locators: string[]; confidence: string; unknowns: string[]; evidence: string[] }

const EXPECTED_MAPPINGS: readonly ExpectedMapping[] = [
  {
    id: 'data/scene-settings', locators: ['RENS:10751/header'], confidence: 'likely', unknowns: ['U-027', 'U-028'],
    evidence: [`${executable}#flight-message-strings-and-the-rens-header-p3-0304`, `${executable}#data-loaded-by-the-loop-p3-0110`],
  },
  {
    id: 'data/explosions', locators: ['EXIC:10211/', ...ANIMATIONS.map(({ expl }) => expl).sort((left, right) => left - right).map(expl => `EXPL:${expl}/`)],
    confidence: 'confirmed', unknowns: [], evidence: [hud, `${textures}#7-expl-explosion-records-confirmed`],
  },
  ...ANIMATIONS.map(({ anim }, index) => ({
    id: `data/explosion-animation/${two(index)}`, locators: [`ANIM:${anim}/`], confidence: 'confirmed', unknowns: ['U-001'],
    evidence: [`${textures}#6-anim-explosion-animations-confirmed`, `${textures}#7-expl-explosion-records-confirmed`],
  })),
  { id: 'data/nebula-backgrounds', locators: ['NEBC:10661/'], confidence: 'confirmed', unknowns: [], evidence: [hud, `${executable}#data-loaded-by-the-loop-p3-0110`] },
];

const frameIds = (animation: number, frames: number) => Array.from({ length: frames }, (_, frame) => `image/explosion/${two(animation)}/${two(frame)}`);

const CHARGED = ['assets', 'dependencyEdges', 'payloadBytes'] as const;

describe('production flight data', () => {
  it('maps each Asset to its entries with the confidence, unknowns and evidence of the Asset table', () => {
    const { mappings, sourceFingerprint } = PRODUCTION_FLIGHT_DATA_MAPPINGS;
    expect(sourceFingerprint).toBeNull();
    const projected = mappings.map(({ asset, parts, confidence, unknowns, evidence, resolution }) => ({
      id: asset.id,
      locators: parts.map(({ alternatives }) => alternatives.map(locator => (isRegionLocator(locator) ? 'region' : `${locator.discPath}#${locator.entry.type}:${locator.entry.id}/${locator.subresource ?? ''}`))),
      confidence, unknowns, evidence, resolution,
    }));
    expect(projected).toEqual(EXPECTED_MAPPINGS.map(({ id, locators, confidence, unknowns, evidence }) => ({
      id, locators: locators.map(locator => [`MAIN/SR.NOB#${locator}`]), confidence, unknowns, evidence: [...evidence].sort(), resolution: 'declared',
    })).sort((left, right) => compareText(left.id, right.id)));
    expect(PRODUCTION_EXPLOSION_RECORDS).toEqual(ANIMATIONS.map(({ expl }) => expl));
    // Every source admits its kind: the only diagnostics are the unverified research states.
    expect(diagnoseSourceMappings(PRODUCTION_FLIGHT_DATA_MAPPINGS, mappings.map(({ asset }) => asset)).map(({ code }) => code))
      .toEqual(new Array(mappings.length).fill('source-unverified'));
  });

  it('declares the four roles with the frames, images and blast sounds of the other production tables', () => {
    const { assets, references } = PRODUCTION_FLIGHT_DATA_DECLARATIONS;
    expect(Object.isFrozen(assets)).toBe(true);
    expect(assets.map(({ asset }) => asset.id).sort(compareText)).toEqual(PRODUCTION_FLIGHT_DATA_MAPPINGS.mappings.map(({ asset }) => asset.id));
    expect(assets).toEqual(expect.arrayContaining([
      { asset: { id: 'data/scene-settings', kind: 'data' }, role: 'scene-settings', group: 'models' },
      {
        asset: { id: 'data/explosions', kind: 'data' }, role: 'explosion-table', group: 'models',
        animations: ANIMATIONS.map((_, index) => `data/explosion-animation/${two(index)}`), sounds: BLASTS,
      },
      ...ANIMATIONS.map(({ frames }, index) => ({
        asset: { id: `data/explosion-animation/${two(index)}`, kind: 'data' }, role: 'explosion-animation', group: 'models', frames: frameIds(index, frames),
      })),
      { asset: { id: 'data/nebula-backgrounds', kind: 'data' }, role: 'nebula-backgrounds', group: 'models', images: NEBC_LIST.map((_, index) => `image/nebula/${two(index)}`) },
    ]));
    expect(assets).toHaveLength(20);
    // The references are exactly P3-03/16's mappings of these frames and images and the audio table's blast sounds.
    const graphics = new Map<string, unknown>(PRODUCTION_FLIGHT_GRAPHICS_MAPPINGS.mappings.map(mapping => [mapping.asset.id, mapping]));
    const sounds = new Map<string, unknown>(PRODUCTION_SOUND_TABLE.map(({ mapping }) => [mapping.asset.id, mapping]));
    const named = [...ANIMATIONS.flatMap(({ frames }, index) => frameIds(index, frames)), ...NEBC_LIST.map((_, index) => `image/nebula/${two(index)}`)];
    expect(references.mappings.map(({ asset }) => asset.id)).toEqual([...named, ...BLASTS].sort(compareText));
    expect(references.mappings).toEqual(references.mappings.map(({ asset }) => graphics.get(asset.id) ?? sounds.get(asset.id)));
    expect(explosionAnimationId(16)).toBe('data/explosion-animation/17');
  });

  it('joins the models group of the graphics and effect tables without a repeated Asset', () => {
    const table = readSourceMappingTable({
      sourceFingerprint: null,
      mappings: [...PRODUCTION_EFFECT_MAPPINGS.mappings, ...PRODUCTION_FLIGHT_GRAPHICS_MAPPINGS.mappings, ...PRODUCTION_FLIGHT_DATA_MAPPINGS.mappings]
        .sort((left, right) => compareText(left.asset.id, right.asset.id)),
    });
    expect(table.mappings).toHaveLength(PRODUCTION_EFFECT_MAPPINGS.mappings.length + PRODUCTION_FLIGHT_GRAPHICS_MAPPINGS.mappings.length + 20);
  });

  it('converts every flight data Asset on a disc in the production structure, reading each of its entries once', async () => {
    const { source, reads } = await countedVerifiedSource(productionFlightDataFiles());
    const result = await runFlightDataStep(source, PRODUCTION_FLIGHT_DATA_MAPPINGS, PRODUCTION_FLIGHT_DATA_DECLARATIONS, PRODUCTION_FLIGHT_DATA_USAGE);
    // The frames, images and sounds belong to other steps: no BITM, TEX, TABL or SND entry is read.
    expect(Object.fromEntries(reads)).toEqual(Object.fromEntries([10_751, 10_211, 10_661, ...ANIMATIONS.flatMap(({ expl, anim }) => [expl, anim])].map(entry => [entry, 1])));
    expect(result.usage).toEqual(PRODUCTION_FLIGHT_DATA_USAGE);
    const [group] = result.groups;
    const unknownsOf = new Map(EXPECTED_MAPPINGS.map(({ id, unknowns }) => [id, unknowns]));
    expect(group.sources).toEqual(group.descriptors.map(({ id }) => ({ id, state: 'verified', unknowns: unknownsOf.get(id) })));
    group.descriptors.forEach((descriptor, index) => {
      expect(decodeFlightDataPayload(group.payloads[index].bytes, descriptor)).toEqual(PRODUCTION_FLIGHT_PAYLOADS.get(descriptor.id));
    });
    const explosions = group.descriptors.find(({ id }) => id === 'data/explosions')!;
    expect(explosions.dependencies).toEqual([
      ...ANIMATIONS.map((_, index) => ({ id: `data/explosion-animation/${two(index)}`, kind: 'data' })), ...BLASTS.map(id => ({ id, kind: 'sound' })),
    ]);
    const nebula = group.descriptors.find(({ id }) => id === 'data/nebula-backgrounds')!;
    expect(nebula.dependencies.map(({ id }) => id)).toEqual(NEBC_LIST.map((_, index) => `image/nebula/${two(index)}`));
  });

  it('passes a budget equal to its usage on top of earlier steps and rejects one less in each charged dimension', async () => {
    const { source } = await countedVerifiedSource(productionFlightDataFiles());
    const earlier: BudgetRecord = { ...EMPTY_BUDGET_USAGE, assets: 230, dependencyEdges: 400, imagePixels: 9_000, payloadBytes: 70_000 };
    const exact = addBudgets(earlier, PRODUCTION_FLIGHT_DATA_USAGE, 'limits');
    const run = (limits: BudgetRecord) => runFlightDataStep(source, PRODUCTION_FLIGHT_DATA_MAPPINGS, PRODUCTION_FLIGHT_DATA_DECLARATIONS, limits, earlier);
    expect((await run(exact)).usage).toEqual(exact);
    expect(BUDGET_DIMENSIONS.filter(dimension => PRODUCTION_FLIGHT_DATA_USAGE[dimension] !== 0)).toEqual([...CHARGED]);
    // 20 Assets; 21 table edges, 186 frame edges and 15 image edges.
    expect([PRODUCTION_FLIGHT_DATA_USAGE.assets, PRODUCTION_FLIGHT_DATA_USAGE.dependencyEdges]).toEqual([20, 222]);
    for (const dimension of CHARGED) {
      expect((await flightDataFailure(() => run({ ...exact, [dimension]: exact[dimension] - 1 }))).limit)
        .toEqual({ name: dimension, limit: exact[dimension] - 1, observed: exact[dimension] });
    }
  });

  it('leaves the RENS header declared until conversion and an EXPL chain mismatch fails the step', async () => {
    const { source } = await countedVerifiedSource(productionFlightDataFiles());
    const verified = await verifySourceMappings(PRODUCTION_FLIGHT_DATA_MAPPINGS, source);
    expect(verified.mappings.filter(({ resolution }) => resolution === 'declared').map(({ asset }) => asset.id)).toEqual(['data/scene-settings']);
    // EXPL 10225 names the ANIM of animation 07 instead of its own (animation 08).
    const [entry] = productionFlightDataEntries().filter(({ id }) => id === 10_225);
    const data = entry.data.slice();
    new DataView(data.buffer).setUint32(4, ANIMATIONS[6].anim, true);
    const swapped = await countedVerifiedSource(productionFlightDataFiles({ 10_225: { ...entry, data } }));
    expect(await flightDataFailure(() => runFlightDataStep(swapped.source, PRODUCTION_FLIGHT_DATA_MAPPINGS, PRODUCTION_FLIGHT_DATA_DECLARATIONS, UNLIMITED_BUDGET)))
      .toEqual({ code: 'subresource-mismatch', location: 'archive:/MAIN/SR.NOB#10225/animation', limit: null });
  });

  it('keeps data/projectile-visuals records-only: the header changes only the scene settings', async () => {
    const other: SceneSettings = { ...PRODUCTION_SCENE, lightType3Colour: [Math.fround(0.125), 4, -8], deviceValues: { base: 1, kinds1c7c: 2, kindsF8000: Math.fround(0.1) } };
    const convert = async (settings: SceneSettings) => {
      const entries = productionFlightDataEntries().map(entry => (entry.id === 10_751 ? productionRensEntry(settings) : entry));
      const { source } = await countedVerifiedSource({ 'MAIN/SR.NOB': buildImfat(10_000, entries), 'MAIN/SRANGERS.EXE': syntheticEffectExecutable() });
      const effects = await runEffectStep(source, PRODUCTION_EFFECT_MAPPINGS, PRODUCTION_EFFECT_DECLARATIONS, UNLIMITED_BUDGET);
      const flight = await runFlightDataStep(source, PRODUCTION_FLIGHT_DATA_MAPPINGS, PRODUCTION_FLIGHT_DATA_DECLARATIONS, UNLIMITED_BUDGET);
      const projectile = effects.groups[0].payloads.find(({ id }) => id === 'data/projectile-visuals')!;
      const index = flight.groups[0].descriptors.findIndex(({ id }) => id === 'data/scene-settings');
      expect(flight.groups[0].descriptors.map(({ id }) => id)).not.toContain('data/projectile-visuals');
      return { projectile: projectile.bytes, scene: decodeFlightDataPayload(flight.groups[0].payloads[index].bytes, flight.groups[0].descriptors[index]) };
    };
    const first = await convert(PRODUCTION_SCENE);
    const second = await convert(other);
    expect(first.projectile).toEqual(encodeEffectPayload(syntheticProjectileSource()));
    expect(second.projectile).toEqual(first.projectile);
    expect(first.scene).toEqual({ role: 'scene-settings', content: PRODUCTION_SCENE });
    expect(second.scene).toEqual({ role: 'scene-settings', content: other });
  });

  it('has a complete share record for P3-03/19 to fill', () => {
    expect(readBudgetRecord(PRODUCTION_FLIGHT_DATA_SHARE, 'share')).toEqual(PRODUCTION_FLIGHT_DATA_SHARE);
  });
});
