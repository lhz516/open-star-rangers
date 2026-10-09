import { readAssetDescriptor, readAssetReference, readResourceGroup } from '../../content/asset-contract.ts';
import { readAssetId, type AssetId, type AssetKind } from '../../content/asset-id.ts';
import { EMPTY_BUDGET_USAGE, readBudgetRecord } from '../../content/budget.ts';
import { compareText, ContentContractError, fail, readArray, readRecord, requireFields } from '../../content/contract-validation.ts';
import {
  FLIGHT_DATA_LIMITS, FLIGHT_DATA_ROLES, FLIGHT_DATA_SCHEMA_VERSIONS, type ExplosionEntry, type ExplosionTable, type FlightDataPayload,
  type FlightDataRole,
} from '../../content/flight/flight-data-content.ts';
import { encodeFlightDataPayload, flightDataDependencies } from '../../content/flight/flight-data-payload.ts';
import { sha256Fingerprint } from '../../content/sha256.ts';
import type { AssetSourceState } from '../../content/source-state.ts';
import type { ArchiveEntryRead } from '../archive/archive-reader.ts';
import type { DiscPath } from '../disc/disc-path.ts';
import { ANIM_LIMITS, readAnimationFrames } from '../formats/anim.ts';
import { EXPLOSION_LIMITS, parseExplosionLists, parseExplosionRecord } from '../formats/explosion.ts';
import { entryLocation, PayloadBlock, requireEntryBytes } from '../formats/payload-block.ts';
import { parseRensHeader, RENS_HEADER_LIMITS } from '../formats/rens-header.ts';
import { SourceError } from '../source-error.ts';
import {
  archiveLocator, assetSourceStates, isRegionLocator, readSourceMappingTable, type ArchiveEntryLocator, type SourceMapping, type SourceMappingTable,
} from '../source-mapping.ts';
import type { VerifiedSource } from '../source/open-verified-source.ts';
import { verifySourceMappings, type EntryReader } from '../source/verify-source-mappings.ts';
import { chargeConversionBudget, readConversionUsage } from './conversion-budget.ts';
import type { GraphicsStepResult } from './graphics-step.ts';
import { stepEntryReader } from './step-entry-reader.ts';

// The flight data step (docs/plan/p3/03/spec.md, S-09 to S-11, 来源映射与核验): converts the RENS 10751 header, EXIC
// 10211 with its EXPL records, the ANIM frame counts and NEBC 10661 into the four `models` data roles of
// src/content/flight/, and checks the ID chains the data give against the mappings. Images and sounds are other steps'
// Assets: the declarations name them, and their own source mappings tell the step which entries they convert, so the
// chains are checked without reading those entries. Layouts: docs/original/formats/executable.md (RENS header),
// textures.md §6–§7 (ANIM, EXPL) and hud.md §3 (EXIC, NEBC).

/** The subresource of a RENS entry's header +0x00–+0x57, the part `scene-settings` is converted from. */
export const SCENE_SETTINGS_SUBRESOURCE = 'header';

/**
 * Structural limits of NEBC (hud §3; P3-03 spec, 限值与预算). `entryBytes`: the entry, observed 68 bytes (NEBC 10661 in
 * the P3-01/10 entry listing), twice that rounded up to a power of two. `images`: the list, shared with the payload.
 */
export const NEBULA_LIST_LIMITS = Object.freeze({ entryBytes: 256, images: FLIGHT_DATA_LIMITS.nebulaImages });

/** The entry types this step reads, each limited by its directory size before its bytes are read. */
const ENTRY_LIMITS: Readonly<Record<string, number>> = Object.freeze({
  RENS: RENS_HEADER_LIMITS.entryBytes,
  EXIC: EXPLOSION_LIMITS.listEntryBytes,
  EXPL: EXPLOSION_LIMITS.recordBytes,
  ANIM: ANIM_LIMITS.entryBytes,
  NEBC: NEBULA_LIST_LIMITS.entryBytes,
});

/** The flight data step's result has the graphics step's shape: only the `models` group, present when it has Assets. */
export type FlightDataStepResult = GraphicsStepResult;

interface DeclarationOf<Role extends FlightDataRole> {
  readonly asset: { readonly id: AssetId; readonly kind: 'data' };
  readonly role: Role;
  readonly group: 'models';
}

/**
 * One flight data Asset. The Asset ID lists name the Assets its payload references:
 * - `explosion-table`: `animations`, the `explosion-animation` Assets of this step in animation number order, that is in
 *   the order their EXPL first appears in the EXIC lists; `sounds`, the delivered sounds the EXPL records name, each
 *   by at least one record.
 * - `explosion-animation`: `frames`, the frame images in frame order.
 * - `nebula-backgrounds`: `images`, the images in NEBC order; one may repeat.
 */
export type FlightDataDeclaration =
  | DeclarationOf<'scene-settings'>
  | DeclarationOf<'explosion-table'> & { readonly animations: readonly AssetId[]; readonly sounds: readonly AssetId[] }
  | DeclarationOf<'explosion-animation'> & { readonly frames: readonly AssetId[] }
  | DeclarationOf<'nebula-backgrounds'> & { readonly images: readonly AssetId[] };

export interface FlightDataDeclarations {
  readonly assets: readonly FlightDataDeclaration[];
  /**
   * The source mappings of exactly the sounds, frames and images the declarations name, as the steps that convert them
   * map them: a whole SND entry, `frames/<i>` of an ANIM entry for the frame at index i, or a whole BITM entry. They
   * are never read here; a table bound to a source fingerprint must be bound to the converted source.
   */
  readonly references: SourceMappingTable;
}

/** Each role's Asset ID list fields, the kind they name, whether an ID may repeat, and the source of a referenced Asset. */
const ROLE_FIELDS: Readonly<Record<FlightDataRole, readonly { readonly name: string; readonly kind: AssetKind; readonly repeats: boolean; readonly type?: string }[]>> = {
  'scene-settings': [],
  'explosion-table': [{ name: 'animations', kind: 'data', repeats: false }, { name: 'sounds', kind: 'sound', repeats: false, type: 'SND' }],
  'explosion-animation': [{ name: 'frames', kind: 'image', repeats: false, type: 'ANIM' }],
  'nebula-backgrounds': [{ name: 'images', kind: 'image', repeats: true, type: 'BITM' }],
};

const isFlightDataRole = (role: unknown): role is FlightDataRole => FLIGHT_DATA_ROLES.some(known => known === role);

/** The first locator of a one-part mapping when it is an entry of `type` with `subresource`, else null. */
function entryPart({ parts }: SourceMapping, type: string, subresource: string | null): ArchiveEntryLocator | null {
  const [first] = parts[0].alternatives;
  return parts.length === 1 && !isRegionLocator(first) && first.entry.type === type && first.subresource === subresource ? first : null;
}

function readIds(value: unknown, path: string, kind: AssetKind, repeats: boolean): readonly AssetId[] {
  const seen = new Set<string>();
  return readArray(value, path, 'invalid-record', (item, at) => {
    const id = readAssetId(item, at);
    if (!id.startsWith(`${kind}/`)) fail('kind-mismatch', at, `must be a ${kind} Asset ID`);
    if (!repeats && seen.has(id)) fail('invalid-record', at, 'must name each Asset once');
    seen.add(id);
    return id;
  });
}

function readDeclaration(value: unknown, path: string, references: ReadonlyMap<string, SourceMapping>, referenced: Set<string>): FlightDataDeclaration {
  const record = readRecord(value, path);
  if (!isFlightDataRole(record.role)) fail('invalid-role', `${path}.role`, 'must be a flight data role');
  const fields = ROLE_FIELDS[record.role];
  requireFields(record, path, ['asset', 'role', 'group', ...fields.map(({ name }) => name)]);
  const asset = readAssetReference(record.asset, `${path}.asset`);
  if (asset.kind !== 'data') fail('invalid-kind', `${path}.asset.kind`, 'must be data');
  if (readResourceGroup(record.group, `${path}.group`) !== 'models') fail('invalid-resource-group', `${path}.group`, 'must be models');
  const lists = fields.map(({ name, kind, repeats, type }) => {
    const ids = readIds(record[name], `${path}.${name}`, kind, repeats);
    if (type) {
      ids.forEach((id, index) => {
        const mapping = references.get(id);
        if (!mapping) fail('invalid-record', `${path}.${name}[${index}]`, 'the Asset has no reference mapping');
        if (!entryPart(mapping, type, type === 'ANIM' ? `frames/${index}` : null)) {
          fail('invalid-record', `${path}.${name}[${index}]`, 'the reference mapping is not the source this field needs');
        }
        referenced.add(id);
      });
    }
    return [name, ids] as const;
  });
  return Object.freeze({ asset, role: record.role, group: 'models', ...Object.fromEntries(lists) }) as FlightDataDeclaration;
}

/**
 * Strictly reads flight data declarations into frozen data. Any problem is `invalid-declaration` at its structural path
 * under `flightData.declarations`: an unknown or missing field, a kind other than data, a role without flight data, a
 * group other than models, an ID list of the wrong kind or with a repeat where none may be, a duplicate Asset ID, an
 * invalid reference mapping table, a named sound, frame or image without a reference mapping of the source its field
 * needs, or a reference mapping no declaration names.
 */
export function readFlightDataDeclarations(value: unknown, path = 'flightData.declarations'): FlightDataDeclarations {
  try {
    const record = readRecord(value, path);
    requireFields(record, path, ['assets', 'references']);
    let references: SourceMappingTable;
    try {
      references = readSourceMappingTable(record.references);
    } catch (error) {
      if (error instanceof ContentContractError) throw new ContentContractError(error.code, error.path.replace(/^sources/, `${path}.references`), error.reason);
      throw error;
    }
    const byId = new Map<string, SourceMapping>(references.mappings.map(mapping => [mapping.asset.id, mapping]));
    const referenced = new Set<string>();
    const seen = new Set<string>();
    const assets = readArray(record.assets, `${path}.assets`, 'invalid-record', (item, at) => {
      const declaration = readDeclaration(item, at, byId, referenced);
      if (seen.has(declaration.asset.id)) fail('duplicate-asset', `${at}.asset.id`, 'must be unique in the set');
      seen.add(declaration.asset.id);
      return declaration;
    });
    if (referenced.size !== byId.size) fail('invalid-record', `${path}.references`, 'must map exactly the Assets the declarations name');
    return Object.freeze({ assets, references });
  } catch (error) {
    // The content readers' reasons are fixed safe text that never echoes the rejected value.
    if (error instanceof ContentContractError) throw new SourceError('invalid-declaration', error.path, error.reason);
    throw error;
  }
}

/** What converting one Asset needs, checked against its mapping and the reference mappings before any read. */
type Plan =
  | { readonly role: 'scene-settings'; readonly rens: ArchiveEntryLocator }
  | {
    readonly role: 'explosion-table';
    readonly lists: ArchiveEntryLocator;
    /** The entry IDs of the mapped EXPL entries, in the archive of the lists. */
    readonly records: ReadonlySet<number>;
    /** In animation number order: each animation Asset and the ANIM its mapping converts. */
    readonly animations: readonly { readonly id: AssetId; readonly anim: ArchiveEntryLocator }[];
    /** SND entry ID → the sound Asset converted from it. */
    readonly sounds: ReadonlyMap<number, AssetId>;
  }
  | { readonly role: 'explosion-animation'; readonly anim: ArchiveEntryLocator; readonly frames: readonly AssetId[] }
  | { readonly role: 'nebula-backgrounds'; readonly list: ArchiveEntryLocator; readonly images: readonly { readonly id: AssetId; readonly entry: number }[] };

const declarationError = (location: string, reason: string): never => {
  throw new SourceError('invalid-declaration', location, reason);
};

const sameArchiveEntry = (left: ArchiveEntryLocator, right: ArchiveEntryLocator): boolean =>
  left.discPath === right.discPath && left.entry.type === right.entry.type && left.entry.id === right.entry.id;

/**
 * Checks the parts of each Asset's mapping against its role: the RENS header; one whole EXIC entry followed by one
 * whole EXPL entry per animation, all in one archive; one whole ANIM entry, whose frames the frame references are, in
 * order; one whole NEBC entry with its images in the same archive. Every animation an explosion table names must be an
 * `explosion-animation` of this step, and each such Asset must be named by exactly one table. Any other form is
 * `invalid-declaration` at the Asset.
 */
function planAll(
  declarations: readonly FlightDataDeclaration[],
  mappingById: ReadonlyMap<string, SourceMapping>,
  references: SourceMappingTable,
): ReadonlyMap<AssetId, Plan> {
  const referenceOf = new Map<string, ArchiveEntryLocator>(references.mappings.map(({ asset, parts }) =>
    [asset.id, archiveLocator(parts[0].alternatives[0])]));
  const tabled = new Set<string>();
  const plans = new Map<AssetId, Plan>();
  const ordered = [...declarations].sort((left, right) => compareText(left.asset.id, right.asset.id));
  // Animations first, so a table can name the ANIM of each of its animations.
  for (const declaration of [...ordered.filter(({ role }) => role !== 'explosion-table'), ...ordered.filter(({ role }) => role === 'explosion-table')]) {
    const { id } = declaration.asset;
    const at = `flightData[${id}]`;
    const mapping = mappingById.get(id)!;
    switch (declaration.role) {
      case 'scene-settings': {
        const rens = entryPart(mapping, 'RENS', SCENE_SETTINGS_SUBRESOURCE) ?? declarationError(`${at}.source`, 'scene settings must map to the header of one RENS entry');
        plans.set(id, { role: 'scene-settings', rens });
        break;
      }
      case 'explosion-animation': {
        const anim = entryPart(mapping, 'ANIM', null) ?? declarationError(`${at}.source`, 'an animation must map to one whole ANIM entry');
        declaration.frames.forEach((frame, index) => {
          if (!sameArchiveEntry(referenceOf.get(frame)!, anim)) declarationError(`${at}.frames[${index}]`, 'the frame image is not a frame of this animation');
        });
        plans.set(id, { role: 'explosion-animation', anim, frames: declaration.frames });
        break;
      }
      case 'nebula-backgrounds': {
        const list = entryPart(mapping, 'NEBC', null) ?? declarationError(`${at}.source`, 'a nebula list must map to one whole NEBC entry');
        const images = declaration.images.map((image, index) => {
          const source = referenceOf.get(image)!;
          if (source.discPath !== list.discPath) declarationError(`${at}.images[${index}]`, 'the image is not in the archive of the list');
          return { id: image, entry: source.entry.id };
        });
        plans.set(id, { role: 'nebula-backgrounds', list, images });
        break;
      }
      case 'explosion-table': {
        const [first, ...rest] = mapping.parts.map(({ alternatives: [locator] }) => locator);
        const whole = (type: string) => (locator: (typeof rest)[number]) => !isRegionLocator(locator) && locator.entry.type === type && locator.subresource === null
          && locator.discPath === first.discPath;
        if (!whole('EXIC')(first) || !rest.every(whole('EXPL'))) {
          declarationError(`${at}.source`, 'an explosion table must map to one whole EXIC entry and whole EXPL entries of its archive');
        }
        const lists = archiveLocator(first);
        if (rest.length !== declaration.animations.length) declarationError(`${at}.animations`, 'the table must name one animation per mapped EXPL entry');
        const animations = declaration.animations.map((animation, index) => {
          const plan = plans.get(animation);
          if (plan?.role !== 'explosion-animation') return declarationError(`${at}.animations[${index}]`, 'the animation is not an explosion animation of this step');
          if (tabled.has(animation)) declarationError(`${at}.animations[${index}]`, 'another explosion table names the animation');
          tabled.add(animation);
          return { id: animation, anim: plan.anim };
        });
        const sounds = new Map<number, AssetId>();
        declaration.sounds.forEach((sound, index) => {
          const source = referenceOf.get(sound)!;
          if (source.discPath !== lists.discPath || sounds.has(source.entry.id)) {
            declarationError(`${at}.sounds[${index}]`, 'the sound is not a distinct entry of the archive of the table');
          }
          sounds.set(source.entry.id, sound);
        });
        plans.set(id, { role: 'explosion-table', lists, records: new Set(rest.map(locator => archiveLocator(locator).entry.id)), animations, sounds });
        break;
      }
    }
  }
  for (const { asset: { id }, role } of ordered) {
    if (role === 'explosion-animation' && !tabled.has(id)) declarationError(`flightData[${id}].source`, 'no explosion table names the animation');
  }
  return plans;
}

function mismatch(location: string, reason: string): never {
  throw new SourceError('subresource-mismatch', location, reason);
}

/** NEBC (hud §3): a relocated {pointer, count} header at +0x00, then the u32 BITM entry IDs; the pointer is the only relocation. */
function parseNebulaList(archive: DiscPath, read: ArchiveEntryRead): readonly number[] {
  const block = new PayloadBlock(archive, read, NEBULA_LIST_LIMITS.entryBytes);
  block.require(0, 8, '/images');
  block.requireRelocations(0, read.bytes.length, new Set([0]), '/images');
  const { start, count } = block.array(0, 4, NEBULA_LIST_LIMITS.images, '/images', 8);
  return Object.freeze(Array.from({ length: count }, (_, index) => block.u32(start + index * 4, `/images[${index}]`)));
}

/**
 * The explosion table and its ID chains: the EXIC lists name exactly the mapped EXPL entries; the n-th distinct EXPL in
 * list and position order belongs to the n-th animation, whose ANIM its record must name; and the records name exactly
 * the declared sounds, so the table depends on each of them.
 */
async function explosionTable(plan: Extract<Plan, { role: 'explosion-table' }>, readEntry: EntryReader): Promise<ExplosionTable> {
  const { discPath } = plan.lists;
  const read = await readEntry(plan.lists);
  const at = entryLocation(discPath, read.entry);
  const lists = parseExplosionLists(discPath, read);
  // The distinct EXPL entries in first appearance order.
  const order = new Set<number>();
  lists.forEach((list, index) => list.forEach((record, item) => {
    if (!plan.records.has(record)) mismatch(`${at}/lists[${index}]/ids[${item}]`, 'the list names an EXPL entry the mapping does not');
    order.add(record);
  }));
  if (order.size !== plan.records.size) mismatch(`${at}/lists`, 'a mapped EXPL entry is in no list');
  const entries = new Map<number, ExplosionEntry>();
  const named = new Set<number>();
  for (const [index, record] of [...order].entries()) {
    const recordRead = await readEntry({ discPath, entry: { id: record, type: 'EXPL' }, subresource: null });
    const recordAt = entryLocation(discPath, recordRead.entry);
    const { sound, animation } = parseExplosionRecord(discPath, recordRead);
    const { id, anim } = plan.animations[index];
    if (anim.discPath !== discPath || anim.entry.id !== animation) mismatch(`${recordAt}/animation`, 'the record names another ANIM than its animation Asset');
    const soundId = plan.sounds.get(sound) ?? mismatch(`${recordAt}/sound`, 'the record names no declared explosion sound');
    named.add(sound);
    entries.set(record, { sound: { id: soundId, kind: 'sound' }, animation: { id, kind: 'data' } });
  }
  if (named.size !== plan.sounds.size) mismatch(`${at}/lists`, 'the records do not name every declared explosion sound');
  const [first, second, third] = lists.map(list => list.map(record => entries.get(record)!));
  return { lists: [first, second, third] };
}

async function convert(plan: Plan, readEntry: EntryReader): Promise<FlightDataPayload> {
  switch (plan.role) {
    case 'scene-settings':
      return { role: plan.role, content: parseRensHeader(plan.rens.discPath, await readEntry(plan.rens)) };
    case 'explosion-table':
      return { role: plan.role, content: await explosionTable(plan, readEntry) };
    case 'explosion-animation': {
      const read = await readEntry(plan.anim);
      if (readAnimationFrames(plan.anim.discPath, read).length !== plan.frames.length) {
        mismatch(`${entryLocation(plan.anim.discPath, read.entry)}/frames`, 'the animation does not have exactly one frame per frame image');
      }
      return { role: plan.role, content: { frames: plan.frames.map(id => ({ id, kind: 'image' })) } };
    }
    case 'nebula-backgrounds': {
      const read = await readEntry(plan.list);
      const at = entryLocation(plan.list.discPath, read.entry);
      const listed = parseNebulaList(plan.list.discPath, read);
      if (listed.length !== plan.images.length) mismatch(`${at}/images`, 'the list does not name exactly one entry per image');
      listed.forEach((entry, index) => {
        if (entry !== plan.images[index].entry) mismatch(`${at}/images[${index}]`, 'the list names another entry than the image at its position');
      });
      return { role: plan.role, content: { images: plan.images.map(({ id }) => ({ id, kind: 'image' })) } };
    }
  }
}

/**
 * Runs the flight data step. It pairs each declaration with exactly one mapping, checks the mappings' parts and the
 * reference mappings against the declared roles, verifies the mappings through a step-local reader that limits each
 * entry by its directory size before reading it, converts each Asset from those reads with its ID chains, and charges
 * each Asset's count, dependency edges and payload bytes before its payload is allocated. Only then are the mappings,
 * the RENS header among them, marked verified. Chain disagreements are `subresource-mismatch` at the structure that
 * disagrees; format failures keep their parser's code and archive location; P2-02 disc failures pass through unchanged.
 * Any failure rejects the whole step without results; reads already issued stay charged to the source.
 */
export async function runFlightDataStep(
  source: VerifiedSource,
  mappings: unknown,
  declarations: unknown,
  limits: unknown,
  usage: unknown = EMPTY_BUDGET_USAGE,
): Promise<FlightDataStepResult> {
  const { assets: checked, references } = readFlightDataDeclarations(declarations);
  const checkedLimits = readBudgetRecord(limits, 'limits');
  let current = readConversionUsage(usage);
  const table = readSourceMappingTable(mappings);
  const mappingById = new Map<string, SourceMapping>(table.mappings.map(mapping => [mapping.asset.id, mapping]));
  checked.forEach(({ asset }, index) => {
    if (!mappingById.has(asset.id)) declarationError(`flightData.declarations.assets[${index}]`, 'the Asset has no source mapping');
  });
  if (table.mappings.length !== checked.length) declarationError('flightData.declarations', 'every mapped Asset must be declared');
  if (references.sourceFingerprint !== null && references.sourceFingerprint !== source.identity.fingerprint) {
    throw new SourceError('fingerprint-mismatch', 'flightData.declarations.references.sourceFingerprint', 'the table is bound to another source');
  }
  const plans = planAll(checked, mappingById, references);

  const readEntry = stepEntryReader(source, (discPath, entry) => {
    const limit = ENTRY_LIMITS[entry.type];
    if (limit !== undefined) requireEntryBytes(discPath, entry, limit);
  });
  // Verification binds the source fingerprint; the RENS header stays declared until it is parsed below.
  const bound = await verifySourceMappings(table, source, readEntry);
  const payloads: { readonly id: AssetId; readonly payload: FlightDataPayload }[] = [];
  for (const id of [...plans.keys()].sort(compareText)) payloads.push({ id, payload: await convert(plans.get(id)!, readEntry) });

  const converted = payloads.map(({ id, payload }) => {
    const dependencies = flightDataDependencies(payload);
    const bytes = encodeFlightDataPayload(payload, byteLength => {
      current = chargeConversionBudget(checkedLimits, current, { assets: 1, dependencyEdges: dependencies.length, payloadBytes: byteLength }, `flightData[${id}]`);
    });
    const schemaVersion = FLIGHT_DATA_SCHEMA_VERSIONS[payload.role];
    const payloadIdentity = { schemaVersion, byteLength: bytes.length, fingerprint: sha256Fingerprint(bytes) };
    const descriptor = readAssetDescriptor({ id, kind: 'data', role: payload.role, group: 'models', dependencies, payloadIdentity });
    return { descriptor, payload: Object.freeze({ id, schemaVersion, bytes }) };
  });

  const verified = readSourceMappingTable({ ...bound, mappings: bound.mappings.map(mapping => ({ ...mapping, resolution: 'verified' })) });
  const stateById = new Map<string, AssetSourceState>(assetSourceStates(verified).states.map(state => [state.id, state]));
  const groups = converted.length === 0 ? [] : [Object.freeze({
    group: 'models' as const,
    descriptors: Object.freeze(converted.map(({ descriptor }) => descriptor)),
    payloads: Object.freeze(converted.map(({ payload }) => payload)),
    sources: Object.freeze(converted.map(({ descriptor }) => stateById.get(descriptor.id)!)),
  })];
  return Object.freeze({ groups: Object.freeze(groups), usage: current });
}
