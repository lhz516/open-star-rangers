// Checks every structure of an IMFAT archive that the import or the research reads, and its cross-references.
// Usage: node tools/nob-check.ts local/StarRang/SRANGERS/MAIN/SR.NOB
// Prints per-type pass and fail counts, failure codes with structural locations, the observed graphics, MESH and MODL
// maxima and the observed container, SNIP, DIAG, ANIM, explosion and craft table counts; never pixels, palette values,
// glyphs, coordinates, offsets, text or other entry contents.
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { isOpaque } from '../src/content/graphics/image-payload.ts';
import type { ArchiveEntryRead } from '../src/original-data/archive/archive-reader.ts';
import {
  checkPaletteIndices, decodeImageRecord, decodeSnipFrame, readCockpitFonts, readCockpitGroupPalette, readCockpitGroups, readDataPalette, readEmbeddedPalette,
  readImageRecordHeader, readMfdRecordOffsets, readSnipFrames, readTableRecordOffsets,
} from '../src/original-data/conversion/source-graphics.ts';
import { readStatusMessages } from '../src/original-data/conversion/source-messages.ts';
import { isDiscPath, type DiscPath } from '../src/original-data/disc/disc-path.ts';
import { entryData, entryRelocations, parseImfat, type ImfatEntry } from '../src/original-data/imfat.ts';
import { decodeAnimationFrame, readAnimationFrames } from '../src/original-data/formats/anim.ts';
import { CRAFT_TABLE_FORMAT, parseCraftTable } from '../src/original-data/formats/craft.ts';
import { parseExplosionLists, parseExplosionRecord } from '../src/original-data/formats/explosion.ts';
import { readMesh } from '../src/original-data/formats/mesh.ts';
import { readModel } from '../src/original-data/formats/modl.ts';
import { parseIdList, PayloadError } from '../src/original-data/payloads.ts';
import { SourceError } from '../src/original-data/source-error.ts';

const file = process.argv[2];
if (!file) {
  console.error('usage: node tools/nob-check.ts <file.NOB>');
  process.exit(1);
}

/** A safe failure text: a SourceError's code and structural location, a research parser's fixed text, or `internal-error`. */
const failureText = (error: unknown): string =>
  error instanceof SourceError ? `${error.code}@${error.location}` : error instanceof PayloadError ? error.message : 'internal-error';

let bytes: Uint8Array;
let archive: ReturnType<typeof parseImfat>;
try {
  bytes = new Uint8Array(readFileSync(file));
  archive = parseImfat(bytes);
} catch (error) {
  // Never print host error text, which may name private paths.
  console.log(`${basename(file)}: ${error instanceof SourceError ? failureText(error) : 'the file cannot be read'}`);
  process.exit(1);
}
/**
 * TABL entries that docs/original/formats/hud.md §2 records as image lists. Their IDs belong to SR.NOB only; an archive
 * holding any of them must hold all of them as TABL entries, whatever the file is called.
 */
const IMAGE_LIST_TABLES: readonly number[] = [10461, 10479, 10481, 10483, 11401];
/**
 * The craft table of docs/original/formats/craft.md §2, whose ID belongs to CRAFT.NOB only: an archive holding the ID
 * must hold it as a TABL entry, whatever the file is called.
 */
const CRAFT_TABLE = 4003;
/** The archive path of diagnostics: the file name when it is an upper-case 8.3 name, never a host path. */
const archivePath = ((name: string) => (isDiscPath(name) ? name : 'ARCHIVE.NOB') as DiscPath)(basename(file).toUpperCase());

const typeById = new Map(archive.entries.map((e) => [e.id, e.type]));
const holdsImageLists = IMAGE_LIST_TABLES.some(id => typeById.has(id));
const counts = new Map<string, { passed: number; failed: number }>();
const failures: string[] = [];
/** Observed graphics maxima by entry type, compared with the P2-05 structural limits in docs/original. */
interface GraphicsStats { imageWidth: number; imageHeight: number; paletteEntryCount: number; fontCells: Set<string> }
const stats = new Map<string, GraphicsStats>();
let images = 0;
let indexedImages = 0;
/** Observed container counts, compared with the P2-07 structural limits in docs/original. */
const containers = {
  cockpitSlots: 0, cockpitElements: 0, elements: 0, groupPalettes: 0, mfdRecords: 0, tableRecords: 0, otherTables: 0, otherImageLists: 0,
};
/** How many elements set each of the two CCKD element flag fields to 1; the others hold 0. */
const flagsSet = [0, 0];
/** Observed SNIP and DIAG counts, compared with the P2-07 limits (2026-10-08 revision) in docs/original. */
const hudSets = { snipFrames: 0, snipFramesDecoded: 0, diagTexts: 0, diagStartupMessages: 0, diagTextBytes: 0 };
/** Observed ANIM frame counts, compared with the P3-03 limits in docs/original/formats/textures.md §6. */
const animations = { frames: 0, framesDecoded: 0, frameDataBytes: 0, pixels: 0, opaquePixels: 0 };
/** Observed EXIC and EXPL references (textures.md §7) and TABL 4003 cells (craft.md §2), as counts of distinct IDs. */
const explosions = { lists: 0, references: 0, records: new Set<number>(), animations: new Set<number>(), sounds: new Set<number>() };
const craftTable = { pairs: 0, craftInfo: new Set<number>() };
/** Stands in for the executable's colour table, which the archive does not hold, so that every frame is decoded. */
const IDENTITY_COLOURS = Uint8Array.of(0, 1, 2, 3);
/** Stands in for the executable's lower-line format; only the entry's own structure is checked. */
const EMPTY_FORMAT = Uint8Array.of(0);

/** Whether CCKD slot `slot` has a palette; a palette it points to must pass the shared reader. */
function hasGroupPalette(block: Uint8Array, slot: number): boolean {
  try {
    readCockpitGroupPalette(block, slot);
    return true;
  } catch (error) {
    if (error instanceof SourceError && error.code === 'subresource-not-found') return false;
    throw error;
  }
}

/** Whether a TABL entry that is not documented as an image list would still parse as one. */
function parsesAsImageList(block: Uint8Array): boolean {
  try {
    readTableRecordOffsets(block);
    return true;
  } catch (error) {
    if (error instanceof SourceError) return false;
    throw error;
  }
}
let vertices = 0;
let triangles = 0;
/** Observed MESH and MODL maxima of passing entries, compared with the P2-06 structural limits in docs/original. */
const meshMaxima = { vertices: 0, triangles: 0, shadingSlots: 0 };
const modelMaxima = { parts: 0, lists: [0, 0, 0], colour: 0, flags: new Set<number>() };

function statsOf(type: string): GraphicsStats {
  let entry = stats.get(type);
  if (!entry) stats.set(type, entry = { imageWidth: 0, imageHeight: 0, paletteEntryCount: 0, fontCells: new Set() });
  return entry;
}

/** The largest width and height among `WxH` cells. */
function maxCell(cells: ReadonlySet<string>): string {
  const sizes = [...cells].map(cell => cell.split('x').map(Number));
  return `${Math.max(...sizes.map(([width]) => width))}x${Math.max(...sizes.map(([, height]) => height))}`;
}

function countOf(type: string): { passed: number; failed: number } {
  let entry = counts.get(type);
  if (!entry) counts.set(type, entry = { passed: 0, failed: 0 });
  return entry;
}

/** Decodes the record at `offset` and, when it embeds a palette, checks that every opaque index addresses it. */
function checkImage(type: string, block: Uint8Array, offset = 0): void {
  const image = decodeImageRecord(block, offset);
  const entry = statsOf(type);
  images += 1;
  entry.imageWidth = Math.max(entry.imageWidth, image.width);
  entry.imageHeight = Math.max(entry.imageHeight, image.height);
  if (readImageRecordHeader(block, offset).paletteCount === 0) return;
  const entryCount = readEmbeddedPalette(block, offset).length / 3;
  entry.paletteEntryCount = Math.max(entry.paletteEntryCount, entryCount);
  checkPaletteIndices(image, entryCount);
  indexedImages += 1;
}

/** The entry as the import's on-demand reads give it to the format parsers. */
const entryRead = (entry: ImfatEntry): ArchiveEntryRead => ({ entry, bytes: entryData(bytes, entry), relocations: entryRelocations(bytes, entry) });

/** Opaque pixels of a decoded image, whose mask has the image payload's layout. */
function opaqueCount({ width, height, mask }: { readonly width: number; readonly height: number; readonly mask: Uint8Array | null }): number {
  let count = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) count += Number(isOpaque(mask, width, x, y));
  return count;
}

/**
 * Checks the whole structure of an ANIM entry with the import's reader, then decodes every frame with the import's
 * decoder, which requires each frame to use up exactly its data (textures.md §6). Only a passing entry is counted.
 */
function checkAnimation(entry: ImfatEntry): void {
  const read = entryRead(entry);
  const frames = readAnimationFrames(archivePath, read);
  const observed = { width: 0, height: 0, frameDataBytes: 0, pixels: 0, opaquePixels: 0 };
  frames.forEach(({ recordOffset }, index) => {
    const frame = decodeAnimationFrame(archivePath, read, index);
    const { width, height, indices } = frame;
    observed.width = Math.max(observed.width, width);
    observed.height = Math.max(observed.height, height);
    observed.frameDataBytes = Math.max(observed.frameDataBytes, readImageRecordHeader(read.bytes, recordOffset, '', 'anim-frame').dataSize);
    observed.pixels += indices.length;
    observed.opaquePixels += opaqueCount(frame);
  });
  const entryStats = statsOf(entry.type);
  entryStats.imageWidth = Math.max(entryStats.imageWidth, observed.width);
  entryStats.imageHeight = Math.max(entryStats.imageHeight, observed.height);
  animations.frames = Math.max(animations.frames, frames.length);
  animations.framesDecoded += frames.length;
  animations.frameDataBytes = Math.max(animations.frameDataBytes, observed.frameDataBytes);
  animations.pixels += observed.pixels;
  animations.opaquePixels += observed.opaquePixels;
}

/** Parses every cell of TABL 4003 with the import's parser; each must name a CINF entry of the archive. */
function checkCraftTable(entry: ImfatEntry): void {
  const read = entryRead(entry);
  const named: number[] = [];
  for (let campaignSlot = 0; campaignSlot < CRAFT_TABLE_FORMAT.rows; campaignSlot++) {
    for (let campaignGroup = 0; campaignGroup < CRAFT_TABLE_FORMAT.pairs; campaignGroup++) {
      const { craftInfoEntryId } = parseCraftTable(archivePath, read, { campaignSlot, campaignGroup });
      if (typeById.get(craftInfoEntryId) !== 'CINF') throw new PayloadError(`table references non-CINF ${craftInfoEntryId}`);
      named.push(craftInfoEntryId);
    }
  }
  craftTable.pairs += named.length;
  for (const id of named) craftTable.craftInfo.add(id);
}

for (const entry of archive.entries) {
  const block = entryData(bytes, entry);
  try {
    switch (entry.type) {
      case 'DATA':
        statsOf(entry.type).paletteEntryCount = readDataPalette(block).length / 3;
        break;
      case 'TEX':
      case 'BITM':
        checkImage(entry.type, block);
        break;
      case 'MFDD':
        for (const list of readMfdRecordOffsets(block)) {
          containers.mfdRecords = Math.max(containers.mfdRecords, list.length);
          for (const offset of list) checkImage(entry.type, block, offset);
        }
        break;
      case 'CCKD': {
        for (const { cellWidth, height } of readCockpitFonts(block)) statsOf(entry.type).fontCells.add(`${cellWidth}x${height}`);
        const groups = readCockpitGroups(block);
        containers.cockpitSlots = Math.max(containers.cockpitSlots, groups.length);
        groups.forEach((_, slot) => { if (hasGroupPalette(block, slot)) containers.groupPalettes += 1; });
        for (const elements of groups) {
          containers.cockpitElements = Math.max(containers.cockpitElements, elements.length);
          for (const { recordOffset, flags } of elements) {
            checkImage(entry.type, block, recordOffset);
            flags.forEach((value, field) => { flagsSet[field] += value; });
            containers.elements += 1;
          }
        }
        break;
      }
      case 'TABL': {
        if (entry.id === CRAFT_TABLE) {
          checkCraftTable(entry);
          break;
        }
        if (!holdsImageLists || !IMAGE_LIST_TABLES.includes(entry.id)) {
          // Other TABL entries are not image lists; count any that would parse as one, which the format doc must list.
          containers.otherTables += 1;
          if (parsesAsImageList(block)) containers.otherImageLists += 1;
          continue;
        }
        const offsets = readTableRecordOffsets(block);
        containers.tableRecords = Math.max(containers.tableRecords, offsets.length);
        for (const offset of offsets) checkImage(entry.type, block, offset);
        break;
      }
      case 'SNIP': {
        const snip = { bytes: block, relocations: entryRelocations(bytes, entry) };
        const { count, width, height } = readSnipFrames(snip);
        const entryStats = statsOf(entry.type);
        entryStats.imageWidth = Math.max(entryStats.imageWidth, width);
        entryStats.imageHeight = Math.max(entryStats.imageHeight, height);
        hudSets.snipFrames = Math.max(hudSets.snipFrames, count);
        for (let frame = 0; frame < count; frame++) decodeSnipFrame(snip, frame, IDENTITY_COLOURS);
        hudSets.snipFramesDecoded += count;
        break;
      }
      case 'DIAG': {
        const messages = readStatusMessages({ bytes: block, relocations: entryRelocations(bytes, entry) }, EMPTY_FORMAT);
        const texts = [
          ...messages.statusFormats, ...messages.ratings.map(({ text }) => text), ...messages.subsystemNames, ...messages.stateWords, ...messages.startupMessages,
        ];
        hudSets.diagTexts += texts.length;
        hudSets.diagStartupMessages = Math.max(hudSets.diagStartupMessages, messages.startupMessages.length);
        hudSets.diagTextBytes = Math.max(hudSets.diagTextBytes, ...texts.map(text => text.length));
        break;
      }
      case 'ANIM':
        checkAnimation(entry);
        break;
      case 'EXIC': {
        const lists = parseExplosionLists(archivePath, entryRead(entry));
        const ids = lists.flat();
        for (const id of ids) {
          if (typeById.get(id) !== 'EXPL') throw new PayloadError(`list references non-EXPL ${id}`);
        }
        explosions.lists += lists.length;
        explosions.references += ids.length;
        for (const id of ids) explosions.records.add(id);
        break;
      }
      case 'EXPL': {
        const { sound, animation } = parseExplosionRecord(archivePath, entryRead(entry));
        if (typeById.get(sound) !== 'SND') throw new PayloadError(`record references non-SND ${sound}`);
        if (typeById.get(animation) !== 'ANIM') throw new PayloadError(`record references non-ANIM ${animation}`);
        explosions.sounds.add(sound);
        explosions.animations.add(animation);
        break;
      }
      case 'M2ID':
      case 'NEBC': {
        const expected = entry.type === 'M2ID' ? 'MODL' : 'BITM';
        for (const id of parseIdList(block)) {
          if (id !== 0 && typeById.get(id) !== expected) throw new PayloadError(`list references non-${expected} ${id}`);
        }
        break;
      }
      case 'MESH': {
        const mesh = readMesh(block, 'mesh');
        const meshVertices = mesh.positions.length / 3;
        const meshTriangles = mesh.indices.length / 3;
        vertices += meshVertices;
        triangles += meshTriangles;
        meshMaxima.vertices = Math.max(meshMaxima.vertices, meshVertices);
        meshMaxima.triangles = Math.max(meshMaxima.triangles, meshTriangles);
        meshMaxima.shadingSlots = Math.max(meshMaxima.shadingSlots, mesh.shadingSlotCount);
        break;
      }
      case 'MODL': {
        const model = readModel(block, 'model');
        const parts = model.partLists.flat();
        for (const part of parts) {
          if (typeById.get(part.meshEntry) !== 'MESH') throw new PayloadError(`part references non-MESH ${part.meshEntry}`);
          if (part.textureEntry !== 0 && typeById.get(part.textureEntry) !== 'TEX') {
            throw new PayloadError(`part references non-TEX ${part.textureEntry}`);
          }
        }
        for (const id of model.soundEntries) {
          if (id !== 0 && typeById.get(id) !== 'SND') throw new PayloadError(`sound slot references non-SND ${id}`);
        }
        modelMaxima.parts = Math.max(modelMaxima.parts, parts.length);
        model.partLists.forEach((list, index) => { modelMaxima.lists[index] = Math.max(modelMaxima.lists[index], list.length); });
        for (const { colour, sourceFlags } of parts) {
          modelMaxima.colour = Math.max(modelMaxima.colour, ...colour);
          modelMaxima.flags.add(sourceFlags);
        }
        break;
      }
      default:
        continue;
    }
    countOf(entry.type).passed += 1;
  } catch (error) {
    countOf(entry.type).failed += 1;
    failures.push(`${entry.id} ${entry.type}: ${failureText(error)}`);
  }
}

for (const id of holdsImageLists ? IMAGE_LIST_TABLES : []) {
  if (typeById.get(id) !== 'TABL') failures.push(`${id} TABL: a documented image list entry is missing or has another type`);
}
if (typeById.has(CRAFT_TABLE) && typeById.get(CRAFT_TABLE) !== 'TABL') failures.push(`${CRAFT_TABLE} TABL: the craft table entry has another type`);

console.log(`${basename(file)}:`);
for (const [type, { passed, failed }] of counts) console.log(`  ${type.padEnd(4)} ${passed} passed, ${failed} failed`);
console.log(`  image records: ${images} decoded, ${indexedImages} with embedded palettes checked for index range`);
console.log(`  MESH totals: ${vertices} vertices, ${triangles} triangles`);
console.log('  observed maxima:');
for (const [type, { imageWidth, imageHeight, paletteEntryCount, fontCells }] of stats) {
  const parts = [
    imageWidth ? `image ${imageWidth}x${imageHeight}` : '',
    paletteEntryCount ? `palette ${paletteEntryCount} entries` : '',
    fontCells.size ? `font cell ${maxCell(fontCells)} (cells seen: ${[...fontCells].sort().join(', ')})` : '',
  ];
  console.log(`    ${type.padEnd(4)} ${parts.filter(Boolean).join(', ')}`);
}
if (counts.get('MESH')?.passed) {
  console.log(`    MESH vertices ${meshMaxima.vertices}, triangles ${meshMaxima.triangles}, shading slots ${meshMaxima.shadingSlots}`);
}
if (counts.get('MODL')?.passed) {
  const flags = [...modelMaxima.flags].sort((left, right) => left - right).join(', ');
  console.log(`    MODL parts ${modelMaxima.parts} (lists ${modelMaxima.lists.join('/')}), colour component ${modelMaxima.colour}, part flags ${flags}`);
}
console.log('  observed container counts:');
console.log(`    CCKD directory slots ${containers.cockpitSlots}, elements per slot ${containers.cockpitElements}, ${containers.elements} elements decoded, ${containers.groupPalettes} group palettes read`);
const flagText = (set: number) => `${containers.elements - set}×0 ${set}×1`;
console.log(`    CCKD element flags: first ${flagText(flagsSet[0])}, second ${flagText(flagsSet[1])}`);
console.log(`    MFDD records per list ${containers.mfdRecords}`);
console.log(`    TABL records per image list ${containers.tableRecords}; ${containers.otherTables} other TABL entries, ${containers.otherImageLists} parse as image lists`);
if (counts.has('SNIP')) console.log(`    SNIP frames per entry ${hudSets.snipFrames}, ${hudSets.snipFramesDecoded} frames decoded`);
if (counts.has('DIAG')) {
  console.log(`    DIAG startup messages ${hudSets.diagStartupMessages}, ${hudSets.diagTexts} texts read, longest ${hudSets.diagTextBytes} bytes`);
}
if (counts.has('ANIM')) {
  const { frames, framesDecoded, frameDataBytes, pixels, opaquePixels } = animations;
  console.log(`    ANIM frames per entry ${frames}, ${framesDecoded} frames decoded, largest frame data ${frameDataBytes} bytes, ${pixels} pixels of which ${opaquePixels} opaque`);
}
if (counts.has('EXIC')) console.log(`    EXIC lists ${explosions.lists}, ${explosions.references} EXPL references (${explosions.records.size} distinct)`);
if (counts.has('EXPL')) {
  console.log(`    EXPL records reference ${explosions.animations.size} distinct ANIM and ${explosions.sounds.size} distinct SND entries`);
}
if (typeById.get(CRAFT_TABLE) === 'TABL') console.log(`    TABL ${CRAFT_TABLE} pairs ${craftTable.pairs} checked, ${craftTable.craftInfo.size} distinct CINF referenced`);
console.log(`  failures: ${failures.length}`);
for (const f of failures) console.log(`    ${f}`);
process.exit(failures.length ? 1 : 0);
