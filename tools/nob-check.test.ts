import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { cockpitLayoutBlock, dataPaletteBlock, rawImageBlock } from '../src/original-data/conversion/conversion.test-support.ts';
import { explosionListsBlock, explosionRecordBlock } from '../src/original-data/conversion/flight-data.test-support.ts';
import { animFrame, patternFrame, solidFrame, syntheticAnimation, type SyntheticFrame } from '../src/original-data/formats/anim.test-support.ts';
import { syntheticCraftTable } from '../src/original-data/formats/craft.test-support.ts';
import type { SyntheticBlock } from '../src/original-data/formats/formats.test-support.ts';
import {
  buildImfat, syntheticDiag, syntheticMesh, syntheticModl, syntheticSnip, type SyntheticDiagFields, type SyntheticEntry,
} from '../src/original-data/synthetic.test-support.ts';

const root = resolve(import.meta.dirname, '..');
const directory = mkdtempSync(join(tmpdir(), 'osr-nob-check-'));
afterAll(() => rmSync(directory, { recursive: true, force: true }));

// A recognisable coordinate that must never reach the output.
const MARKER = 12.375;
const up = (vertices: number) => Array.from({ length: vertices }, () => [0, 0, 1]).flat();
/** A quad of 4 vertices, 2 triangles and 6 shading slots. */
const quad = (trailer = 0) => syntheticMesh({
  positions: [MARKER, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0], uvs: [0, 0, 1, 0, 1, 1, 0, 1], normals: up(4), shadingSlotCount: 6,
  faces: [[[0, 0], [1, 1], [2, 2]], [[0, 3], [2, 4], [3, 5]]], trailer,
});
/** A triangle of 3 vertices sharing 1 shading slot. */
const triangle = syntheticMesh({
  positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], uvs: [0, 0, 1, 0, 0, 1], normals: up(3), shadingSlotCount: 1, faces: [[[0, 0], [1, 0], [2, 0]]],
});
// Lists of 2, 1 and 0 parts with flags 3, 1 (the default) and 2; the default colour component is 128.
const model = syntheticModl({
  partLists: [[{ mesh: 10_001, flags: 3, colour: [10, 200, 30] }, { mesh: 10_002 }], [{ mesh: 10_002, flags: 2 }], []],
  sounds: [10_003, 0, 0, 0, 0],
});

function check(name: string, corruptQuad = false) {
  const file = join(directory, name);
  writeFileSync(file, buildImfat(10_000, [
    { id: 10_001, type: 'MESH', ...quad(corruptQuad ? 1 : 0) },
    { id: 10_002, type: 'MESH', ...triangle },
    { id: 10_003, type: 'SND', data: new Uint8Array(8) },
    { id: 10_004, type: 'MODL', ...model },
  ]));
  return spawnSync(process.execPath, [join(root, 'tools/nob-check.ts'), file], { cwd: root, encoding: 'utf8', timeout: 60_000 });
}

describe('nob-check on a synthetic archive', () => {
  it('passes every MESH and MODL and prints their observed maxima, never coordinates', () => {
    const result = check('VALID.NOB');
    expect(result.status).toBe(0);
    const lines = result.stdout.split('\n').map(line => line.trim());
    expect(lines).toEqual(expect.arrayContaining([
      'MESH 2 passed, 0 failed',
      'MODL 1 passed, 0 failed',
      'MESH totals: 7 vertices, 3 triangles',
      'MESH vertices 4, triangles 2, shading slots 6',
      'MODL parts 3 (lists 2/1/0), colour component 200, part flags 1, 2, 3',
      'failures: 0',
    ]));
    expect(result.stdout).not.toContain(String(MARKER));
  });

  it('reports a rejected MESH by code and location, and takes maxima from passing entries only', () => {
    const result = check('CORRUPT.NOB', true);
    expect(result.status).toBe(1);
    const lines = result.stdout.split('\n').map(line => line.trim());
    expect(lines).toEqual(expect.arrayContaining([
      'MESH 1 passed, 1 failed',
      'MESH vertices 3, triangles 1, shading slots 1',
      'failures: 1',
      '10001 MESH: invalid-payload@mesh',
    ]));
    expect(result.stdout).not.toContain(String(MARKER));
  });
});

describe('nob-check on a synthetic CCKD entry', () => {
  // Slot 0 holds one element; slot 1 is empty with a palette, slot 2 has neither.
  const cockpit = (palette: Uint8Array) => cockpitLayoutBlock([[{ record: rawImageBlock(1, 1, [1]), x: 0, y: 0 }], [], []], undefined, [null, palette]);
  const checkCockpit = (name: string, palette: Uint8Array) => {
    const file = join(directory, name);
    writeFileSync(file, buildImfat(10_000, [{ id: 10_001, type: 'CCKD', data: cockpit(palette) }]));
    return spawnSync(process.execPath, [join(root, 'tools/nob-check.ts'), file], { cwd: root, encoding: 'utf8', timeout: 60_000 });
  };

  it('reads every group palette a directory record points to with the shared reader', () => {
    const result = checkCockpit('COCKPIT.NOB', dataPaletteBlock());
    expect(result.status).toBe(0);
    expect(result.stdout.split('\n').map(line => line.trim())).toEqual(expect.arrayContaining([
      'CCKD 1 passed, 0 failed',
      'CCKD directory slots 3, elements per slot 1, 1 elements decoded, 1 group palettes read',
      'failures: 0',
    ]));
  });

  it('reports a group palette the reader rejects by code and location', () => {
    const result = checkCockpit('BADPAL.NOB', dataPaletteBlock(index => (index === 5 ? 64 : 0)));
    expect(result.status).toBe(1);
    expect(result.stdout.split('\n').map(line => line.trim())).toEqual(expect.arrayContaining(['failures: 1', '10001 CCKD: invalid-payload@palette']));
  });
});

// P2-07 2026-10-08 revision: SNIP frames and DIAG messages through the import's readers, counts only.
describe('nob-check on synthetic SNIP and DIAG entries', () => {
  const SECRET = 'zq-secret-text';
  const diag = (startup: readonly string[]): SyntheticDiagFields => ({
    timings: [1, 2, 3, 4],
    statusFormats: ['f0', 'f1 %d', 'f2', 'f3'],
    ratings: [['a', 4], ['b', 3], ['c', 2], ['d', 1], ['e', 0]],
    subsystemNames: Array.from({ length: 15 }, (_, index) => (index === 3 ? SECRET : `s${index}`)),
    stateWords: ['x', 'y', 'z'],
    startupMessages: startup,
  });
  const run = (name: string, diagEntry: { data: Uint8Array; relocations: number[] }) => {
    const file = join(directory, name);
    writeFileSync(file, buildImfat(10_000, [
      { id: 10_001, type: 'SNIP', ...syntheticSnip({ width: 8, height: 2, frames: [new Array(16).fill(1), new Array(16).fill(2), new Array(16).fill(3)] }) },
      { id: 10_002, type: 'DIAG', ...diagEntry },
      { id: 10_003, type: 'DIAG', ...syntheticDiag(diag([])) },
    ]));
    return spawnSync(process.execPath, [join(root, 'tools/nob-check.ts'), file], { cwd: root, encoding: 'utf8', timeout: 60_000 });
  };

  it('decodes every frame and reads every text, printing counts and never text', () => {
    const result = run('HUD.NOB', syntheticDiag(diag(['boot 1', 'boot 2'])));
    expect(result.status).toBe(0);
    expect(result.stdout.split('\n').map(line => line.trim())).toEqual(expect.arrayContaining([
      'SNIP 1 passed, 0 failed',
      'DIAG 2 passed, 0 failed',
      'SNIP image 8x2',
      'SNIP frames per entry 3, 3 frames decoded',
      `DIAG startup messages 2, ${27 + 2 + 27} texts read, longest ${SECRET.length} bytes`,
      'failures: 0',
    ]));
    expect(result.stdout).not.toContain(SECRET);
  });

  it('reports a DIAG whose relocations are not its pointer fields by code and location', () => {
    const entry = syntheticDiag(diag([]));
    const result = run('BADDIAG.NOB', { ...entry, relocations: entry.relocations.slice(1) });
    expect(result.status).toBe(1);
    expect(result.stdout.split('\n').map(line => line.trim())).toEqual(expect.arrayContaining(['failures: 1', '10002 DIAG: invalid-payload@messages']));
  });
});

// P3-03/21: every ANIM frame through the import's decoder, and the EXIC → EXPL → ANIM/SND references, counts only.
describe('nob-check on synthetic ANIM, EXIC and EXPL entries', () => {
  const FRAMES: readonly SyntheticFrame[] = [patternFrame(9, 4, 3), patternFrame(9, 4, 5), solidFrame(5, 2, 7)];
  const entryOf = (id: number, type: string, { bytes, relocations }: SyntheticBlock): SyntheticEntry => ({ id, type, data: bytes, relocations: [...relocations] });
  interface Changes { readonly second?: SyntheticBlock; readonly record?: readonly [number, number]; readonly lists?: readonly (readonly number[])[] }
  const run = (name: string, { second, record = [20_001, 20_005], lists = [[20_007], [20_009, 20_007], []] }: Changes = {}) => {
    const file = join(directory, name);
    writeFileSync(file, buildImfat(20_000, [
      { id: 20_001, type: 'SND', data: new Uint8Array(8) },
      entryOf(20_003, 'ANIM', syntheticAnimation(FRAMES.slice(0, 2).map(animFrame))),
      entryOf(20_005, 'ANIM', second ?? syntheticAnimation([animFrame(FRAMES[2])])),
      entryOf(20_007, 'EXPL', explosionRecordBlock(20_001, 20_003)),
      entryOf(20_009, 'EXPL', explosionRecordBlock(...record)),
      entryOf(20_011, 'EXIC', explosionListsBlock(lists)),
    ]));
    return spawnSync(process.execPath, [join(root, 'tools/nob-check.ts'), file], { cwd: root, encoding: 'utf8', timeout: 60_000 });
  };
  const opaque = (frames: readonly SyntheticFrame[]) => frames.reduce((total, { pixels }) => total + pixels.filter(index => index !== null).length, 0);

  it('decodes every frame and checks every reference, printing counts and never pixels or paths', () => {
    const result = run('EXPLODE.NOB');
    expect(result.status).toBe(0);
    const largest = Math.max(...FRAMES.map(frame => animFrame(frame).data.length));
    expect(result.stdout.split('\n').map(line => line.trim())).toEqual(expect.arrayContaining([
      'ANIM 2 passed, 0 failed',
      'EXIC 1 passed, 0 failed',
      'EXPL 2 passed, 0 failed',
      'ANIM image 9x4',
      `ANIM frames per entry 2, 3 frames decoded, largest frame data ${largest} bytes, ${36 + 36 + 10} pixels of which ${opaque(FRAMES)} opaque`,
      'EXIC lists 3, 3 EXPL references (2 distinct)',
      'EXPL records reference 2 distinct ANIM and 1 distinct SND entries',
      'failures: 0',
    ]));
    expect(result.stdout).not.toContain(directory);
  });

  it('reports a frame that does not use up its data, and references to entries of another type', () => {
    // The second frame's data ends with a byte its rows never read; the layout is otherwise sound.
    const padded = { ...animFrame(FRAMES[2]), data: Uint8Array.from([...animFrame(FRAMES[2]).data, 0]) };
    const result = run('BADEXPL.NOB', { second: syntheticAnimation([padded]), record: [20_001, 20_001], lists: [[20_007], [20_005], []] });
    expect(result.status).toBe(1);
    expect(result.stdout.split('\n').map(line => line.trim())).toEqual(expect.arrayContaining([
      'ANIM 1 passed, 1 failed',
      'EXIC 0 passed, 1 failed',
      'EXPL 1 passed, 1 failed',
      `ANIM frames per entry 2, 2 frames decoded, largest frame data ${Math.max(...FRAMES.slice(0, 2).map(frame => animFrame(frame).data.length))} bytes, 72 pixels of which ${opaque(FRAMES.slice(0, 2))} opaque`,
      'failures: 3',
      '20005 ANIM: invalid-payload@archive:/BADEXPL.NOB#20005/frames[0]/pixels',
      '20009 EXPL: record references non-ANIM 20001',
      '20011 EXIC: list references non-EXPL 20005',
    ]));
  });
});

describe('nob-check on a synthetic craft table', () => {
  const CINF = [4005, 4007, 4009];
  const run = (name: string, cell: (row: number, pair: number) => readonly [number, number], tableType = 'TABL') => {
    const file = join(directory, name);
    const table = syntheticCraftTable(cell);
    writeFileSync(file, buildImfat(4000, [
      { id: 4003, type: tableType, data: table.bytes, relocations: [...table.relocations] },
      ...CINF.map(id => ({ id, type: 'CINF', data: new Uint8Array(8) })),
      { id: 4011, type: 'SND', data: new Uint8Array(8) },
    ]));
    return spawnSync(process.execPath, [join(root, 'tools/nob-check.ts'), file], { cwd: root, encoding: 'utf8', timeout: 60_000 });
  };

  it('parses every cell with the import parser and checks that each names a CINF entry', () => {
    const result = run('CRAFT.NOB', (row, pair) => [CINF[(row + pair) % CINF.length], 0.75]);
    expect(result.status).toBe(0);
    expect(result.stdout.split('\n').map(line => line.trim())).toEqual(expect.arrayContaining([
      'TABL 1 passed, 0 failed',
      'TABL records per image list 0; 0 other TABL entries, 0 parse as image lists',
      'TABL 4003 pairs 54 checked, 3 distinct CINF referenced',
      'failures: 0',
    ]));
    expect(result.stdout).not.toContain('0.75');
  });

  it('reports a cell naming an entry of another type, and a craft table entry of another type', () => {
    const named = run('BADCELL.NOB', (row, pair) => [row === 17 && pair === 2 ? 4011 : CINF[0], 1]);
    expect(named.status).toBe(1);
    expect(named.stdout.split('\n').map(line => line.trim())).toEqual(expect.arrayContaining([
      'TABL 0 passed, 1 failed',
      'TABL 4003 pairs 0 checked, 0 distinct CINF referenced',
      'failures: 1',
      '4003 TABL: table references non-CINF 4011',
    ]));
    const typed = run('BADTYPE.NOB', () => [CINF[0], 1], 'TEXT');
    expect(typed.status).toBe(1);
    expect(typed.stdout.split('\n').map(line => line.trim())).toEqual(expect.arrayContaining(['failures: 1', '4003 TABL: the craft table entry has another type']));
  });
});
