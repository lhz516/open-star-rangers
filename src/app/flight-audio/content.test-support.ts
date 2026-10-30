import type { ResourceGroup } from '../../content/asset-contract.ts';
import { readContentIdentity } from '../../content/content-identity.ts';
import { compareText } from '../../content/contract-validation.ts';
import { FLIGHT_DATA_SCHEMA_VERSIONS } from '../../content/flight/flight-data-content.ts';
import { encodeFlightDataPayload, flightDataDependencies } from '../../content/flight/flight-data-payload.ts';
import { syntheticFlightPayload } from '../../content/flight/flight-data.test-support.ts';
import { encodeModelPayload, MODEL_PAYLOAD_SCHEMA_VERSION, modelReferences } from '../../content/models/model-payload.ts';
import { syntheticModel } from '../../content/models/models.test-support.ts';
import { SOUND_PAYLOAD_SCHEMA_VERSION, writeSoundPayload } from '../../content/sound-payload.ts';
import { payloadIdentityOf, syntheticGroup } from '../../content/synthetic-content.test-support.ts';
import { imported, logicGroupInput, packageCraftTypes, SYNTHETIC_FINGERPRINT } from '../resources/resource-holder.test-support.ts';
import type { HeldGroup, HeldPackage } from '../resources/resource-holder.ts';
import type { BoundPackage } from './content.ts';

// Code-generated synthetic content for the flight sound bindings (P3-14 subtask 09); it never holds original data. A
// held package of three groups bound to the synthetic original import: the logic group of real logic payloads
// (resource-holder.test-support.ts), a models group of real model payloads and an explosion table, and an audio group
// of real schema 2 sounds. Builders return fresh mutable data a test may corrupt.

/** The models of the synthetic craft type table (`packageCraftTypes`): kinds 0 and 1 share the player model. */
export const MODELS = Object.freeze({
  player: 'model/synthetic-player',
  enemyA: 'model/synthetic-enemy-a',
  enemyB: 'model/synthetic-enemy-b',
  base: 'model/synthetic-base',
});

const sound = (name: string) => `sound/synthetic-flight/${name}`;

export const SOUNDS = Object.freeze({
  playerEngine: sound('engine-player'),
  enemyEngine: sound('engine-enemy'),
  gun: sound('gun'),
  missile: sound('missile'),
  hull: sound('hull'),
  kill: sound('kill'),
  baseHull: sound('hull-base'),
  boomA: sound('boom-a'),
  boomB: sound('boom-b'),
  boomC: sound('boom-c'),
});

type Slots = readonly [string | null, string | null, string | null, string | null, string | null];

export interface SoundPackageSpec {
  /** The five sound slots of each model of the models group, by model ID. */
  readonly slots?: Readonly<Record<string, Slots>>;
  /** The sound of each EXPL record of the three lists; the animations are synthetic IDs the bindings never read. */
  readonly explosions?: readonly [readonly string[], readonly string[], readonly string[]];
  /** The audio group's sounds; by default every sound the slots and lists name. */
  readonly sounds?: readonly string[];
  readonly craftTypes?: ReturnType<typeof packageCraftTypes>;
  readonly generation?: number;
}

/**
 * Two models sharing their gun, missile, hull and kill sounds; one model with every slot empty; one with only its hit
 * slots set. The kill sound is also an EXPL sound.
 */
const defaultSlots = (): Record<string, Slots> => ({
  [MODELS.player]: [SOUNDS.playerEngine, SOUNDS.gun, SOUNDS.missile, SOUNDS.hull, SOUNDS.kill],
  [MODELS.enemyA]: [SOUNDS.enemyEngine, SOUNDS.gun, SOUNDS.missile, SOUNDS.hull, SOUNDS.kill],
  [MODELS.enemyB]: [null, null, null, null, null],
  [MODELS.base]: [null, null, null, SOUNDS.baseHull, SOUNDS.kill],
});

/** Lists of 3, 2 and 1 records: list 1 repeats a sound at items 0 and 2, list 2 shares the kill sound with the models. */
const defaultExplosions = (): [string[], string[], string[]] => [
  [SOUNDS.boomA, SOUNDS.boomB, SOUNDS.boomA],
  [SOUNDS.kill, SOUNDS.boomC],
  [SOUNDS.boomB],
];

/** The origin the synthetic logic group (`logicGroupInput`) is bound to, for the other groups of the same package. */
const ORIGIN = Object.freeze({ origin: { type: 'original-import', sourceFingerprint: SYNTHETIC_FINGERPRINT } });

/** A short readable schema 2 sound. */
const soundBytes = (): Uint8Array => writeSoundPayload({ sampleRate: 11_025, channels: 1, encoding: 'u8', loop: 'none', pcm: Uint8Array.of(128, 160, 96) });

function modelsGroup(slots: Readonly<Record<string, Slots>>, explosions: readonly (readonly string[])[]): HeldGroup {
  const models = Object.entries(slots).map(([id, soundSlots]) => {
    const model = { ...syntheticModel(), soundSlots } as unknown as Parameters<typeof encodeModelPayload>[0];
    return {
      id, role: 'craft-model', schemaVersion: MODEL_PAYLOAD_SCHEMA_VERSION,
      dependencies: modelReferences(model).map(({ id: dependency }) => dependency), bytes: encodeModelPayload(model),
    };
  });
  const table = syntheticFlightPayload('explosion-table', {
    lists: explosions.map((list, at) => list.map((id, item) =>
      ({ sound: { id, kind: 'sound' }, animation: { id: `data/synthetic-animation/${at + 1}-${item}`, kind: 'data' } }))),
  });
  const explosionTable = {
    id: 'data/synthetic-explosions', role: 'explosion-table', schemaVersion: FLIGHT_DATA_SCHEMA_VERSIONS['explosion-table'],
    dependencies: flightDataDependencies(table).map(({ id }) => id), bytes: encodeFlightDataPayload(table),
  };
  const specs = [...models, explosionTable].sort((left, right) => compareText(left.id, right.id));
  return { group: 'models', ...syntheticGroup('models', specs, ORIGIN) };
}

function audioGroup(sounds: readonly string[]): HeldGroup {
  const specs = [...new Set(sounds)].sort(compareText).map(id => ({ id, role: 'fire-sound', schemaVersion: SOUND_PAYLOAD_SCHEMA_VERSION, bytes: soundBytes() }));
  return { group: 'audio', ...syntheticGroup('audio', specs, ORIGIN) };
}

/** A complete held package of the spec and the binding of its generation and identity. */
export function soundPackage(spec: SoundPackageSpec = {}): { held: HeldPackage; bound: BoundPackage } {
  const { slots = defaultSlots(), explosions = defaultExplosions(), craftTypes = packageCraftTypes(), generation = 1 } = spec;
  const named = [...Object.values(slots).flat(), ...explosions.flat()].filter((id): id is string => id !== null);
  const logic = logicGroupInput({ craftTypes });
  const groups: HeldGroup[] = [imported('logic', logic), modelsGroup(slots, explosions), audioGroup(spec.sounds ?? named)];
  const identity = readContentIdentity((logic.manifest as { identity: unknown }).identity);
  const held: HeldPackage = { generation, origin: 'import', groups, completeness: { status: 'complete', identity, groups: groups.map(({ group }) => group) } };
  return { held, bound: { generation, identity } };
}

/** `held` with the payload of Asset `id` in `group` replaced as `change` says, its descriptor declaring the result. */
export function withPayload(held: HeldPackage, group: ResourceGroup, id: string, change: { readonly schemaVersion?: number; readonly bytes?: Uint8Array }): HeldPackage {
  return withGroup(held, group, (input) => {
    const manifest = structuredClone(input.manifest) as { assets: { id: string; payloadIdentity: unknown }[] };
    const payloads = (input.payloads as { id: string; schemaVersion: number; bytes: Uint8Array }[]).map(record => (record.id === id ? { ...record, ...change } : record));
    const record = payloads.find(item => item.id === id)!;
    manifest.assets.find(asset => asset.id === id)!.payloadIdentity = { ...payloadIdentityOf(record.bytes), schemaVersion: record.schemaVersion };
    return { ...input, manifest, payloads };
  });
}

/** `held` with `change` applied to its group `group`. */
export function withGroup(held: HeldPackage, group: ResourceGroup, change: (input: HeldGroup) => HeldGroup): HeldPackage {
  return { ...held, groups: held.groups.map(input => (input.group === group ? change(input) : input)) };
}
