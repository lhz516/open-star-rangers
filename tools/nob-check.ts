// Parses every TEX, BITM, MFDD, CCKD font, M2ID, NEBC, MESH, and MODL entry of an IMFAT archive and checks cross-references.
// Usage: node tools/nob-check.ts local/StarRang/SRANGERS/MAIN/SR.NOB
// Prints counts and failures only; never prints entry contents.
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { entryData, parseImfat } from '../src/original-data/imfat.ts';
import { parseBitmapFont, parseIdList, parseImage, parseMesh, parseMfdImages, parseModel } from '../src/original-data/payloads.ts';

const file = process.argv[2];
if (!file) {
  console.error('usage: node tools/nob-check.ts <file.NOB>');
  process.exit(1);
}

const bytes = new Uint8Array(readFileSync(file));
const archive = parseImfat(bytes);
const typeById = new Map(archive.entries.map((e) => [e.id, e.type]));
const ok = new Map<string, number>();
const failures: string[] = [];
let vertices = 0;
let triangles = 0;

for (const entry of archive.entries) {
  const block = entryData(bytes, entry);
  try {
    switch (entry.type) {
      case 'TEX':
      case 'BITM':
        parseImage(block);
        break;
      case 'MFDD':
        parseMfdImages(block);
        break;
      case 'CCKD': {
        // The three header tables are bitmap fonts.
        const v = new DataView(block.buffer, block.byteOffset, block.byteLength);
        const at = v.getUint32(0, true);
        for (let t = 0; t < v.getUint32(4, true); t++) {
          const offset = v.getUint32(at + t * 8, true);
          parseBitmapFont(block.subarray(offset, offset + v.getUint32(at + t * 8 + 4, true)));
        }
        break;
      }
      case 'M2ID':
      case 'NEBC': {
        const expected = entry.type === 'M2ID' ? 'MODL' : 'BITM';
        for (const id of parseIdList(block)) {
          if (id !== 0 && typeById.get(id) !== expected) throw new Error(`list references non-${expected} ${id}`);
        }
        break;
      }
      case 'MESH': {
        const mesh = parseMesh(block);
        vertices += mesh.positions.length / 3;
        triangles += mesh.indices.length / 3;
        break;
      }
      case 'MODL': {
        const model = parseModel(block);
        for (const part of model.partLists.flat()) {
          if (typeById.get(part.meshId) !== 'MESH') throw new Error(`part references non-MESH ${part.meshId}`);
          if (part.textureId !== 0 && typeById.get(part.textureId) !== 'TEX') {
            throw new Error(`part references non-TEX ${part.textureId}`);
          }
        }
        for (const id of model.soundIds) {
          if (id !== 0 && typeById.get(id) !== 'SND') throw new Error(`sound slot references non-SND ${id}`);
        }
        break;
      }
      default:
        continue;
    }
    ok.set(entry.type, (ok.get(entry.type) ?? 0) + 1);
  } catch (error) {
    failures.push(`${entry.id} ${entry.type}: ${(error as Error).message}`);
  }
}

console.log(`${basename(file)}:`);
for (const [type, count] of ok) console.log(`  ${type.padEnd(4)} ${count} parsed`);
console.log(`  MESH totals: ${vertices} vertices, ${triangles} triangles`);
console.log(`  failures: ${failures.length}`);
for (const f of failures) console.log(`    ${f}`);
process.exit(failures.length ? 1 : 0);
