import { EMPTY_BUDGET_USAGE } from '../../content/budget.ts';
import { readArray, readRecord } from '../../content/contract-validation.ts';
import type { ByteSource } from '../io/byte-source.ts';
import { DiscReadError } from './disc-error.ts';
import { readCancellation, readSourceLimits, snapshotSource, SourceReader, type CancellationProbe, type SourceSnapshot } from './source-reader.ts';

// CloneCD file sets (P2-02 S-01, S-02): pairing, size gates and the supported single-session, single-MODE1-track layout.

export const RAW_SECTOR_BYTES = 2_352;
export const MAX_DESCRIPTOR_BYTES = 65_536;
/** Enough sectors for the primary volume descriptor at LBA 16 and a terminator. */
export const MIN_IMAGE_SECTORS = 18;
/** The CD MSF address space, 100 × 60 × 75 frames, less the 150-frame start offset. */
export const MAX_IMAGE_SECTORS = 100 * 60 * 75 - 150;
const FILE_EXTENSIONS: ReadonlySet<string> = new Set(['ccd', 'img', 'sub', 'cue']);

/** A host file: its name only pairs files and never enters results or diagnostics. */
export interface DiscInputFile {
  readonly name: string;
  readonly source: ByteSource;
}

export interface OpenDiscOptions {
  /** A complete P2-01 budget record; defaults to the `.ccd` and `.img` byte total as `sourceReadBytes`, 0 elsewhere. */
  readonly limits?: unknown;
  readonly cancellation?: CancellationProbe;
}

/** An opened file set whose descriptor matched the image; volume reading continues from here. */
export interface CloneCdImage {
  readonly reader: SourceReader;
  readonly image: SourceSnapshot;
  readonly sectorCount: number;
}

function unsupportedFileSet(): DiscReadError {
  return new DiscReadError('unsupported-file-set', 'files', 'a file set is one .ccd and one .img with the same name, plus an optional .sub and .cue');
}

/** Pairs the descriptor and image by name without touching any source or running accessors. */
function pairFiles(files: readonly DiscInputFile[]): { readonly descriptor: ByteSource; readonly image: ByteSource } {
  if (!Array.isArray(files) || files.length > FILE_EXTENSIONS.size) throw unsupportedFileSet();
  let records: readonly Record<string, unknown>[];
  try {
    records = readArray(files, 'files', 'invalid-record', readRecord);
  } catch {
    throw unsupportedFileSet();
  }
  const sources = new Map<string, ByteSource>();
  let stem: string | undefined;
  for (const { name, source } of records) {
    if (typeof name !== 'string' || typeof source !== 'object' || source === null) throw unsupportedFileSet();
    const dot = name.lastIndexOf('.');
    const extension = name.slice(dot + 1).toLowerCase();
    const fileStem = name.slice(0, Math.max(dot, 0)).toLowerCase();
    // dot <= 0: no extension, or an empty stem.
    if (dot <= 0 || !FILE_EXTENSIONS.has(extension) || sources.has(extension) || (stem ?? fileStem) !== fileStem) throw unsupportedFileSet();
    stem = fileStem;
    sources.set(extension, source as ByteSource);
  }
  const descriptor = sources.get('ccd');
  const image = sources.get('img');
  if (!descriptor || !image) throw unsupportedFileSet();
  return { descriptor, image };
}

function limitExceeded(location: string, name: 'descriptorBytes' | 'imageSectors' | 'sourceReadBytes', limit: number, observed: number): DiscReadError {
  return new DiscReadError('limit-exceeded', location, 'the input is outside a supported size limit', { name, limit, observed });
}

function imageSectorCount(byteLength: number): number {
  if (byteLength % RAW_SECTOR_BYTES !== 0) throw new DiscReadError('image-size-mismatch', 'image', 'the image must be whole 2,352-byte raw sectors');
  const sectors = byteLength / RAW_SECTOR_BYTES;
  if (sectors < MIN_IMAGE_SECTORS) throw limitExceeded('image', 'imageSectors', MIN_IMAGE_SECTORS, sectors);
  if (sectors > MAX_IMAGE_SECTORS) throw limitExceeded('image', 'imageSectors', MAX_IMAGE_SECTORS, sectors);
  return sectors;
}

/**
 * Opens a CloneCD file set: pairs it, snapshots sources and options, gates sizes before any read, then reads and checks
 * the whole `.ccd`. The `.sub` and `.cue` are never read. Failures reject without a partial result.
 */
export async function openCloneCd(files: readonly DiscInputFile[], options: OpenDiscOptions = {}): Promise<CloneCdImage> {
  const pair = pairFiles(files);
  const descriptor = snapshotSource(pair.descriptor, 'descriptor');
  const image = snapshotSource(pair.image, 'image');
  let record: Record<string, unknown>;
  try {
    // A plain record only; data fields are copied without running accessors.
    record = readRecord(options, 'options');
  } catch {
    throw new DiscReadError('invalid-record', 'options', 'must be a plain options record of data fields');
  }
  const requested = record.limits === undefined ? undefined : readSourceLimits(record.limits);
  const cancellation = readCancellation(record.cancellation);
  if (descriptor.byteLength < 1) throw limitExceeded('descriptor', 'descriptorBytes', 1, descriptor.byteLength);
  if (descriptor.byteLength > MAX_DESCRIPTOR_BYTES) throw limitExceeded('descriptor', 'descriptorBytes', MAX_DESCRIPTOR_BYTES, descriptor.byteLength);
  const sectorCount = imageSectorCount(image.byteLength);
  const inputBytes = descriptor.byteLength + image.byteLength;
  if (requested && requested.sourceReadBytes > inputBytes) throw limitExceeded('limits.sourceReadBytes', 'sourceReadBytes', inputBytes, requested.sourceReadBytes);
  const reader = new SourceReader(requested ?? Object.freeze({ ...EMPTY_BUDGET_USAGE, sourceReadBytes: inputBytes }), cancellation);
  checkDescriptor(await reader.read(descriptor, 0, descriptor.byteLength, 'descriptor'), sectorCount);
  return Object.freeze({ reader, image, sectorCount });
}

interface Section {
  readonly name: string;
  readonly keys: Map<string, { readonly value: string; readonly line: number }>;
}

interface ParsedDescriptor {
  readonly sections: ReadonlyMap<string, Section>;
  readonly entries: readonly Section[];
  /** The first section outside the supported set; reported only after the syntax checks pass. */
  readonly unknownSectionLine: number | undefined;
}

const KNOWN_SECTIONS: ReadonlySet<string> = new Set(['CloneCD', 'Disc', 'Session 1', 'TRACK 1']);
const ENTRY_SECTION = /^Entry (0|[1-9][0-9]*)$/;
const SECTION_LINE = /^\[([^[\]]+)\]$/;
const NUMBER = /^(?:[0-9]+|0x[0-9a-fA-F]+)$/;
const LEAD_IN_POINTS = [0xa0, 0xa1] as const;
const TRACK_ONE = 0x01;
const LEAD_OUT = 0xa2;
const TOC_POINTS: ReadonlySet<number> = new Set([...LEAD_IN_POINTS, LEAD_OUT, TRACK_ONE]);
const DATA_TRACK_CONTROL = 0x04;

// Locations echo only allow-listed section and key names; anything else is located by line number.
const lineAt = (line: number): string => `descriptor:line ${line}`;
const keyAt = (section: string, key?: string): string => `descriptor[${section}]${key === undefined ? '' : `.${key}`}`;
const invalid = (location: string, reason: string): DiscReadError => new DiscReadError('invalid-descriptor', location, reason);
const unsupported = (location: string): DiscReadError => new DiscReadError('unsupported-layout', location, 'the descriptor is outside the supported layout');

function descriptorLines(bytes: Uint8Array): string[] {
  const lines: string[] = [];
  let line = '';
  for (let index = 0; index < bytes.length; index++) {
    const byte = bytes[index];
    if (byte === 0x0a || (byte === 0x0d && bytes[index + 1] === 0x0a)) {
      lines.push(line);
      line = '';
      if (byte === 0x0d) index++;
    } else if (byte >= 0x20 && byte <= 0x7e) {
      line += String.fromCharCode(byte);
    } else {
      throw invalid(lineAt(lines.length + 1), 'must be printable ASCII with LF or CRLF line ends');
    }
  }
  if (line !== '') lines.push(line);
  return lines;
}

function parseDescriptor(bytes: Uint8Array): ParsedDescriptor {
  const sections = new Map<string, Section>();
  const entries: Section[] = [];
  const names = new Set<string>();
  let unknownSectionLine: number | undefined;
  let current: Section | undefined;
  for (const [index, text] of descriptorLines(bytes).entries()) {
    const line = index + 1;
    if (text === '') continue;
    const header = SECTION_LINE.exec(text);
    if (header) {
      const name = header[1];
      if (names.has(name)) throw invalid(lineAt(line), 'repeats a section');
      names.add(name);
      current = { name, keys: new Map() };
      const entry = ENTRY_SECTION.exec(name);
      if (entry) {
        if (entry[1] !== String(entries.length)) throw invalid(lineAt(line), 'entries must be numbered consecutively from 0');
        entries.push(current);
      } else if (KNOWN_SECTIONS.has(name)) {
        sections.set(name, current);
      } else {
        unknownSectionLine ??= line;
      }
      continue;
    }
    const separator = text.indexOf('=');
    if (separator <= 0 || text.startsWith('[') || !current) throw invalid(lineAt(line), 'must be a [section], a key=value or an empty line');
    const key = text.slice(0, separator);
    if (current.keys.has(key)) throw invalid(lineAt(line), 'repeats a key');
    current.keys.set(key, { value: text.slice(separator + 1), line });
  }
  return { sections, entries, unknownSectionLine };
}

function requiredSection(descriptor: ParsedDescriptor, name: string): Section {
  const section = descriptor.sections.get(name);
  if (!section) throw invalid(keyAt(name), 'is a required section');
  return section;
}

function numberAt(section: Section, key: string): number {
  const field = section.keys.get(key);
  if (!field) throw invalid(keyAt(section.name, key), 'is a required key');
  const value = NUMBER.test(field.value) ? Number(field.value) : Number.NaN;
  if (!Number.isSafeInteger(value)) throw invalid(keyAt(section.name, key), 'must be a whole decimal or 0x hexadecimal safe integer');
  return value;
}

interface TocEntry {
  readonly name: string;
  readonly session: number;
  readonly point: number;
  readonly adr: number;
  readonly control: number;
  /** First or last track number, read only for the lead-in points. */
  readonly pMin: number | undefined;
  /** Track start or lead-out address, read only for track 1 and the lead-out. */
  readonly pLba: number | undefined;
}

function tocEntry(entry: Section): TocEntry {
  const session = numberAt(entry, 'Session');
  const point = numberAt(entry, 'Point');
  const adr = numberAt(entry, 'ADR');
  const control = numberAt(entry, 'Control');
  const pMin = point === LEAD_IN_POINTS[0] || point === LEAD_IN_POINTS[1] ? numberAt(entry, 'PMin') : undefined;
  const pLba = point === TRACK_ONE || point === LEAD_OUT ? numberAt(entry, 'PLBA') : undefined;
  return { name: entry.name, session, point, adr, control, pMin, pLba };
}

/**
 * Checks a `.ccd` in the documented order: syntax and required keys (`invalid-descriptor`), then the supported layout
 * (`unsupported-layout`), then the lead-out against the image size (`image-size-mismatch`).
 */
function checkDescriptor(bytes: Uint8Array, sectorCount: number): void {
  const descriptor = parseDescriptor(bytes);
  const cloneCd = requiredSection(descriptor, 'CloneCD');
  const disc = requiredSection(descriptor, 'Disc');
  requiredSection(descriptor, 'Session 1');
  const track = requiredSection(descriptor, 'TRACK 1');
  const version = numberAt(cloneCd, 'Version');
  const tocEntries = numberAt(disc, 'TocEntries');
  const sessions = numberAt(disc, 'Sessions');
  const scrambled = numberAt(disc, 'DataTracksScrambled');
  const toc = descriptor.entries.map(tocEntry);
  const mode = numberAt(track, 'MODE');
  const firstIndex = numberAt(track, 'INDEX 1');
  if (tocEntries !== toc.length) throw invalid(keyAt('Disc', 'TocEntries'), 'must equal the number of entries');

  if (version !== 3) throw unsupported(keyAt('CloneCD', 'Version'));
  if (sessions !== 1) throw unsupported(keyAt('Disc', 'Sessions'));
  if (scrambled !== 0) throw unsupported(keyAt('Disc', 'DataTracksScrambled'));
  if (descriptor.unknownSectionLine !== undefined) throw unsupported(lineAt(descriptor.unknownSectionLine));
  const points = new Set<number>();
  for (const entry of toc) {
    if (entry.session !== 1) throw unsupported(keyAt(entry.name, 'Session'));
    if (entry.adr !== 1) throw unsupported(keyAt(entry.name, 'ADR'));
    if (entry.control > 15 || (entry.control & DATA_TRACK_CONTROL) === 0) throw unsupported(keyAt(entry.name, 'Control'));
    if (!TOC_POINTS.has(entry.point) || points.has(entry.point)) throw unsupported(keyAt(entry.name, 'Point'));
    points.add(entry.point);
    // The lead-in PMin is the first or last track number; their PLBA is not an address and is never read.
    if (entry.pMin !== undefined && entry.pMin !== 1) throw unsupported(keyAt(entry.name, 'PMin'));
    if (entry.point === TRACK_ONE && entry.pLba !== 0) throw unsupported(keyAt(entry.name, 'PLBA'));
  }
  if (points.size !== TOC_POINTS.size) throw unsupported(keyAt('Disc', 'TocEntries'));
  if (mode !== 1) throw unsupported(keyAt('TRACK 1', 'MODE'));
  if (firstIndex !== 0) throw unsupported(keyAt('TRACK 1', 'INDEX 1'));
  for (const [key, { line }] of track.keys) {
    if (key.startsWith('INDEX ') && key !== 'INDEX 1') throw unsupported(lineAt(line));
  }

  const leadOut = toc.find(entry => entry.point === LEAD_OUT)!;
  if (leadOut.pLba !== sectorCount) {
    throw new DiscReadError('image-size-mismatch', keyAt(leadOut.name, 'PLBA'), 'the lead-out must equal the image sector count');
  }
}
