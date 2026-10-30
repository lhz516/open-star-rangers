import type { AssetDescriptor, ResourceGroup } from '../../content/asset-contract.ts';
import type { AssetId } from '../../content/asset-id.ts';
import { contentIdentityKey, type ContentIdentity } from '../../content/content-identity.ts';
import { ContentContractError, compareText, fail } from '../../content/contract-validation.ts';
import type { ExplosionTable } from '../../content/flight/flight-data-content.ts';
import { decodeFlightDataPayload } from '../../content/flight/flight-data-payload.ts';
import type { CraftTypeTable } from '../../content/logic/logic-content.ts';
import { readGroupManifest } from '../../content/manifest.ts';
import type { ModelPayload } from '../../content/models/model-payload.ts';
import { readPayloadRecords, type PayloadRecord } from '../../content/payload.ts';
import { readSoundPayload, SOUND_PAYLOAD_SCHEMA_VERSION } from '../../content/sound-payload.ts';
import { missionInput, modelInputs, type PackageGroup } from '../resources/mission-input.ts';
import type { HeldPackage } from '../resources/resource-holder.ts';

// The flight sounds' static content bindings (P3-14 S-02, AC-02; subtask 09): from one held package of the generation
// and content identity the mission owner bound, the five sound slots of each craft type's model (through the mission's
// craft type table, by kind bit position) and the sound of each EXPL record (by original list and item). Every sound
// they name is checked to be a schema 2 sound of the same package's `audio` group before a run uses them, so an empty
// slot (null) is the only silence the bindings report; a missing, foreign or unreadable reference is refused. The
// bindings keep Asset IDs only: no payload bytes, model geometry or other decoded content.

/** The package a mission owner bound: the holder generation and content identity its runs are created from. */
export interface BoundPackage {
  readonly generation: number;
  readonly identity: ContentIdentity;
}

/** A model's five sound slots in slot order; the slot meanings are in docs/original/formats/audio.md. */
export type SoundSlots = ModelPayload['soundSlots'];

/** The sounds of one craft type: the model its craft type table entry names and that model's sound slots. */
export interface CraftSounds {
  /** The kind's bit position 0–31, as Core's `kindBit`; the original kind mask is 2 ** craftType. */
  readonly craftType: number;
  readonly model: AssetId;
  readonly soundSlots: SoundSlots;
}

/** The static sound bindings of one bound package. Frozen plain data. */
export interface FlightSoundContent {
  readonly generation: number;
  readonly identity: ContentIdentity;
  /** Indexed by kind bit position 0–31; null for a kind the mission's craft type table has no entry for. */
  readonly craft: readonly (CraftSounds | null)[];
  /** The sound of each EXPL record: `explosions[list - 1][item]`, `item` being the index in the original list. */
  readonly explosions: readonly [readonly AssetId[], readonly AssetId[], readonly AssetId[]];
  /** Every distinct sound the bindings name, in ascending ID order; each is a sound of the package's `audio` group. */
  readonly sounds: readonly AssetId[];
}

/** Why a package is not the bound one. */
export type FlightSoundPackageMismatch = 'incomplete' | 'generation' | 'identity';

/** The package handed over is not the complete package of the bound generation and content identity. */
export class FlightSoundPackageError extends Error {
  readonly mismatch: FlightSoundPackageMismatch;

  constructor(mismatch: FlightSoundPackageMismatch, message: string) {
    super(message);
    this.name = 'FlightSoundPackageError';
    this.mismatch = mismatch;
  }
}

const KIND_BITS = 32;

const missing = (path: string, reason: string): never => fail('binding-mismatch', path, reason);

/** The group named `name` with its descriptors, after checking that it is a group of the bound identity. */
function readGroup(groups: readonly PackageGroup[], name: ResourceGroup, identityKey: string) {
  const group = groups.find(({ group }) => group === name) ?? missing(`groups.${name}`, 'must be a group of the bound package');
  const { identity, assets } = readGroupManifest(group.manifest, `groups.${name}.manifest`);
  if (contentIdentityKey(identity) !== identityKey) {
    throw new FlightSoundPackageError('identity', `The ${name} group is not of the bound package's content identity`);
  }
  return { group, assets };
}

/** The group's payload records by Asset ID. */
const payloadsOf = ({ group }: { readonly group: PackageGroup }): ReadonlyMap<AssetId, PayloadRecord> =>
  new Map(readPayloadRecords(group.payloads, `groups.${group.group}.payloads`).map(record => [record.id, record]));

/** The craft type table the mission references, decoded with the mission input the mission owner uses. */
function craftTypeTable(logic: PackageGroup): { readonly id: AssetId; readonly table: CraftTypeTable } {
  const { mission, craftTypes } = missionInput(logic);
  if (mission === undefined) return missing('groups.logic.manifest.assets', 'must hold the mission Asset');
  if (craftTypes === undefined) return missing(`logic[${mission.id}].references.craftTypes`, 'must name a craft type table of the package');
  return { id: craftTypes.id, table: craftTypes.content as CraftTypeTable };
}

/** The models group's only `explosion-table` Asset, decoded strictly against its descriptor. */
function explosionTable(assets: readonly AssetDescriptor[], payloads: ReadonlyMap<AssetId, PayloadRecord>): { readonly id: AssetId; readonly table: ExplosionTable } {
  const tables = assets.filter(({ role }) => role === 'explosion-table');
  if (tables.length !== 1) return missing('groups.models.manifest.assets', 'must hold exactly one explosion-table Asset');
  const [descriptor] = tables;
  const { id } = descriptor;
  const record = payloads.get(id) ?? missing(`models[${id}]`, 'must have a payload record');
  try {
    return { id, table: decodeFlightDataPayload(record.bytes, descriptor).content as ExplosionTable };
  } catch (error) {
    // Placed under the Asset, as mission-input.ts places decoding errors.
    if (error instanceof ContentContractError) throw new ContentContractError(error.code, `models[${id}].${error.path}`, error.reason);
    throw error;
  }
}

/**
 * Checks that `id`, named at `path`, is a readable schema 2 sound of the `audio` group: a sound descriptor, a payload
 * record of the declared schema, and payload bytes `readSoundPayload` accepts. The bytes are read in place, never kept.
 */
function checkSound(
  id: AssetId,
  path: string,
  audio: { readonly assets: ReadonlyMap<AssetId, AssetDescriptor>; readonly payloads: ReadonlyMap<AssetId, PayloadRecord> },
): void {
  const descriptor = audio.assets.get(id);
  if (descriptor?.kind !== 'sound') return missing(path, 'must name a sound Asset of the package\'s audio group');
  const record = audio.payloads.get(id) ?? missing(`audio[${id}]`, 'must have a payload record');
  if (descriptor.payloadIdentity.schemaVersion !== SOUND_PAYLOAD_SCHEMA_VERSION || record.schemaVersion !== SOUND_PAYLOAD_SCHEMA_VERSION) {
    fail('unsupported-payload-schema', `audio[${id}].schemaVersion`, `must be sound payload schema ${SOUND_PAYLOAD_SCHEMA_VERSION}`);
  }
  readSoundPayload(record.bytes, `audio[${id}].payload`);
}

/**
 * The flight sound bindings of `held`, which must be the complete package of `bound`'s generation and content identity
 * (otherwise a FlightSoundPackageError). It decodes the mission's craft type table, the models it names and the
 * explosion table with the parsers world creation uses, and checks every sound they name (`checkSound`). A reference
 * the package cannot satisfy is a ContentContractError: `binding-mismatch` for a missing Asset, the parsers' own codes
 * at `<group>[<Asset ID>].<path>` for an unreadable one. A null slot is legal silence. The caller's bytes are only read.
 */
export function bindFlightSounds(held: HeldPackage, bound: BoundPackage): FlightSoundContent {
  if (held.completeness.status !== 'complete') throw new FlightSoundPackageError('incomplete', 'The package is not complete');
  if (held.generation !== bound.generation) {
    throw new FlightSoundPackageError('generation', `The package is generation ${held.generation}, not the bound generation ${bound.generation}`);
  }
  const identityKey = contentIdentityKey(bound.identity);
  if (contentIdentityKey(held.completeness.identity) !== identityKey) {
    throw new FlightSoundPackageError('identity', 'The package is not of the bound content identity');
  }
  const { groups } = held;
  const logic = readGroup(groups, 'logic', identityKey);
  const models = readGroup(groups, 'models', identityKey);
  const audioGroup = readGroup(groups, 'audio', identityKey);
  const audio = { assets: new Map(audioGroup.assets.map(descriptor => [descriptor.id, descriptor])), payloads: payloadsOf(audioGroup) };
  const named = new Set<AssetId>();
  const sound = (id: AssetId, path: string): AssetId => {
    if (!named.has(id)) checkSound(id, path, audio);
    named.add(id);
    return id;
  };

  const craftTypes = craftTypeTable(logic.group);
  const modelIds = [...new Set(craftTypes.table.entries.map(({ model }) => model.id))].sort(compareText);
  const decoded = new Map(modelInputs(groups, modelIds).map(({ id, content }) => [id, content as ModelPayload]));
  const craft: (CraftSounds | null)[] = Array.from({ length: KIND_BITS }, () => null);
  craftTypes.table.entries.forEach(({ craftType, model: { id: model } }, index) => {
    const payload = decoded.get(model) ?? missing(`logic[${craftTypes.id}].entries[${index}].model`, 'must name a model Asset of the package');
    const soundSlots = payload.soundSlots.map((slot, at) => (slot === null ? null : sound(slot, `models[${model}].soundSlots[${at}]`)));
    craft[craftType] = Object.freeze({ craftType, model, soundSlots: Object.freeze(soundSlots) as unknown as SoundSlots });
  });

  const explosions = explosionTable(models.assets, payloadsOf(models));
  const lists = explosions.table.lists.map((list, at) =>
    Object.freeze(list.map((entry, item) => sound(entry.sound.id, `models[${explosions.id}].lists[${at}][${item}].sound`))));

  return Object.freeze({
    generation: held.generation,
    identity: held.completeness.identity,
    craft: Object.freeze(craft),
    explosions: Object.freeze(lists) as unknown as FlightSoundContent['explosions'],
    sounds: Object.freeze([...named].sort(compareText)),
  });
}

/**
 * The sounds of the craft type at kind bit position `kindBit` (Core's `kindBit`, not the original mask), or null when
 * the mission's craft type table has no entry for it. Resolved from the static binding alone, never from the current
 * Render State, so an event whose source has since left the world still resolves. A value that is not a bit position
 * 0–31 is a RangeError.
 */
export function craftSounds(content: FlightSoundContent, kindBit: number): CraftSounds | null {
  if (!Number.isInteger(kindBit) || kindBit < 0 || kindBit >= KIND_BITS) throw new RangeError(`${kindBit} is not a kind bit position 0–31`);
  return content.craft[kindBit];
}

/**
 * The sound of the EXPL record P3-12 selected: `item` is the index in the original list `list` (1–3), not in any drawn
 * subset. A selection outside the bound table is a RangeError: the selection and the bindings disagree on the table.
 */
export function explosionSound(content: FlightSoundContent, { list, item }: { readonly list: 1 | 2 | 3; readonly item: number }): AssetId {
  const records = list === 1 || list === 2 || list === 3 ? content.explosions[list - 1] : undefined;
  if (records === undefined || !Number.isInteger(item) || item < 0 || item >= records.length) {
    throw new RangeError(`list ${list}, item ${item} is not an EXPL record of the bound explosion table`);
  }
  return records[item];
}
