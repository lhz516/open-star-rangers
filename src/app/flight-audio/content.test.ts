import { describe, expect, it } from 'vitest';
import { readGroupManifest } from '../../content/manifest.ts';
import { ContentContractError } from '../../content/contract-validation.ts';
import type { ContentIdentity } from '../../content/content-identity.ts';
import type { ExplosionTable } from '../../content/flight/flight-data-content.ts';
import type { CraftTypeTable } from '../../content/logic/logic-content.ts';
import { deepFrozen, LOGIC_IDS } from '../../content/logic/logic-content.test-support.ts';
import { isDetached } from '../../content/ownership.ts';
import { thrownBy } from '../../core/world/world.test-support.ts';
import { missionHolder } from '../mission/mission.test-support.ts';
import { missionInput, ruleDataInputs } from '../resources/mission-input.ts';
import { syntheticGroup } from '../../content/synthetic-content.test-support.ts';
import type { HeldPackage } from '../resources/resource-holder.ts';
import { bindFlightSounds, craftSounds, explosionSound, FlightSoundPackageError, type CraftSounds, type FlightSoundContent } from './content.ts';
import { MODELS, soundPackage, SOUNDS, withGroup, withPayload } from './content.test-support.ts';

// The flight sounds' static content bindings (P3-14 subtask 09; spec S-02, AC-02): craft type → model → sound slots and
// EXPL records by original list index, all from the bound package, with every failure to bind refused explicitly.

/** What `bind` throws, asserted to be a ContentContractError. */
function contractError(bind: () => unknown): ContentContractError {
  const error = thrownBy(bind);
  expect(error).toBeInstanceOf(ContentContractError);
  return error as ContentContractError;
}

function packageError(bind: () => unknown): FlightSoundPackageError {
  const error = thrownBy(bind);
  expect(error).toBeInstanceOf(FlightSoundPackageError);
  return error as FlightSoundPackageError;
}

const bound = (spec?: Parameters<typeof soundPackage>[0]): FlightSoundContent => {
  const { held, bound: binding } = soundPackage(spec);
  return bindFlightSounds(held, binding);
};

describe('flight sound bindings', () => {
  it('binds each craft type of the mission table to its model\'s five sound slots and each EXPL record to its sound', () => {
    const content = bound();
    const player = [SOUNDS.playerEngine, SOUNDS.gun, SOUNDS.missile, SOUNDS.hull, SOUNDS.kill];
    expect(craftSounds(content, 0)).toEqual({ craftType: 0, model: MODELS.player, soundSlots: player });
    expect(craftSounds(content, 1)).toEqual({ craftType: 1, model: MODELS.player, soundSlots: player });
    expect(craftSounds(content, 7)).toEqual({
      craftType: 7, model: MODELS.enemyA, soundSlots: [SOUNDS.enemyEngine, SOUNDS.gun, SOUNDS.missile, SOUNDS.hull, SOUNDS.kill],
    });
    expect(craftSounds(content, 8)).toEqual({ craftType: 8, model: MODELS.enemyB, soundSlots: [null, null, null, null, null] });
    expect(craftSounds(content, 17)).toEqual({ craftType: 17, model: MODELS.base, soundSlots: [null, null, null, SOUNDS.baseHull, SOUNDS.kill] });
    expect(content.explosions).toEqual([[SOUNDS.boomA, SOUNDS.boomB, SOUNDS.boomA], [SOUNDS.kill, SOUNDS.boomC], [SOUNDS.boomB]]);
    expect(content.sounds).toEqual([
      'sound/synthetic-flight/boom-a', 'sound/synthetic-flight/boom-b', 'sound/synthetic-flight/boom-c',
      'sound/synthetic-flight/engine-enemy', 'sound/synthetic-flight/engine-player', 'sound/synthetic-flight/gun',
      'sound/synthetic-flight/hull', 'sound/synthetic-flight/hull-base', 'sound/synthetic-flight/kill', 'sound/synthetic-flight/missile',
    ]);
    expect(content.generation).toBe(1);
    expect(deepFrozen(content)).toBe(true);
  });

  it('shares one sound Asset among craft types, models and EXPL records, and keeps repeated EXPL records apart by original index', () => {
    const content = bound();
    // Kinds 0 and 1 name the same model; two models and an EXPL record name the same kill sound.
    expect(craftSounds(content, 0)?.soundSlots).toEqual(craftSounds(content, 1)?.soundSlots);
    expect(craftSounds(content, 0)?.soundSlots[4]).toBe(SOUNDS.kill);
    expect(craftSounds(content, 7)?.soundSlots[4]).toBe(SOUNDS.kill);
    expect(explosionSound(content, { list: 2, item: 0 })).toBe(SOUNDS.kill);
    // `item` indexes the original list: items 0 and 2 of list 1 name one sound, item 1 another.
    expect(explosionSound(content, { list: 1, item: 0 })).toBe(SOUNDS.boomA);
    expect(explosionSound(content, { list: 1, item: 1 })).toBe(SOUNDS.boomB);
    expect(explosionSound(content, { list: 1, item: 2 })).toBe(SOUNDS.boomA);
    expect(explosionSound(content, { list: 3, item: 0 })).toBe(SOUNDS.boomB);
  });

  it('reports an empty slot as null, distinct from a kind the table has no entry for, and needs no audio Asset for it', () => {
    const content = bound();
    expect(craftSounds(content, 8)?.soundSlots).toEqual([null, null, null, null, null]);
    expect(craftSounds(content, 17)?.soundSlots[0]).toBeNull();
    expect(craftSounds(content, 2)).toBeNull();
    expect(craftSounds(content, 31)).toBeNull();
  });

  it('resolves a source by its kind bit position alone, never by a Render State model, and refuses a kind mask', () => {
    const content = bound();
    // An event carries only the kind bit and position snapshots: the binding needs no entity, so a removed source resolves.
    expect(craftSounds(content, 7)?.model).toBe(MODELS.enemyA);
    // 0x80 is the original mask of kind bit 7, not a bit position.
    expect(() => craftSounds(content, 0x80)).toThrow(RangeError);
    for (const kindBit of [-1, 32, 1.5, Number.NaN]) expect(() => craftSounds(content, kindBit)).toThrow(RangeError);
  });

  it('refuses an EXPL selection outside the bound table', () => {
    const content = bound();
    expect(() => explosionSound(content, { list: 2, item: 2 })).toThrow(RangeError);
    expect(() => explosionSound(content, { list: 3, item: -1 })).toThrow(RangeError);
    expect(() => explosionSound(content, { list: 1, item: 0.5 })).toThrow(RangeError);
    expect(() => explosionSound(content, { list: 0 as 1, item: 0 })).toThrow(RangeError);
    expect(() => explosionSound(content, { list: 4 as 3, item: 0 })).toThrow(RangeError);
  });
});

describe('flight sound binding failures', () => {
  /** The default package whose audio group lacks sound `id`, which the default slots or lists name. */
  const withoutSound = (id: string) => soundPackage({ sounds: Object.values(SOUNDS).filter(sound => sound !== id) });

  it('refuses a model slot naming a sound the audio group lacks, at the slot', () => {
    const { held, bound: binding } = withoutSound(SOUNDS.missile);
    const error = contractError(() => bindFlightSounds(held, binding));
    expect(error.code).toBe('binding-mismatch');
    // Kind 0 is the table's first entry.
    expect(error.path).toBe(`models[${MODELS.player}].soundSlots[2]`);
  });

  it('refuses an EXPL record naming a sound the audio group lacks, at the record', () => {
    const { held, bound: binding } = withoutSound(SOUNDS.boomC);
    const error = contractError(() => bindFlightSounds(held, binding));
    expect(error.code).toBe('binding-mismatch');
    expect(error.path).toBe('models[data/synthetic-explosions].lists[1][1].sound');
  });

  it('refuses a craft type whose model the models group lacks, at the table entry', () => {
    const { held, bound: binding } = soundPackage({
      slots: { [MODELS.player]: [null, null, null, null, null], [MODELS.enemyA]: [null, null, null, null, null], [MODELS.enemyB]: [null, null, null, null, null] },
    });
    const error = contractError(() => bindFlightSounds(held, binding));
    expect(error.code).toBe('binding-mismatch');
    expect(error.path).toBe(`logic[${LOGIC_IDS.craftTypes}].entries[4].model`);
  });

  it('refuses a package without its explosion table or without a group it reads', () => {
    const { held, bound: binding } = soundPackage();
    const noTable = withGroup(held, 'models', (input) => {
      const manifest = structuredClone(input.manifest) as { assets: { role: string }[] };
      return { ...input, manifest: { ...manifest, assets: manifest.assets.filter(({ role }) => role !== 'explosion-table') } };
    });
    expect(contractError(() => bindFlightSounds(noTable, binding))).toMatchObject({ code: 'binding-mismatch', path: 'groups.models.manifest.assets' });
    const noAudio: HeldPackage = { ...held, groups: held.groups.filter(({ group }) => group !== 'audio') };
    expect(contractError(() => bindFlightSounds(noAudio, binding))).toMatchObject({ code: 'binding-mismatch', path: 'groups.audio' });
  });

  it('refuses a named sound of another payload schema or whose bytes are not a sound payload, rather than treating it as silence', () => {
    const { held, bound: binding } = soundPackage();
    const schema1 = contractError(() => bindFlightSounds(withPayload(held, 'audio', SOUNDS.gun, { schemaVersion: 1 }), binding));
    expect(schema1).toMatchObject({ code: 'unsupported-payload-schema', path: `audio[${SOUNDS.gun}].schemaVersion` });
    const notSound = contractError(() => bindFlightSounds(withPayload(held, 'audio', SOUNDS.kill, { bytes: new TextEncoder().encode('not a sound') }), binding));
    expect(notSound.code).toBe('invalid-sound-payload');
    expect(notSound.path.startsWith(`audio[${SOUNDS.kill}].payload`)).toBe(true);
  });

  it('places a model or explosion table decoding error under its Asset', () => {
    const { held, bound: binding } = soundPackage();
    const garbage = Uint8Array.of(1, 2, 3);
    const model = contractError(() => bindFlightSounds(withPayload(held, 'models', MODELS.enemyB, { bytes: garbage }), binding));
    expect(model.code).toBe('invalid-model-payload');
    expect(model.path.startsWith(`models[${MODELS.enemyB}].`)).toBe(true);
    const table = contractError(() => bindFlightSounds(withPayload(held, 'models', 'data/synthetic-explosions', { bytes: garbage }), binding));
    expect(table.path.startsWith('models[data/synthetic-explosions].')).toBe(true);
  });

  it('refuses a package of another generation or content identity, an incomplete package and a group of another package', () => {
    const { held, bound: binding } = soundPackage({ generation: 3 });
    expect(packageError(() => bindFlightSounds({ ...held, generation: 4 }, binding)).mismatch).toBe('generation');
    const otherIdentity: ContentIdentity = { ...binding.identity, converterVersion: 'synthetic-converter.2' as ContentIdentity['converterVersion'] };
    expect(packageError(() => bindFlightSounds(held, { ...binding, identity: otherIdentity })).mismatch).toBe('identity');
    const incomplete: HeldPackage = { ...held, completeness: { status: 'incomplete', diagnostics: [] } };
    expect(packageError(() => bindFlightSounds(incomplete, binding)).mismatch).toBe('incomplete');
    // An audio group of the same Assets converted for another source.
    const foreign = withGroup(held, 'audio', (input) => {
      const { manifest } = syntheticGroup('audio', [], { origin: { type: 'original-import', sourceFingerprint: `source:sha256:${'cd'.repeat(32)}` } });
      return { ...input, manifest: { ...manifest, assets: (input.manifest as { assets: unknown }).assets } };
    });
    expect(packageError(() => bindFlightSounds(foreign, binding)).mismatch).toBe('identity');
  });
});

describe('flight sound binding ownership', () => {
  it('only reads the caller\'s payload bytes and keeps no bytes or decoded content', () => {
    const { held, bound: binding } = soundPackage();
    const records = held.groups.flatMap(({ payloads }) => payloads as { readonly bytes: Uint8Array }[]);
    const before = records.map(({ bytes }) => Uint8Array.from(bytes));
    const content = bindFlightSounds(held, binding);
    records.forEach(({ bytes }, index) => {
      expect(isDetached(bytes.buffer)).toBe(false);
      expect(bytes).toEqual(before[index]);
    });
    // Frozen plain data: Asset IDs, kind bits and the identity only, so no typed array or model geometry is held.
    expect(deepFrozen(content)).toBe(true);
    expect(JSON.parse(JSON.stringify(content))).toEqual(content);
  });
});

describe('flight sound bindings of a production-converted package', () => {
  it('binds every craft type and EXPL record of the mission-startable package to sounds of its audio group', async () => {
    const { holder } = await missionHolder();
    const held = holder.current()!;
    if (held.completeness.status !== 'complete') throw new Error('The mission-startable package is not complete');
    const content = bindFlightSounds(held, { generation: held.generation, identity: held.completeness.identity });

    const audio = new Set(readGroupManifest(held.groups.find(({ group }) => group === 'audio')!.manifest).assets.map(({ id }) => id));
    const logic = held.groups.find(({ group }) => group === 'logic')!;
    const table = missionInput(logic).craftTypes!.content as CraftTypeTable;
    expect(content.craft.filter((entry): entry is CraftSounds => entry !== null).map(({ craftType, model }) => [craftType, model]))
      .toEqual(table.entries.map(({ craftType, model }) => [craftType, model.id]));
    const explosions = ruleDataInputs(held.groups).explosions!.content as ExplosionTable;
    expect(content.explosions).toEqual(explosions.lists.map(list => list.map(({ sound }) => sound.id)));
    expect(content.sounds.length).toBeGreaterThan(0);
    for (const id of content.sounds) expect(audio.has(id)).toBe(true);
  });
});
