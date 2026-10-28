import { describe, expect, it } from 'vitest';
import { AI_PROGRAMS_LIMITS, readAiPrograms, type AiPrograms } from '../../content/rule-data/ai-programs.ts';
import { encodeRuleDataPayload } from '../../content/rule-data/rule-data-payload.ts';
import {
  builtInProgram, deepFrozen, keyword, MARKER, parameterEntry, script, scriptItem, syntheticAiPrograms, tableProgram, text,
} from '../../content/rule-data/rule-data.test-support.ts';
import type { DiscPath } from '../disc/disc-path.ts';
import { SourceError, type SourceErrorData } from '../source-error.ts';
import { sourceFailure } from '../source-error.test-support.ts';
import { memoryByteSource } from '../synthetic.test-support.ts';
import { AI_LAYOUT, AI_SOURCE_LIMITS, parseAiPrograms } from './ai.ts';
import {
  aiContent, aiSources, BUILT_IN_LOCATION, keywordNameLocation, keywordTableLocation, nameLocation, SYNTHETIC_AI_IDS, syntheticAiSources,
  syntheticBuiltIn, syntheticBuiltInExecutable, syntheticKeywordExecutable, syntheticKeywordTables, type SyntheticAiSources,
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

// P3-03 AC-23 (revision 3): the four EXE keyword tables. The synthetic tables (rule-data test support) hold 3, 6, 2 and 3
// pairs; the fourth equals the first and shares its name regions, the second shares one region with the first and one
// with the third, so 9 distinct name regions serve the 14 pairs, some starting at odd offsets.
describe('keyword tables (AC-23)', () => {
  const keywords = (change: (synthetic: SyntheticAiSources['keywords']) => void, content?: AiPrograms) => {
    const synthetic = syntheticAiSources(content);
    change(synthetic.keywords);
    return synthetic;
  };
  const table = (index: number, path = '') => `${keywordTableLocation(index)}${path}`;
  const { keywordEntryBytes: pair } = AI_LAYOUT;

  it('parses the four tables in address order, keeping pair order, i32 values and name bytes, reading each shared name once', () => {
    const content = aiContent();
    const synthetic = syntheticAiSources(content);
    expect(synthetic.keywords.names).toHaveLength(9);
    expect(synthetic.keywords.names.some(({ region }) => region.offset % 2 === 1)).toBe(true);
    expect(synthetic.keywords.tables[3].fixups).toEqual(synthetic.keywords.tables[0].fixups);
    const parsed = parse(synthetic).content.keywordTables;
    expect(parsed).toEqual(content.keywordTables);
    expect(deepFrozen(parsed)).toBe(true);
    expect(parsed.flat().map(({ value }) => value)).toEqual(expect.arrayContaining([-1, 0x7fffffff, -0x80000000]));
    // The canonical payload round-trips the parsed content byte for byte.
    const bytes = encodeRuleDataPayload({ role: 'ai-programs', content: parse(synthetic).content });
    expect(encodeRuleDataPayload({ role: 'ai-programs', content: readAiPrograms(JSON.parse(new TextDecoder('latin1').decode(bytes))) })).toEqual(bytes);
  });

  it('reads the tables and names through the LE fixed-up region reader', async () => {
    const content = aiContent();
    const synthetic = syntheticAiSources(content);
    const built = syntheticKeywordExecutable(synthetic.keywords);
    const executable = await openLeExecutable(memoryByteSource(built.file), 'file');
    const sources = aiSources(synthetic);
    const tables = await Promise.all(built.tables.map(async (region, index) => ({ region, ...await executable.readFixedUpRegion(region, table(index)), location: table(index) })));
    tables.forEach(({ fixups }, index) => expect(fixups).toEqual(synthetic.keywords.tables[index].fixups));
    const names = await Promise.all(built.names.map(async (region, index) => ({ region, bytes: await executable.readRegion(region, 'name'), location: keywordNameLocation(index) })));
    const parsed = parseAiPrograms(AISTUFF, { ...sources, keywordTables: tables as unknown as typeof sources.keywordTables, keywordNames: names }, 0);
    expect(parsed.content.keywordTables).toEqual(content.keywordTables);
  });

  it.each<[string, (offset: number, object: number, target: number) => number[]]>([
    ['an additive fixup', (offset, object, target) => [0x07, 0x04, offset & 0xff, offset >>> 8, object, target & 0xff, target >>> 8, 1, 0]],
    ['a 16-bit offset fixup', (offset, object, target) => [0x05, 0x00, offset & 0xff, offset >>> 8, object, target & 0xff, target >>> 8]],
  ])('rejects a table that %s patches in the LE reader', async (_, record) => {
    const built = syntheticKeywordExecutable(syntheticAiSources().keywords, record);
    const executable = await openLeExecutable(memoryByteSource(built.file), 'file');
    expect(await regionFailure(() => executable.readFixedUpRegion(built.tables[0], table(0)))).toEqual(diagnostic('invalid-payload', table(0)));
  });

  it.each<[string, (synthetic: SyntheticAiSources['keywords']) => void, string, string]>([
    ['a fixup at a value word', ({ tables }) => tables[1].fixups.push({ at: pair + 4, object: 4, offset: 0x10 }), 'unsupported-payload', table(1, '/entries[1]')],
    ['a fixup at the terminator pair', ({ tables }) => tables[2].fixups.push({ at: 2 * pair, object: 4, offset: 0x10 }), 'unsupported-payload', table(2, '/terminator')],
    ['a fixup across two words', ({ tables }) => tables[0].fixups.push({ at: 2 * pair + 2, object: 4, offset: 0x10 }), 'unsupported-payload', table(0, '/entries[2]')],
    ['a missing name fixup', ({ tables }) => tables[1].fixups.splice(4, 1), 'unsupported-payload', table(1, '/entries[4]/name')],
    ['a fixup to another object', ({ tables }) => { tables[3].fixups[1] = { ...tables[3].fixups[1], object: 3 }; }, 'unsupported-payload', table(3, '/entries[1]/name')],
    ['a stored pointer other than the target offset', ({ tables }) => setU32(tables[0].bytes, pair, 0), 'unsupported-payload', table(0, '/entries[1]/name')],
    ['a pair after a null pair inside the table', ({ tables }) => { setU32(tables[1].bytes, 2 * pair, 0); tables[1].fixups.splice(2, 1); }, 'unsupported-payload', table(1, '/entries[2]/name')],
    ['no terminator pair', ({ tables }) => setU32(tables[2].bytes, 2 * pair, 0x10), 'unsupported-payload', table(2, '/terminator')],
    ['a terminator with a value', ({ tables }) => setU32(tables[3].bytes, 3 * pair + 4, 1), 'unsupported-payload', table(3, '/terminator')],
    ['a region of no whole pairs', ({ tables }) => { tables[1].bytes = tables[1].bytes.slice(0, -4); }, 'invalid-payload', table(1)],
    ['a region of only the terminator', ({ tables }) => { tables[2].bytes = new Uint8Array(pair); tables[2].fixups = []; }, 'invalid-payload', table(2)],
    ['a table that does not follow the previous one', ({ tables }) => { tables[2].region = { ...tables[2].region, offset: tables[2].region.offset + pair }; }, 'invalid-payload', table(2)],
    ['a table in another object', ({ tables }) => { tables[1].region = { ...tables[1].region, object: 3 }; }, 'invalid-payload', table(1)],
    ['a name target inside a region', ({ tables }) => {
      tables[0].fixups[1] = { ...tables[0].fixups[1], offset: tables[0].fixups[1].offset + 1 };
      setU32(tables[0].bytes, pair, tables[0].fixups[1].offset);
    }, 'subresource-mismatch', table(0, '/entries[1]/name')],
    ['a name region without a NUL', ({ names }) => { names[4].bytes = names[4].bytes.slice(0, -1); }, 'invalid-payload', keywordNameLocation(4)],
    ['a name region past its NUL', ({ names }) => { names[2].bytes = Uint8Array.of(...names[2].bytes, 0x41); }, 'invalid-payload', keywordNameLocation(2)],
    ['an empty name', ({ names }) => { names[6].bytes = Uint8Array.of(0); }, 'invalid-payload', keywordNameLocation(6)],
    ['a name region no pair names', ({ names }) => names.push({ region: { object: 4, offset: 0x20, length: 2 }, bytes: Uint8Array.of(0x41, 0) }), 'subresource-mismatch', keywordNameLocation(9)],
    // The names are given in reverse order, so the copy comes first.
    ['a repeated name region', ({ names }) => names.push(names[3]), 'subresource-mismatch', keywordNameLocation(3)],
    ['a name repeated within a table with A–Z folded', ({ names }) => { names[1].bytes = Uint8Array.from('Apriv\0', character => character.charCodeAt(0)); }, 'unsupported-payload', table(0, '/entries[1]/name')],
  ])('rejects %s', async (_name, change, code, location) => {
    expect(await regionFailure(() => parse(keywords(change)))).toEqual(diagnostic(code, location));
  });

  it('rejects a zero name word before the terminator even with a fixup to a name region at offset 0', async () => {
    const synthetic = syntheticAiSources();
    const { tables, names } = synthetic.keywords;
    const first = tables[0].fixups[0];
    const region = names.find(({ region: { offset } }) => offset === first.offset)!;
    // Every pair naming that region now names offset 0, where the region moves.
    for (const table of tables) {
      table.fixups = table.fixups.map(fixup => (fixup.offset === first.offset ? { ...fixup, offset: 0 } : fixup));
      for (const { at, offset } of table.fixups) if (offset === 0) setU32(table.bytes, at, 0);
    }
    region.region = { ...region.region, offset: 0 };
    expect(await regionFailure(() => parse(synthetic))).toEqual(diagnostic('unsupported-payload', table(0, '/entries[0]/name')));
  });

  it('accepts a name repeated across tables and names that differ only outside A–Z', () => {
    const plain = syntheticAiPrograms();
    plain.keywordTables[2] = [keyword(text(7), 1), keyword(`${text(3)}q\xc4`, 2), keyword(`${text(3)}Q\xe4`, 3)];
    const content = aiContent(plain);
    expect(parse(syntheticAiSources(content)).content.keywordTables[2]).toEqual(content.keywordTables[2]);
  });

  /** Tables of `counts` pairs whose names are `name(i)` for a running index, the fourth table empty of new names. */
  const tablesOf = (counts: readonly number[], name: (index: number) => string) => {
    let next = 0;
    const tables = counts.map(count => Array.from({ length: count }, () => keyword(name(next), next++)));
    return unchecked({ ...syntheticAiPrograms(), keywordTables: [...tables, tables[0]] });
  };
  /** The `index`th of `width`-byte names: MARKER text and a distinct last byte, never two equal under the A–Z fold. */
  const named = (width: number) => (index: number) => `${text(width - 1)}${String.fromCharCode(0x30 + index)}`;

  it('limits the pairs of a table: 16 pass, 17 fail before any pair is read', async () => {
    const at = AI_PROGRAMS_LIMITS.keywordEntries;
    expect(parse(syntheticAiSources(tablesOf([1, at, 1], named(3)))).content.keywordTables[1]).toHaveLength(at);
    expect(await regionFailure(() => parse(syntheticAiSources(tablesOf([1, at + 1, 1], named(3))))))
      .toEqual(limitExceeded(table(1, '/entries'), 'aiKeywordEntries', at));
  });

  // The names are given in reverse order (aiSources), so the first region past a limit is the last one built.
  it('limits the name regions: 32 pass, 33 fail at the first region past the limit', async () => {
    const at = AI_SOURCE_LIMITS.keywordNames;
    expect(parse(syntheticAiSources(tablesOf([16, 16, 1], index => named(3)(index % at)))).content.keywordTables[2]).toHaveLength(1);
    const over = syntheticAiSources(tablesOf([16, 16, 1], named(3)));
    expect(over.keywords.names).toHaveLength(at + 1);
    expect(await regionFailure(() => parse(over))).toEqual(limitExceeded(keywordNameLocation(0), 'aiKeywordNames', at));
  });

  it('limits the name bytes with their NULs: 256 pass, 257 fail', async () => {
    const at = AI_SOURCE_LIMITS.keywordNameBytes;
    // 32 names of 7 bytes and their NULs: 256 bytes.
    const exact = syntheticAiSources(tablesOf([16, 16, 1], index => named(7)(index % 32)));
    expect(exact.keywords.names.reduce((total, { bytes }) => total + bytes.length, 0)).toBe(at);
    expect(() => parse(exact)).not.toThrow();
    const over = syntheticAiSources(tablesOf([16, 16, 1], index => (index === 31 ? `${named(7)(index)}+` : named(7)(index % 32))));
    expect(await regionFailure(() => parse(over))).toEqual(limitExceeded(keywordNameLocation(0), 'aiKeywordNameBytes', at));
  });

  it('limits a name to the keyword name bytes', async () => {
    const at = AI_PROGRAMS_LIMITS.keywordNameBytes;
    const plain = syntheticAiPrograms();
    plain.keywordTables[2] = [keyword(text(at), 0)];
    expect(parse(syntheticAiSources(aiContent(plain))).content.keywordTables[2][0].name).toHaveLength(at);
    plain.keywordTables[2] = [keyword(text(at + 1), 0)];
    const synthetic = syntheticAiSources(unchecked(plain));
    expect(await regionFailure(() => parse(synthetic))).toEqual(limitExceeded(keywordNameLocation(8), 'textBytes', at));
  });

  it('builds the same synthetic sources from equal content', () => {
    expect(syntheticKeywordTables(aiContent().keywordTables)).toEqual(syntheticAiSources().keywords);
  });
});
