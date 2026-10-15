import { RESOURCE_GROUPS, type ResourceGroup } from '../content/asset-contract.ts';
import type { GroupInput } from '../content/completeness.ts';
import { compareText } from '../content/contract-validation.ts';
import { readConverterVersion } from '../content/content-identity.ts';
import { syntheticIdentity, syntheticSourceGroup } from '../content/synthetic-content.test-support.ts';
import { PRODUCTION_CONVERTER_VERSION } from '../original-data/conversion/converter-version.ts';
import { openDiscImage } from '../original-data/disc/disc-image.ts';
import { MARKER, syntheticFileDisc, type SyntheticFileContent, type SyntheticFileDisc } from '../original-data/disc/disc.test-support.ts';
import { identifySource, type VerifiedSource } from '../original-data/source/identify-source.ts';
import { PRODUCTION_CATALOG, sourceFingerprint } from '../original-data/source/source-catalog.ts';
import { catalogFor } from '../original-data/source/source.test-support.ts';
import { addBudgets, EMPTY_BUDGET_USAGE, type BudgetRecord } from '../content/budget.ts';
import { fontPayloadLength } from '../content/graphics/font-payload.ts';
import { palettePayloadLength } from '../content/graphics/palette-payload.ts';
import { SOUND_PAYLOAD_HEADER_BYTES } from '../content/sound-payload.ts';
import {
  cockpitLayoutBlock, fontDeclaration, fontTable, GRAPHICS_ARCHIVE, GRAPHICS_ENTRIES, graphicsArchive, graphicsMapping, imageDeclaration, instrumentRecord,
  layoutDeclaration, mfdBlock, paletteDeclaration, rawImageBlock, spriteImageBlock, tableBlock, viewLabelTable,
} from '../original-data/conversion/conversion.test-support.ts';
import { FLIGHT_GRAPHICS_USAGE } from '../original-data/conversion/production-flight-graphics.test-support.ts';
import { HUD_TEXT_USAGE, syntheticHudTextSource } from '../original-data/conversion/production-hud-text.test-support.ts';
import {
  COCKPIT_HUD_MAP_USAGE, MAP_GEOMETRY_USAGE, MODEL_TEXTURE_USAGE, PRODUCTION_GRAPHICS_REGION_WRITES, productionCockpitBlock, productionGraphicsFiles, regionExecutable,
} from '../original-data/conversion/production-graphics.test-support.ts';
import { productionRuleData, productionRuleDataContents } from '../original-data/conversion/production-rule-data.test-support.ts';
import type { RuleDataContents } from '../original-data/conversion/rule-data.test-support.ts';
import { PRODUCTION_SOUND_USAGE, productionSoundEntries } from '../original-data/conversion/production-sounds.test-support.ts';
import { productionEffectRegionWrites } from '../original-data/conversion/production-effects.test-support.ts';
import { productionSliceEntries } from '../original-data/conversion/production-models.test-support.ts';
import {
  defaultCampaignSpec, defaultScenarioSpec, fiveWingmanCampaignSpec, syntheticCampaign, syntheticScenario, syntheticScenarioArchive,
  twoPlayerRequestsScenarioSpec, type ScenarioSpec,
} from '../original-data/formats/formats.test-support.ts';
import { buildImfat, syntheticSnd } from '../original-data/synthetic.test-support.ts';
import type { ImportJob } from './import-host.ts';
import {
  createImportJob, type AudioStageInput, type GraphicsStepInput, type LogicStepInput, type ModelStepInput, type OpenSource,
} from './import-job.ts';
import { PRODUCTION_PACKAGE, type ExpectedPackageProfile } from './production-package.ts';

// Code-generated CloneCD imports for Worker tests in Node and the browser; it never holds original data.

export { MARKER };

const CHUNK = 1 << 20;

/**
 * An unread file that raises the default read budget, which equals the input size, above a small disc's reads, such as
 * the 498 small entries of the COMMFACE plan, a sector each.
 */
export const PADDING: SyntheticFileContent = { byteLength: 2 << 20, read: (_, length) => new Uint8Array(length) };

interface SyntheticImport {
  /** The `.ccd` and `.img` Files, whose names contain `MARKER`. */
  readonly files: readonly File[];
  /** Identification against a whitelist of exactly the covered files, in place of the production whitelist. */
  readonly open: OpenSource;
}

/** Generated content whose byte at `i` is a fixed function of `i` and `seed`; never original data. */
export function generatedContent(byteLength: number, seed: number): SyntheticFileContent {
  return {
    byteLength,
    read: (offset, length) => {
      const bytes = new Uint8Array(length);
      for (let index = 0; index < length; index++) bytes[index] = ((offset + index) * 31 + seed) & 0xff;
      return bytes;
    },
  };
}

/** Files at the production whitelist's paths and sizes, with generated content: shaped like the base version, never it. */
export function productionSizedFiles(): Record<string, SyntheticFileContent> {
  return Object.fromEntries(PRODUCTION_CATALOG.files.map(({ path, byteLength }, index) => [path, generatedContent(byteLength, index + 1)]));
}

/** Identification against a whitelist of exactly `covered`, in place of the production whitelist. */
export function syntheticOpen(covered: Readonly<Record<string, SyntheticFileContent>>, versionId = 'synthetic-import'): OpenSource {
  return async inputs => identifySource(await openDiscImage(inputs), catalogFor(covered, versionId));
}

/** The verified source of `syntheticImport(covered, versionId)` opened in the calling thread, with the same fingerprint. */
export async function syntheticSource(covered: Readonly<Record<string, SyntheticFileContent>>, versionId = 'synthetic-import'): Promise<VerifiedSource> {
  return identifySource(await openDiscImage(syntheticFileDisc({ ...covered, 'PAD/PAD.DAT': PADDING }).files), catalogFor(covered, versionId));
}

/** The CloneCD files of a synthetic disc as `File`s, read out chunk by chunk, keeping their marked names. */
export async function fileSetOf({ files }: Pick<SyntheticFileDisc, 'files'>): Promise<File[]> {
  return Promise.all(files.map(async ({ name, source }) => {
    const parts: Uint8Array<ArrayBuffer>[] = [];
    for (let offset = 0; offset < source.byteLength; offset += CHUNK) {
      // Synthetic ports return bytes in fresh, unshared buffers.
      parts.push(await source.read(offset, Math.min(CHUNK, source.byteLength - offset)) as Uint8Array<ArrayBuffer>);
    }
    return new File(parts, name);
  }));
}

/** A CloneCD file set holding `covered` plus the padding, by disc path, read out chunk by chunk. */
export async function syntheticImport(covered: Readonly<Record<string, SyntheticFileContent>>, versionId = 'synthetic-import'): Promise<SyntheticImport> {
  const files = await fileSetOf(syntheticFileDisc({ ...covered, 'PAD/PAD.DAT': PADDING }));
  return { files, open: syntheticOpen(covered, versionId) };
}

/** A CCKD block in the production cockpit structure whose 4×6 font table is one byte short. */
const CORRUPT_FONTS = productionCockpitBlock([fontTable(8, 8), fontTable(8, 8), fontTable(4, 6, 4 + 256 * 6 - 1)]);

/** A corrupt production CCKD: a 4×6 font table one byte short, or a first front element with a draw-pass flag of 2. */
export type CockpitCorruption = 'font' | 'element';

const corruptCockpit = (corrupt: CockpitCorruption | undefined) => {
  if (corrupt === undefined) return {};
  return { CCKD: corrupt === 'font' ? CORRUPT_FONTS : productionCockpitBlock(undefined, [2, 0]) };
};

/** A graphics step with nothing to convert, for jobs whose test is about identification or group transfer. */
export const NO_GRAPHICS: GraphicsStepInput = Object.freeze({
  mappings: { sourceFingerprint: null, mappings: [] },
  declarations: [],
  share: EMPTY_BUDGET_USAGE,
});

/** A logic step that converts nothing and binds no models, for jobs whose test is about identification, graphics or group transfer. */
export const NO_LOGIC: LogicStepInput = Object.freeze({
  convert: async (_source: unknown, _limits: unknown, usage: BudgetRecord) => ({ drafts: [], usage, models: [] }),
  share: EMPTY_BUDGET_USAGE,
});

/**
 * A model stage with no models, effects or flight data to convert whatever the logic step bound; the models group holds
 * only the graphics partition.
 */
export const NO_MODELS: ModelStepInput = Object.freeze({
  inputs: () => ({ mappings: { sourceFingerprint: null, mappings: [] }, declarations: [] }),
  references: Object.freeze({ textures: new Map(), sounds: new Map() }),
  effects: Object.freeze({ mappings: { sourceFingerprint: null, mappings: [] }, declarations: [] }),
  flightData: Object.freeze({
    mappings: { sourceFingerprint: null, mappings: [] }, declarations: { assets: [], references: { sourceFingerprint: null, mappings: [] } },
  }),
  share: EMPTY_BUDGET_USAGE,
});

let sliceExecutable: Uint8Array | undefined;

/**
 * The covered files of a disc for every production step: `MAIN/SR.NOB` with the production graphics and flight graphics
 * entries, the M2ID list with valid models for the craft types the default mission binds and their meshes, the effect
 * model, the RENS entry, the explosion and nebula lists, the base repair TABL and synthetic samples at every entry of
 * the production sound table; `MAIN/SCENARIO.NOB` with the campaign table and `scenario` as the selected mission; the
 * production-structure CRAFT, DEBRIS, AISTUFF and COMM archives of the rule data; and `MAIN/SRANGERS.EXE`, a synthetic
 * LE executable with the effect, graphics and rule-data regions at their production addresses. `campaign` replaces the
 * default campaign table and its wingman roster. `corruptMesh` breaks the mesh five models share, which the model step
 * rejects as `invalid-payload`. `ruleData` replaces the production rule-data contents.
 */
export function sliceCoveredFiles({ scenario = syntheticScenario(defaultScenarioSpec()), campaign = syntheticCampaign(defaultCampaignSpec()), corruptMesh = false, ruleData }: {
  readonly scenario?: ReturnType<typeof syntheticScenario>;
  readonly campaign?: ReturnType<typeof syntheticCampaign>;
  readonly corruptMesh?: boolean;
  readonly ruleData?: RuleDataContents;
} = {}): Record<string, Uint8Array> {
  const sources = productionRuleData(ruleData);
  const build = () => regionExecutable([...productionEffectRegionWrites(), ...PRODUCTION_GRAPHICS_REGION_WRITES, ...sources.writes], sources.fixups);
  // Only the default rule data's executable is cached.
  const executable = ruleData === undefined ? (sliceExecutable ??= build()) : build();
  return {
    'MAIN/SCENARIO.NOB': syntheticScenarioArchive(campaign, scenario),
    'MAIN/SR.NOB': buildImfat(10_000, productionSliceEntries(corruptMesh)),
    ...sources.archives,
    'MAIN/SRANGERS.EXE': executable.slice(),
  };
}

/** The kind bit of the base the docking mission places (record 7). */
export const DOCKING_BASE_KIND = 17;
/** The kind bits without speed in the docking mission: the player's and the base's. */
export const DOCKING_STILL_KINDS: readonly number[] = Object.freeze([0, DOCKING_BASE_KIND]);
/**
 * Their +0xB8: the base's 0; the player's the smallest positive f32 (2^-149), positive as P3-09's Warp check requires
 * (docs/plan/p3/02/spec.md, MW-01 check 4), whose movement in a tick rounds to 0.
 */
export const DOCKING_STILL_SPEEDS: readonly number[] = Object.freeze([2 ** -149, 0]);
/** The base kind as a category's kind mask. */
export const DOCKING_BASE_KIND_MASK = 1 << DOCKING_BASE_KIND;
/** The communications command codes of the base status request and the docking request (P3-10). */
export const DOCKING_COMMAND_CODES = Object.freeze({ status: 7, docking: 9 });

/**
 * The production rule-data contents for P3-10's browser docking flow (docs/plan/p3/10/subtasks/23-browser-verification.md):
 * the category menu lists the player's kind, then the base kind 17, then the exit, so `c` then 2 chooses the base
 * category; the gated base menu holds the status request at key 1 and the docking request at key 2 before its exit; the
 * base face table (TABL 20011) has as many faces as the base face pool, 5, by taking a face of TABL 20985, so whichever
 * face the base draws has its docking reply (index 0) and status reply (index 1); and the player and base craft have no
 * speed (+0xB8 0), so the base stays within the docking range. Made-up values only.
 */
export function dockingRuleDataContents(): RuleDataContents {
  const contents = productionRuleDataContents();
  const menus = contents['comm-menus'];
  const [player, other, exit] = menus.categories;
  const [status, docking, leave] = menus.gatedTargetCommands;
  const messages = contents['comm-messages'];
  const [baseFaces, craftFaces, [moved, ...otherFaces]] = messages.faceTables;
  const info = contents['craft-info'];
  return {
    ...contents,
    'comm-messages': { ...messages, faceTables: [[...baseFaces, moved], craftFaces, otherFaces] },
    'comm-menus': {
      ...menus,
      categories: [player, { ...other, kindMask: DOCKING_BASE_KIND_MASK }, exit],
      gatedTargetCommands: [
        { ...status, command: DOCKING_COMMAND_CODES.status }, { ...docking, command: DOCKING_COMMAND_CODES.docking }, leave,
      ],
    },
    'craft-info': {
      ...info,
      craft: info.craft.map((record, kindBit) => {
        const still = DOCKING_STILL_KINDS.indexOf(kindBit);
        return still < 0 ? record : { ...record, atB8: DOCKING_STILL_SPEEDS[still] };
      }),
    },
  };
}

/**
 * The slice-shaped mission with the player (record 0) and the base (record 7, kind 17) placed in one small shared
 * rectangle, region 2 shrunk to 40 × 20 mission units, so the base starts within the docking range of the player.
 */
export function dockingScenarioSpec(): ScenarioSpec {
  const spec = defaultScenarioSpec();
  spec.regions![2] = [-20, -20, 20, 0];
  return spec;
}

/** The rule-data conversion usage on `sliceCoveredFiles()`. */
export const RULE_DATA_USAGE: BudgetRecord = productionRuleData().usage;

/** An audio stage with nothing to convert; its group has no Assets. */
export const NO_AUDIO: AudioStageInput = Object.freeze({ table: [], rules: Object.freeze({ flags: Object.freeze([]), s16le: false }) });

/** `flags` values with test meanings only, play once and play three times; production meanings come from research. */
const SYNTHETIC_FLAGS = 7;
const SYNTHETIC_REPEAT_FLAGS = 9;

/**
 * The sound of the synthetic audio disc that plays more than once, and its play count: unlike the production count, so
 * a converted count comes from the rules.
 */
export const SYNTHETIC_REPEATED_SOUND = Object.freeze({ id: 'sound/event/synthetic-2', plays: 3 });

/** A one-sample 8-bit sound of a version 4 event or HUD role at `entry`. */
const namedSound = (role: 'event-sound' | 'hud-sound', index: number, entry: number, flags = SYNTHETIC_FLAGS) =>
  ({ role, id: `sound/${role === 'event-sound' ? 'event' : 'hud'}/synthetic-${index + 1}`, entry, bitsPerSample: 8, samples: [entry & 0xff], flags });

interface SyntheticSound {
  readonly role: string;
  readonly id: string;
  readonly entry: number;
  readonly bitsPerSample: number;
  readonly samples: readonly number[];
  readonly flags: number;
}

/**
 * The sounds of the synthetic audio disc, in ascending Asset ID order, at entry IDs no graphics entry uses: the four
 * core sounds and the eight event and three HUD sounds slice definition version 4 requires.
 */
const SOUNDS: readonly SyntheticSound[] = Object.freeze([
  // The second event sound is `SYNTHETIC_REPEATED_SOUND`.
  ...Array.from({ length: 8 }, (_, index) => namedSound('event-sound', index, 12_005 + index, index === 1 ? SYNTHETIC_REPEAT_FLAGS : SYNTHETIC_FLAGS)),
  { role: 'explosion-sound', id: 'sound/explosion', entry: 12_001, bitsPerSample: 16, samples: [0x00, 0x80, 0xff, 0x7f], flags: SYNTHETIC_FLAGS },
  { role: 'fire-sound', id: 'sound/fire', entry: 12_002, bitsPerSample: 8, samples: [0, 64, 128, 192, 255], flags: SYNTHETIC_FLAGS },
  ...Array.from({ length: 3 }, (_, index) => namedSound('hud-sound', index, 12_013 + index)),
  { role: 'missile-sound', id: 'sound/missile', entry: 12_003, bitsPerSample: 8, samples: [10, 20, 30], flags: SYNTHETIC_FLAGS },
  { role: 'warp-sound', id: 'sound/warp', entry: 12_004, bitsPerSample: 8, samples: [200, 100, 50, 25, 12, 6], flags: SYNTHETIC_FLAGS },
]);

/** The synthetic sound table and rules that convert the sounds of `audioCoveredFiles()` into a complete audio group. */
export const SYNTHETIC_AUDIO: AudioStageInput = Object.freeze({
  table: SOUNDS.map(({ role, id, entry }) => ({
    role,
    mapping: {
      asset: { id, kind: 'sound' },
      parts: [{ alternatives: [{ discPath: 'MAIN/SR.NOB', entry: { id: entry, type: 'SND' }, subresource: null }] }],
      confidence: 'confirmed',
      unknowns: [],
      evidence: ['docs/original/formats/audio.md#1-snd-digital-sound-effects-confirmed-on-all-37-entries'],
      resolution: 'declared',
    },
  })),
  rules: Object.freeze({
    flags: Object.freeze([
      Object.freeze({ value: SYNTHETIC_FLAGS, channels: 1, loop: 'none' }),
      Object.freeze({ value: SYNTHETIC_REPEAT_FLAGS, channels: 1, loop: 'repeat', plays: SYNTHETIC_REPEATED_SOUND.plays }),
    ]),
    s16le: true,
  }),
});

/** The audio conversion usage of `SYNTHETIC_AUDIO` on `audioCoveredFiles()`: 15 mono clips, one of them 16-bit. */
export const AUDIO_CONVERSION_USAGE: BudgetRecord = Object.freeze({
  ...EMPTY_BUDGET_USAGE,
  assets: SOUNDS.length,
  payloadBytes: SOUNDS.reduce((total, { samples }) => total + SOUND_PAYLOAD_HEADER_BYTES + samples.length, 0),
  audioSamples: SOUNDS.reduce((total, { bitsPerSample, samples }) => total + samples.length / (bitsPerSample / 8), 0),
});

/** The index of the fire sound in `SYNTHETIC_AUDIO`'s table, which `audioCoveredFiles(true)` corrupts. */
export const SYNTHETIC_FIRE_SOUND = SOUNDS.findIndex(({ id }) => id === 'sound/fire');

/**
 * The covered files of a disc in the production graphics structure whose `MAIN/SR.NOB` also holds the synthetic SND
 * entries of `SYNTHETIC_AUDIO`; `corrupt` gives the fire sound a `flags` value the rules do not accept.
 */
export function audioCoveredFiles(corrupt = false): Record<string, Uint8Array> {
  return productionGraphicsFiles({}, SOUNDS.map(({ entry, bitsPerSample, samples, flags }, index) => ({
    id: entry, type: 'SND', ...syntheticSnd({ samples: [...samples], bitsPerSample, flags: corrupt && index === SYNTHETIC_FIRE_SOUND ? SYNTHETIC_FLAGS + 1 : flags }),
  })));
}

/**
 * The covered files of a disc in the production graphics structure; `corrupt` shortens the 4×6 font table by one byte,
 * which the converter rejects as `invalid-payload`.
 */
export function graphicsCoveredFiles(corrupt = false): Record<string, Uint8Array> {
  return productionGraphicsFiles(corrupt ? { CCKD: CORRUPT_FONTS } : {});
}

/**
 * The covered files of a disc in the production graphics and sound structure: the production graphics and synthetic
 * samples at every entry of the production sound table, so the production graphics and audio stages convert both.
 * `corrupt` shortens the 4×6 font table by one byte (`font`) or sets a front cockpit element flag to 2 (`element`); the
 * converter rejects either as `invalid-payload`.
 */
export function productionCoveredFiles(corrupt?: CockpitCorruption): Record<string, Uint8Array> {
  return productionGraphicsFiles(corruptCockpit(corrupt), productionSoundEntries());
}

/**
 * The payload bytes of the P2-05 Assets: two flight palettes, two 8×8 fonts of 256 glyphs with 94 and 95 map entries,
 * and the 4×6 font of 192 eight-row glyphs with 56 entries.
 */
const P2_05_PAYLOAD_BYTES = 2 * palettePayloadLength(256) + fontPayloadLength(256, 8, 94) + fontPayloadLength(256, 8, 95) + fontPayloadLength(192, 8, 56);

/**
 * The payload bytes of the production graphics converted from `graphicsCoveredFiles()` or `productionCoveredFiles()`:
 * the P2-05 palettes and fonts, the slice textures with their palettes, the P2-07 cockpit, HUD and map Assets, the
 * P3-03 flight graphics and HUD text, and the P3-09 map geometry.
 */
export const GRAPHICS_PAYLOAD_BYTES = P2_05_PAYLOAD_BYTES + MODEL_TEXTURE_USAGE.payloadBytes + COCKPIT_HUD_MAP_USAGE.payloadBytes + FLIGHT_GRAPHICS_USAGE.payloadBytes
  + HUD_TEXT_USAGE.payloadBytes + MAP_GEOMETRY_USAGE.payloadBytes;

/**
 * The conversion usage of the production graphics step on `graphicsCoveredFiles()` or `productionCoveredFiles()`: the
 * P2-05 Assets, two 256-entry palettes and fonts of 256, 256 and 192 glyphs, plus the slice textures, the P2-07
 * cockpit, HUD and map Assets, the P3-03 flight graphics and HUD text, and the P3-09 map geometry.
 */
export const GRAPHICS_CONVERSION_USAGE: BudgetRecord = [MODEL_TEXTURE_USAGE, COCKPIT_HUD_MAP_USAGE, FLIGHT_GRAPHICS_USAGE, HUD_TEXT_USAGE, MAP_GEOMETRY_USAGE].reduce((total, usage) => addBudgets(total, usage, 'usage'), {
  ...EMPTY_BUDGET_USAGE,
  assets: 5,
  paletteEntries: 512,
  glyphs: 256 + 256 + 192,
  payloadBytes: P2_05_PAYLOAD_BYTES,
});

/**
 * The conversion usage of the production graphics and audio stages on `productionCoveredFiles()`: the graphics
 * Assets plus the production sounds.
 */
export const PRODUCTION_CONVERSION_USAGE: BudgetRecord = addBudgets(GRAPHICS_CONVERSION_USAGE, PRODUCTION_SOUND_USAGE, 'usage');

const { data: DATA_ENTRY, texture: TEX_ENTRY, cockpit: CCKD_ENTRY, mfd: MFDD_ENTRY, table: TABL_ENTRY, labels: LABELS_ENTRY } = GRAPHICS_ENTRIES;
const FLIGHT_PALETTE = 'palette/flight/cockpit-hud-map';
const MAP_PALETTE = 'palette/map/frame/element-0';
const FRONT_ELEMENTS = ['image/cockpit/front/element-0', 'image/cockpit/front/element-1'];
const MAP_ELEMENTS = ['image/map/frame/element-0'];

/** One Asset of the synthetic cockpit disc: its declaration and its single-locator mapping. */
interface CockpitAsset {
  readonly id: string;
  readonly role: string;
  readonly group: ResourceGroup;
  readonly declaration: Record<string, unknown>;
  readonly mapping: Record<string, unknown>;
}

const cockpitAsset = (declaration: Record<string, unknown>, type: string, entry: number, subresource: string | null = null): CockpitAsset => {
  const { id } = declaration.asset as { readonly id: string };
  return { id, role: declaration.role as string, group: declaration.group as ResourceGroup, declaration, mapping: graphicsMapping(id, type, entry, subresource) };
};

/** The map geometry of the synthetic cockpit disc: font 1 and the type-10 record of the CCKD slot carrying layout 6. */
const COCKPIT_MAP_GEOMETRY: CockpitAsset = (() => {
  const { mapping } = cockpitAsset({ asset: { id: 'data/hud/map-geometry', kind: 'data' } }, 'CCKD', CCKD_ENTRY, 'fonts/1');
  const parts = mapping.parts as readonly { readonly alternatives: readonly Record<string, unknown>[] }[];
  const instrument = { ...parts[0].alternatives[0], subresource: 'layouts/6/instruments/type-10' };
  return {
    id: 'data/hud/map-geometry', role: 'map-geometry', group: 'cockpit-hud-map',
    declaration: { asset: { id: 'data/hud/map-geometry', kind: 'data' }, role: 'map-geometry', group: 'cockpit-hud-map' },
    mapping: { ...mapping, parts: [...parts, { alternatives: [instrument] }] },
  };
})();

/** The HUD text of the synthetic cockpit disc: its regions in the disc's small executable. */
const COCKPIT_HUD_TEXT = syntheticHudTextSource();

/**
 * The Assets of the synthetic cockpit disc in ascending ID order. The `cockpit-hud-map` partition fills every role of
 * the group with the P2-05 shapes (the flight palette and three fonts), the P2-07 ones (the front and map frame layouts
 * with their CCKD element images, an element's embedded palette, MFDD and TABL records) and the P3-03 ones (a target
 * display image from the TEX entry with its embedded palette, the view labels, and the HUD text from the executable's
 * regions) and the P3-09 map geometry from the CCKD's map slot and font 1; the `models` partition is one texture with its palette and the models flight palette.
 */
const COCKPIT_ASSETS: readonly CockpitAsset[] = [
  cockpitAsset(fontDeclaration('font/hud/4x6', { cell: { width: 4, height: 6 } }), 'CCKD', CCKD_ENTRY, 'fonts/2'),
  cockpitAsset(fontDeclaration('font/hud/8x8-1'), 'CCKD', CCKD_ENTRY, 'fonts/0'),
  cockpitAsset(fontDeclaration('font/hud/8x8-2'), 'CCKD', CCKD_ENTRY, 'fonts/1'),
  ...FRONT_ELEMENTS.map((id, index) => cockpitAsset(imageDeclaration(id, FLIGHT_PALETTE, { role: 'cockpit-element' }), 'CCKD', CCKD_ENTRY, `groups/0/elements/${index}`)),
  cockpitAsset(imageDeclaration('image/hud/gauge-bar-1/0', FLIGHT_PALETTE, { alpha: { colourKey: 0 } }), 'TABL', TABL_ENTRY, 'records/0'),
  cockpitAsset(imageDeclaration('image/hud/status-display/background-0', FLIGHT_PALETTE), 'MFDD', MFDD_ENTRY, 'lists/0/records/0'),
  cockpitAsset(imageDeclaration('image/hud/status-display/overlay-0', FLIGHT_PALETTE, { alpha: { colourKey: 0 } }), 'MFDD', MFDD_ENTRY, 'lists/1/records/0'),
  ...MAP_ELEMENTS.map((id, index) => cockpitAsset(imageDeclaration(id, MAP_PALETTE, { role: 'map-frame-element' }), 'CCKD', CCKD_ENTRY, `groups/2/elements/${index}`)),
  cockpitAsset(imageDeclaration('image/map/unit-marker/0', MAP_PALETTE, { role: 'strategic-map', alpha: { colourKey: 0 } }), 'TABL', TABL_ENTRY, 'records/1'),
  cockpitAsset(imageDeclaration('image/model-texture/01', 'palette/model-texture/01', {
    group: 'models', role: 'model-texture', display: { nearest: 'palette/flight/models' },
  }), 'TEX', TEX_ENTRY),
  cockpitAsset(layoutDeclaration('layout/cockpit/front', FRONT_ELEMENTS, { frame: { width: 8, height: 8 } }), 'CCKD', CCKD_ENTRY, 'groups/0'),
  cockpitAsset(layoutDeclaration('layout/map/frame', MAP_ELEMENTS, { role: 'strategic-map', frame: { width: 4, height: 4 } }), 'CCKD', CCKD_ENTRY, 'groups/2'),
  cockpitAsset(paletteDeclaration(FLIGHT_PALETTE), 'DATA', DATA_ENTRY),
  cockpitAsset(paletteDeclaration('palette/flight/models', 'models'), 'DATA', DATA_ENTRY),
  cockpitAsset({ ...paletteDeclaration(MAP_PALETTE), role: 'map-palette' }, 'CCKD', CCKD_ENTRY, 'groups/2/elements/0/palette'),
  cockpitAsset({ ...paletteDeclaration('palette/model-texture/01', 'models'), role: 'texture-palette' }, 'TEX', TEX_ENTRY, 'palette'),
  cockpitAsset(imageDeclaration('image/hud/target-display', 'palette/hud/target-display', {
    role: 'target-display', display: { nearest: FLIGHT_PALETTE },
  }), 'TEX', TEX_ENTRY),
  cockpitAsset({ ...paletteDeclaration('palette/hud/target-display'), role: 'texture-palette' }, 'TEX', TEX_ENTRY, 'palette'),
  cockpitAsset({ asset: { id: 'data/hud/view-labels', kind: 'data' }, role: 'view-labels', group: 'cockpit-hud-map' }, 'TABL', LABELS_ENTRY, 'labels/8'),
  { id: 'data/hud/text', role: 'hud-text', group: 'cockpit-hud-map' as const, declaration: COCKPIT_HUD_TEXT.declaration, mapping: COCKPIT_HUD_TEXT.mapping },
  COCKPIT_MAP_GEOMETRY,
].sort((left, right) => compareText(left.id, right.id));

/** The ID, role and group of every Asset `cockpitGraphics()` converts, in ascending ID order. */
export const COCKPIT_GRAPHICS_ASSETS: readonly Pick<CockpitAsset, 'id' | 'role' | 'group'>[] =
  Object.freeze(COCKPIT_ASSETS.map(({ id, role, group }) => Object.freeze({ id, role, group })));

/** A share above the conversion usage of `cockpitGraphics()` in every dimension it charges. */
const COCKPIT_GRAPHICS_SHARE: BudgetRecord = Object.freeze({
  ...EMPTY_BUDGET_USAGE, assets: 64, dependencyEdges: 64, paletteEntries: 1024, imagePixels: 1024, glyphs: 1024, payloadBytes: 1 << 16,
});

/** Changes to the Assets of `cockpitGraphics()`, by Asset ID. */
interface CockpitGraphicsChanges {
  /** Assets left out, declaration and mapping. */
  readonly without?: readonly string[];
  /** Fields replaced in an Asset's declaration. */
  readonly declarations?: Readonly<Record<string, Record<string, unknown>>>;
  /** Fields replaced in an Asset's mapping, such as its confidence. */
  readonly mappings?: Readonly<Record<string, Record<string, unknown>>>;
}

/**
 * The graphics step input converting the Assets of `cockpitCoveredFiles()` with `changes`: confirmed mappings, so
 * every converted Asset is verified, and a share above their usage.
 */
export function cockpitGraphics({ without = [], declarations = {}, mappings = {} }: CockpitGraphicsChanges = {}): GraphicsStepInput {
  const kept = COCKPIT_ASSETS.filter(({ id }) => !without.includes(id));
  return Object.freeze({
    mappings: { sourceFingerprint: null, mappings: kept.map(({ id, mapping }) => ({ ...mapping, ...mappings[id] })) },
    declarations: kept.map(({ id, declaration }) => ({ ...declaration, ...declarations[id] })),
    share: COCKPIT_GRAPHICS_SHARE,
  });
}

/** A raw and a sprite front element, a map frame element with a 16-colour embedded palette, MFDD and TABL records. */
const FRONT_RAW = rawImageBlock(4, 2, [1, 2, 3, 4, 5, 6, 7, 8]);
const FRONT_SPRITE = spriteImageBlock(5, 3, [0, 0, 2, 0, 1, 2, 3, 0, 5, 0, 1, 0, 3, 0, 3, 4, 5, 1, 0]);
const MAP_FRAME = rawImageBlock(2, 3, [0, 1, 2, 3, 0, 1], Array.from({ length: 48 }, (_, index) => (index * 5) & 0xff));
const MFD = mfdBlock([[rawImageBlock(3, 2, [9, 8, 7, 6, 5, 4])], [rawImageBlock(2, 2, [0, 3, 0, 4])]]);
const TABLE = tableBlock([rawImageBlock(2, 3, [1, 2, 3, 4, 5, 6]), rawImageBlock(1, 2, [0, 15])]);

/**
 * The covered files of a synthetic disc whose `MAIN/SR.NOB` holds the DATA, TEX, CCKD, MFDD and the two TABL entries
 * `cockpitGraphics()` maps, and whose `MAIN/SRANGERS.EXE` holds the HUD text regions: the CCKD has the front layout in
 * slot 0 (layout 0), an empty slot 1 (layout 5) and the map frame in slot 2 (layout 6, with the map's type-10 instrument
 * record). `corrupt` sets a front element's +44 field to 2, which the converter rejects as `invalid-payload`.
 */
export function cockpitCoveredFiles(corrupt = false): Record<string, Uint8Array> {
  const cockpit = cockpitLayoutBlock([
    [{ record: FRONT_RAW, x: 0, y: 6 }, { record: FRONT_SPRITE, x: 3, y: 0, flags: [corrupt ? 2 : 0, 0] }],
    [],
    [{ record: MAP_FRAME, x: 1, y: 1, flags: [1, 0] }],
  ], undefined, [], [
    { layout: 0, records: [instrumentRecord(8, [0, 0, 7, 1])] },
    { layout: 5, records: [] },
    { layout: 6, records: [instrumentRecord(10, [1, 1, 9, 5]), instrumentRecord(8, [0, 6, 3, 7])] },
  ]);
  return {
    [GRAPHICS_ARCHIVE]: graphicsArchive({ cockpit, mfd: MFD, table: TABLE, labels: viewLabelTable('\x80synthetic-label') }),
    'MAIN/SRANGERS.EXE': COCKPIT_HUD_TEXT.executable.slice(),
  };
}

/** The groups a synthetic job sends once the source is identified, given the identified fingerprint. */
export type SyntheticGroups = (sourceFingerprint: string) => readonly (readonly [ResourceGroup, GroupInput])[];

/** The four synthetic groups, each bound to the identified source. */
export const boundGroups: SyntheticGroups = fingerprint => RESOURCE_GROUPS.map(group => [group, syntheticSourceGroup(group, fingerprint)]);

/**
 * The import job identifying through `open` and converting no graphics, logic or sounds, then sending `groups` for the
 * identified fingerprint in place of its own empty models, cockpit-hud-map and audio groups.
 */
export function syntheticGroupsJob(open: OpenSource, groups: SyntheticGroups = boundGroups): ImportJob {
  const identify = createImportJob(open, NO_GRAPHICS, NO_LOGIC, NO_AUDIO, NO_MODELS);
  return async (files, report) => {
    let fingerprint = '';
    const usage = await identify(files, Object.freeze({
      ...report,
      identified: (identity: Parameters<typeof report.identified>[0]) => {
        fingerprint = identity.sourceFingerprint;
        report.identified(identity);
      },
      group: () => undefined,
    }));
    for (const [group, input] of groups(fingerprint)) report.group(group, input);
    return usage;
  };
}

/** What a test Worker scenario identifies: its covered files and the version ID of its synthetic whitelist. */
export interface ScenarioSource {
  readonly covered: Readonly<Record<string, SyntheticFileContent>>;
  readonly versionId: string;
}

/**
 * The synthetic disc of each test Worker scenario that identifies one, shared by the Worker entry and the app test
 * entry, so the profile the app expects is that of the package the scenario sends. The P3-04 mission discs are the slice
 * disc with the five-option roster of `fiveWingmanCampaignSpec()`, and that disc with the player requesting two craft.
 */
export const SCENARIO_SOURCES = Object.freeze({
  synthetic: (): ScenarioSource => ({ covered: productionSizedFiles(), versionId: 'synthetic-browser' }),
  graphics: (): ScenarioSource => ({ covered: productionCoveredFiles(), versionId: 'synthetic-graphics' }),
  'graphics-corrupt': (): ScenarioSource => ({ covered: productionCoveredFiles('font'), versionId: 'synthetic-graphics' }),
  'graphics-element-corrupt': (): ScenarioSource => ({ covered: productionCoveredFiles('element'), versionId: 'synthetic-graphics' }),
  audio: (): ScenarioSource => ({ covered: audioCoveredFiles(), versionId: 'synthetic-audio' }),
  models: (): ScenarioSource => ({ covered: sliceCoveredFiles(), versionId: 'synthetic-models' }),
  'models-corrupt': (): ScenarioSource => ({ covered: sliceCoveredFiles({ corruptMesh: true }), versionId: 'synthetic-models' }),
  'mission-startable': (): ScenarioSource => ({
    covered: sliceCoveredFiles({ campaign: syntheticCampaign(fiveWingmanCampaignSpec()) }), versionId: 'synthetic-mission',
  }),
  'mission-create-rejected': (): ScenarioSource => ({
    covered: sliceCoveredFiles({ campaign: syntheticCampaign(fiveWingmanCampaignSpec()), scenario: syntheticScenario(twoPlayerRequestsScenarioSpec()) }),
    versionId: 'synthetic-mission',
  }),
  'mission-docking': (): ScenarioSource => ({
    covered: sliceCoveredFiles({
      campaign: syntheticCampaign(fiveWingmanCampaignSpec()), scenario: syntheticScenario(dockingScenarioSpec()), ruleData: dockingRuleDataContents(),
    }),
    versionId: 'synthetic-mission',
  }),
});

export type IdentifyingScenario = keyof typeof SCENARIO_SOURCES;

/** Identification of a scenario's disc against its synthetic whitelist. */
export function scenarioOpen(scenario: IdentifyingScenario): OpenSource {
  const { covered, versionId } = SCENARIO_SOURCES[scenario]();
  return syntheticOpen(covered, versionId);
}

/**
 * The expected package profile of a scenario's package: its whitelist's fingerprint and its converter version (the
 * content test support's for `synthetic`, which sends those groups, and the production one for the converting
 * scenarios), with the production package budget.
 */
export function scenarioProfile(scenario: IdentifyingScenario): ExpectedPackageProfile {
  const { covered, versionId } = SCENARIO_SOURCES[scenario]();
  return Object.freeze({
    converterVersion: scenario === 'synthetic' ? readConverterVersion(syntheticIdentity().converterVersion) : PRODUCTION_CONVERTER_VERSION,
    sourceFingerprint: sourceFingerprint(catalogFor(covered, versionId)),
    limits: PRODUCTION_PACKAGE.limits,
  });
}
