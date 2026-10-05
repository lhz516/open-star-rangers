import { describe, expect, it } from 'vitest';
import { ByteWriter, directoryRecord, ISO_DIRECTORY_FLAG } from '../synthetic.ts';
import { bothEndian16, bothEndian32, extentFits, readDirectoryRecord, unsupportedFeature, type DirectoryRecord } from './iso9660-record.ts';

const record = (fields: Partial<Parameters<typeof directoryRecord>[0]> = {}): Uint8Array =>
  directoryRecord({ extent: 20, dataLength: 4_096, name: 'FILE.DAT;1', ...fields });
const read = (bytes: Uint8Array, end = bytes.length): DirectoryRecord | string => readDirectoryRecord(bytes, 0, end);
const edited = (bytes: Uint8Array, edit: (bytes: Uint8Array) => void): Uint8Array => {
  const copy = bytes.slice();
  edit(copy);
  return copy;
};

describe('both-byte-order fields', () => {
  it('reads matching copies, including the largest 32-bit value, and rejects differing ones', () => {
    expect(bothEndian16(new ByteWriter().both16(0xbeef).toBytes(), 0)).toBe(0xbeef);
    expect(bothEndian32(new ByteWriter().both32(0xffff_ffff).toBytes(), 0)).toBe(0xffff_ffff);
    expect(bothEndian16(new ByteWriter().u16(1).u16be(2).toBytes(), 0)).toBeUndefined();
    expect(bothEndian32(new ByteWriter().u32(1).u32be(0x0100_0000).toBytes(), 0)).toBeUndefined();
  });
});

describe('directory records', () => {
  it('reads every field and a view of the identifier, without interpreting System Use', () => {
    const bytes = record({ flags: ISO_DIRECTORY_FLAG | 0x01, systemUse: Uint8Array.of(0x52, 0x52, 0x05, 0x01) });
    const parsed = read(bytes) as DirectoryRecord;
    expect(parsed).toMatchObject({
      recordLength: bytes.length, extendedAttributeLength: 0, extent: 20, dataLength: 4_096, flags: 0x03, fileUnitSize: 0, interleaveGap: 0,
      volumeSequenceNumber: 1,
    });
    expect(String.fromCharCode(...parsed.identifier)).toBe('FILE.DAT;1');
    expect(parsed.identifier.buffer).toBe(bytes.buffer);
  });

  it.each([
    ['a record under 34 bytes', (bytes: Uint8Array) => { bytes[0] = 32; }, 'length'],
    ['an odd record length', (bytes: Uint8Array) => { bytes[0] += 1; }, 'length'],
    ['an extent copy mismatch', (bytes: Uint8Array) => { bytes[2] ^= 1; }, 'extent'],
    ['a data length copy mismatch', (bytes: Uint8Array) => { bytes[17] ^= 1; }, 'dataLength'],
    ['a volume sequence copy mismatch', (bytes: Uint8Array) => { bytes[31] ^= 1; }, 'volumeSequenceNumber'],
    ['an empty identifier', (bytes: Uint8Array) => { bytes[32] = 0; }, 'identifier'],
    ['an identifier past the record', (bytes: Uint8Array) => { bytes[32] = bytes[0] - 32; }, 'identifier'],
  ])('reports %s', (_case, edit, problem) => {
    const bytes = new Uint8Array(64);
    bytes.set(edited(record({ systemUse: new Uint8Array(4) }), edit));
    expect(read(bytes)).toBe(problem);
  });

  it('rejects a record that runs past the given end or the buffer', () => {
    const bytes = record();
    expect(read(bytes, bytes.length - 1)).toBe('length');
    expect(readDirectoryRecord(bytes.subarray(0, 10), 0, 34)).toBe('length');
    expect(readDirectoryRecord(bytes, bytes.length, bytes.length)).toBe('length');
  });

  it('requires the padding byte after an even-length identifier to be zero', () => {
    const bytes = record({ name: 'AB' });
    expect(typeof read(bytes)).toBe('object');
    expect(read(edited(bytes, copy => { copy[35] = 1; }))).toBe('padding');
  });

  it.each([
    ['nothing unsupported', {}, undefined],
    ['a hidden or associated record', { flags: 0x01 | 0x04 }, undefined],
    ['an extended attribute record', { extendedAttributeLength: 1 }, 'extendedAttributeLength'],
    ['record format', { flags: 0x08 }, 'flags'],
    ['protection', { flags: 0x10 }, 'flags'],
    ['a reserved flag', { flags: 0x40 }, 'flags'],
    ['multi-extent', { flags: 0x80 }, 'flags'],
    ['a file unit size', { fileUnitSize: 1 }, 'interleave'],
    ['an interleave gap', { interleaveGap: 1 }, 'interleave'],
    ['another volume of the set', { volumeSequenceNumber: 2 }, 'volumeSequenceNumber'],
  ])('finds %s among the features a target may not use', (_case, fields, feature) => {
    expect(unsupportedFeature(read(record(fields)) as DirectoryRecord)).toBe(feature);
  });
});

describe('extent bounds', () => {
  it('fits an extent ending exactly at the volume end and rejects one block more, safely for huge values', () => {
    expect(extentFits(18, 4_096, 20)).toBe(true);
    expect(extentFits(18, 4_097, 20)).toBe(false);
    expect(extentFits(20, 0, 20)).toBe(true);
    expect(extentFits(21, 0, 20)).toBe(false);
    expect(extentFits(0xffff_ffff, 0xffff_ffff, 20)).toBe(false);
  });
});
