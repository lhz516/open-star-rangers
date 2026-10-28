import { expect } from 'vitest';
import { EMPTY_BUDGET_USAGE, type BudgetRecord } from '../../content/budget.ts';
import { compareText } from '../../content/contract-validation.ts';
import type { FlightDataPayload, SceneSettings } from '../../content/flight/flight-data-content.ts';
import { encodeFlightDataPayload } from '../../content/flight/flight-data-payload.ts';
import { readFlightDataContent } from '../../content/flight/flight-data-readers.ts';
import { kindOf } from '../../content/synthetic-content.test-support.ts';
import { animFrame, patternFrame, syntheticAnimation } from '../formats/anim.test-support.ts';
import type { SyntheticBlock } from '../formats/formats.test-support.ts';
import { rensHeaderBytes, syntheticRensSettings } from '../formats/rens-header.test-support.ts';
import { SourceError, type SourceErrorData } from '../source-error.ts';
import { inLocationGrammar } from '../source-error.test-support.ts';
import { archiveLocator } from '../source-mapping.ts';
import { buildImfat, ByteWriter, type SyntheticEntry } from '../synthetic.test-support.ts';
import { blockEntry, namesPrivateDetail, rawImageBlock } from './conversion.test-support.ts';
import { SCENE_SETTINGS_SUBRESOURCE } from './flight-data-step.ts';
import { explosionAnimationId, PRODUCTION_EXPLOSION_RECORDS } from './production-flight-data.ts';
import { explosionFrameImageId, nebulaImageId, PRODUCTION_EXPLOSION_ANIMATIONS, PRODUCTION_NEBULA_IMAGES } from './production-flight-graphics.ts';
import { productionFlightGraphicsEntries } from './production-flight-graphics.test-support.ts';
import { syntheticRensEntry } from './production-effects.test-support.ts';
import { PRODUCTION_SOUND_TABLE } from './production-sounds.ts';

// Code-generated sources for the flight data step; never original data. A small synthetic set with made-up entry IDs
// exercises every ID chain, and a set at the production entry IDs exercises the production tables. Each comes with the
// payload content it must produce, written here from the generated data rather than by the step.

const FLIGHT_DATA_ARCHIVE = 'MAIN/SR.NOB';

/** An EXIC block: three {pointer, count} headers, then each non-empty list in order; an empty list has a null pointer. */
export function explosionListsBlock(lists: readonly (readonly number[])[]): SyntheticBlock {
  const writer = new ByteWriter();
  let at = lists.length * 8;
  const relocations: number[] = [];
  lists.forEach((ids, list) => {
    writer.u32(ids.length ? at : 0, ids.length);
    if (ids.length) relocations.push(list * 8);
    at += ids.length * 4;
  });
  for (const ids of lists) writer.u32(...ids);
  return { bytes: writer.toBytes(), relocations };
}

/** An EXPL block: the SND entry ID at +0 and the ANIM entry ID at +4. */
export const explosionRecordBlock = (sound: number, animation: number): SyntheticBlock => ({ bytes: new ByteWriter().u32(sound, animation).toBytes(), relocations: [] });

/** A NEBC block: the relocated list pointer (8) and the count, then the BITM entry IDs; an empty list has a null pointer. */
export const nebulaListBlock = (ids: readonly number[]): SyntheticBlock =>
  ({ bytes: new ByteWriter().u32(ids.length ? 8 : 0, ids.length, ...ids).toBytes(), relocations: ids.length ? [0] : [] });

const locator = (type: string, entry: number, subresource: string | null = null) => ({ discPath: FLIGHT_DATA_ARCHIVE, entry: { id: entry, type }, subresource });

/** A declared mapping of `id` with one part per locator, in the given order. */
export const flightMapping = (id: string, locators: readonly ReturnType<typeof locator>[]) => ({
  asset: { id, kind: kindOf(id) },
  parts: locators.map(alternative => ({ alternatives: [alternative] })),
  confidence: 'confirmed',
  unknowns: [],
  evidence: ['docs/original/formats/hud.md'],
  resolution: 'declared',
});

const byId = <T extends { readonly asset: { readonly id: string } }>(items: T[]): T[] => items.sort((left, right) => compareText(left.asset.id, right.asset.id));

/** Synthetic entry IDs, not original ones. */
export const SYNTHETIC_ENTRIES = Object.freeze({
  rens: 30_101,
  lists: 30_103,
  nebula: 30_105,
  /** EXPL. */
  records: Object.freeze([30_111, 30_113, 30_115]),
  /** ANIM, by animation number. */
  anims: Object.freeze([30_125, 30_121, 30_123]),
  /** SND of the sounds a, b and c. */
  sounds: Object.freeze([30_133, 30_131, 30_135]),
  /** BITM of nebula images 01, 02 and 03. */
  images: Object.freeze([30_145, 30_141, 30_143]),
  /** An entry of each type the step never reads: a second EXIC, an ANIM, an SND and a BITM. */
  unread: Object.freeze([[30_151, 'EXIC'], [30_153, 'ANIM'], [30_155, 'SND'], [30_157, 'BITM']] as const),
});

const [R1, R2, R3] = SYNTHETIC_ENTRIES.records;
/** EXIC lists: the first appearances are R2, R1, R3, so animation 01 belongs to R2, 02 to R1 and 03 to R3. */
export const SYNTHETIC_LISTS: readonly (readonly number[])[] = [[R2, R1], [R3, R1], [R3]];
/** The EXPL records in animation number order: sound b, a, b and the ANIM of animation 01, 02, 03. */
const RECORD_ORDER = [R2, R1, R3];
const RECORD_SOUNDS = [SYNTHETIC_ENTRIES.sounds[1], SYNTHETIC_ENTRIES.sounds[0], SYNTHETIC_ENTRIES.sounds[1]];
/** Frames of animation 01, 02 and 03. */
const SYNTHETIC_FRAME_COUNTS: readonly number[] = [2, 3, 1];
/** NEBC order: images 01, 02, 03, then 02 again. */
const NEBULA_ORDER = [0, 1, 2, 1];

export const SYNTHETIC_IDS = Object.freeze({
  scene: 'data/scene-settings',
  explosions: 'data/explosions',
  nebula: 'data/nebula-backgrounds',
  animations: Object.freeze(['data/synthetic-animation/01', 'data/synthetic-animation/02', 'data/synthetic-animation/03']),
  sounds: Object.freeze(['sound/synthetic/boom-a', 'sound/synthetic/boom-b', 'sound/synthetic/boom-c']),
  images: Object.freeze(['image/synthetic-nebula/01', 'image/synthetic-nebula/02', 'image/synthetic-nebula/03']),
});

export const syntheticFrameId = (animation: number, frame: number): string => `image/synthetic-frame/${animation + 1}/${frame + 1}`;

/** The scene settings in the synthetic RENS header: other values than the content tests' defaults. */
export const SYNTHETIC_SCENE: SceneSettings = (() => {
  const settings = syntheticRensSettings();
  return { ...settings, deviceByte: 0x3e, deviceValues: { ...settings.deviceValues, base: -2.5 } };
})();

/** A RENS block: `settings` in the header and two pattern records the header does not read. */
function rensBlock(settings: SceneSettings): SyntheticBlock {
  const bytes = new Uint8Array(0x60 + 2 * 28).fill(0x5a);
  bytes.set(rensHeaderBytes(settings));
  const view = new DataView(bytes.buffer);
  view.setUint32(0x58, 0x60, true);
  view.setUint32(0x5c, 2, true);
  return { bytes, relocations: [0x58] };
}

/** An ANIM block of `frames` small made-up frames, seeded by `seed`. */
export const syntheticAnimBlock = (frames: number, seed = 1): SyntheticBlock =>
  syntheticAnimation(Array.from({ length: frames }, (_, frame) => animFrame(patternFrame(3, 2, seed * 7 + frame))));

/**
 * The synthetic SR.NOB entries in ascending ID order: the RENS, EXIC, three EXPL, three ANIM and NEBC entries, the
 * three BITM and SND entries other steps would convert, and one unread entry of each type. `replace` swaps the block
 * of an entry by ID, or omits the entry when null.
 */
function syntheticFlightDataEntries(replace: Readonly<Record<number, SyntheticBlock | null>> = {}): SyntheticEntry[] {
  const { rens, lists, nebula, anims, sounds, images, unread } = SYNTHETIC_ENTRIES;
  const plain = (bytes: Uint8Array): SyntheticBlock => ({ bytes, relocations: [] });
  const entries: [number, string, SyntheticBlock][] = [
    [rens, 'RENS', rensBlock(SYNTHETIC_SCENE)],
    [lists, 'EXIC', explosionListsBlock(SYNTHETIC_LISTS)],
    ...RECORD_ORDER.map((record, index): [number, string, SyntheticBlock] => [record, 'EXPL', explosionRecordBlock(RECORD_SOUNDS[index], anims[index])]),
    ...anims.map((anim, index): [number, string, SyntheticBlock] => [anim, 'ANIM', syntheticAnimBlock(SYNTHETIC_FRAME_COUNTS[index], index + 1)]),
    [nebula, 'NEBC', nebulaListBlock(NEBULA_ORDER.map(index => images[index]))],
    ...sounds.map((entry): [number, string, SyntheticBlock] => [entry, 'SND', plain(Uint8Array.of(1, 2, 3, 4))]),
    ...images.map((entry, index): [number, string, SyntheticBlock] => [entry, 'BITM', plain(rawImageBlock(2, 1, [index, 7]))]),
    ...unread.map(([entry, type]): [number, string, SyntheticBlock] => [entry, type, plain(Uint8Array.of(9))]),
  ];
  return entries
    .filter(([id]) => replace[id] !== null)
    .map(([id, type, block]) => blockEntry(id, type, replace[id] ?? block))
    .sort((left, right) => left.id - right.id);
}

/** The disc files of the synthetic set. */
export const syntheticFlightDataFiles = (replace: Readonly<Record<number, SyntheticBlock | null>> = {}): Record<string, Uint8Array> =>
  ({ [FLIGHT_DATA_ARCHIVE]: buildImfat(10_000, syntheticFlightDataEntries(replace)) });

/** The mappings of the synthetic set, fresh mutable plain data in Asset ID order. */
export function syntheticFlightDataMappings() {
  const { rens, lists, records, nebula, anims } = SYNTHETIC_ENTRIES;
  return {
    sourceFingerprint: null,
    mappings: byId([
      flightMapping(SYNTHETIC_IDS.scene, [locator('RENS', rens, SCENE_SETTINGS_SUBRESOURCE)]),
      flightMapping(SYNTHETIC_IDS.explosions, [locator('EXIC', lists), ...records.map(entry => locator('EXPL', entry))]),
      ...SYNTHETIC_IDS.animations.map((id, index) => flightMapping(id, [locator('ANIM', anims[index])])),
      flightMapping(SYNTHETIC_IDS.nebula, [locator('NEBC', nebula)]),
    ]),
  };
}

/** The declared sounds a and b, which the records name; sound c is a delivered SND no record names. */
const DECLARED_SOUNDS = SYNTHETIC_IDS.sounds.slice(0, 2);

/** The declarations of the synthetic set with their reference mappings, fresh mutable plain data. */
export function syntheticFlightDataDeclarations() {
  const { anims, sounds, images } = SYNTHETIC_ENTRIES;
  const frames = (animation: number) => Array.from({ length: SYNTHETIC_FRAME_COUNTS[animation] }, (_, frame) => syntheticFrameId(animation, frame));
  const models = { group: 'models' };
  return {
    assets: [
      { asset: { id: SYNTHETIC_IDS.scene, kind: 'data' }, role: 'scene-settings', ...models },
      { asset: { id: SYNTHETIC_IDS.explosions, kind: 'data' }, role: 'explosion-table', ...models, animations: [...SYNTHETIC_IDS.animations], sounds: DECLARED_SOUNDS },
      ...SYNTHETIC_IDS.animations.map((id, index) => ({ asset: { id, kind: 'data' }, role: 'explosion-animation', ...models, frames: frames(index) })),
      { asset: { id: SYNTHETIC_IDS.nebula, kind: 'data' }, role: 'nebula-backgrounds', ...models, images: NEBULA_ORDER.map(index => SYNTHETIC_IDS.images[index]) },
    ] as Record<string, unknown>[],
    references: {
      sourceFingerprint: null,
      mappings: byId([
        ...DECLARED_SOUNDS.map((id, index) => flightMapping(id, [locator('SND', sounds[index])])),
        ...SYNTHETIC_IDS.images.map((id, index) => flightMapping(id, [locator('BITM', images[index])])),
        ...anims.flatMap((anim, animation) => frames(animation).map((id, frame) => flightMapping(id, [locator('ANIM', anim, `frames/${frame}`)]))),
      ]),
    },
  };
}

const sound = (id: string) => ({ id, kind: 'sound' });
const data = (id: string) => ({ id, kind: 'data' });
const image = (id: string) => ({ id, kind: 'image' });

/** The payload of each synthetic Asset: the explosion entries follow the EXIC lists, an entry per position. */
export const SYNTHETIC_FLIGHT_PAYLOADS: ReadonlyMap<string, FlightDataPayload> = (() => {
  const entryOf = (record: number) => {
    const index = RECORD_ORDER.indexOf(record);
    return { sound: sound(SYNTHETIC_IDS.sounds[SYNTHETIC_ENTRIES.sounds.indexOf(RECORD_SOUNDS[index])]), animation: data(SYNTHETIC_IDS.animations[index]) };
  };
  return new Map([
    [SYNTHETIC_IDS.scene, readFlightDataContent('scene-settings', SYNTHETIC_SCENE)],
    [SYNTHETIC_IDS.explosions, readFlightDataContent('explosion-table', { lists: SYNTHETIC_LISTS.map(list => list.map(entryOf)) })],
    ...SYNTHETIC_IDS.animations.map((id, animation) => [id, readFlightDataContent('explosion-animation', {
      frames: Array.from({ length: SYNTHETIC_FRAME_COUNTS[animation] }, (_, frame) => image(syntheticFrameId(animation, frame))),
    })] as const),
    [SYNTHETIC_IDS.nebula, readFlightDataContent('nebula-backgrounds', { images: NEBULA_ORDER.map(index => image(SYNTHETIC_IDS.images[index])) })],
  ]);
})();

/**
 * A step's usage on `payloads`: one Asset each, an edge per distinct referenced Asset, and the canonical payload bytes,
 * counted from the expected payloads alone.
 */
function flightDataUsage(payloads: ReadonlyMap<string, FlightDataPayload>): BudgetRecord {
  const referenced = ({ role, content }: FlightDataPayload): readonly { readonly id: string }[] => {
    switch (role) {
      case 'scene-settings': return [];
      case 'explosion-table': return content.lists.flat().flatMap(({ sound: s, animation }) => [s, animation]);
      case 'explosion-animation': return content.frames;
      case 'nebula-backgrounds': return content.images;
    }
  };
  const all = [...payloads.values()];
  return {
    ...EMPTY_BUDGET_USAGE,
    assets: all.length,
    dependencyEdges: all.reduce((total, payload) => total + new Set(referenced(payload).map(({ id }) => id)).size, 0),
    payloadBytes: all.reduce((total, payload) => total + encodeFlightDataPayload(payload).length, 0),
  };
}

export const SYNTHETIC_FLIGHT_DATA_USAGE: BudgetRecord = flightDataUsage(SYNTHETIC_FLIGHT_PAYLOADS);

// The flight data location grammar, written from the spec as an oracle: the declaration set or a declaration's field
// path (including its reference mappings), or a flight data Asset alone or followed by its source or an ID list item.
const FLIGHT_DATA_LOCATION = new RegExp(`^flightData(?:${[
  String.raw`\.declarations(?:\.(?:assets|references)(?:\[\d+\])?(?:\.[A-Za-z]+(?:\[\d+\])?)*)?`,
  String.raw`\[[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)+\](?:\.source|\.(?:animations|sounds|frames|images)(?:\[\d+\])?)?`,
].join('|')})$`);

/**
 * Awaits a rejected step and returns its diagnostic without the reason. The error must be a SourceError located in the
 * flight data grammar or the P2-03 archive and mapping grammar, with a reason of 1 to 512 printable ASCII characters
 * that names no file, path, offset or entry number, and nothing besides the location may match `hidden`.
 */
export async function flightDataFailure(action: () => Promise<unknown>, hidden = /^$/): Promise<Omit<SourceErrorData, 'reason'>> {
  const error = await action().then(() => null, (caught: unknown) => caught);
  expect(error).toBeInstanceOf(SourceError);
  const data = (error as SourceError).toData();
  expect(FLIGHT_DATA_LOCATION.test(data.location) || inLocationGrammar(data), data.location).toBe(true);
  expect(data.reason).toMatch(/^[ -~]{1,512}$/);
  expect(namesPrivateDetail(data.reason), data.reason).toBe(false);
  expect(JSON.stringify({ ...data, location: '' })).not.toMatch(hidden);
  return { code: data.code, location: data.location, limit: data.limit };
}

// The production structure: the RENS, EXIC, EXPL, ANIM and NEBC entries at the production IDs, with made-up content.

/** The SND entry each blast sound Asset maps to in the audio table. */
const BLAST_ENTRIES = ['blast-v1', 'blast-v2', 'blast-v3', 'blast-v4'].map(name =>
  archiveLocator(PRODUCTION_SOUND_TABLE.find(({ mapping }) => mapping.asset.id === `sound/explosion/${name}`)!.mapping.parts[0].alternatives[0]).entry.id);
/** The made-up blast variant of each EXPL in animation number order, every variant used. */
const blastOf = (animation: number): number => (animation * 3) % 4;

/** The EXIC lists at the production structure: lists 1 and 2 of 7 EXPL and list 3 of 3 (textures §7). */
export const PRODUCTION_LISTS: readonly (readonly number[])[] = [
  PRODUCTION_EXPLOSION_RECORDS.slice(0, 7), PRODUCTION_EXPLOSION_RECORDS.slice(7, 14), PRODUCTION_EXPLOSION_RECORDS.slice(14),
];

/**
 * The production scene settings: other values than the small set's, inside what the flight renderer draws a run with
 * (docs/original/formats/executable.md): device values ordered as the shipped data's (+0x1C < +0x20 < +0x24, PV4), a
 * directional light of intensity in (0, 1] and a non-negative ambient level (the single-light path, LS2), and flash
 * levels 0–63 with finite, non-zero durations (SF4).
 */
export const PRODUCTION_SCENE: SceneSettings = {
  ...SYNTHETIC_SCENE,
  lightType3Colour: [0.75, 0.625, Math.fround(0.9)],
  lightType0Colour: [0.25, Math.fround(0.3), 0.125],
  deviceByte: 0x81,
  deviceValues: { base: 600, kinds1c7c: 1200, kindsF8000: 4000 },
  screenFlashes: [
    { randomMask: 0x0f, duration: 0.5, drawIntervalTicks: 2, level: 40 },
    { randomMask: 0x07, duration: 0.75, drawIntervalTicks: 3, level: 63 },
    { randomMask: 0xffff_fffe, duration: Math.fround(1.6), drawIntervalTicks: 1, level: 24 },
  ],
};

/**
 * The production RENS entry for the effect step and this step: the effect tests' records after a header of `settings`.
 */
export function productionRensEntry(settings: SceneSettings = PRODUCTION_SCENE): SyntheticEntry {
  const entry = syntheticRensEntry();
  const data = entry.data.slice();
  data.set(rensHeaderBytes(settings));
  return { ...entry, data };
}

/**
 * The SR.NOB entries of the production flight data in ascending ID order, with the flight graphics entries (which this
 * step does not read). `replace` swaps an entry by ID, or omits it when null.
 */
export function productionFlightDataEntries(replace: Readonly<Record<number, SyntheticEntry | null>> = {}): SyntheticEntry[] {
  const entries = [
    productionRensEntry(),
    blockEntry(10_211, 'EXIC', explosionListsBlock(PRODUCTION_LISTS)),
    ...PRODUCTION_EXPLOSION_RECORDS.map((record, animation) =>
      blockEntry(record, 'EXPL', explosionRecordBlock(BLAST_ENTRIES[blastOf(animation)], PRODUCTION_EXPLOSION_ANIMATIONS[animation].entry))),
    blockEntry(10_661, 'NEBC', nebulaListBlock(PRODUCTION_NEBULA_IMAGES)),
    ...productionFlightGraphicsEntries(),
  ];
  return entries
    .map(entry => (Object.hasOwn(replace, entry.id) ? replace[entry.id] : entry))
    .filter((entry): entry is SyntheticEntry => entry !== null)
    .sort((left, right) => left.id - right.id);
}

export const productionFlightDataFiles = (replace: Readonly<Record<number, SyntheticEntry | null>> = {}): Record<string, Uint8Array> =>
  ({ [FLIGHT_DATA_ARCHIVE]: buildImfat(10_000, productionFlightDataEntries(replace)) });

/** The payload of each production flight data Asset on `productionFlightDataEntries()`. */
export const PRODUCTION_FLIGHT_PAYLOADS: ReadonlyMap<string, FlightDataPayload> = new Map([
  ['data/scene-settings', readFlightDataContent('scene-settings', PRODUCTION_SCENE)],
  ['data/explosions', readFlightDataContent('explosion-table', {
    lists: PRODUCTION_LISTS.map(list => list.map(record => {
      const animation = PRODUCTION_EXPLOSION_RECORDS.indexOf(record);
      return { sound: sound(`sound/explosion/blast-v${blastOf(animation) + 1}`), animation: data(explosionAnimationId(animation)) };
    })),
  })],
  ...PRODUCTION_EXPLOSION_ANIMATIONS.map(({ frames }, animation) => [explosionAnimationId(animation), readFlightDataContent('explosion-animation', {
    frames: Array.from({ length: frames }, (_, frame) => image(explosionFrameImageId(animation, frame))),
  })] as const),
  ['data/nebula-backgrounds', readFlightDataContent('nebula-backgrounds', { images: PRODUCTION_NEBULA_IMAGES.map((_, index) => image(nebulaImageId(index))) })],
]);

/** The production step's usage on `productionFlightDataEntries()`, from the expected payloads alone. */
export const PRODUCTION_FLIGHT_DATA_USAGE: BudgetRecord = flightDataUsage(PRODUCTION_FLIGHT_PAYLOADS);
