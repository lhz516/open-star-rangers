import { describe, expect, it } from 'vitest';
import { EMPTY_BUDGET_USAGE, addBudgets, type BudgetRecord } from '../../content/budget.ts';
import { encodeEffectPayload, readEffectPayload, type EffectKind } from '../../content/effects/effect-payload.ts';
import type { VerifiedSource } from '../source/open-verified-source.ts';
import { buildImfat, leInternalFixup, type SyntheticEntry } from '../synthetic.ts';
import { UNLIMITED_BUDGET, countedVerifiedSource, expectSourceError } from './conversion.test-support.ts';
import { runEffectStep } from './effect-step.ts';
import { PRODUCTION_EFFECT_DECLARATIONS, PRODUCTION_EFFECT_MAPPINGS, PRODUCTION_EFFECT_REGIONS } from './production-effects.ts';
import {
  PRODUCTION_EFFECT_USAGE, syntheticEffectExecutable, syntheticEffectPayloads, syntheticMissileSource, syntheticProjectileSource, syntheticRensEntry,
} from './production-effects.test-support.ts';

// P2-06 AC-20 (step): the production effect inputs on synthetic sources at the production RENS entry and regions.

const ID = Object.freeze({ projectile: 'data/projectile-visuals', missile: 'data/missile-visuals', debris: 'data/debris-visuals' });

/** The index of a use among an Asset's regions, which its diagnostics name. */
const regionIndex = (id: string, use: string): number => PRODUCTION_EFFECT_REGIONS.get(id)!.findIndex(region => region.use === use);

interface Sources {
  readonly rens?: SyntheticEntry | null;
  readonly exe?: Uint8Array | null;
}

async function sourceOf({ rens = syntheticRensEntry(), exe = syntheticEffectExecutable() }: Sources = {}): Promise<{ source: VerifiedSource; opened: string[] }> {
  const files: Record<string, Uint8Array> = { 'MAIN/SR.NOB': buildImfat(10_000, rens ? [rens] : [{ id: 10_001, type: 'DATA', data: new Uint8Array(4) }]) };
  if (exe) files['MAIN/SRANGERS.EXE'] = exe;
  const { source } = await countedVerifiedSource(files);
  const opened: string[] = [];
  return { source: { ...source, openFile: path => (opened.push(path), source.openFile(path)), openArchive: path => source.openArchive(path), usage: () => source.usage(), identity: source.identity }, opened };
}

const run = async (sources: Sources = {}, limits: BudgetRecord = UNLIMITED_BUDGET, mappings: unknown = PRODUCTION_EFFECT_MAPPINGS, declarations: unknown = PRODUCTION_EFFECT_DECLARATIONS) =>
  runEffectStep((await sourceOf(sources)).source, mappings, declarations, limits);

/** Expects the step to fail with this SourceError; any partial result would be a resolved promise. */
async function expectFailure(sources: Sources, code: string, location: string, limit: unknown = null, limits?: BudgetRecord): Promise<void> {
  const error = await run(sources, limits).then(() => null, (caught: unknown) => caught);
  expectSourceError(() => { throw error; }, code, location, limit as never);
}

/** The executable with one Asset's region bytes replaced. */
const exeWith = (id: string, use: string, replace: (bytes: Uint8Array) => Uint8Array) =>
  syntheticEffectExecutable(undefined, (asset, candidate, bytes) => (asset === id && candidate === use ? replace(bytes.slice()) : bytes));
const setU32 = (offset: number, value: number) => (bytes: Uint8Array) => {
  new DataView(bytes.buffer).setUint32(offset, value, true);
  return bytes;
};

describe('effect step', () => {
  it('converts the three effect Assets bit for bit, charging each on top of the earlier usage', async () => {
    const { source, opened } = await sourceOf();
    const start: BudgetRecord = { ...EMPTY_BUDGET_USAGE, assets: 3, vertices: 10 };
    const result = await runEffectStep(source, PRODUCTION_EFFECT_MAPPINGS, PRODUCTION_EFFECT_DECLARATIONS, UNLIMITED_BUDGET, start);
    expect(result.usage).toEqual(addBudgets(start, PRODUCTION_EFFECT_USAGE, 'usage'));
    expect(opened).toEqual(['MAIN/SRANGERS.EXE']);
    const [group] = result.groups;
    expect(group.group).toBe('models');
    const expected = syntheticEffectPayloads();
    expect(group.descriptors.map(({ id, kind, role, dependencies }) => ({ id, kind, role, dependencies }))).toEqual([
      { id: ID.debris, kind: 'data', role: 'debris', dependencies: [{ id: 'image/model-texture/16', kind: 'image' }] },
      { id: ID.missile, kind: 'data', role: 'missile', dependencies: [{ id: 'image/missile', kind: 'image' }] },
      { id: ID.projectile, kind: 'data', role: 'projectile', dependencies: [] },
    ]);
    group.payloads.forEach(({ id, schemaVersion, bytes }, index) => {
      const payload = expected.get(id)!;
      expect(bytes).toEqual(encodeEffectPayload(payload));
      expect(readEffectPayload(bytes, schemaVersion, group.descriptors[index].role as EffectKind)).toEqual(payload);
      expect(group.descriptors[index].payloadIdentity.byteLength).toBe(bytes.length);
    });
    expect(group.sources).toEqual([ID.debris, ID.missile, ID.projectile].map(id => ({ id, state: 'verified', unknowns: ['U-027'] })));
  });

  it('keeps an empty result for no declarations', async () => {
    expect(await run({}, UNLIMITED_BUDGET, { sourceFingerprint: null, mappings: [] }, [])).toEqual({ groups: [], usage: EMPTY_BUDGET_USAGE });
  });

  it('pairs declarations with mappings and checks the parts against the declared uses', async () => {
    const [debris, missile, projectile] = PRODUCTION_EFFECT_MAPPINGS.mappings;
    const declarations = PRODUCTION_EFFECT_DECLARATIONS;
    const mappings = (...list: unknown[]) => ({ sourceFingerprint: null, mappings: list });
    const failures: [unknown, unknown, string, string?][] = [
      [mappings(debris, missile), declarations, 'effects.declarations[0]'],
      [PRODUCTION_EFFECT_MAPPINGS, declarations.slice(0, 2), 'effects.declarations'],
      [mappings(debris, missile, { ...projectile, parts: projectile.parts.slice(1) }), declarations, `effects[${ID.projectile}].source`,
        'a projectile mapping must start with one whole RENS entry of the effect archive'],
      [mappings({ ...debris, parts: debris.parts.slice(1) }, missile, projectile), declarations, `effects[${ID.debris}].source`],
    ];
    // A constants region shorter than its use accepts.
    const constants = regionIndex(ID.missile, 'constants');
    const shortened = missile.parts.map((part, index) => index !== constants ? part
      : { alternatives: [{ ...part.alternatives[0], subresource: part.alternatives[0].subresource!.replace(/\/56$/, '/48') }] });
    failures.push([mappings(debris, { ...missile, parts: shortened }, projectile), declarations, `effects[${ID.missile}].regions[${constants}]`]);
    for (const [table, declared, location, reason] of failures) {
      const error = await run({}, UNLIMITED_BUDGET, table, declared).then(() => null, (caught: unknown) => caught);
      expectSourceError(() => { throw error; }, 'invalid-declaration', location, null, reason);
    }
    const reordered = { ...declarations[0], regions: [...declarations[0].regions].reverse() };
    const error = await run({}, UNLIMITED_BUDGET, PRODUCTION_EFFECT_MAPPINGS, [reordered, ...declarations.slice(1)]).then(() => null, (caught: unknown) => caught);
    expectSourceError(() => { throw error; }, 'invalid-declaration', `effects[${ID.projectile}].regions[0]`);
  });

  it('reports an uncovered executable at the region alternative, without reading it', async () => {
    const debris = PRODUCTION_EFFECT_MAPPINGS.mappings.findIndex(({ asset }) => asset.id === ID.debris);
    await expectFailure({ exe: null }, 'path-not-covered', `sources.mappings[${debris}].parts[0].alternatives[0]`);
  });

  it('rejects a damaged executable at the first Asset that reads it', async () => {
    const exe = syntheticEffectExecutable();
    exe[0] = 0;
    await expectFailure({ exe }, 'invalid-payload', `effects[${ID.debris}].source`);
  });

  it('rejects a region a fixup patches', async () => {
    const [{ object, offset }] = PRODUCTION_EFFECT_REGIONS.get(ID.debris)!;
    expect(object).toBe(2);
    // Object 1 is one page, so page p of object 2 is page map entry p + 2.
    const exe = syntheticEffectExecutable(undefined, undefined, { [Math.floor(offset / 4_096) + 2]: leInternalFixup(offset % 4_096) });
    await expectFailure({ exe }, 'invalid-payload', `effects[${ID.debris}].regions[0]`);
  });

  it.each<[string, Sources, string, string, unknown]>([
    ['no projectile records', { rens: syntheticRensEntry(undefined, 0) }, 'limit-exceeded', `effects[${ID.projectile}].source`,
      { name: 'effectRecords', limit: 64, observed: 0 }],
    ['65 projectile records', { rens: syntheticRensEntry(undefined, 65) }, 'limit-exceeded', `effects[${ID.projectile}].source`,
      { name: 'effectRecords', limit: 64, observed: 65 }],
    ['records beyond the RENS entry', { rens: syntheticRensEntry(undefined, 6) }, 'invalid-payload', `effects[${ID.projectile}].source`, null],
    ['a RENS header without its pointer relocation', { rens: { ...syntheticRensEntry(), relocations: [] } }, 'invalid-payload', `effects[${ID.projectile}].source`, null],
    ['a RENS pointer into the record table', { rens: (() => {
      const rens = syntheticRensEntry(undefined, 4);
      new DataView(rens.data.buffer).setUint32(0x58, 0x60 + 28, true);
      return rens;
    })() }, 'invalid-payload', `effects[${ID.projectile}].source`, null],
    ['records after the counted ones', { rens: syntheticRensEntry(undefined, 4) }, 'invalid-payload', `effects[${ID.projectile}].source`, null],
    ['a NaN record colour', { rens: (() => {
      const projectile = syntheticProjectileSource();
      return syntheticRensEntry({ ...projectile, records: projectile.records.map((record, index) => (index === 2 ? { ...record, colour: [0, Number.NaN, 0] as const } : record)) });
    })() }, 'invalid-payload', `effects[${ID.projectile}].records[2]`, null],
    ['33 missile types', { exe: exeWith(ID.missile, 'type-count', setU32(0, 33)) }, 'limit-exceeded',
      `effects[${ID.missile}].regions[${regionIndex(ID.missile, 'type-count')}]`, { name: 'missileTypes', limit: 32, observed: 33 }],
    ['a type count the table does not hold', { exe: exeWith(ID.missile, 'type-count', setU32(0, 8)) }, 'invalid-payload',
      `effects[${ID.missile}].regions[${regionIndex(ID.missile, 'types')}]`, null],
    ['two body segments', { exe: exeWith(ID.missile, 'types', setU32(3 * 0x7c + 0x28, 2)) }, 'limit-exceeded',
      `effects[${ID.missile}].records[3]`, { name: 'ringSegments', limit: 64, observed: 2 }],
    ['five missile parts', { exe: exeWith(ID.missile, 'types', setU32(5 * 0x7c, 5)) }, 'invalid-payload', `effects[${ID.missile}].records[5]`, null],
    ['a 25-bit fin colour', { exe: exeWith(ID.missile, 'types', setU32(1 * 0x7c + 0x30 + 16, 0x100_0000)) }, 'invalid-payload', `effects[${ID.missile}].records[1]`, null],
    ['a NaN missile flag', { exe: exeWith(ID.missile, 'types', setU32(8 * 0x7c + 0x78, 0x7fc0_0000)) }, 'invalid-payload', `effects[${ID.missile}].records[8]`, null],
    ['an infinite missile constant', { exe: exeWith(ID.missile, 'constants', setU32(20, 0x7ff0_0000)) }, 'invalid-payload',
      `effects[${ID.missile}].regions[${regionIndex(ID.missile, 'constants')}]`, null],
    ['an 8-bit colour immediate that is NaN as a float', { exe: exeWith(ID.missile, 'extra-colour-2', () => Uint8Array.of(0x80)) }, 'invalid-payload',
      `effects[${ID.missile}].regions[${regionIndex(ID.missile, 'extra-colour-2')}]`, null],
    ['an extra face beyond its vertices', { exe: exeWith(ID.missile, 'extra-faces', setU32(4, 3)) }, 'invalid-payload', `effects[${ID.missile}].templates[3]`, null],
    ['a face list without its end marker', { exe: exeWith(ID.projectile, 'template-1-faces', setU32(64, 3)) }, 'invalid-payload', `effects[${ID.projectile}].templates[1]`, null],
    ['an infinite projectile vertex', { exe: exeWith(ID.projectile, 'template-0-vertices', setU32(8, 0xff80_0000)) }, 'invalid-payload', `effects[${ID.projectile}].templates[0]`, null],
    ['an infinite debris scale', { exe: exeWith(ID.debris, 'textured-scale-1', setU32(0, 0x7f80_0000)) }, 'invalid-payload',
      `effects[${ID.debris}].regions[${regionIndex(ID.debris, 'textured-scale-1')}]`, null],
    ['a debris face of more corners than vertices', { exe: exeWith(ID.debris, 'untextured-faces', setU32(0, 7)) }, 'invalid-payload', `effects[${ID.debris}].templates[0]`, null],
  ])('rejects %s', async (_, sources, code, location, limit) => expectFailure(sources, code, location, limit));

  it('charges each Asset in ID order and rejects one beyond the limits before encoding it', async () => {
    const payloads = syntheticEffectPayloads();
    const missileBytes = encodeEffectPayload(payloads.get(ID.missile)!).length;
    const debrisBytes = encodeEffectPayload(payloads.get(ID.debris)!).length;
    const limits = { ...UNLIMITED_BUDGET, payloadBytes: debrisBytes + missileBytes - 1 };
    await expectFailure({}, 'budget-exceeded', `effects[${ID.missile}]`, { name: 'payloadBytes', limit: limits.payloadBytes, observed: debrisBytes + missileBytes }, limits);
    const vertices = { ...UNLIMITED_BUDGET, vertices: PRODUCTION_EFFECT_USAGE.vertices };
    expect((await run({}, vertices)).usage.vertices).toBe(PRODUCTION_EFFECT_USAGE.vertices);
  });

  it('reads a sign-extended 8-bit immediate as the low half of the rotation scale', async () => {
    const result = await run();
    const missile = result.groups[0].payloads.find(({ id }) => id === ID.missile)!;
    expect(readEffectPayload(missile.bytes, 1, 'missile').rotationScale).toBe(syntheticMissileSource().rotationScale);
  });
});
