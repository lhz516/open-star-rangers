import { describe, expect, it } from 'vitest';
import { ConversionError, type ConversionErrorCode } from './conversion-error.ts';

const CODES: Record<ConversionErrorCode, true> = { 'invalid-sound': true, 'unsupported-sound-format': true, 'limit-exceeded': true };

describe('conversion errors', () => {
  it('carries a frozen, structured-cloneable diagnostic', () => {
    const limit = { name: 'payloadBytes', limit: 8, observed: 9 } as const;
    const error = new ConversionError('limit-exceeded', 'sounds[0].mapping', 'the converted payloads exceed the audio budget', limit);
    const data = error.toData();
    expect(data).toEqual({ code: 'limit-exceeded', location: 'sounds[0].mapping', reason: 'the converted payloads exceed the audio budget', limit });
    expect(Object.isFrozen(data) && Object.isFrozen(data.limit)).toBe(true);
    expect(data.limit).not.toBe(limit);
    expect(structuredClone(data)).toEqual(data);
    expect([error.name, error.message]).toEqual(['ConversionError', 'sounds[0].mapping: the converted payloads exceed the audio budget']);
    expect(error).toBeInstanceOf(Error);
  });

  it('reports a null observed value beyond the safe integer range and no limit by default', () => {
    expect(new ConversionError('limit-exceeded', 'sounds', 'overflows', { name: 'audioSamples', limit: 1, observed: null }).toData().limit)
      .toEqual({ name: 'audioSamples', limit: 1, observed: null });
    expect(new ConversionError('invalid-sound', 'archive:/MAIN/SR.NOB#1.size', 'short').toData().limit).toBeNull();
  });

  it('uses codes that fit the import protocol token grammar', () => {
    for (const code of Object.keys(CODES)) expect(code).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });
});
