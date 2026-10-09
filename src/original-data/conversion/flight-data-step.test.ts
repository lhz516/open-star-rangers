import { describe, expect, it } from 'vitest';
import { addBudgets, BUDGET_DIMENSIONS, EMPTY_BUDGET_USAGE, type BudgetRecord } from '../../content/budget.ts';
import type { SceneSettings } from '../../content/flight/flight-data-content.ts';
import { decodeFlightDataPayload, encodeFlightDataPayload } from '../../content/flight/flight-data-payload.ts';
import type { SyntheticBlock } from '../formats/formats.test-support.ts';
import { rensHeaderBytes } from '../formats/rens-header.test-support.ts';
import { verifySourceMappings } from '../source/verify-source-mappings.ts';
import { ByteWriter } from '../synthetic.test-support.ts';
import { countedVerifiedSource, UNLIMITED_BUDGET } from './conversion.test-support.ts';
import {
  explosionListsBlock, explosionRecordBlock, flightDataFailure, flightMapping, nebulaListBlock, SYNTHETIC_ENTRIES, SYNTHETIC_FLIGHT_DATA_USAGE,
  SYNTHETIC_FLIGHT_PAYLOADS, SYNTHETIC_IDS, SYNTHETIC_LISTS, SYNTHETIC_SCENE, syntheticAnimBlock, syntheticFlightDataDeclarations,
  syntheticFlightDataFiles, syntheticFlightDataMappings, syntheticFrameId,
} from './flight-data.test-support.ts';
import { NEBULA_LIST_LIMITS, runFlightDataStep } from './flight-data-step.ts';

// P3-03 S-09 to S-11 (step): the flight data step on code-generated sources with made-up entry IDs.

type Replace = Readonly<Record<number, SyntheticBlock | null>>;
type Mappings = ReturnType<typeof syntheticFlightDataMappings>;
type Declarations = ReturnType<typeof syntheticFlightDataDeclarations>;

interface RunOptions {
  readonly replace?: Replace;
  readonly mappings?: (mappings: Mappings) => unknown;
  readonly declarations?: (declarations: Declarations) => unknown;
  readonly limits?: BudgetRecord;
  readonly usage?: BudgetRecord;
}

async function run({ replace = {}, mappings = table => table, declarations = set => set, limits = UNLIMITED_BUDGET, usage }: RunOptions = {}) {
  const { source, reads } = await countedVerifiedSource(syntheticFlightDataFiles(replace));
  const action = () => runFlightDataStep(source, mappings(syntheticFlightDataMappings()), declarations(syntheticFlightDataDeclarations()), limits, usage);
  return { action, reads };
}

/** The step's diagnostic, which must not name `hidden` outside its location. */
async function failure(options: RunOptions, hidden?: RegExp) {
  const { action } = await run(options);
  return flightDataFailure(action, hidden);
}

const { rens, lists, nebula, records, anims, sounds, images } = SYNTHETIC_ENTRIES;
const [R1, R2, R3] = records;
const at = (entry: number, path = '') => `archive:/MAIN/SR.NOB#${entry}${path}`;
const mismatch = (location: string) => ({ code: 'subresource-mismatch', location, limit: null });
const declarationError = (location: string) => ({ code: 'invalid-declaration', location, limit: null });

const mappingOf = (table: Mappings, id: string) => table.mappings.find(({ asset }) => asset.id === id)!;
const assetOf = (set: Declarations, id: string) => set.assets.find(({ asset }) => (asset as { id: string }).id === id)!;
/** A copy of `set` whose reference mapping of `id` is replaced. */
function withReference(set: Declarations, id: string, replacement: ReturnType<typeof flightMapping>): Declarations {
  set.references.mappings = set.references.mappings.map(mapping => (mapping.asset.id === id ? replacement : mapping));
  return set;
}
const locator = (type: string, entry: number, subresource: string | null = null, discPath = 'MAIN/SR.NOB') => ({ discPath, entry: { id: entry, type }, subresource });

describe('flight data step', () => {
  it('converts the four roles from their entries, reading each mapped entry once and nothing else', async () => {
    const { source, reads } = await countedVerifiedSource(syntheticFlightDataFiles());
    const start: BudgetRecord = { ...EMPTY_BUDGET_USAGE, assets: 5, dependencyEdges: 3, imagePixels: 9, payloadBytes: 100 };
    const result = await runFlightDataStep(source, syntheticFlightDataMappings(), syntheticFlightDataDeclarations(), UNLIMITED_BUDGET, start);
    expect(Object.fromEntries(reads)).toEqual(Object.fromEntries([rens, lists, nebula, ...records, ...anims].map(entry => [entry, 1])));
    expect(result.usage).toEqual(addBudgets(start, SYNTHETIC_FLIGHT_DATA_USAGE, 'usage'));
    expect(Object.isFrozen(result) && Object.isFrozen(result.groups)).toBe(true);

    const [group] = result.groups;
    expect(result.groups).toHaveLength(1);
    expect(group.group).toBe('models');
    const ids = [SYNTHETIC_IDS.explosions, SYNTHETIC_IDS.nebula, SYNTHETIC_IDS.scene, ...SYNTHETIC_IDS.animations];
    expect(group.descriptors.map(({ id, kind, group: owner }) => [id, kind, owner])).toEqual(ids.map(id => [id, 'data', 'models']));
    expect(group.sources).toEqual(ids.map(id => ({ id, state: 'verified', unknowns: [] })));
    group.descriptors.forEach((descriptor, index) => {
      const payload = group.payloads[index];
      const expected = SYNTHETIC_FLIGHT_PAYLOADS.get(descriptor.id)!;
      expect(payload.id).toBe(descriptor.id);
      expect(descriptor.role).toBe(expected.role);
      expect(payload.bytes).toEqual(encodeFlightDataPayload(expected));
      expect(payload.bytes.byteOffset === 0 && payload.bytes.buffer.byteLength === payload.bytes.length).toBe(true);
      expect(decodeFlightDataPayload(payload.bytes, descriptor)).toEqual(expected);
      expect(descriptor.payloadIdentity).toMatchObject({ schemaVersion: 1, byteLength: payload.bytes.length });
    });

    const byId = new Map<string, (typeof group.descriptors)[number]>(group.descriptors.map(descriptor => [descriptor.id, descriptor]));
    // The table depends on every animation and on the declared sounds, which its records name.
    expect(byId.get(SYNTHETIC_IDS.explosions)!.dependencies).toEqual([
      ...SYNTHETIC_IDS.animations.map(id => ({ id, kind: 'data' })), { id: SYNTHETIC_IDS.sounds[0], kind: 'sound' }, { id: SYNTHETIC_IDS.sounds[1], kind: 'sound' },
    ]);
    expect(byId.get(SYNTHETIC_IDS.nebula)!.dependencies).toEqual(SYNTHETIC_IDS.images.map(id => ({ id, kind: 'image' })));
    expect(byId.get(SYNTHETIC_IDS.animations[1])!.dependencies).toEqual([0, 1, 2].map(frame => ({ id: syntheticFrameId(1, frame), kind: 'image' })));
    expect(byId.get(SYNTHETIC_IDS.scene)!.dependencies).toEqual([]);
  });

  it('numbers animations by the first appearance of their EXPL in the lists, not by entry ID', async () => {
    const { action } = await run();
    const { groups: [group] } = await action();
    const index = group.descriptors.findIndex(({ id }) => id === SYNTHETIC_IDS.explosions);
    const table = decodeFlightDataPayload(group.payloads[index].bytes, group.descriptors[index]);
    if (table.role !== 'explosion-table') throw new Error('expected an explosion table');
    // R2, R1 and R3 first appear in that order; R1 and R3 repeat.
    const [first, second, third] = SYNTHETIC_IDS.animations;
    expect(table.content.lists.map(list => list.map(({ animation }) => animation.id))).toEqual([[first, second], [third, second], [third]]);
    expect(table.content.lists.map(list => list.map(({ sound }) => sound.id))).toEqual([
      [SYNTHETIC_IDS.sounds[1], SYNTHETIC_IDS.sounds[0]], [SYNTHETIC_IDS.sounds[1], SYNTHETIC_IDS.sounds[0]], [SYNTHETIC_IDS.sounds[1]],
    ]);
    // Declaring the animations in another order breaks the chain at the first record.
    const swapped = await failure({ declarations: set => {
      (assetOf(set, SYNTHETIC_IDS.explosions) as { animations: string[] }).animations = [second, first, third];
      return set;
    } });
    expect(swapped).toEqual(mismatch(at(R2, '/animation')));
  });

  it('converts the RENS header only, and keeps it declared until it is parsed', async () => {
    const { source } = await countedVerifiedSource(syntheticFlightDataFiles());
    const verified = await verifySourceMappings(syntheticFlightDataMappings(), source);
    expect(verified.mappings.map(({ asset, resolution }) => [asset.id, resolution])).toEqual(verified.mappings.map(({ asset }) =>
      [asset.id, asset.id === SYNTHETIC_IDS.scene ? 'declared' : 'verified']));

    // Other records and another header: only the header reaches the payload.
    const [flash0, flash1, flash2] = SYNTHETIC_SCENE.screenFlashes;
    const settings: SceneSettings = { ...SYNTHETIC_SCENE, deviceByte: 7, screenFlashes: [flash2, flash0, flash1] };
    const bytes = new Uint8Array(0x60 + 5 * 28).fill(0xc3);
    bytes.set(rensHeaderBytes(settings));
    new DataView(bytes.buffer).setUint32(0x58, 0x60, true);
    const { action } = await run({ replace: { [rens]: { bytes, relocations: [0x58] } } });
    const { groups: [group] } = await action();
    const index = group.descriptors.findIndex(({ id }) => id === SYNTHETIC_IDS.scene);
    expect(decodeFlightDataPayload(group.payloads[index].bytes, group.descriptors[index])).toEqual({ role: 'scene-settings', content: settings });

    // An unread header byte that is not zero fails the whole step.
    const reserved = bytes.slice();
    reserved[0x19] = 1;
    expect(await failure({ replace: { [rens]: { bytes: reserved, relocations: [0x58] } } })).toEqual({ code: 'unsupported-payload', location: at(rens, '/reserved'), limit: null });
  });

  it('keeps an empty result for no declarations', async () => {
    const { action } = await run({ mappings: () => ({ sourceFingerprint: null, mappings: [] }), declarations: () => ({ assets: [], references: { sourceFingerprint: null, mappings: [] } }) });
    expect(await action()).toEqual({ groups: [], usage: EMPTY_BUDGET_USAGE });
  });

  describe('ID chains', () => {
    const cases: [string, Replace, string][] = [
      ['an EXIC list names an unmapped EXPL', { [lists]: explosionListsBlock([[R2, R1], [R3, 30_199], [R3]]) }, at(lists, '/lists[1]/ids[1]')],
      ['a mapped EXPL is in no list', { [lists]: explosionListsBlock([[R2], [R3], [R3]]) }, at(lists, '/lists')],
      ['the lists are empty', { [lists]: explosionListsBlock([[], [], []]) }, at(lists, '/lists')],
      ['an EXPL names another ANIM than its animation', { [R2]: explosionRecordBlock(sounds[1], anims[1]) }, at(R2, '/animation')],
      ['an EXPL names an ANIM of no animation', { [R3]: explosionRecordBlock(sounds[1], 30_199) }, at(R3, '/animation')],
      ['an EXPL names a sound that is not declared', { [R1]: explosionRecordBlock(sounds[2], anims[1]) }, at(R1, '/sound')],
      ['an EXPL names an entry that is no sound', { [R1]: explosionRecordBlock(30_199, anims[1]) }, at(R1, '/sound')],
      ['no record names a declared sound', { [R1]: explosionRecordBlock(sounds[1], anims[1]) }, at(lists, '/lists')],
      ['an ANIM has a frame fewer than its frame images', { [anims[1]]: syntheticAnimBlock(2) }, at(anims[1], '/frames')],
      ['an ANIM has a frame more than its frame images', { [anims[2]]: syntheticAnimBlock(2) }, at(anims[2], '/frames')],
      ['the NEBC list names another BITM', { [nebula]: nebulaListBlock([images[0], images[1], images[0], images[1]]) }, at(nebula, '/images[2]')],
      ['the NEBC list has the images in another order', { [nebula]: nebulaListBlock([images[1], images[0], images[2], images[1]]) }, at(nebula, '/images[0]')],
      ['the NEBC list is shorter than the images', { [nebula]: nebulaListBlock([images[0], images[1], images[2]]) }, at(nebula, '/images')],
      ['the NEBC list is empty', { [nebula]: nebulaListBlock([]) }, at(nebula, '/images')],
    ];
    it.each(cases)('%s is subresource-mismatch, without a result', async (_, replace, location) => {
      expect(await failure({ replace }, /30199|30135/)).toEqual(mismatch(location));
    });
  });

  it('rejects a format failure of any entry at its archive location', async () => {
    const unlisted = explosionListsBlock(SYNTHETIC_LISTS);
    unlisted.relocations = [];
    const extraRelocation = nebulaListBlock([images[0], images[1], images[2], images[1]]);
    extraRelocation.relocations.push(4);
    const cases: [Replace, string, string][] = [
      [{ [lists]: unlisted }, 'invalid-payload', at(lists, '/lists[0]')],
      [{ [R1]: { bytes: new ByteWriter().u32(sounds[0]).toBytes(), relocations: [] } }, 'invalid-payload', at(R1, '/record')],
      [{ [nebula]: extraRelocation }, 'invalid-payload', at(nebula, '/images')],
      [{ [anims[0]]: { bytes: new ByteWriter().u32(8, 0).toBytes(), relocations: [0] } }, 'unsupported-payload', at(anims[0], '/frames')],
    ];
    for (const [replace, code, location] of cases) expect(await failure({ replace })).toEqual({ code, location, limit: null });
    const header = rensHeaderBytes(SYNTHETIC_SCENE);
    new DataView(header.buffer).setUint32(4, 0x7fc0_0000, true);
    const bytes = new Uint8Array(0x60).fill(0);
    bytes.set(header);
    new DataView(bytes.buffer).setUint32(0x58, 0x60, true);
    expect(await failure({ replace: { [rens]: { bytes, relocations: [0x58] } } })).toEqual({ code: 'invalid-payload', location: at(rens, '/lightType3Colour[1]'), limit: null });
  });

  describe('declarations', () => {
    const [first, second, third] = SYNTHETIC_IDS.animations;
    const table = (set: Declarations) => assetOf(set, SYNTHETIC_IDS.explosions) as { animations: string[]; sounds: string[] };
    const cases: [string, RunOptions, string][] = [
      ['a declared Asset without a mapping', { mappings: t => ({ ...t, mappings: t.mappings.filter(({ asset }) => asset.id !== SYNTHETIC_IDS.nebula) }) }, 'flightData.declarations.assets[5]'],
      ['a mapped Asset without a declaration', {
        mappings: t => ({ ...t, mappings: [...t.mappings, flightMapping('data/zz-extra', [locator('NEBC', nebula)])] }),
      }, 'flightData.declarations'],
      ['scene settings mapped to the whole RENS entry', { mappings: t => (mappingOf(t, SYNTHETIC_IDS.scene).parts[0].alternatives[0].subresource = null, t) }, `flightData[${SYNTHETIC_IDS.scene}].source`],
      ['scene settings mapped to another part of the RENS entry', { mappings: t => (mappingOf(t, SYNTHETIC_IDS.scene).parts[0].alternatives[0].subresource = 'records', t) }, `flightData[${SYNTHETIC_IDS.scene}].source`],
      ['an explosion table without its EXIC entry', { mappings: t => (mappingOf(t, SYNTHETIC_IDS.explosions).parts.shift(), t), declarations: s => (table(s).animations.pop(), s) }, `flightData[${SYNTHETIC_IDS.explosions}].source`],
      ['an explosion table with a NEBC part', { mappings: t => (mappingOf(t, SYNTHETIC_IDS.explosions).parts.push({ alternatives: [locator('NEBC', nebula)] }), t) }, `flightData[${SYNTHETIC_IDS.explosions}].source`],
      ['an explosion table with fewer EXPL than animations', { mappings: t => (mappingOf(t, SYNTHETIC_IDS.explosions).parts.pop(), t) }, `flightData[${SYNTHETIC_IDS.explosions}].animations`],
      ['a table naming an Asset that is not an animation', { declarations: s => (table(s).animations[2] = SYNTHETIC_IDS.nebula, s) }, `flightData[${SYNTHETIC_IDS.explosions}].animations[2]`],
      ['an animation no table names', {
        mappings: t => (mappingOf(t, SYNTHETIC_IDS.explosions).parts.pop(), t), declarations: s => (table(s).animations = [first, second], s),
      }, `flightData[${third}].source`],
      ['an animation mapped to an ANIM frame', { mappings: t => (mappingOf(t, first).parts[0].alternatives[0].subresource = 'frames/0', t) }, `flightData[${first}].source`],
      ['a frame image of another ANIM', {
        declarations: s => withReference(s, syntheticFrameId(0, 1), flightMapping(syntheticFrameId(0, 1), [locator('ANIM', anims[1], 'frames/1')])),
      }, `flightData[${first}].frames[1]`],
      ['a nebula list mapped to an EXIC entry', { mappings: t => (mappingOf(t, SYNTHETIC_IDS.nebula).parts[0].alternatives[0].entry.type = 'EXIC', t) }, `flightData[${SYNTHETIC_IDS.nebula}].source`],
      ['a nebula image in another archive', {
        declarations: s => withReference(s, SYNTHETIC_IDS.images[1], flightMapping(SYNTHETIC_IDS.images[1], [locator('BITM', images[1], null, 'MAIN/OTHER.NOB')])),
      }, `flightData[${SYNTHETIC_IDS.nebula}].images[1]`],
      ['a sound in another archive', {
        declarations: s => withReference(s, SYNTHETIC_IDS.sounds[0], flightMapping(SYNTHETIC_IDS.sounds[0], [locator('SND', sounds[0], null, 'MAIN/OTHER.NOB')])),
      }, `flightData[${SYNTHETIC_IDS.explosions}].sounds[0]`],
      ['two sounds of one SND entry', {
        declarations: s => withReference(s, SYNTHETIC_IDS.sounds[1], flightMapping(SYNTHETIC_IDS.sounds[1], [locator('SND', sounds[0])])),
      }, `flightData[${SYNTHETIC_IDS.explosions}].sounds[1]`],
    ];
    it.each(cases)('rejects %s before reading any entry', async (_, options, location) => {
      const { action, reads } = await run(options);
      expect(await flightDataFailure(action)).toEqual(declarationError(location));
      expect(reads.size).toBe(0);
    });

    const reader: [string, (set: Declarations) => unknown, string][] = [
      ['a set that is not a record', () => [], 'flightData.declarations'],
      ['an unknown role', set => (set.assets[0].role = 'explosion', set), 'flightData.declarations.assets[0].role'],
      ['a kind other than data', set => (set.assets[0].asset = { id: 'image/scene', kind: 'image' }, set), 'flightData.declarations.assets[0].asset.kind'],
      ['a group other than models', set => (set.assets[0].group = 'cockpit-hud-map', set), 'flightData.declarations.assets[0].group'],
      ['a field another role has', set => (set.assets[0].frames = [], set), 'flightData.declarations.assets[0]'],
      ['a missing field', set => (delete set.assets[1].sounds, set), 'flightData.declarations.assets[1].sounds'],
      ['a frame that is not an image', set => ((set.assets[2].frames as string[])[0] = SYNTHETIC_IDS.sounds[0], set), 'flightData.declarations.assets[2].frames[0]'],
      ['a repeated frame', set => ((set.assets[2].frames as string[])[1] = syntheticFrameId(0, 0), set), 'flightData.declarations.assets[2].frames[1]'],
      ['a repeated animation', set => (table(set).animations[1] = first, set), 'flightData.declarations.assets[1].animations[1]'],
      ['a repeated Asset', set => (set.assets.push(set.assets[0]), set), 'flightData.declarations.assets[6].asset.id'],
      ['a named image without a reference mapping', set => (set.references.mappings = set.references.mappings.filter(({ asset }) => asset.id !== SYNTHETIC_IDS.images[2]), set),
        'flightData.declarations.assets[5].images[2]'],
      ['a frame reference at another frame index', set => withReference(set, syntheticFrameId(0, 0), flightMapping(syntheticFrameId(0, 0), [locator('ANIM', anims[0], 'frames/1')])),
        'flightData.declarations.assets[2].frames[0]'],
      ['a sound reference that is not an SND entry', set => withReference(set, SYNTHETIC_IDS.sounds[0], flightMapping(SYNTHETIC_IDS.sounds[0], [locator('BITM', images[0])])),
        'flightData.declarations.assets[1].sounds[0]'],
      ['a reference mapping no declaration names', set => (set.references.mappings.push(flightMapping('sound/zz-extra', [locator('SND', 30_155)])), set),
        'flightData.declarations.references'],
      ['an invalid reference mapping table', set => (set.references.mappings.reverse(), set), 'flightData.declarations.references.mappings[1]'],
    ];
    it('rejects reference mappings bound to another source before reading any entry', async () => {
      const { action, reads } = await run({ declarations: set => ({ ...set, references: { ...set.references, sourceFingerprint: 'source:another-disc' } }) });
      expect(await flightDataFailure(action)).toEqual({ code: 'fingerprint-mismatch', location: 'flightData.declarations.references.sourceFingerprint', limit: null });
      expect(reads.size).toBe(0);
    });

    it.each(reader)('rejects %s as invalid-declaration', async (_, edit, location) => {
      const { action, reads } = await run({ declarations: set => edit(set as Declarations & { assets: Record<string, unknown>[] }) });
      expect(await flightDataFailure(action)).toEqual(declarationError(location));
      expect(reads.size).toBe(0);
    });
  });

  describe('structural limits', () => {
    const padded = (block: SyntheticBlock, length: number): SyntheticBlock => {
      const bytes = new Uint8Array(length);
      bytes.set(block.bytes);
      return { bytes, relocations: block.relocations };
    };
    const order = [images[0], images[1], images[2], images[1]];
    const indexOf = (id: string) => syntheticFlightDataMappings().mappings.findIndex(({ asset }) => asset.id === id);
    const tooLarge: [string, number, SyntheticBlock, string, number][] = [
      ['NEBC', nebula, padded(nebulaListBlock(order), NEBULA_LIST_LIMITS.entryBytes + 1), SYNTHETIC_IDS.nebula, 256],
      ['RENS', rens, { bytes: new Uint8Array(2_049), relocations: [] }, SYNTHETIC_IDS.scene, 2_048],
      ['EXIC', lists, padded(explosionListsBlock(SYNTHETIC_LISTS), 257), SYNTHETIC_IDS.explosions, 256],
      ['ANIM', anims[0], { bytes: new Uint8Array(131_073), relocations: [] }, SYNTHETIC_IDS.animations[0], 131_072],
    ];
    it.each(tooLarge)('rejects a %s entry above its limit by its directory size, without reading it', async (_, entry, block, id, limit) => {
      const { action, reads } = await run({ replace: { [entry]: block } });
      expect(await flightDataFailure(action)).toEqual({
        code: 'limit-exceeded', location: `sources.mappings[${indexOf(id)}].parts[0].alternatives[0]`, limit: { name: 'payloadEntryBytes', limit, observed: limit + 1 },
      });
      expect(reads.has(entry)).toBe(false);
    });

    it('rejects an EXPL entry larger than the record format before reading it', async () => {
      const { action, reads } = await run({ replace: { [R3]: padded(explosionRecordBlock(sounds[1], anims[2]), 9) } });
      expect((await flightDataFailure(action)).limit).toEqual({ name: 'payloadEntryBytes', limit: 8, observed: 9 });
      expect(reads.has(R3)).toBe(false);
    });

    it('accepts RENS, EXIC and NEBC entries exactly at their limits', async () => {
      const header = new Uint8Array(2_048);
      header.set(rensHeaderBytes(SYNTHETIC_SCENE));
      const { action } = await run({ replace: {
        [nebula]: padded(nebulaListBlock(order), NEBULA_LIST_LIMITS.entryBytes),
        [rens]: { bytes: header, relocations: [] },
        [lists]: padded(explosionListsBlock(SYNTHETIC_LISTS), 256),
      } });
      const { usage } = await action();
      expect(usage).toEqual(SYNTHETIC_FLIGHT_DATA_USAGE);
    });

    it('accepts 32 NEBC images and rejects 33 before reading the list', async () => {
      const declare = (count: number) => (set: Declarations) => {
        (assetOf(set, SYNTHETIC_IDS.nebula) as { images: string[] }).images = Array.from({ length: count }, (_, index) => SYNTHETIC_IDS.images[index % 3]);
        return set;
      };
      const list = (count: number) => nebulaListBlock(Array.from({ length: count }, (_, index) => images[index % 3]));
      const exact = await run({ replace: { [nebula]: list(32) }, declarations: declare(32) });
      expect((await exact.action()).groups[0].descriptors.find(({ id }) => id === SYNTHETIC_IDS.nebula)!.dependencies).toHaveLength(3);
      const over = await run({ replace: { [nebula]: list(33) }, declarations: declare(33) });
      expect(await flightDataFailure(over.action)).toEqual({
        code: 'limit-exceeded', location: at(nebula, '/images'), limit: { name: 'payloadItems', limit: NEBULA_LIST_LIMITS.images, observed: 33 },
      });
    });
  });

  it('passes a budget equal to its usage on top of earlier steps and rejects one less in each charged dimension', async () => {
    const earlier: BudgetRecord = { ...EMPTY_BUDGET_USAGE, assets: 7, dependencyEdges: 11, imagePixels: 64, payloadBytes: 4_096 };
    const exact = addBudgets(earlier, SYNTHETIC_FLIGHT_DATA_USAGE, 'limits');
    expect((await (await run({ limits: exact, usage: earlier })).action()).usage).toEqual(exact);
    const charged = BUDGET_DIMENSIONS.filter(dimension => SYNTHETIC_FLIGHT_DATA_USAGE[dimension] !== 0);
    expect(charged).toEqual(['assets', 'dependencyEdges', 'payloadBytes']);
    for (const dimension of charged) {
      const limits = { ...exact, [dimension]: exact[dimension] - 1 };
      expect(await failure({ limits, usage: earlier })).toEqual({
        code: 'budget-exceeded', location: `flightData[${SYNTHETIC_IDS.animations[2]}]`, limit: { name: dimension, limit: exact[dimension] - 1, observed: exact[dimension] },
      });
    }
  });
});
