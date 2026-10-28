import { openAsBlob } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AssetDescriptor, ResourceGroup } from '../src/content/asset-contract.ts';
import { BUDGET_DIMENSIONS, type BudgetRecord } from '../src/content/budget.ts';
import { validatePackage, type GroupInput, type PackageCompletenessResult } from '../src/content/completeness.ts';
import { ContentContractError } from '../src/content/contract-validation.ts';
import { FLIGHT_DATA_LIMITS, type FlightDataPayload } from '../src/content/flight/flight-data-content.ts';
import { decodeFlightDataPayload } from '../src/content/flight/flight-data-payload.ts';
import { checkGraphicsBinding } from '../src/content/graphics/graphics-binding.ts';
import { isOpaque, readImagePayload } from '../src/content/graphics/image-payload.ts';
import { readLayoutPayload } from '../src/content/graphics/layout-payload.ts';
import { readPalettePayload } from '../src/content/graphics/palette-payload.ts';
import { decodeHudTextPayload, HUD_TEXT_FORMATS, HUD_TEXT_KEYS, HUD_TEXT_LIMITS } from '../src/content/hud/hud-text-payload.ts';
import {
  checkCockpitInstruments, COCKPIT_INSTRUMENTS_FORMAT, COCKPIT_INSTRUMENTS_LIMITS, decodeCockpitInstrumentsPayload, type InstrumentRecord,
} from '../src/content/hud/instruments-payload.ts';
import { decodeMapGeometryPayload, MAP_GEOMETRY_LIMITS, type MapGeometry } from '../src/content/hud/map-geometry-payload.ts';
import { decodeViewLabelsPayload, VIEW_LABELS_LIMITS } from '../src/content/hud/view-labels-payload.ts';
import { LOGIC_LIMITS, type LogicPayload } from '../src/content/logic/logic-content.ts';
import { decodeLogicPayload } from '../src/content/logic/logic-payload.ts';
import { readGroupManifest, type GroupManifest } from '../src/content/manifest.ts';
import { readPayloadRecords, type PayloadRecord } from '../src/content/payload.ts';
import { AI_PROGRAMS_LIMITS } from '../src/content/rule-data/ai-programs.ts';
import { COMM_MENUS_LIMITS } from '../src/content/rule-data/comm-menus.ts';
import { COMM_MESSAGES_LIMITS } from '../src/content/rule-data/comm-messages.ts';
import { CRAFT_INFO_LIMITS } from '../src/content/rule-data/craft-info.ts';
import { DEBRIS_PARAMETERS_LIMITS } from '../src/content/rule-data/debris-parameters.ts';
import { FLIGHT_MESSAGES_LIMITS } from '../src/content/rule-data/flight-messages.ts';
import { decodeRuleDataPayload, type RuleDataPayload } from '../src/content/rule-data/rule-data-payload.ts';
import { sha256Fingerprint } from '../src/content/sha256.ts';
import { CLASSIC_P2_SLICE } from '../src/content/slice-definition.ts';
import { readSoundPayload, SOUND_PAYLOAD_SCHEMA_VERSION } from '../src/content/sound-payload.ts';
import { CoreInputError } from '../src/core/errors.ts';
import { loadMission } from '../src/core/mission/load-mission.ts';
import { openImfatArchive } from '../src/original-data/archive/archive-reader.ts';
import { DiscReadError } from '../src/original-data/disc/disc-error.ts';
import { openDiscImage } from '../src/original-data/disc/disc-image.ts';
import { SourceError } from '../src/original-data/source-error.ts';
import { identifySource } from '../src/original-data/source/identify-source.ts';
import { BlobByteSource } from '../src/platform/files/blob-byte-source.ts';
import type { ImportJob, ImportReporter } from '../src/workers/import-host.ts';
import { createImportJob, type OpenSource } from '../src/workers/import-job.ts';
import { IMPORT_STAGES, type ImportFile, type ImportStage } from '../src/workers/import-protocol.ts';
import { PRODUCTION_PACKAGE } from '../src/workers/production-package.ts';

// Local package check (P3-03 S-16, AC-19): runs the production import job the Worker runs on a CloneCD file set,
// validates the whole package against the slice definition, decodes every Asset of the roles P3-03 added or extended with
// its role's reader and loads the mission in Core. The P3-09 map geometry is also compared with an independent read of
// its source record (`mapGeometrySource`), which shares no code with the converter; so are the CCKD slots of the P3-13
// cockpit instruments (`instrumentSlotsSource`), which are also checked against the package's layouts and map geometry. The P3-08 keyword tables of
// `ai-programs` are reported as counts and a digest (`keywordTablesDigest`) for comparison with an independent local read.
// Output holds only verdicts, Asset IDs, counts, limits, read amounts and hashes: never names, texts, field values,
// pixels, samples, host paths or host error text.

export interface PackageCheckOptions {
  /** A synthetic whitelist for tests; otherwise the product entry identifies the source. */
  readonly catalog?: unknown;
  /** Replaces the production job, which `catalog` would otherwise configure; only tests pass it. */
  readonly job?: ImportJob;
}

export interface PackageCheckFailure {
  readonly code: string;
  readonly location: string;
}

/** A structural observation of the canonical data, or a package budget usage, and the limit it must stay within. */
export interface LimitCheck {
  readonly name: string;
  readonly observed: number;
  readonly limit: number;
}

/** The Assets of one role, decoded with the role's reader. */
export interface RoleReport {
  readonly role: string;
  readonly group: ResourceGroup;
  readonly assets: number;
  readonly payloadBytes: number;
  /** `sha256:` of the role's `<Asset ID> <payload fingerprint>` lines in Asset ID order. */
  readonly digest: string;
  /** Records, frames, texts, sounds and pixels; never a value. */
  readonly counts: Readonly<Record<string, number>>;
  /** `sha256:` digests of parts of the content that an independent read can compare, by name; only roles that have them. */
  readonly digests?: Readonly<Record<string, string>>;
}

export interface GroupReport {
  readonly group: ResourceGroup;
  readonly assets: number;
  readonly dependencyEdges: number;
  readonly payloadBytes: number;
  /** As `RoleReport.digest`, over every Asset of the group. */
  readonly digest: string;
}

export interface PackageCheckReport {
  readonly format: 'osr-package-check';
  readonly version: 1;
  readonly passed: boolean;
  /** The first failure that ended the check, if any. */
  readonly error: PackageCheckFailure | null;
  readonly identity: { readonly versionId: string; readonly fingerprint: string } | null;
  readonly package: {
    readonly status: 'complete';
    readonly sliceDefinitionVersion: number;
    readonly converterVersion: string;
    readonly manifestIdentity: string;
    readonly groups: readonly GroupReport[];
  } | null;
  readonly roles: readonly RoleReport[];
  readonly limits: readonly LimitCheck[];
  /** Bytes read by each stage (its last progress less the bytes read when it started) and in total. */
  readonly reads: Readonly<Record<ImportStage | 'total', number>>;
}

class CheckStop extends Error {
  readonly failure: PackageCheckFailure;

  constructor(code: string, location: string) {
    super(`${location}: ${code}`);
    this.failure = { code, location };
  }
}

/** The input of a file set at `index` could not be opened. */
export class InputReadError extends Error {
  readonly index: number;

  constructor(index: number) {
    super(`input[${index}] could not be opened`);
    this.name = 'InputReadError';
    this.index = index;
  }
}

/** The failure an error stands for, by code and structural position only. */
function failureOf(cause: unknown): PackageCheckFailure {
  if (cause instanceof CheckStop) return cause.failure;
  if (cause instanceof InputReadError) return { code: 'read-failed', location: `input[${cause.index}]` };
  if (cause instanceof DiscReadError || cause instanceof SourceError) return { code: cause.code, location: cause.location };
  if (cause instanceof ContentContractError) return { code: cause.code, location: cause.path };
  if (cause instanceof CoreInputError) return { code: 'core-input', location: cause.path };
  // Anything else may carry host paths in its text.
  return { code: 'internal-error', location: 'check' };
}

/** One Asset of the package with its payload bytes. */
interface PackageAsset {
  readonly descriptor: AssetDescriptor;
  readonly bytes: Uint8Array;
}

/** What one Asset's payload contributes: counts are summed over a role, limit observations take the largest. */
interface Measured {
  readonly counts: Readonly<Record<string, number>>;
  readonly limits: readonly LimitCheck[];
  readonly digests?: Readonly<Record<string, string>>;
}

/**
 * What a measure may consult besides its Asset: other Assets by ID or role, and the map geometry and the cockpit
 * instruments' slots read independently from the disc.
 */
interface MeasureContext {
  readonly find: (id: string) => PackageAsset;
  readonly roleAssets: (role: string) => readonly PackageAsset[];
  readonly mapGeometrySource: () => Promise<MapGeometry>;
  readonly instrumentSlotsSource: () => Promise<readonly InstrumentSlotSource[]>;
}

type Measure = (asset: PackageAsset, context: MeasureContext) => Measured | Promise<Measured>;

const sum = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0);
const largest = (values: readonly number[]): number => values.reduce((most, value) => Math.max(most, value), 0);
const limit = (name: string, observed: number, bound: number): LimitCheck => ({ name, observed, limit: bound });
/** Opaque pixels of an image payload's mask, as the image payload defines them. */
function opaquePixels({ width, height, mask }: { readonly width: number; readonly height: number; readonly mask: Uint8Array | null }): number {
  let count = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) count += Number(isOpaque(mask, width, x, y));
  return count;
}

const digestOf = (assets: readonly AssetDescriptor[]): string =>
  sha256Fingerprint(new TextEncoder().encode(assets.map(({ id, payloadIdentity }) => `${id} ${payloadIdentity.fingerprint}\n`).join('')));

/** The content of a payload of `role` R. */
type ContentOf<P extends { readonly role: string; readonly content: unknown }, R extends P['role']> = Extract<P, { readonly role: R }>['content'];

/** A canonical JSON payload decoded by its family's reader; its byte length is checked against the family's limit. */
function decoded<P extends { readonly role: string; readonly content: unknown }>(
  decode: (bytes: Uint8Array, descriptor: AssetDescriptor) => P, payloadBytes: number,
) {
  return <R extends P['role']>(role: R, measure: (content: ContentOf<P, R>) => Measured): Measure => ({ descriptor, bytes }) => {
    const payload = decode(bytes, descriptor);
    if (payload.role !== role) throw new CheckStop('role-mismatch', `roles.${role}`);
    const { counts, limits, digests } = measure(payload.content as ContentOf<P, R>);
    return { counts, limits: [...limits, limit(`${role}.payloadBytes`, bytes.length, payloadBytes)], ...(digests && { digests }) };
  };
}

const ruleData = decoded<RuleDataPayload>(decodeRuleDataPayload, LOGIC_LIMITS.payloadBytes);

/**
 * `sha256:` of the keyword tables as lines `<table> <pair> <i32 value> <name bytes in hex>` in table and pair order, the
 * form an independent read of the executable regions can reproduce without printing a name or a value.
 */
export function keywordTablesDigest(tables: readonly (readonly { readonly name: string; readonly value: number }[])[]): string {
  const hex = (name: string) => Array.from(name, character => character.charCodeAt(0).toString(16).padStart(2, '0')).join('');
  return sha256Fingerprint(new TextEncoder().encode(tables.flatMap((pairs, table) => pairs.map(({ name, value }, index) => `${table} ${index} ${value} ${hex(name)}\n`)).join('')));
}
const flightData = decoded<FlightDataPayload>(decodeFlightDataPayload, FLIGHT_DATA_LIMITS.payloadBytes);

/**
 * Pixel counts of an image, and the palette entries of its own palette when `withPalette` is set. Each graphics payload's
 * descriptor dependencies must be exactly the palettes it references, which package validation does not check.
 */
function image(withPalette = false): Measure {
  return ({ descriptor, bytes }, { find }) => {
    const payload = readImagePayload(bytes, descriptor.payloadIdentity.schemaVersion);
    checkGraphicsBinding(descriptor, payload, `assets.${descriptor.id}`);
    const counts: Record<string, number> = { pixels: payload.width * payload.height, opaquePixels: opaquePixels(payload) };
    if (withPalette) {
      const { descriptor: paletteDescriptor, bytes: paletteBytes } = find(payload.palette);
      const palettePayload = readPalettePayload(paletteBytes, paletteDescriptor.payloadIdentity.schemaVersion);
      checkGraphicsBinding(paletteDescriptor, palettePayload, `assets.${paletteDescriptor.id}`);
      counts.paletteEntries = palettePayload.entries.length / 3;
    }
    return { counts, limits: [] };
  };
}

/** A sound payload references no Asset, so its descriptor has no dependencies. */
const sound: Measure = ({ descriptor, bytes }) => {
  if (descriptor.payloadIdentity.schemaVersion !== SOUND_PAYLOAD_SCHEMA_VERSION) throw new CheckStop('unsupported-payload-schema', `assets.${descriptor.id}`);
  if (descriptor.dependencies.length !== 0) throw new CheckStop('binding-mismatch', `assets.${descriptor.id}.dependencies`);
  const { frames, loop } = readSoundPayload(bytes);
  return { counts: { frames, none: Number(loop === 'none'), whole: Number(loop === 'whole'), repeat: Number(loop === 'repeat') }, limits: [] };
};

/**
 * The roles P3-03 added, with the mission it extended, the map geometry P3-09 added and the cockpit instruments P3-13
 * added, in group order: required roles and the roles their dependencies close over. The target display's palette is an Asset of a P2 role, read through its
 * image.
 */
const ROLES: readonly { readonly role: string; readonly group: ResourceGroup; readonly measure: Measure }[] = [
  { role: 'craft-info', group: 'logic', measure: ruleData('craft-info', info => {
    const names = [...info.guns, ...info.missiles].map(({ name }) => name).concat(info.craft.flatMap(({ at00, name }) => [at00, name]));
    const mountLists = info.craft.flatMap(({ mountLists: lists }) => lists.map(list => list.length));
    const mounts = info.craft.map(craft => craft.mounts.length);
    const boxes = info.craft.map(craft => craft.collision.boxes.length);
    const pairs = info.craft.map(craft => craft.pairs.length);
    return {
      counts: {
        guns: info.guns.length, missiles: info.missiles.length, craft: info.craft.length, missileBodies: info.missileBodies.length,
        mounts: sum(mounts), boxes: sum(boxes), pairs: sum(pairs), mountListEntries: sum(mountLists), texts: names.length, textBytes: sum(names.map(text => text.length)),
      },
      limits: [
        limit('craft-info.guns', info.guns.length, CRAFT_INFO_LIMITS.guns),
        limit('craft-info.missiles', info.missiles.length, CRAFT_INFO_LIMITS.missiles),
        limit('craft-info.missileBodies', info.missileBodies.length, CRAFT_INFO_LIMITS.missileBodies),
        limit('craft-info.mounts', largest(mounts), CRAFT_INFO_LIMITS.mounts),
        limit('craft-info.boxes', largest(boxes), CRAFT_INFO_LIMITS.boxes),
        limit('craft-info.mountListEntries', largest(mountLists), CRAFT_INFO_LIMITS.mountListEntries),
        limit('craft-info.pairs', largest(pairs), CRAFT_INFO_LIMITS.pairs),
        limit('craft-info.nameBytes', largest(names.map(text => text.length)), CRAFT_INFO_LIMITS.nameBytes),
      ],
    };
  }) },
  { role: 'debris-parameters', group: 'logic', measure: ruleData('debris-parameters', ({ byCraftType }) => {
    const records = byCraftType.flat();
    const boxes = records.map(({ collision }) => collision.boxes.length);
    return {
      counts: { craftTypes: byCraftType.length, records: records.length, boxes: sum(boxes) },
      limits: [
        limit('debris-parameters.records', largest(byCraftType.map(list => list.length)), DEBRIS_PARAMETERS_LIMITS.records),
        limit('debris-parameters.boxes', largest(boxes), DEBRIS_PARAMETERS_LIMITS.boxes),
      ],
    };
  }) },
  { role: 'ai-programs', group: 'logic', measure: ruleData('ai-programs', ai => {
    const scripts = ai.entries.flatMap(entry => (entry.kind === 'script' ? [entry.items] : []));
    const stateLists = ai.entries.flatMap(entry => (entry.kind === 'parameters' ? Object.values(entry.stateScripts) : []));
    const names = [...ai.programs, ...ai.builtInPrograms].map(({ name }) => name.length);
    const argumentBytes = scripts.flat().flatMap(({ argument }) => (argument === null ? [] : [argument.length]));
    const keywordNames = [...new Set(ai.keywordTables.flat().map(({ name }) => name))].map(name => name.length);
    const keywordPairs = ai.keywordTables.map(table => table.length);
    return {
      counts: {
        programs: ai.programs.length, builtInPrograms: ai.builtInPrograms.length, entries: ai.entries.length,
        parameterEntries: ai.entries.length - scripts.length, scriptEntries: scripts.length, scriptItems: sum(scripts.map(items => items.length)),
        globalElements: ai.globals.elements.length, texts: names.length + argumentBytes.length, textBytes: sum([...names, ...argumentBytes]),
        ...Object.fromEntries(keywordPairs.map((pairs, table) => [`keywordPairs${table}`, pairs])),
        keywordNames: keywordNames.length, keywordNameBytes: sum(keywordNames.map(length => length + 1)),
      },
      digests: { keywordTables: keywordTablesDigest(ai.keywordTables) },
      limits: [
        limit('ai-programs.programRecords', largest([ai.programs.length, ai.builtInPrograms.length]), AI_PROGRAMS_LIMITS.programRecords),
        limit('ai-programs.programNameBytes', largest(names), AI_PROGRAMS_LIMITS.programNameBytes),
        limit('ai-programs.globalElements', ai.globals.elements.length, AI_PROGRAMS_LIMITS.globalElements),
        limit('ai-programs.entries', ai.entries.length, AI_PROGRAMS_LIMITS.entries),
        limit('ai-programs.stateScriptItems', largest(stateLists.map(list => list.length)), AI_PROGRAMS_LIMITS.stateScriptItems),
        limit('ai-programs.scriptItems', largest(scripts.map(items => items.length)), AI_PROGRAMS_LIMITS.scriptItems),
        limit('ai-programs.scriptTextBytes', largest(argumentBytes), AI_PROGRAMS_LIMITS.scriptTextBytes),
        limit('ai-programs.keywordEntries', largest(keywordPairs), AI_PROGRAMS_LIMITS.keywordEntries),
        limit('ai-programs.keywordNameBytes', largest(keywordNames), AI_PROGRAMS_LIMITS.keywordNameBytes),
      ],
    };
  }) },
  { role: 'comm-menus', group: 'logic', measure: ruleData('comm-menus', menus => {
    const lists = [menus.gatedTargetCommands, menus.otherTargetCommands, menus.categories, menus.kind2TargetCommands];
    const texts = [...lists.flat().map(({ text }) => text), menus.objectListLastEntry].map(text => text.length);
    return {
      counts: { menus: lists.length + 1, items: sum(lists.map(list => list.length)) + 1, texts: texts.length, textBytes: sum(texts) },
      limits: [
        limit('comm-menus.items', largest(lists.map(list => list.length)), COMM_MENUS_LIMITS.items),
        limit('comm-menus.textBytes', largest(texts), COMM_MENUS_LIMITS.textBytes),
      ],
    };
  }) },
  { role: 'base-repair-items', group: 'logic', measure: ruleData('base-repair-items', ({ subsystemSelectors }) => ({ counts: { selectors: subsystemSelectors.length }, limits: [] })) },
  { role: 'flight-messages', group: 'logic', measure: ruleData('flight-messages', messages => {
    const texts = Object.values(messages).map(text => text.length);
    return { counts: { texts: texts.length, textBytes: sum(texts) }, limits: [limit('flight-messages.textBytes', largest(texts), FLIGHT_MESSAGES_LIMITS.textBytes)] };
  }) },
  { role: 'comm-messages', group: 'logic', measure: ruleData('comm-messages', ({ faceTables, direct, names2001, names2011 }) => {
    // Face tables 20011, 20019 and 20985 in content order, then the direct list 20983 (executable.md RQ4).
    const [first, second, third] = faceTables.map(table => ({ faces: table.length, messages: sum(table.map(sub => sub.length)) }));
    const messages = [...faceTables.flat(2), ...direct];
    const frames = messages.flatMap(item => (item.present ? [item.frameDurations.length] : []));
    const names = [...names2001, ...names2011].map(name => name.length);
    return {
      counts: {
        faces20011: first.faces, messages20011: first.messages, faces20019: second.faces, messages20019: second.messages,
        faces20985: third.faces, messages20985: third.messages, messages20983: direct.length, present: frames.length, frames: sum(frames),
        names2001: names2001.length, names2011: names2011.length, nameBytes: sum(names),
      },
      limits: [
        limit('comm-messages.faces', largest(faceTables.map(table => table.length)), COMM_MESSAGES_LIMITS.faces),
        limit('comm-messages.faceMessages', largest(faceTables.flat().map(sub => sub.length)), COMM_MESSAGES_LIMITS.faceMessages),
        limit('comm-messages.directMessages', direct.length, COMM_MESSAGES_LIMITS.directMessages),
        limit('comm-messages.frames', largest(frames), COMM_MESSAGES_LIMITS.frames),
        limit('comm-messages.names', largest([names2001.length, names2011.length]), COMM_MESSAGES_LIMITS.names),
        limit('comm-messages.nameBytes', largest(names), COMM_MESSAGES_LIMITS.nameBytes),
      ],
    };
  }) },
  { role: 'scene-settings', group: 'models', measure: flightData('scene-settings', ({ screenFlashes }) => ({ counts: { screenFlashes: screenFlashes.length }, limits: [] })) },
  { role: 'explosion-table', group: 'models', measure: flightData('explosion-table', ({ lists }) => ({
    counts: { lists: lists.length, entries: sum(lists.map(list => list.length)) },
    limits: [limit('explosion-table.listItems', largest(lists.map(list => list.length)), FLIGHT_DATA_LIMITS.explosionListItems)],
  })) },
  { role: 'explosion-animation', group: 'models', measure: flightData('explosion-animation', ({ frames }) => ({
    counts: { frames: frames.length }, limits: [limit('explosion-animation.frames', frames.length, FLIGHT_DATA_LIMITS.animationFrames)],
  })) },
  { role: 'explosion-frame', group: 'models', measure: image() },
  { role: 'nebula-backgrounds', group: 'models', measure: flightData('nebula-backgrounds', ({ images }) => ({
    counts: { images: images.length }, limits: [limit('nebula-backgrounds.images', images.length, FLIGHT_DATA_LIMITS.nebulaImages)],
  })) },
  { role: 'nebula-background', group: 'models', measure: image() },
  { role: 'hit-shimmer', group: 'models', measure: image() },
  { role: 'target-display', group: 'cockpit-hud-map', measure: image(true) },
  { role: 'view-labels', group: 'cockpit-hud-map', measure: ({ descriptor, bytes }) => {
    const texts = decodeViewLabelsPayload(bytes, descriptor).labels.map(({ text }) => text.length);
    return {
      counts: { labels: texts.length, textBytes: sum(texts) },
      limits: [limit('view-labels.textBytes', largest(texts), VIEW_LABELS_LIMITS.textBytes), limit('view-labels.payloadBytes', bytes.length, VIEW_LABELS_LIMITS.payloadBytes)],
    };
  } },
  { role: 'hud-text', group: 'cockpit-hud-map', measure: ({ descriptor, bytes }) => {
    const { entries } = decodeHudTextPayload(bytes, descriptor);
    const texts = HUD_TEXT_KEYS.map(key => entries[key].length);
    return {
      counts: { texts: texts.length, formatted: HUD_TEXT_KEYS.filter(key => HUD_TEXT_FORMATS[key] !== null).length, textBytes: sum(texts) },
      limits: [limit('hud-text.textBytes', largest(texts), HUD_TEXT_LIMITS.textBytes), limit('hud-text.payloadBytes', bytes.length, HUD_TEXT_LIMITS.payloadBytes)],
    };
  } },
  { role: 'map-geometry', group: 'cockpit-hud-map', measure: async ({ descriptor, bytes }, { mapGeometrySource }) => {
    // Both are plain records built in the schema's field order.
    const decoded = decodeMapGeometryPayload(bytes, descriptor);
    if (JSON.stringify(decoded) !== JSON.stringify(await mapGeometrySource())) throw new CheckStop('source-mismatch', 'roles.map-geometry');
    return { counts: { sourceMatches: 1 }, limits: [limit('map-geometry.payloadBytes', bytes.length, MAP_GEOMETRY_LIMITS.payloadBytes)] };
  } },
  { role: 'cockpit-instruments', group: 'cockpit-hud-map', measure: async ({ descriptor, bytes }, { find, roleAssets, instrumentSlotsSource }) => {
    const instruments = decodeCockpitInstrumentsPayload(bytes, descriptor);
    const layout = (id: string) => {
      const { descriptor: layoutDescriptor, bytes: layoutBytes } = find(id);
      return readLayoutPayload(layoutBytes, layoutDescriptor.payloadIdentity.schemaVersion);
    };
    const [front, map] = instruments.slots;
    const [geometry] = roleAssets('map-geometry');
    if (!geometry) throw new CheckStop('missing-asset', 'roles.map-geometry');
    checkCockpitInstruments(instruments, { front: layout(front.layout!), mapFrame: layout(map.layout!), mapGeometry: decodeMapGeometryPayload(geometry.bytes, geometry.descriptor) });
    // Both are plain records built in the schema's field order.
    const slots = instruments.slots.map(({ slot, alwaysRedraw, elements, instruments: records }) =>
      ({ slot, alwaysRedraw, elements: elements.map(({ pass, everyFrame }) => ({ pass, everyFrame })), instruments: records }));
    if (JSON.stringify(slots) !== JSON.stringify(await instrumentSlotsSource())) throw new CheckStop('source-mismatch', 'roles.cockpit-instruments');
    const elements = instruments.slots.flatMap(slot => slot.elements);
    const records = instruments.slots.map(slot => slot.instruments.length);
    const params = instruments.slots.flatMap(slot => slot.instruments.map(record => record.params.length));
    return {
      counts: {
        slots: instruments.slots.length, alwaysRedrawSlots: instruments.slots.filter(slot => slot.alwaysRedraw).length, elements: elements.length,
        passOneElements: elements.filter(({ pass }) => pass === 1).length, everyFrameElements: elements.filter(({ everyFrame }) => everyFrame).length,
        records: sum(records), parameterTables: params.filter(count => count > 0).length, params: sum(params),
        viewDistances: instruments.targetViewDistances.length, sourceMatches: 1,
      },
      limits: [
        limit('cockpit-instruments.recordsPerSlot', largest(records), COCKPIT_INSTRUMENTS_LIMITS.recordsPerSlot),
        limit('cockpit-instruments.params', largest(params), COCKPIT_INSTRUMENTS_LIMITS.params),
        limit('cockpit-instruments.payloadBytes', bytes.length, COCKPIT_INSTRUMENTS_LIMITS.payloadBytes),
      ],
    };
  } },
  { role: 'event-sound', group: 'audio', measure: sound },
  { role: 'hud-sound', group: 'audio', measure: sound },
];

/**
 * The CCKD sources of the map geometry and the cockpit instruments as recorded in docs/original/formats/cockpit.md
 * (group directory, element, instrument types per slot and instrument records) and hud.md §1, read here without the
 * converter's readers: CCKD 10103 of `MAIN/SR.NOB`, the directory slots by layout number (+0x00), and font table 1.
 * Counts are checked against their caps and arrays against the entry before anything is iterated; any structure that
 * does not hold is `source-unreadable` at the role, without values.
 */
const COCKPIT_SOURCE = Object.freeze({
  archive: 'MAIN/SR.NOB', entry: 10_103, type: 'CCKD', mapLayout: 6, mapInstrumentType: 10, font: 1,
  /**
   * Counts beyond the approved caps are not read: 8 directory slots, 16 elements and 32 instrument records per slot, 4
   * parameters per record.
   */
  slots: 8, elements: 16, instruments: 32, params: 4,
});

/** A cockpit instruments slot as an independent read gives it: the payload slot without its images. */
interface InstrumentSlotSource {
  readonly slot: number;
  readonly alwaysRedraw: boolean;
  readonly elements: readonly { readonly pass: number; readonly everyFrame: boolean }[];
  readonly instruments: readonly InstrumentRecord[];
}

/** Word reads of the independently read CCKD entry, failing as `source-unreadable` at `role`. */
function cockpitReader(bytes: Uint8Array, role: string) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const unreadable = (): never => { throw new CheckStop('source-unreadable', `roles.${role}`); };
  const word = (offset: number, signed = false): number => {
    if (offset < 0 || offset + 4 > bytes.length) unreadable();
    return signed ? view.getInt32(offset, true) : view.getUint32(offset, true);
  };
  /** The offsets of the `count` items of `size` bytes from `start`, after the count and the array are checked. */
  const items = (start: number, count: number, cap: number, size: number): number[] => {
    if (count > cap || start + count * size > bytes.length) unreadable();
    return Array.from({ length: count }, (_, index) => start + index * size);
  };
  /** The directory index and offset of the one slot of layout number `layout`. */
  const slotOf = (layout: number): { readonly slot: number; readonly at: number } => {
    const directory = items(word(8), word(12), COCKPIT_SOURCE.slots, 32);
    const slots = directory.filter(at => word(at, true) === layout);
    if (slots.length !== 1) unreadable();
    return { slot: directory.indexOf(slots[0]), at: slots[0] };
  };
  const records = (at: number): number[] => items(word(at + 0x18), word(at + 0x1c), COCKPIT_SOURCE.instruments, 48);
  const rectangle = (record: number) => ({ x0: word(record + 4, true), y0: word(record + 8, true), x1: word(record + 12, true), y1: word(record + 16, true) });
  return { bytes, word, items, slotOf, records, rectangle, unreadable };
}

async function readCockpitSource(files: readonly ImportFile[]): Promise<Uint8Array> {
  const disc = await openDiscImage(files.map(({ name, blob }) => ({ name, source: new BlobByteSource(blob) })));
  const archive = await openImfatArchive(await disc.openFile(COCKPIT_SOURCE.archive));
  return (await archive.read(COCKPIT_SOURCE.entry, COCKPIT_SOURCE.type)).bytes;
}

/** The map geometry: the one type-10 record of the layout-6 slot (rectangle +0x04–+0x10, interval +0x18) and font 1's height byte (+3). */
function mapGeometrySource(entry: Uint8Array): MapGeometry {
  const { bytes, word, slotOf, records, rectangle, unreadable } = cockpitReader(entry, 'map-geometry');
  const fontEntry = word(0) + COCKPIT_SOURCE.font * 8;
  if (COCKPIT_SOURCE.font >= word(4)) unreadable();
  const fontAt = word(fontEntry);
  if (word(fontEntry + 4) < 4 || fontAt + 4 > bytes.length) unreadable();
  const matching = records(slotOf(COCKPIT_SOURCE.mapLayout).at).filter(at => word(at) === COCKPIT_SOURCE.mapInstrumentType);
  if (matching.length !== 1) unreadable();
  const [record] = matching;
  return { rectangle: rectangle(record), redrawInterval: word(record + 0x18), informationLineHeight: bytes[fontAt + 3] };
}

/**
 * The cockpit instruments' slots of the layout numbers of `COCKPIT_INSTRUMENTS_FORMAT`: each slot's directory index and
 * +0x0C; its elements' +44 and +48; and its records' type, rectangle, interval (+0x18), +0x14 and the i32 table +0x24
 * points to with +0x28 entries, null when there are none.
 */
function instrumentSlotsSource(entry: Uint8Array): InstrumentSlotSource[] {
  const { word, items, slotOf, records, rectangle, unreadable } = cockpitReader(entry, 'cockpit-instruments');
  return COCKPIT_INSTRUMENTS_FORMAT.slots.map(({ layoutNumber }) => {
    const { slot, at } = slotOf(layoutNumber);
    const elementCount = word(at + 0x14);
    const elements = elementCount === 0 ? [] : items(word(at + 0x10), elementCount, COCKPIT_SOURCE.elements, 52);
    return {
      slot,
      alwaysRedraw: word(at + 0x0c) !== 0,
      elements: elements.map(element => ({ pass: word(element + 44), everyFrame: word(element + 48) !== 0 })),
      instruments: records(at).map(record => {
        const [table, count] = [word(record + 0x24), word(record + 0x28)];
        if ((table === 0) !== (count === 0)) unreadable();
        return {
          type: word(record) as InstrumentRecord['type'], rectangle: rectangle(record), redrawInterval: word(record + 0x18), drawParam: word(record + 0x14),
          params: count === 0 ? [] : items(table, count, COCKPIT_SOURCE.params, 4).map(param => word(param, true)),
        };
      }),
    };
  });
}

/** Adds the counts of each Asset and keeps the largest observation of each limit, in first-seen order. */
function combine(measured: readonly Measured[]): Measured {
  const counts: Record<string, number> = {};
  const limits = new Map<string, LimitCheck>();
  const digests: Record<string, string> = {};
  for (const item of measured) {
    for (const [name, value] of Object.entries(item.counts)) counts[name] = (counts[name] ?? 0) + value;
    // Only single-Asset roles report digests.
    Object.assign(digests, item.digests);
    for (const check of item.limits) {
      const seen = limits.get(check.name);
      if (!seen || check.observed > seen.observed) limits.set(check.name, check);
    }
  }
  return { counts, limits: [...limits.values()], ...(Object.keys(digests).length > 0 && { digests }) };
}

/** A role's report from its Assets, their summed counts and their digests, if any. */
function roleReport(
  role: string, group: ResourceGroup, members: readonly PackageAsset[], counts: Readonly<Record<string, number>>, digests?: Readonly<Record<string, string>>,
): RoleReport {
  const descriptors = members.map(({ descriptor }) => descriptor);
  return {
    role, group, assets: members.length, payloadBytes: sum(descriptors.map(({ payloadIdentity }) => payloadIdentity.byteLength)), digest: digestOf(descriptors), counts,
    ...(digests && { digests }),
  };
}

/** The only Asset of logic role `role`, decoded with the logic payload reader. */
function logicAsset<R extends LogicPayload['role']>(members: readonly PackageAsset[], role: R) {
  if (members.length !== 1) throw new CheckStop('missing-asset', `roles.${role}`);
  const [{ descriptor, bytes }] = members;
  const payload = decodeLogicPayload(bytes, descriptor);
  if (payload.role !== role) throw new CheckStop('role-mismatch', `roles.${role}`);
  return { id: descriptor.id, content: payload.content as ContentOf<LogicPayload, R> };
}

/** Loads the mission in Core from the decoded logic Assets; reports the mission and the event trigger counts and limits P3-03 added. */
function checkMission(roleAssets: (role: string) => readonly PackageAsset[]): { readonly report: RoleReport; readonly limits: readonly LimitCheck[] } {
  const members = roleAssets('mission');
  const mission = logicAsset(members, 'mission');
  loadMission({ mission, craftTypes: logicAsset(roleAssets('craft-types'), 'craft-types'), wingmanRoster: logicAsset(roleAssets('wingman-roster'), 'wingman-roster') });
  const { declarations, eventTriggers } = mission.content;
  const ranges = eventTriggers.flatMap(trigger => trigger.ranges);
  const messages = ranges.flatMap(range => range.messages);
  return {
    report: roleReport('mission', 'logic', members, {
      declarations: declarations.length,
      eventTriggerReferences: declarations.filter(({ eventTrigger }) => eventTrigger !== null).length,
      eventTriggers: eventTriggers.length,
      eventRanges: ranges.length,
      eventMessages: messages.length,
      eventMessageBytes: sum(messages.map(message => message.length)),
    }),
    limits: [
      limit('mission.eventTriggers', eventTriggers.length, LOGIC_LIMITS.eventTriggers),
      limit('mission.eventRanges', largest(eventTriggers.map(trigger => trigger.ranges.length)), LOGIC_LIMITS.eventRanges),
      limit('mission.eventMessages', largest(ranges.map(range => range.messages.length)), LOGIC_LIMITS.eventMessages),
      limit('mission.eventMessageBytes', largest(messages.map(message => message.length)), LOGIC_LIMITS.eventMessageBytes),
    ],
  };
}

/** The package usage of every budget dimension but the source reads, against the production package limits. */
const budgetLimits = (usage: BudgetRecord): LimitCheck[] => BUDGET_DIMENSIONS
  .filter(dimension => dimension !== 'sourceReadBytes')
  .map(dimension => limit(`package.${dimension}`, usage[dimension], PRODUCTION_PACKAGE.limits[dimension]));

/**
 * What a whole-package import gives: the job's usage, every group it sent in send order, their package validation, and
 * the input files, which a check may read again on its own.
 */
export interface ImportedPackage {
  readonly files: readonly ImportFile[];
  readonly usage: BudgetRecord;
  readonly groups: readonly GroupInput[];
  readonly validation: PackageCompletenessResult;
}

/**
 * Runs the production import job the Worker runs, or the job `options` configure for tests, on the CloneCD file set
 * at `paths`, keeps every group it sends and validates them as a whole package against the slice definition. An input
 * that cannot be opened throws InputReadError; the job's own errors pass through unchanged. `report` sees the job's
 * progress and identification. The input Blobs from `fs.openAsBlob` have no close method, so this is meant for
 * one-shot processes.
 */
export async function importPackage(
  paths: readonly string[], options: PackageCheckOptions, report: Omit<ImportReporter, 'group'>,
): Promise<ImportedPackage> {
  const files: ImportFile[] = [];
  for (const [index, path] of paths.entries()) {
    try {
      files.push({ name: basename(path), blob: await openAsBlob(path) });
    } catch {
      throw new InputReadError(index);
    }
  }
  const { catalog } = options;
  const open: OpenSource | undefined = catalog === undefined ? undefined : async inputs => identifySource(await openDiscImage(inputs), catalog);
  const groups: GroupInput[] = [];
  const usage = await (options.job ?? createImportJob(open))(files, {
    progress: (stage, bytes) => { report.progress(stage, bytes); },
    identified: identity => { report.identified(identity); },
    group: (_name, input) => { groups.push(input); },
  });
  return { files, usage, groups, validation: validatePackage(CLASSIC_P2_SLICE, groups) };
}

/**
 * Checks a CloneCD file set with the production import job. The first failure of the job, the package validation, a
 * payload decoding or the Core load ends the check; its report keeps everything gathered before it. As in the logic
 * check, the input Blobs from `fs.openAsBlob` have no close method, so the check is meant for one-shot processes.
 */
export async function runPackageCheck(paths: readonly string[], options: PackageCheckOptions = {}): Promise<PackageCheckReport> {
  let identity: PackageCheckReport['identity'] = null;
  let checkedPackage: PackageCheckReport['package'] = null;
  const roles: RoleReport[] = [];
  const limits: LimitCheck[] = [];
  let error: PackageCheckFailure | null = null;
  const reads = Object.fromEntries([...IMPORT_STAGES, 'total'].map(stage => [stage, 0])) as Record<ImportStage | 'total', number>;
  /** The bytes read when each stage started: a stage reports its first progress with the bytes read so far. */
  const starts: Partial<Record<ImportStage, number>> = {};
  try {
    const { files, usage, groups: sent, validation } = await importPackage(paths, options, {
      progress: (stage, bytes) => {
        starts[stage] ??= bytes;
        reads[stage] = bytes - starts[stage];
        reads.total = bytes;
      },
      identified: ({ versionId, sourceFingerprint }) => { identity = { versionId, fingerprint: sourceFingerprint }; },
    });

    if (validation.status !== 'complete') {
      const [first] = validation.diagnostics;
      throw new CheckStop(first.code, first.path);
    }
    // Validation read every manifest and payload strictly, so their shapes hold from here on.
    const groups = sent.map(({ manifest, payloads }) => ({
      manifest: readGroupManifest(manifest),
      payloads: new Map(readPayloadRecords(payloads).map((record: PayloadRecord) => [record.id as string, record.bytes])),
    }));
    const assets = new Map<string, PackageAsset>();
    const byRole = new Map<string, PackageAsset[]>();
    for (const { manifest, payloads } of groups) {
      for (const descriptor of manifest.assets) {
        const asset = { descriptor, bytes: payloads.get(descriptor.id)! };
        assets.set(descriptor.id, asset);
        byRole.set(descriptor.role, [...byRole.get(descriptor.role) ?? [], asset]);
      }
    }
    const find = (id: string): PackageAsset => assets.get(id) ?? (() => { throw new CheckStop('missing-asset', `assets.${id}`); })();
    const roleAssets = (role: string): readonly PackageAsset[] => byRole.get(role) ?? [];
    let cockpit: Promise<Uint8Array> | undefined;
    const cockpitSource = () => (cockpit ??= readCockpitSource(files));
    const context: MeasureContext = {
      find, roleAssets, mapGeometrySource: async () => mapGeometrySource(await cockpitSource()), instrumentSlotsSource: async () => instrumentSlotsSource(await cockpitSource()),
    };
    const [{ manifest: first }] = groups;
    const groupReport = ({ group, assets: descriptors }: GroupManifest): GroupReport => ({
      group,
      assets: descriptors.length,
      dependencyEdges: sum(descriptors.map(({ dependencies }) => dependencies.length)),
      payloadBytes: sum(descriptors.map(({ payloadIdentity }) => payloadIdentity.byteLength)),
      digest: digestOf(descriptors),
    });
    checkedPackage = {
      status: validation.status,
      sliceDefinitionVersion: first.identity.sliceDefinitionVersion,
      converterVersion: first.identity.converterVersion,
      manifestIdentity: first.identity.manifestIdentity,
      groups: groups.map(({ manifest }) => groupReport(manifest)),
    };

    const mission = checkMission(roleAssets);
    roles.push(mission.report);
    limits.push(...mission.limits);
    for (const { role, group, measure } of ROLES) {
      const members = roleAssets(role);
      if (members.length === 0) throw new CheckStop('missing-asset', `roles.${role}`);
      if (members.some(({ descriptor }) => descriptor.group !== group)) throw new CheckStop('group-mismatch', `roles.${role}`);
      const measured = combine(await Promise.all(members.map(asset => measure(asset, context))));
      roles.push(roleReport(role, group, members, measured.counts, measured.digests));
      limits.push(...measured.limits);
    }
    limits.push(...budgetLimits(usage));
    const over = limits.find(({ observed, limit: bound }) => observed > bound);
    if (over) throw new CheckStop('limit-exceeded', `limits.${over.name}`);
  } catch (cause) {
    error = failureOf(cause);
  }
  return { format: 'osr-package-check', version: 1, passed: error === null, error, identity, package: checkedPackage, roles, limits, reads };
}

const USAGE = 'usage: node tools/package-check.ts <file.ccd> <file.img> [<file.sub>] [<file.cue>]';

/** Runs the CLI: prints one JSON report and returns 0 when the check passed, 1 when it failed, 2 on bad usage. */
export async function main(argv: readonly string[], options: PackageCheckOptions = {}): Promise<number> {
  if (argv.length === 0 || argv.some(argument => argument.startsWith('-'))) {
    console.error(USAGE);
    console.log(JSON.stringify({ format: 'osr-package-check', version: 1, passed: false, error: { code: 'usage', location: 'argv' } }));
    return 2;
  }
  const report = await runPackageCheck(argv.map(file => resolve(file)), options);
  console.log(JSON.stringify(report, null, 2));
  return report.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
