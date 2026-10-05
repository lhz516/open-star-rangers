import { describe, expect, it } from 'vitest';
import { ByteWriter, directoryRecord, ISO_DIRECTORY_FLAG, primaryVolumeDescriptor, volumeDescriptor } from '../synthetic.ts';
import { openDiscImage } from './disc-image.ts';
import { failure, failureOf, requestedLbas, rootRecord, syntheticDisc, volumeSectors } from './disc.test-support.ts';

const SECTORS = 20;
const PVD = 'image:lba 16';
const ROOT = 156;
const SUPPLEMENTARY = 2;

/** The base volume after `edit` changes the primary volume descriptor's bytes in place. */
function editedPrimary(edit: (descriptor: Uint8Array) => void, sectorCount = SECTORS): Map<number, Uint8Array> {
  const sectors = volumeSectors(sectorCount);
  edit(sectors.get(16)!);
  return sectors;
}

const open = (sectorCount: number, sectors: ReadonlyMap<number, Uint8Array>, edit?: (lba: number, raw: Uint8Array) => void) => {
  const disc = syntheticDisc(sectorCount, sectors, edit);
  return { ...disc, result: () => openDiscImage(disc.files) };
};

/** A descriptor sequence from LBA 16, in order. */
const sequence = (...descriptors: Uint8Array[]): Map<number, Uint8Array> => new Map(descriptors.map((descriptor, index) => [16 + index, descriptor]));
const terminator = (): Uint8Array => volumeDescriptor(255);

describe('volume descriptors', () => {
  it('opens the smallest volume and reads only the .ccd and the descriptor sectors', async () => {
    const { descriptor, image, result } = open(SECTORS, volumeSectors(SECTORS));
    const disc = await result();
    expect(disc.volume).toEqual({ sectorCount: SECTORS, volumeSectors: SECTORS });
    expect(Object.isFrozen(disc.volume) && structuredClone(disc.volume)).toEqual(disc.volume);
    expect(requestedLbas(image)).toEqual([16, 17]);
    expect(disc.usage().sourceReadBytes).toBe(descriptor.byteLength + 2 * 2_352);
  });

  it('skips boot, supplementary and partition descriptors before and after the primary one', async () => {
    const sectors = sequence(volumeDescriptor(0), primaryVolumeDescriptor(24, rootRecord(22)), volumeDescriptor(SUPPLEMENTARY), volumeDescriptor(3), terminator());
    const { image, result } = open(24, sectors);
    expect((await result()).volume).toEqual({ sectorCount: 24, volumeSectors: 24 });
    expect(requestedLbas(image)).toEqual([16, 17, 18, 19, 20]);
  });

  it('accepts a primary descriptor after a supplementary one', async () => {
    const sectors = sequence(volumeDescriptor(SUPPLEMENTARY), primaryVolumeDescriptor(SECTORS, rootRecord(19, 2_048)), terminator());
    expect((await open(SECTORS, sectors).result()).volume.volumeSectors).toBe(SECTORS);
  });

  it('accepts a terminator as the sixteenth descriptor, at LBA 31', async () => {
    const descriptors = [primaryVolumeDescriptor(40, rootRecord(34)), ...Array.from({ length: 14 }, () => volumeDescriptor(SUPPLEMENTARY)), terminator()];
    const { image, result } = open(40, sequence(...descriptors));
    expect((await result()).volume).toEqual({ sectorCount: 40, volumeSectors: 40 });
    expect(requestedLbas(image)).toEqual(Array.from({ length: 16 }, (_, index) => 16 + index));
  });

  it('rejects a sequence without a terminator in 16 descriptors and reads no further', async () => {
    const descriptors = [primaryVolumeDescriptor(40, rootRecord(34)), ...Array.from({ length: 15 }, () => volumeDescriptor(SUPPLEMENTARY))];
    const { image, result } = open(40, sequence(...descriptors));
    expect(await failure(result)).toEqual(failureOf('invalid-volume', 'image:lba 31'));
    expect(requestedLbas(image)).toEqual(Array.from({ length: 16 }, (_, index) => 16 + index));
  });

  it('rejects a sequence that reaches the end of the image without a terminator', async () => {
    const { image, result } = open(18, sequence(primaryVolumeDescriptor(18, rootRecord(17)), volumeDescriptor(SUPPLEMENTARY)));
    expect(await failure(result)).toEqual(failureOf('invalid-volume', 'image:lba 17'));
    expect(requestedLbas(image)).toEqual([16, 17]);
  });

  it.each([
    ['no primary descriptor', sequence(volumeDescriptor(SUPPLEMENTARY), terminator()), 'image:lba 17'],
    ['a repeated primary descriptor', sequence(primaryVolumeDescriptor(SECTORS, rootRecord()), primaryVolumeDescriptor(SECTORS, rootRecord()), terminator()), 'image:lba 17/type'],
    ['an unknown descriptor type', sequence(volumeDescriptor(4), terminator()), 'image:lba 16/type'],
    ['a wrong standard identifier', sequence(Object.assign(volumeDescriptor(255), { 5: 0x32 })), 'image:lba 16/identifier'],
    ['a wrong descriptor version', sequence(Object.assign(volumeDescriptor(255), { 6: 2 })), 'image:lba 16/version'],
  ])('rejects %s', async (_case, sectors, location) => {
    expect(await failure(open(SECTORS, sectors).result)).toEqual(failureOf('invalid-volume', location));
  });

  it('rejects a bad raw sector header among the descriptors and ignores bad sectors it never reads', async () => {
    const corrupt = (target: number) => (lba: number, raw: Uint8Array): void => { if (lba === target) raw[0] = 1; };
    expect(await failure(open(SECTORS, volumeSectors(SECTORS), corrupt(17)).result)).toEqual(failureOf('invalid-sector', 'image:lba 17'));
    expect((await open(SECTORS, volumeSectors(SECTORS), corrupt(19)).result()).volume.sectorCount).toBe(SECTORS);
  });
});

describe('primary volume descriptor', () => {
  const both16 = (value: number): Uint8Array => new ByteWriter().both16(value).toBytes();
  const both32 = (value: number): Uint8Array => new ByteWriter().both32(value).toBytes();
  it.each([
    ['a volume space beyond the image', 80, both32(SECTORS + 1), 'volumeSpaceSize'],
    ['a volume space inside the descriptor sequence', 80, both32(17), 'volumeSpaceSize'],
    ['a volume set of two discs', 120, both16(2), 'volumeSetSize'],
    ['a second volume in the set', 124, both16(2), 'volumeSequenceNumber'],
    ['a logical block other than 2,048 bytes', 128, both16(1_024), 'logicalBlockSize'],
    ['another file structure version', 881, [2], 'fileStructureVersion'],
  ])('rejects %s', async (_case, offset, bytes, field) => {
    const sectors = editedPrimary(descriptor => descriptor.set(bytes, offset));
    expect(await failure(open(SECTORS, sectors).result)).toEqual(failureOf('invalid-volume', `${PVD}/${field}`));
  });

  it.each([
    ['volumeSpaceSize', 80, 4],
    ['volumeSetSize', 120, 2],
    ['volumeSequenceNumber', 124, 2],
    ['logicalBlockSize', 128, 2],
    ['pathTableSize', 132, 4],
    ['rootDirectory.extent', ROOT + 2, 4],
    ['rootDirectory.dataLength', ROOT + 10, 4],
    ['rootDirectory.volumeSequenceNumber', ROOT + 28, 2],
  ])('rejects differing byte-order copies of %s, whichever copy differs', async (field, offset, width) => {
    for (const copy of [offset, offset + width]) {
      const sectors = editedPrimary(descriptor => { descriptor[copy] ^= 0x01; });
      expect(await failure(open(SECTORS, sectors).result)).toEqual(failureOf('invalid-volume', `${PVD}/${field}`));
    }
  });

  it('reports the primary descriptor fields before its root record', async () => {
    const sectors = editedPrimary(descriptor => {
      descriptor[881] = 2;
      descriptor[ROOT] = 32;
    });
    expect(await failure(open(SECTORS, sectors).result)).toEqual(failureOf('invalid-volume', `${PVD}/fileStructureVersion`));
  });

  it('checks the path table size without reading the path table', async () => {
    const sectors = editedPrimary(descriptor => descriptor.set(new ByteWriter().both32(4_096).u32(19).u32(0).u32be(19).u32be(0).toBytes(), 132));
    const { image, result } = open(SECTORS, sectors);
    await result();
    expect(requestedLbas(image)).toEqual([16, 17]);
  });
});

describe('root directory record', () => {
  const root = (fields: Partial<Parameters<typeof directoryRecord>[0]>): Map<number, Uint8Array> =>
    editedPrimary(descriptor => descriptor.set(directoryRecord({ extent: 18, dataLength: 2_048, flags: ISO_DIRECTORY_FLAG, name: Uint8Array.of(0), ...fields }), ROOT));
  it.each([
    ['a record length beyond 34 bytes', editedPrimary(descriptor => { descriptor[ROOT] = 36; }), 'length'],
    ['a record length under 34 bytes', editedPrimary(descriptor => { descriptor[ROOT] = 32; }), 'length'],
    ['an odd record length', editedPrimary(descriptor => { descriptor[ROOT] = 33; }), 'length'],
    ['a two-byte identifier', editedPrimary(descriptor => { descriptor[ROOT + 32] = 2; }), 'identifier'],
    ['an identifier other than 0', root({ name: Uint8Array.of(1) }), 'identifier'],
    ['a file instead of a directory', root({ flags: 0 }), 'flags'],
    ['an associated record', root({ flags: ISO_DIRECTORY_FLAG | 0x04 }), 'flags'],
    ['a multi-extent directory', root({ flags: ISO_DIRECTORY_FLAG | 0x80 }), 'flags'],
    ['a reserved flag', root({ flags: ISO_DIRECTORY_FLAG | 0x20 }), 'flags'],
    ['an extended attribute record', root({ extendedAttributeLength: 1 }), 'extendedAttributeLength'],
    ['an interleaved directory', root({ fileUnitSize: 1, interleaveGap: 1 }), 'interleave'],
    ['another volume of the set', root({ volumeSequenceNumber: 2 }), 'volumeSequenceNumber'],
    ['an empty directory', root({ dataLength: 0 }), 'dataLength'],
    ['a length that is not whole blocks', root({ dataLength: 2_050 }), 'dataLength'],
    ['an extent past the volume', root({ extent: 19, dataLength: 4_096 }), 'extent'],
    ['an extent beyond the volume', root({ extent: 0xffff_ffff }), 'extent'],
  ])('rejects %s as invalid-volume', async (_case, sectors, field) => {
    expect(await failure(open(SECTORS, sectors).result)).toEqual(failureOf('invalid-volume', `${PVD}/rootDirectory.${field}`));
  });

  it('accepts a hidden root directory', async () => {
    expect((await open(SECTORS, root({ flags: ISO_DIRECTORY_FLAG | 0x01 })).result()).volume.sectorCount).toBe(SECTORS);
  });

  it('accepts a 65,536-byte root directory and rejects 67,584 bytes as over the limit', async () => {
    const sectorCount = 60;
    const withRoot = (dataLength: number) => editedPrimary(descriptor => descriptor.set(rootRecord(18, dataLength), ROOT), sectorCount);
    expect((await open(sectorCount, withRoot(65_536)).result()).volume.volumeSectors).toBe(sectorCount);
    expect(await failure(open(sectorCount, withRoot(67_584)).result))
      .toEqual(failureOf('limit-exceeded', `${PVD}/rootDirectory`, { name: 'directoryBytes', limit: 65_536, observed: 67_584 }));
  });
});
