import { asciiBytes } from '../content/graphics/graphics-format.ts';
import { productionSliceEntries } from '../original-data/conversion/production-models.test-support.ts';
import { PRODUCTION_SOUND_TABLE } from '../original-data/conversion/production-sounds.ts';
import type { SyntheticFileContent } from '../original-data/disc/disc.test-support.ts';
import { PRODUCTION_CATALOG } from '../original-data/source/source-catalog.ts';
import { archiveLocator } from '../original-data/source-mapping.ts';
import { buildImfat, syntheticSnd } from '../original-data/synthetic.ts';
import { productionSizedFiles, sliceCoveredFiles } from './synthetic-import.test-support.ts';

// P2-12 network canaries (spec, network audit): code-generated synthetic markers placed where the import reads them and,
// for the slice disc, carried unchanged into a converted payload. Never original data. The existing fixtures keep their
// bytes; these are separate variants.

/** The ASCII canary written into input data the import reads. */
export const CANARY_TEXT = 'OSR-CANARY-TEXT-51c3a9e0';

/** A unique synthetic byte marker, outside printable ASCII, that conversion keeps unchanged in the canary payload. */
const CANARY_MARKER_HEX = 'd38f1cb64ef19207a86de53bc0197afe';

/** A fresh copy of the byte marker. */
export const canaryMarkerBytes = (): Uint8Array =>
  Uint8Array.from(CANARY_MARKER_HEX.match(/../g)!, pair => Number.parseInt(pair, 16));

/** The canary text followed by the byte marker. */
export const canaryBytes = (): Uint8Array => Uint8Array.from([...asciiBytes(CANARY_TEXT), ...canaryMarkerBytes()]);

/** Whether `bytes` holds `marker` as one contiguous run. */
export function containsBytes(bytes: Uint8Array, marker: Uint8Array): boolean {
  outer: for (let start = 0; start + marker.length <= bytes.length; start++) {
    for (let index = 0; index < marker.length; index++) if (bytes[start + index] !== marker[index]) continue outer;
    return true;
  }
  return false;
}

/** The sound Asset whose 8-bit samples are the canary bytes; a sound payload copies its PCM unchanged. */
export const CANARY_ASSET = 'sound/fire/player';

const CANARY_ENTRY = archiveLocator(PRODUCTION_SOUND_TABLE.find(({ mapping }) => mapping.asset.id === CANARY_ASSET)!.mapping.parts[0].alternatives[0]).entry.id;

/**
 * The synthetic slice disc of `sliceCoveredFiles()` whose `MAIN/SR.NOB` SND entry for `CANARY_ASSET` holds the canary
 * bytes as 8-bit mono samples played once: the audio stage reads that entry and copies the samples into the payload.
 */
export function canaryCoveredFiles(): Record<string, Uint8Array> {
  const entries = productionSliceEntries().map(entry =>
    (entry.id === CANARY_ENTRY ? { id: entry.id, type: 'SND', ...syntheticSnd({ samples: canaryBytes(), bitsPerSample: 8, flags: 1 }) } : entry));
  return { ...sliceCoveredFiles(), 'MAIN/SR.NOB': buildImfat(10_000, entries) };
}

/** The production whitelist's first file in path order, which identification hashes whole before any other. */
export const CANARY_PRODUCTION_PATH = PRODUCTION_CATALOG.files[0].path;

/** Where the canary bytes start in `CANARY_PRODUCTION_PATH`, inside its first sector. */
export const CANARY_PRODUCTION_OFFSET = 1_024;

/** `content` with `bytes` written at `offset`; the length is unchanged and the content is still generated on demand. */
function overlay(content: SyntheticFileContent, offset: number, bytes: Uint8Array): SyntheticFileContent {
  const read = (at: number, length: number) => (content instanceof Uint8Array ? content.slice(at, at + length) : content.read(at, length));
  return {
    byteLength: content.byteLength,
    read: (at, length) => {
      const result = read(at, length);
      const from = Math.max(at, offset);
      const to = Math.min(at + length, offset + bytes.length);
      if (from < to) result.set(bytes.subarray(from - offset, to - offset), from - at);
      return result;
    },
  };
}

/**
 * `productionSizedFiles()` with the canary bytes in the production whitelist's first file. The production job checks
 * every covered file's presence and size, then hashes this file whole and rejects it as `unsupported-version`, so the
 * canary is read before the job fails; nothing is converted.
 */
export function canaryProductionSizedFiles(): Record<string, SyntheticFileContent> {
  const files = productionSizedFiles();
  return { ...files, [CANARY_PRODUCTION_PATH]: overlay(files[CANARY_PRODUCTION_PATH], CANARY_PRODUCTION_OFFSET, canaryBytes()) };
}
