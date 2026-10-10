import { describe, expect, it } from 'vitest';
import type { Recording } from '../../core/replay/recording.ts';
import { recordingFile, recordingFileName } from './recording-export.ts';

// The recording file (docs/plan/p3/04/spec.md: 开发诊断, 录制导出): Core's Recording as compact JSON, named only by the
// validated setupHash, uint32 seed and finalTick.

function recording({ setupHash = '0123456789abcdef', seed = 4_294_967_295, finalTick = 96 } = {}): Recording {
  return {
    record: { setupHash, run: { seed }, mission: 'MISSION Name', producer: 'osr-test' },
    result: { finalTick, events: [], checkpoints: [] },
  } as unknown as Recording;
}

describe('recording file', () => {
  it('names the file by setupHash, seed and finalTick only', () => {
    expect(recordingFileName(recording())).toBe('osr-recording-0123456789abcdef-4294967295-96.json');
    expect(recordingFileName(recording({ seed: 0, finalTick: 0 }))).toBe('osr-recording-0123456789abcdef-0-0.json');
  });

  it.each([
    ['setupHash', { setupHash: '0123456789ABCDEF' }],
    ['setupHash', { setupHash: '../../evil' }],
    ['seed', { seed: 2 ** 32 }],
    ['seed', { seed: -1 }],
    ['seed', { seed: 1.5 }],
    ['finalTick', { finalTick: -1 }],
    ['finalTick', { finalTick: Number.MAX_SAFE_INTEGER + 1 }],
  ])('refuses a recording whose %s breaks its contract', (part, parts) => {
    expect(() => recordingFileName(recording(parts))).toThrow(new RegExp(part));
  });

  it('serializes the recording unchanged as compact JSON', () => {
    const source = recording();
    const file = recordingFile(source);
    expect(file).toEqual({ name: 'osr-recording-0123456789abcdef-4294967295-96.json', text: JSON.stringify(source), finalTick: 96 });
    expect(file.text).not.toMatch(/\n| {2}/);
    expect(JSON.parse(file.text)).toEqual(source);
    expect(Object.isFrozen(file)).toBe(true);
  });
});
