import { describe, expect, it } from 'vitest';
import { AI_PROGRAMS_LIMITS, readAiPrograms, type AiPrograms } from '../../content/rule-data/ai-programs.ts';
import { encodeRuleDataPayload } from '../../content/rule-data/rule-data-payload.ts';
import {
  builtInProgram, deepFrozen, MARKER, parameterEntry, script, scriptItem, syntheticAiPrograms, tableProgram, text,
} from '../../content/rule-data/rule-data.test-support.ts';
import type { DiscPath } from '../disc/disc-path.ts';
import { SourceError, type SourceErrorData } from '../source-error.ts';
import { sourceFailure } from '../source-error.test-support.ts';
import { memoryByteSource } from '../synthetic.test-support.ts';
import { AI_LAYOUT, AI_SOURCE_LIMITS, parseAiPrograms } from './ai.ts';
import {
  aiContent, aiSources, BUILT_IN_LOCATION, nameLocation, SYNTHETIC_AI_IDS, syntheticAiSources, syntheticBuiltIn,
  syntheticBuiltInExecutable, type SyntheticAiSources,
} from './ai.test-support.ts';
import type { SyntheticBlock } from './formats.test-support.ts';
import { openLeExecutable } from './le-executable.ts';

// P3-03 AC-05 (parsing), AC-14 (structural limits) and AC-18 for the AISTUFF group-0 closure and the EXE built-in program
// table. All sources are code-generated from synthetic content; texts carry MARKER, which no diagnostic may contain.

const AISTUFF = 'MAIN/AISTUFF.NOB' as DiscPath;
const { programBytes, scriptItemBytes } = AI_LAYOUT;
const entryId = (index: number) => SYNTHETIC_AI_IDS.entries + index * 2;
const at = (id: number, path = '') => `archive:/MAIN/AISTUFF.NOB#${id}${path}`;
const GLOBALS = SYNTHETIC_AI_IDS.globals;
const TABLE = SYNTHETIC_AI_IDS.table;

const parse = (synthetic: SyntheticAiSources = syntheticAiSources(), group = 0) => parseAiPrograms(AISTUFF, aiSources(synthetic), group);
/** Content the payload reader would reject, for sources beyond the limits. */
const unchecked = (plain: unknown) => plain as AiPrograms;

const failure = (action: () => unknown) => sourceFailure(action, new RegExp(MARKER));

/** A failure located at a region, whose location the archive grammar does not cover. */
async function regionFailure(action: () => unknown): Promise<Omit<SourceErrorData, 'reason'>> {
  try {
    await action();
  } catch (error) {
    if (!(error instanceof SourceError)) throw error;
    const { code, location, limit } = error.toData();
    if (new RegExp(MARKER).test(JSON.stringify(error.toData()))) throw new Error('the diagnostic leaks private input', { cause: error });
    return { code, location, limit };
  }
  throw new Error('expected a SourceError');
}

const diagnostic = (code: string, location: string) => ({ code, location, limit: null });
const limitExceeded = (location: string, name: string, limit: number) => ({ code: 'limit-exceeded', location, limit: { name, limit, observed: limit + 1 } });

const viewOf = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
const setU32 = (bytes: Uint8Array, offset: number, value: number) => viewOf(bytes).setUint32(offset, value >>> 0, true);
const getU32 = (bytes: Uint8Array, offset: number) => viewOf(bytes).getUint32(offset, true);
/** The block with `extra` bytes appended. */
const padded = ({ bytes, relocations }: SyntheticBlock, extra: number): SyntheticBlock => {
  const grown = new Uint8Array(bytes.length + extra).fill(0x5a);
  grown.set(bytes);
  return { bytes: grown, relocations };
};

/** The default sources with one block changed. */
function changed(select: (synthetic: SyntheticAiSources) => SyntheticBlock, change: (block: SyntheticBlock) => void, content?: AiPrograms) {
  const synthetic = syntheticAiSources(content);
  change(select(synthetic));
  return synthetic;
}

const aico = (synthetic: SyntheticAiSources) => synthetic.globals.block;
const table = (synthetic: SyntheticAiSources) => synthetic.table.block;
const entry = (index: number) => (synthetic: SyntheticAiSources) => synthetic.entries[index].block;

// The synthetic content (rule-data test support): programs naming entries 0, 4 and 0; entry 0 is a DFPG with install
// script 1 and lists state1 [2], state2 [3, 2] and state6 [3]; entry 4 a DFPG with state4 [5, 2]; the rest scripts.
const NEGATIVE_ZERO = 0x8000_0000;
const NAN = 0x7fc0_0000;

describe('AISTUFF and built-in AI program parsing', () => {
  it('parses the synthetic sources back into their content, frozen, and returns the entry IDs in first-reach order', () => {
    const content = aiContent();
    const parsed = parse(syntheticAiSources(content));
    expect(parsed.content).toEqual(content);
    expect(parsed.entryIds).toEqual(content.entries.map((_, index) => entryId(index)));
    expect(deepFrozen(parsed)).toBe(true);
    // The content is what the payload contract reads and encodes.
    expect(readAiPrograms(parsed.content)).toEqual(parsed.content);
    expect(encodeRuleDataPayload({ role: 'ai-programs', content: parsed.content })).toBeInstanceOf(Uint8Array);
  });

  it('takes every value from the input', () => {
    const plain = syntheticAiPrograms();
    plain.groupTriple = [7, -8, 9];
    plain.globals.at38 = 0x8000_0001;
    plain.programs[0].at50 = 0x1234;
    (plain.entries[0] as ReturnType<typeof parameterEntry>).at2C = 6.5;
    (plain.entries[1] as ReturnType<typeof script>).items[0].opcode = 4242;
    plain.builtInPrograms[1].handler = { object: 7, offset: 0x99 };
    const content = aiContent(plain);
    expect(parse(syntheticAiSources(content)).content).toEqual(content);
  });

  it('selects the triple of the given difficulty group', () => {
    const content = aiContent();
    for (const group of [0, 2, 4]) {
      expect(parse(syntheticAiSources(content, { triples: 5, group }), group).content.groupTriple).toEqual(content.groupTriple);
    }
    expect(parse(syntheticAiSources(content, { triples: 5, group: 2 }), 0).content.groupTriple).not.toEqual(content.groupTriple);
  });

  it('maps the zero values the table loader replaces to null, and keeps the built-in values', () => {
    const plain = syntheticAiPrograms();
    plain.builtInPrograms[0].at2C = 0;
    const synthetic = syntheticAiSources(aiContent(plain));
    // Program 1 holds kind mask 0 and +0x2C +0.0; program 0 gets −0.0 at +0x2C.
    setU32(synthetic.table.block.bytes, 0x2c, NEGATIVE_ZERO);
    const { programs, builtInPrograms } = parse(synthetic).content;
    expect([programs[0].at2C, programs[1].at2C, programs[1].kindMask]).toEqual([null, null, null]);
    expect([builtInPrograms[0].kindMask, builtInPrograms[0].at2C]).toEqual([0, 0]);
  });

  it('does not read the positions the load code overwrites', () => {
    const content = aiContent();
    const synthetic = syntheticAiSources(content);
    // Table +0x18 and +0x20 and DFPG +0x0C already hold non-zero values; other values change nothing.
    setU32(synthetic.table.block.bytes, programBytes + 0x18, 0xffff_ffff);
    setU32(synthetic.table.block.bytes, 0x20, NAN);
    setU32(synthetic.entries[0].block.bytes, 0x0c, NAN);
    // The stored words at the built-in fixup sites do not name the targets.
    setU32(synthetic.builtIn.bytes, 0x00, 0xdead);
    setU32(synthetic.builtIn.bytes, 0x18, 0xbeef);
    expect(parse(synthetic).content).toEqual(content);
  });

  it('stops the program table at the first record whose first word is zero', () => {
    const plain = syntheticAiPrograms();
    plain.programs = [];
    plain.entries = [];
    expect(parse(syntheticAiSources(aiContent(plain))).content).toMatchObject({ programs: [], entries: [] });
    // Only the first word ends the records: a record with zeros elsewhere is a record.
    plain.programs = [tableProgram(0, { at04: 0, kindMask: null, at0C: 0, at10: 0, at14: 0 }), tableProgram(0)];
    plain.entries = [parameterEntry(null)];
    const content = aiContent(plain);
    expect(parse(syntheticAiSources(content)).content.programs).toEqual(content.programs);
  });

  it('orders the entries as the table loader first reaches them, whatever the order they are given in', () => {
    const plain = syntheticAiPrograms();
    // Program 1 names a second DFPG, whose install script and lists reach scripts 4 and 5 and again 2 and 4.
    plain.programs = [tableProgram(0), tableProgram(3), tableProgram(0)];
    plain.entries = [
      parameterEntry(null, { state4: [1, 2], state6: [1] }), script(), script([scriptItem(10000)]),
      parameterEntry(4, { state1: [2], state3: [5, 1], state6: [4] }), script([scriptItem(1, text(3)), scriptItem(10000)]), script(),
    ];
    const content = aiContent(plain);
    const synthetic = syntheticAiSources(content);
    synthetic.entries = [3, 0, 5, 1, 4, 2].map(index => synthetic.entries[index]);
    const parsed = parse(synthetic);
    expect(parsed.content.entries).toEqual(content.entries);
    expect(parsed.entryIds).toEqual([0, 1, 2, 3, 4, 5].map(entryId));
  });

  it('reads the built-in table and its names through the LE fixed-up region reader', async () => {
    const plain = syntheticAiPrograms();
    plain.builtInPrograms = [builtInProgram(0x10), builtInProgram(0x2ff, { name: text(4) }), builtInProgram(0x10, { name: text(0) })];
    const content = aiContent(plain);
    const synthetic = syntheticAiSources(content);
    const built = syntheticBuiltInExecutable(synthetic.builtIn);
    const executable = await openLeExecutable(memoryByteSource(built.file), 'file');
    const fixedUp = await executable.readFixedUpRegion(built.table, BUILT_IN_LOCATION);
    // Record 1's name fixup crosses a page boundary and is recorded on both pages.
    expect(fixedUp.fixups).toEqual(synthetic.builtIn.fixups);
    const names = await Promise.all(built.names.map(region => executable.readRegion(region, 'name')));
    const sources = aiSources(synthetic);
    const parsed = parseAiPrograms(AISTUFF, {
      ...sources,
      builtIn: { ...fixedUp, location: BUILT_IN_LOCATION },
      builtInNames: names.map((bytes, index) => ({ region: built.names[index], bytes, location: nameLocation(index) })),
    }, 0);
    expect(parsed.content.builtInPrograms).toEqual(content.builtInPrograms);
  });
});

describe('AICO 6001 rejection', () => {
  it.each<[string, (bytes: Uint8Array) => void, string, string]>([
    ['a triple pointer past the header', bytes => setU32(bytes, 0x00, 0x4c + 4), 'unsupported-payload', '/groupTriples'],
    ['a triple count other than the layout', bytes => setU32(bytes, 0x04, 2), 'unsupported-payload', '/elements'],
    ['an element pointer other than after the triples', bytes => setU32(bytes, 0x18, 0x4c), 'unsupported-payload', '/elements'],
    ['an element count other than the layout', bytes => setU32(bytes, 0x1c, 1), 'unsupported-payload', '/elements'],
    ['a −0.0 value', bytes => setU32(bytes, 0x10, NEGATIVE_ZERO), 'unsupported-payload', '/at10'],
    ['a −0.0 element value', bytes => setU32(bytes, 0x70 + 16 + 8, NEGATIVE_ZERO), 'unsupported-payload', '/elements[1]'],
    ['a non-finite value', bytes => setU32(bytes, 0x44, NAN), 'invalid-payload', '/at44'],
    ['a triple pointer into the header', bytes => setU32(bytes, 0x00, 0x48), 'unsupported-payload', '/groupTriples'],
    ['a triple array beyond the block', bytes => setU32(bytes, 0x04, 7), 'invalid-payload', '/groupTriples'],
  ])('rejects %s', async (_name, change, code, path) => {
    expect(await failure(() => parse(changed(aico, ({ bytes }) => change(bytes))))).toEqual(diagnostic(code, at(GLOBALS, path)));
  });

  it('rejects bytes after the elements, a short header and relocations other than the two pointers', async () => {
    const synthetic = syntheticAiSources();
    synthetic.globals.block = padded(synthetic.globals.block, 1);
    expect(await failure(() => parse(synthetic))).toEqual(diagnostic('unsupported-payload', at(GLOBALS, '/elements')));
    const short = syntheticAiSources();
    short.globals.block = { bytes: short.globals.block.bytes.slice(0, 0x4b), relocations: [] };
    expect(await failure(() => parse(short))).toEqual(diagnostic('invalid-payload', at(GLOBALS, '/header')));
    const extra = changed(aico, block => block.relocations.push(0x08));
    expect(await failure(() => parse(extra))).toEqual(diagnostic('invalid-payload', at(GLOBALS, '/header')));
    const unlisted = changed(aico, block => block.relocations.splice(block.relocations.indexOf(0x18), 1));
    expect(await failure(() => parse(unlisted))).toEqual(diagnostic('invalid-payload', at(GLOBALS, '/elements')));
  });

  it('rejects a difficulty group without a triple as subresource-mismatch', async () => {
    for (const [triples, group] of [[3, 3], [1, 1], [0, 0]]) {
      const synthetic = syntheticAiSources(aiContent(), { triples, group: 0 });
      expect(await failure(() => parse(synthetic, group))).toEqual(diagnostic('subresource-mismatch', at(GLOBALS, `/groupTriples[${group}]`)));
    }
  });
});

describe('program table rejection', () => {
  // Three records: the terminator record is at 0xFC and the names start at 0x150.
  it.each<[string, (block: SyntheticBlock) => void, string, string]>([
    ['a non-zero byte in the terminator record', ({ bytes }) => { bytes[0xfc + 0x53] = 1; }, 'unsupported-payload', '/terminator'],
    ['a name pointer into the records', ({ bytes }) => setU32(bytes, programBytes, 0xfc), 'unsupported-payload', '/programs[1]/name'],
    ['a name pointer into the previous name', ({ bytes }) => setU32(bytes, programBytes, getU32(bytes, programBytes) - 1), 'unsupported-payload', '/programs[1]/name'],
    ['a name shared with the previous record', ({ bytes }) => setU32(bytes, programBytes, 0x150), 'unsupported-payload', '/programs[1]/name'],
    ['names out of record order', ({ bytes }) => setU32(bytes, 0, getU32(bytes, programBytes)), 'unsupported-payload', '/programs[0]/name'],
    ['a relocated zero first word', ({ bytes }) => setU32(bytes, programBytes * 2, 0), 'unsupported-payload', '/programs[2]/name'],
    ['bytes after the names', block => Object.assign(block, padded(block, 1)), 'unsupported-payload', '/names'],
    ['a name pointer outside the block', ({ bytes }) => setU32(bytes, 0, bytes.length), 'invalid-payload', '/programs[0]/name'],
    ['an unlisted first word', block => block.relocations.splice(block.relocations.indexOf(programBytes * 2), 1), 'invalid-payload', '/programs[2]/name'],
    ['a relocation at the handler', block => block.relocations.push(0x18), 'invalid-payload', '/programs[0]'],
    ['a relocation over a name', block => block.relocations.push(0x150 + 2), 'invalid-payload', '/programs[0]/name'],
    ['a −0.0 value', ({ bytes }) => setU32(bytes, programBytes + 0x40, NEGATIVE_ZERO), 'unsupported-payload', '/programs[1]/at40'],
    ['a non-finite value', ({ bytes }) => setU32(bytes, 0x2c, NAN), 'invalid-payload', '/programs[0]/at2C'],
  ])('rejects %s', async (_name, change, code, path) => {
    expect(await failure(() => parse(changed(table, change)))).toEqual(diagnostic(code, at(TABLE, path)));
  });

  it('rejects a table without a terminator record or with a short one, and a name without a NUL', async () => {
    const synthetic = syntheticAiSources();
    const { bytes, relocations } = synthetic.table.block;
    synthetic.table.block = { bytes: bytes.slice(0, programBytes * 3 + 2), relocations };
    expect(await failure(() => parse(synthetic))).toEqual(diagnostic('invalid-payload', at(TABLE, '/programs[3]/name')));
    synthetic.table.block = { bytes: bytes.slice(0, programBytes * 3 + 40), relocations };
    expect(await failure(() => parse(synthetic))).toEqual(diagnostic('invalid-payload', at(TABLE, '/terminator')));
    const plain = syntheticAiPrograms();
    plain.programs = [tableProgram(0, { name: text(30) })];
    plain.entries.splice(4);
    const unterminated = syntheticAiSources(aiContent(plain));
    unterminated.table.block.bytes = unterminated.table.block.bytes.slice(0, -1);
    expect(await failure(() => parse(unterminated))).toEqual(diagnostic('invalid-payload', at(TABLE, '/programs[0]/name')));
  });
});

describe('DFPG and script rejection', () => {
  // Entry 0, the DFPG: lists state1 at 0x6C, state2 at 0x70 and state6 at 0x78. Entry 1, a script of three items with
  // its text after them at 0x48.
  it.each<[string, number, (block: SyntheticBlock) => void, string, string]>([
    ['a non-zero unused DFPG word', 0, ({ bytes }) => { bytes[3] = 1; }, 'unsupported-payload', '/at00'],
    ['a −0.0 DFPG value', 0, ({ bytes }) => setU32(bytes, 0x30, NEGATIVE_ZERO), 'unsupported-payload', '/at30'],
    ['a DFPG relocation outside the list pointers', 0, block => block.relocations.push(0x38), 'invalid-payload', '/header'],
    ['a list with a pointer and no IDs', 0, ({ bytes }) => setU32(bytes, 0x3c + 4, 0), 'unsupported-payload', '/stateScripts/state1'],
    ['a list pointer into the header', 0, ({ bytes }) => setU32(bytes, 0x44, 0x68), 'unsupported-payload', '/stateScripts/state2'],
    ['a list pointer to the previous list', 0, ({ bytes }) => setU32(bytes, 0x44, 0x6c), 'unsupported-payload', '/stateScripts/state2'],
    ['a list pointer past a gap', 0, ({ bytes }) => setU32(bytes, 0x44, 0x74), 'unsupported-payload', '/stateScripts/state2'],
    ['bytes after the lists', 0, block => Object.assign(block, padded(block, 4)), 'unsupported-payload', '/stateScripts'],
    ['a list beyond the block', 0, ({ bytes }) => setU32(bytes, 0x64 + 4, 2), 'invalid-payload', '/stateScripts/state6'],
    ['a non-zero run-time word +0x08', 1, ({ bytes }) => { bytes[0x08] = 1; }, 'unsupported-payload', '/items[0]/runtime'],
    ['a non-zero run-time word +0x0C', 1, ({ bytes }) => { bytes[scriptItemBytes + 0x0f] = 1; }, 'unsupported-payload', '/items[1]/runtime'],
    ['a non-zero run-time word +0x10', 1, ({ bytes }) => { bytes[scriptItemBytes * 2 + 0x10] = 1; }, 'unsupported-payload', '/items[2]/runtime'],
    ['a relocation at a run-time word', 1, block => block.relocations.push(0x0c), 'invalid-payload', '/items[0]'],
    ['a branch inside an item', 1, ({ bytes }) => setU32(bytes, scriptItemBytes + 0x14, 4), 'unsupported-payload', '/items[1]/branch'],
    ['a branch to the texts', 1, ({ bytes }) => setU32(bytes, scriptItemBytes + 0x14, 0x48), 'unsupported-payload', '/items[1]/branch'],
    ['a branch outside the block', 1, ({ bytes }) => setU32(bytes, scriptItemBytes + 0x14, bytes.length), 'invalid-payload', '/items[1]/branch'],
    ['a text pointer into the items', 1, ({ bytes }) => setU32(bytes, 0x04, 0x30), 'unsupported-payload', '/items[0]/argument'],
    ['a text pointer into its text', 1, ({ bytes }) => setU32(bytes, 0x04, 0x49), 'unsupported-payload', '/items[0]/argument'],
    ['bytes after the texts', 1, block => Object.assign(block, padded(block, 1)), 'unsupported-payload', '/texts'],
    ['a text without a NUL', 1, block => { block.bytes = block.bytes.slice(0, -1); }, 'invalid-payload', '/items[0]/argument'],
    // The search for the end item reads on through the texts to the block's end.
    ['a script without its end item', 1, ({ bytes }) => setU32(bytes, scriptItemBytes * 2, 9999), 'invalid-payload', '/items[5]/opcode'],
  ])('rejects %s', async (_name, index, change, code, path) => {
    expect(await failure(() => parse(changed(entry(index), change)))).toEqual(diagnostic(code, at(entryId(index), path)));
  });

  it('accepts a branch to the end item and items of every argument form', () => {
    const plain = syntheticAiPrograms();
    plain.entries[2] = script([scriptItem(9000, null, 2), scriptItem(1, text(1), 0), scriptItem(10000, text(5), 1)]);
    const content = aiContent(plain);
    expect(parse(syntheticAiSources(content)).content).toEqual(content);
  });
});

describe('ID chain', () => {
  const without = (index: number) => {
    const synthetic = syntheticAiSources();
    synthetic.entries.splice(index, 1);
    return synthetic;
  };

  it.each([
    ['the DFPG a program names', 0, at(TABLE, '/programs[0]/parameters')],
    ['an install script', 1, at(entryId(0), '/installScript')],
    ['a script of a state list', 3, at(entryId(0), '/stateScripts/state2[0]')],
    ['a script only the second DFPG names', 5, at(entryId(4), '/stateScripts/state4[0]')],
  ])('rejects a missing entry: %s', async (_name, index, location) => {
    expect(await failure(() => parse(without(index)))).toEqual(diagnostic('subresource-mismatch', location));
  });

  it('rejects an extra, a repeated and a mistyped entry', async () => {
    const extra = syntheticAiSources();
    extra.entries.push({ ...extra.entries[1], id: 7_299 });
    expect(await failure(() => parse(extra))).toEqual(diagnostic('subresource-mismatch', at(7_299)));
    const repeated = syntheticAiSources();
    repeated.entries.push(repeated.entries[2]);
    expect(await failure(() => parse(repeated))).toEqual(diagnostic('subresource-mismatch', at(entryId(2))));
    const parameters = syntheticAiSources();
    parameters.entries[0].type = 'TABL';
    expect(await failure(() => parse(parameters))).toEqual(diagnostic('subresource-mismatch', at(TABLE, '/programs[0]/parameters')));
    const mistyped = syntheticAiSources();
    mistyped.entries[2].type = 'DFPG';
    expect(await failure(() => parse(mistyped))).toEqual(diagnostic('subresource-mismatch', at(entryId(0), '/stateScripts/state1[0]')));
  });

  it('rejects an ID the chain names that only another table field holds', async () => {
    // Program 1 names the table itself, which is not among the entries.
    const synthetic = changed(table, ({ bytes }) => setU32(bytes, programBytes + 0x1c, TABLE));
    expect(await failure(() => parse(synthetic))).toEqual(diagnostic('subresource-mismatch', at(TABLE, '/programs[1]/parameters')));
  });
});

describe('built-in table rejection', () => {
  const builtIn = (change: (synthetic: SyntheticAiSources['builtIn']) => void) => {
    const synthetic = syntheticAiSources();
    change(synthetic.builtIn);
    return synthetic;
  };
  const region = (path: string) => `${BUILT_IN_LOCATION}${path}`;

  it.each<[string, (synthetic: SyntheticAiSources['builtIn']) => void, string, string]>([
    ['a missing name fixup', ({ fixups }) => fixups.splice(2, 1), 'invalid-payload', region('/programs[1]/name')],
    ['a missing handler fixup', ({ fixups }) => fixups.splice(1, 1), 'invalid-payload', region('/programs[0]/handler')],
    ['a fixup at a value field', ({ fixups }) => fixups.push({ at: programBytes + 4, object: 2, offset: 0 }), 'invalid-payload', region('/programs[1]')],
    ['a fixup at the count', ({ fixups }) => fixups.push({ at: programBytes * 2, object: 2, offset: 0 }), 'invalid-payload', region('/count')],
    ['a count other than the region', ({ bytes }) => setU32(bytes, programBytes * 2, 1), 'invalid-payload', region('/count')],
    ['a negative count', ({ bytes }) => setU32(bytes, programBytes * 2, -2), 'invalid-payload', region('/count')],
    ['a non-zero +0x1C', ({ bytes }) => setU32(bytes, 0x1c, 1), 'unsupported-payload', region('/programs[0]/at1C')],
    ['a non-zero +0x20', ({ bytes }) => setU32(bytes, programBytes + 0x20, 1), 'unsupported-payload', region('/programs[1]/at20')],
    ['a −0.0 value', ({ bytes }) => setU32(bytes, programBytes + 0x24, NEGATIVE_ZERO), 'unsupported-payload', region('/programs[1]/at24')],
    ['a non-finite value', ({ bytes }) => setU32(bytes, 0x4c, NAN), 'invalid-payload', region('/programs[0]/at4C')],
    ['a name region other than the targets', ({ names }) => { names[1].region = { ...names[1].region, offset: names[1].region.offset + 1 }; }, 'subresource-mismatch', region('/programs[1]/name')],
    ['a name without a NUL', ({ names }) => { names[0].bytes = names[0].bytes.slice(0, -1); }, 'invalid-payload', nameLocation(0)],
    ['a name region past its NUL', ({ names }) => { names[1].bytes = Uint8Array.of(...names[1].bytes, 0); }, 'invalid-payload', nameLocation(1)],
    ['an extra name region', ({ names }) => names.push({ region: { object: 3, offset: 0x10, length: 1 }, bytes: Uint8Array.of(0) }), 'subresource-mismatch', nameLocation(2)],
    ['a repeated name region', ({ names }) => names.push(names[0]), 'subresource-mismatch', nameLocation(2)],
  ])('rejects %s', async (_name, change, code, location) => {
    expect(await regionFailure(() => parse(builtIn(change)))).toEqual(diagnostic(code, location));
  });

  it('rejects a region too short for its count', async () => {
    expect(await regionFailure(() => parse(builtIn(synthetic => { synthetic.bytes = new Uint8Array(3); }))))
      .toEqual(diagnostic('invalid-payload', region('/count')));
  });

  it('shares a name region between records that name the same text', () => {
    const synthetic = syntheticAiSources();
    const { names, fixups } = synthetic.builtIn;
    names[1].bytes = names[0].bytes;
    fixups[2] = { ...fixups[2], offset: names[0].region.offset };
    names.pop();
    const parsed = parse(synthetic).content.builtInPrograms;
    expect(parsed[1].name).toBe(parsed[0].name);
  });
});

describe('structural limits (AC-14)', () => {
  const plainWith = (programs: unknown[], entries: unknown[]) => ({ ...syntheticAiPrograms(), programs, entries });

  /** The default sources with the block `select` names replaced by `block`, or by the default one grown to `bytes`. */
  const sized = (select: (synthetic: SyntheticAiSources) => SyntheticBlock, bytes: number, content?: AiPrograms) => {
    const synthetic = syntheticAiSources(content);
    const block = select(synthetic);
    block.bytes = padded(block, bytes - block.bytes.length).bytes;
    return synthetic;
  };
  const entryLimit = (id: number, limit: number) =>
    ({ code: 'limit-exceeded', location: at(id), limit: { name: 'payloadEntryBytes', limit, observed: limit + 1 } });

  it('accepts a program table and a script that fill their entry byte limits, and rejects one byte more before reading it', async () => {
    const plain = syntheticAiPrograms();
    // 32 records and the terminator take 2,772 bytes; 32 names of 40 or 41 bytes and their NULs take the other 1,324.
    plain.programs = Array.from({ length: 32 }, (_, index) => tableProgram(0, { name: text(index < 12 ? 41 : 40) }));
    plain.entries.splice(4);
    // 128 items take 3,072 bytes; 8 texts of 127 bytes and their NULs take the other 1,024.
    plain.entries[1] = script(Array.from({ length: 128 }, (_, index) =>
      index === 127 ? scriptItem(10000) : scriptItem(109, index % 16 === 0 ? text(127) : null)));
    const content = aiContent(plain);
    const synthetic = syntheticAiSources(content);
    expect([synthetic.table.block.bytes.length, synthetic.entries[1].block.bytes.length])
      .toEqual([AI_SOURCE_LIMITS.programTableEntryBytes, AI_SOURCE_LIMITS.scriptEntryBytes]);
    expect(parse(synthetic).content).toEqual(content);
    expect(await failure(() => parse(sized(table, AI_SOURCE_LIMITS.programTableEntryBytes + 1, content))))
      .toEqual(entryLimit(TABLE, AI_SOURCE_LIMITS.programTableEntryBytes));
    expect(await failure(() => parse(sized(entry(1), AI_SOURCE_LIMITS.scriptEntryBytes + 1, content))))
      .toEqual(entryLimit(entryId(1), AI_SOURCE_LIMITS.scriptEntryBytes));
  });

  it('accepts AICO 6001 and a DFPG at their largest layouts, and checks their entry byte limits before reading', async () => {
    // At most 8 triples and 16 elements (428 bytes) and six lists of 16 IDs (492 bytes) fit, below the 512-byte limits,
    // so a block at the limit passes the size check and fails its layout; one byte more fails the size check.
    const plain = syntheticAiPrograms();
    plain.globals.elements = Array.from({ length: AI_PROGRAMS_LIMITS.globalElements }, (_, index) => [index, 1, 2, 3]);
    const full = Array<number>(AI_PROGRAMS_LIMITS.stateScriptItems).fill(1);
    plain.programs = [tableProgram(0)];
    plain.entries = [parameterEntry(1, { state1: full, state2: full, state3: full, state5: full, state4: full, state6: full }), script()];
    const content = aiContent(plain);
    const synthetic = syntheticAiSources(content, { triples: AI_SOURCE_LIMITS.groupTriples });
    expect([synthetic.globals.block.bytes.length, synthetic.entries[0].block.bytes.length]).toEqual([428, 492]);
    expect(parse(synthetic).content).toEqual(content);
    for (const [select, limit, id] of [
      [aico, AI_SOURCE_LIMITS.globalsEntryBytes, GLOBALS], [entry(0), AI_SOURCE_LIMITS.parameterEntryBytes, entryId(0)],
    ] as const) {
      expect((await failure(() => parse(sized(select, limit)))).code).toBe('unsupported-payload');
      expect(await failure(() => parse(sized(select, limit + 1)))).toEqual(entryLimit(id, limit));
    }
  });

  it('limits the AICO triples and elements', async () => {
    const { groupTriples } = AI_SOURCE_LIMITS;
    expect(parse(syntheticAiSources(aiContent(), { triples: groupTriples, group: groupTriples - 1 }), groupTriples - 1).content).toEqual(aiContent());
    expect(await failure(() => parse(syntheticAiSources(aiContent(), { triples: groupTriples + 1 }))))
      .toEqual(limitExceeded(at(GLOBALS, '/groupTriples'), 'payloadItems', groupTriples));
    const { globalElements } = AI_PROGRAMS_LIMITS;
    const plain = syntheticAiPrograms();
    plain.globals.elements = Array.from({ length: globalElements }, (_, index) => [index, -index, 0.5, 2]);
    expect(parse(syntheticAiSources(aiContent(plain))).content.globals.elements).toHaveLength(globalElements);
    plain.globals.elements.push([1, 2, 3, 4]);
    expect(await failure(() => parse(syntheticAiSources(unchecked(plain)))))
      .toEqual(limitExceeded(at(GLOBALS, '/elements'), 'payloadItems', globalElements));
  });

  it('limits the records of the program table and of the built-in table', async () => {
    const { programRecords } = AI_PROGRAMS_LIMITS;
    const programs = Array.from({ length: programRecords }, () => tableProgram(0));
    const plain = plainWith(programs, [parameterEntry(null)]);
    plain.builtInPrograms = Array.from({ length: programRecords }, (_, index) => builtInProgram(index));
    expect(parse(syntheticAiSources(aiContent(plain))).content.programs).toHaveLength(programRecords);
    expect(parse(syntheticAiSources(aiContent(plain))).content.builtInPrograms).toHaveLength(programRecords);
    plain.programs.push(tableProgram(0));
    expect(await failure(() => parse(syntheticAiSources(unchecked(plain)))))
      .toEqual(limitExceeded(at(TABLE, '/programs'), 'aiProgramRecords', programRecords));
    plain.programs.pop();
    plain.builtInPrograms.push(builtInProgram(0));
    expect(await regionFailure(() => parse(syntheticAiSources(unchecked(plain)))))
      .toEqual(limitExceeded(`${BUILT_IN_LOCATION}/programs`, 'aiProgramRecords', programRecords));
  });

  it('limits the program names of both tables', async () => {
    const { programNameBytes } = AI_PROGRAMS_LIMITS;
    const plain = syntheticAiPrograms();
    plain.programs[2].name = text(programNameBytes);
    plain.builtInPrograms[1].name = text(programNameBytes);
    const content = aiContent(plain);
    expect(parse(syntheticAiSources(content)).content).toEqual(content);
    plain.programs[2].name += 'x';
    expect(await failure(() => parse(syntheticAiSources(unchecked(plain)))))
      .toEqual(limitExceeded(at(TABLE, '/programs[2]/name'), 'textBytes', programNameBytes));
    plain.programs[2].name = text(1);
    plain.builtInPrograms[1].name += 'x';
    expect(await regionFailure(() => parse(syntheticAiSources(unchecked(plain)))))
      .toEqual(limitExceeded(nameLocation(1), 'textBytes', programNameBytes));
  });

  it('limits the IDs of a DFPG list', async () => {
    const { stateScriptItems } = AI_PROGRAMS_LIMITS;
    const plain = plainWith([tableProgram(0)], [parameterEntry(null, { state5: Array<number>(stateScriptItems).fill(1) }), script()]);
    expect(parse(syntheticAiSources(aiContent(plain))).content.entries).toHaveLength(2);
    (plain.entries[0] as ReturnType<typeof parameterEntry>).stateScripts.state5.push(1);
    expect(await failure(() => parse(syntheticAiSources(unchecked(plain)))))
      .toEqual(limitExceeded(at(entryId(0), '/stateScripts/state5'), 'payloadItems', stateScriptItems));
  });

  it('limits the entries the ID chain names', async () => {
    const { entries: limit } = AI_PROGRAMS_LIMITS;
    // One DFPG whose install script and lists name `scripts` distinct scripts.
    const plainOf = (scripts: number) => {
      const ids = Array.from({ length: scripts }, (_, index) => index + 1);
      const lists = Object.fromEntries(['state1', 'state2', 'state3', 'state5', 'state4', 'state6']
        .map((state, list) => [state, ids.slice(1 + list * 16, 1 + (list + 1) * 16)]));
      return plainWith([tableProgram(0)], [parameterEntry(1, lists), ...ids.map(() => script([scriptItem(10000)]))]);
    };
    expect(parse(syntheticAiSources(aiContent(plainOf(limit - 1)))).entryIds).toHaveLength(limit);
    expect(await failure(() => parse(syntheticAiSources(unchecked(plainOf(limit))))))
      .toEqual({ code: 'limit-exceeded', location: at(TABLE, '/entries'), limit: { name: 'aiEntries', limit, observed: limit + 1 } });
  });

  it('limits the items and texts of a script', async () => {
    const { scriptItems, scriptTextBytes } = AI_PROGRAMS_LIMITS;
    const items = (count: number) => [...Array.from({ length: count - 1 }, () => scriptItem(9000, null, 0)), scriptItem(10000)];
    const plain = syntheticAiPrograms();
    plain.entries[1] = script(items(scriptItems));
    plain.entries[2] = script([scriptItem(109, text(scriptTextBytes)), scriptItem(10000)]);
    const content = aiContent(plain);
    expect(parse(syntheticAiSources(content)).content).toEqual(content);
    plain.entries[1] = script(items(scriptItems + 1));
    expect(await failure(() => parse(syntheticAiSources(unchecked(plain)))))
      .toEqual(limitExceeded(at(entryId(1), '/items'), 'aiScriptItems', scriptItems));
    plain.entries[1] = script();
    plain.entries[2].items[0].argument += 'x';
    expect(await failure(() => parse(syntheticAiSources(unchecked(plain)))))
      .toEqual(limitExceeded(at(entryId(2), '/items[0]/argument'), 'textBytes', scriptTextBytes));
  });

  it('checks a limit before reading what it bounds', async () => {
    const { scriptItems, programRecords, entries } = AI_PROGRAMS_LIMITS;
    // A script without an end item among its first `scriptItems` items: what follows is not read, even past the block.
    const items = syntheticAiSources();
    items.entries[1].block = { bytes: new Uint8Array(scriptItems * scriptItemBytes), relocations: [] };
    expect(await failure(() => parse(items))).toEqual(limitExceeded(at(entryId(1), '/items'), 'aiScriptItems', scriptItems));
    // One record too many, whose first word is not a listed pointer: only that the word is not zero counts.
    const records = syntheticAiSources(aiContent({
      ...syntheticAiPrograms(), programs: Array.from({ length: programRecords }, () => tableProgram(0)), entries: syntheticAiPrograms().entries.slice(0, 4),
    }));
    setU32(records.table.block.bytes, programRecords * programBytes, 1);
    expect(await failure(() => parse(records))).toEqual(limitExceeded(at(TABLE, '/programs'), 'aiProgramRecords', programRecords));
    // One entry too many, which is not given: the limit comes first.
    const ids = Array.from({ length: entries }, (_, index) => index + 1);
    const lists = Object.fromEntries(['state1', 'state2', 'state3', 'state5', 'state4', 'state6']
      .map((state, list) => [state, ids.slice(1 + list * 16, 1 + (list + 1) * 16)]));
    const chain = syntheticAiSources(unchecked({ ...syntheticAiPrograms(), programs: [tableProgram(0)],
      entries: [parameterEntry(1, lists), ...ids.map(() => script([scriptItem(10000)]))] }));
    chain.entries.pop();
    expect(await failure(() => parse(chain))).toEqual(limitExceeded(at(TABLE, '/entries'), 'aiEntries', entries));
  });
});

it('builds the built-in table with stored words equal to the fixup targets', () => {
  const content = aiContent();
  const { bytes, fixups } = syntheticBuiltIn(content.builtInPrograms);
  for (const fixup of fixups) expect(getU32(bytes, fixup.at)).toBe(fixup.offset);
});
