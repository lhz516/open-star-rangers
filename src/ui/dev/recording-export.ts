/**
 * The recording file of the development diagnostics (docs/plan/p3/04/spec.md: 开发诊断, 录制导出): Core's `Recording`
 * as compact JSON, unchanged, under a name built only from the record's validated setupHash, its uint32 seed and the
 * result's finalTick. Nothing the content names reaches the file name.
 */
import { readHash, type Recording } from '../../core/replay/recording.ts';

/** A recording ready to save: a detached text that later ticks of the run cannot change. */
export interface RecordingFile {
  readonly name: string;
  readonly text: string;
  readonly finalTick: number;
}

/** `osr-recording-<setupHash>-<seed>-<finalTick>.json`; throws a RangeError when a part breaks its contract. */
export function recordingFileName(recording: Recording): string {
  const { record: { setupHash, run: { seed } }, result: { finalTick } } = recording;
  try {
    readHash(setupHash, 'record.setupHash');
  } catch (cause) {
    throw new RangeError('The recording setupHash is not 16 lowercase hex digits', { cause });
  }
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff) throw new RangeError('The recording seed is not a uint32');
  if (!Number.isSafeInteger(finalTick) || finalTick < 0) throw new RangeError('The recording finalTick is not a nonnegative safe integer');
  return `osr-recording-${setupHash}-${seed}-${finalTick}.json`;
}

/** The file of `recording`, an export the Session returned; throws as recordingFileName does. */
export function recordingFile(recording: Recording): RecordingFile {
  const name = recordingFileName(recording);
  return Object.freeze({ name, text: JSON.stringify(recording), finalTick: recording.result.finalTick });
}
