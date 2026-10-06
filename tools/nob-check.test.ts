import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { cockpitLayoutBlock, dataPaletteBlock, rawImageBlock } from '../src/original-data/conversion/conversion.test-support.ts';
import { buildImfat, syntheticMesh, syntheticModl } from '../src/original-data/synthetic.ts';

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
