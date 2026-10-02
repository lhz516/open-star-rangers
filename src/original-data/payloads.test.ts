import { describe, expect, it } from 'vitest';
import {
  decodeSpriteRle,
  parseBitmapFont,
  parseCockpitFonts,
  parseIdList,
  parseImage,
  parseMesh,
  parseMfdImages,
  parseModel,
  parseVgaPalette,
  PayloadError,
} from './payloads.ts';
import { ByteWriter, imageRecord } from './synthetic.ts';

describe('parseVgaPalette', () => {
  it('expands 6-bit components by bit replication', () => {
    const block = new Uint8Array(768);
    block.set([0, 32, 63], 0);
    expect(Array.from(parseVgaPalette(block).subarray(0, 3))).toEqual([0, 130, 255]);
  });
});

describe('parseImage', () => {
  it('reads a raw image and converts the embedded BGR palette to RGB', () => {
    const w = new ByteWriter();
    imageRecord(w, { encoding: 0, width: 2, height: 2, paletteOffset: 36, paletteCount: 2, pixelOffset: 42, size: 4 });
    w.u8(10, 20, 30, 40, 50, 60); // two BGR colours
    w.u8(0, 1, 1, 0);
    const image = parseImage(w.toBytes());
    expect([image.width, image.height, image.encoding]).toEqual([2, 2, 0]);
    expect(Array.from(image.pixels)).toEqual([0, 1, 1, 0]);
    expect(image.opaque).toBeNull();
    expect(Array.from(image.palette ?? [])).toEqual([30, 20, 10, 60, 50, 40]);
  });

  it('reads a sprite-RLE image at an offset inside a larger block', () => {
    const w = new ByteWriter().u32(0xdeadbeef);
    imageRecord(w, { encoding: 2, width: 4, height: 2, paletteOffset: 0, paletteCount: 0, pixelOffset: 40, size: 10 });
    w.u16(4); // row 0: fully transparent
    w.u16(1, 2).u8(7, 8).u16(1); // row 1: skip 1, two pixels, skip 1
    const image = parseImage(w.toBytes(), 4);
    expect(Array.from(image.pixels)).toEqual([0, 0, 0, 0, 0, 7, 8, 0]);
    expect(Array.from(image.opaque ?? [])).toEqual([0, 0, 0, 0, 0, 1, 1, 0]);
    expect(image.palette).toBeNull();
  });

  it('rejects unsupported encodings and size mismatches', () => {
    const anim = imageRecord(new ByteWriter(), { encoding: 1, width: 1, height: 1, paletteOffset: 0, paletteCount: 0, pixelOffset: 36, size: 1 }).u8(0);
    expect(() => parseImage(anim.toBytes())).toThrow(/encoding 1/);
    const short = imageRecord(new ByteWriter(), { encoding: 0, width: 2, height: 2, paletteOffset: 0, paletteCount: 0, pixelOffset: 36, size: 3 }).u8(0, 0, 0);
    expect(() => parseImage(short.toBytes())).toThrow(PayloadError);
  });
});

describe('decodeSpriteRle', () => {
  it('rejects a row that overflows the width', () => {
    expect(() => decodeSpriteRle(new ByteWriter().u16(5).toBytes(), 4, 1)).toThrow(/overflows/);
  });

  it('rejects trailing bytes', () => {
    expect(() => decodeSpriteRle(new ByteWriter().u16(4, 0).toBytes(), 4, 1)).toThrow(/trailing/);
  });
});

function triangleMesh(cornerCount = 3): Uint8Array {
  const body = new ByteWriter()
    .u32(3) // vertices
    .f32(0, 0, 0, 1, 0, 0, 0, 1, 0)
    .f32(0, 0, 1, 0, 0, 1) // UVs
    .u32(3) // slot count
    .f32(0, 0, 1, 0, 0, 1, 0, 0, 1) // normals
    .u32(1) // faces
    .u32(cornerCount, 0, 0, 1, 1, 2, 2)
    .u32(0); // trailer
  const bytes = body.toBytes();
  return new ByteWriter().u32(12, bytes.length, 0).raw(bytes).toBytes();
}

describe('parseMesh', () => {
  it('reads positions, UVs, normals, and triangle indices', () => {
    const mesh = parseMesh(triangleMesh());
    expect(Array.from(mesh.positions)).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    expect(Array.from(mesh.uvs)).toEqual([0, 0, 1, 0, 0, 1]);
    expect(Array.from(mesh.indices)).toEqual([0, 1, 2]);
    expect(Array.from(mesh.cornerSlots)).toEqual([0, 1, 2]);
    expect(mesh.slotCount).toBe(3);
  });

  it('rejects faces that are not triangles', () => {
    expect(() => parseMesh(triangleMesh(4))).toThrow(PayloadError);
  });
});

describe('parseModel', () => {
  function model(extraBytes = 0): Uint8Array {
    const w = new ByteWriter().u32(44, 1, 0, 0, 0, 0).u32(11, 0, 0, 0, 12);
    w.u32(3, 160, 160, 160, 0, 10001, 10003);
    for (let i = 0; i < extraBytes; i++) w.u8(0);
    return w.toBytes();
  }

  it('reads part lists and sound IDs', () => {
    const parsed = parseModel(model());
    expect(parsed.partLists[0]).toEqual([{ flags: 3, color: [160, 160, 160], meshId: 10001, textureId: 10003 }]);
    expect(parsed.partLists[1]).toEqual([]);
    expect(parsed.soundIds).toEqual([11, 0, 0, 0, 12]);
  });

  it('rejects a size that does not match the part lists', () => {
    expect(() => parseModel(model(4))).toThrow(/size/);
  });
});

describe('parseBitmapFont', () => {
  it('reads an 8x8 font with 256 glyphs', () => {
    const table = new Uint8Array(4 + 256 * 8);
    table.set([0, 1, 8, 8]);
    table[4 + 65 * 8] = 0x3c;
    const font = parseBitmapFont(table);
    expect([font.width, font.height]).toEqual([8, 8]);
    expect(font.glyphs[65 * 8]).toBe(0x3c);
  });

  describe('parseCockpitFonts', () => {
    it('reads the font directory in order', () => {
      const first = new Uint8Array(4 + 256 * 8);
      first.set([0, 1, 8, 8]);
      const second = new Uint8Array(4 + 256 * 6);
      second.set([0, 1, 4, 6]);
      const block = new ByteWriter()
        .u32(8, 2, 24, first.length, 24 + first.length, second.length)
        .raw(first)
        .raw(second)
        .toBytes();

      expect(parseCockpitFonts(block).map((font) => [font.width, font.height])).toEqual([[8, 8], [4, 6]]);
    });

    it('reads an empty font directory', () => {
      expect(parseCockpitFonts(new ByteWriter().u32(8, 0).toBytes())).toEqual([]);
    });
  });

  it('rejects a table whose size does not match the glyph height', () => {
    const table = new Uint8Array(4 + 256 * 6);
    table.set([0, 1, 8, 8]);
    expect(() => parseBitmapFont(table)).toThrow(PayloadError);
  });
});

describe('parseIdList and parseMfdImages', () => {
  it('reads an ID list', () => {
    expect(parseIdList(new ByteWriter().u32(8, 3, 10743, 10743, 0).toBytes())).toEqual([10743, 10743, 0]);
  });

  it('reads two lists of image records', () => {
    const w = new ByteWriter().u32(16, 1, 52, 1);
    imageRecord(w, { encoding: 0, width: 1, height: 1, paletteOffset: 0, paletteCount: 0, pixelOffset: 88, size: 1 });
    imageRecord(w, { encoding: 0, width: 1, height: 1, paletteOffset: 0, paletteCount: 0, pixelOffset: 89, size: 1 });
    w.u8(5, 6);
    const [backgrounds, overlays] = parseMfdImages(w.toBytes());
    expect(backgrounds.map((i) => i.pixels[0])).toEqual([5]);
    expect(overlays.map((i) => i.pixels[0])).toEqual([6]);
  });
});
