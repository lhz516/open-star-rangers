import { describe, expect, it } from 'vitest';
import {
  BAND_TABLE_SIZE, bandOpacity, bandPosition, bandTable, isScreenDoorDrawn, LAST_BAND, SCREEN_DOOR_TABLE_SIZE, screenDoorTable,
  screenDoorThreshold,
} from './shimmer-band.ts';

describe('band position', () => {
  it('counts 255/128 per mission clock unit, chopped', () => {
    expect([0, 1, 2, 64, 125].map((elapsed) => bandPosition(1000 + elapsed, 1000))).toEqual([0, 1, 3, 127, 249]);
  });

  it('ends after 126 units: t = 250 at 125.5 units is never reached on whole units, 251 at 126', () => {
    expect(bandPosition(126, 0)).toBe(251);
    expect(bandPosition(126, 0) > LAST_BAND).toBe(true);
    expect(bandPosition(125, 0) > LAST_BAND).toBe(false);
  });

  it('takes the sample difference as u32 and gives the integer indefinite past i32', () => {
    expect(bandPosition(2 ** 32 + 5, 2 ** 32)).toBe(9);
    expect(bandPosition(0, 1)).toBe(-(2 ** 31));
    const first = Math.ceil((2 ** 31 * 128) / 255);
    expect(bandPosition(first - 1, 0)).toBe(Math.trunc(((first - 1) * 255) / 128));
    expect(bandPosition(first - 1, 0)).toBeLessThan(2 ** 31);
    expect(bandPosition(first, 0)).toBe(-(2 ** 31));
  });
});

describe('band opacity', () => {
  it('is opaque for t + 1 < v < t + 40, half for t − 3 < v < t + 43, otherwise clear, at every boundary', () => {
    for (const t of [0, 15, 100, 225, 250]) {
      const expected = (v: number) => (t + 1 < v && v < t + 40 ? 0xff : t - 3 < v && v < t + 43 ? 0x7f : 0);
      for (const v of [t - 3, t - 2, t + 1, t + 2, t + 39, t + 40, t + 42, t + 43]) {
        if (v >= 0 && v <= 255) expect([t, v, bandOpacity(v, t)]).toEqual([t, v, expected(v)]);
      }
    }
    expect([97, 98, 101, 102, 139, 140, 142, 143].map((v) => bandOpacity(v, 100))).toEqual([0, 0x7f, 0x7f, 0xff, 0xff, 0x7f, 0x7f, 0]);
  });

  it('reads thresholds as stored values, not colours, and leaves nothing for the integer indefinite', () => {
    const thresholds = Uint8Array.of(0, 1, 2, 39, 40, 42, 43, 255);
    expect([...thresholds].map((v) => bandOpacity(v, 0))).toEqual([0x7f, 0x7f, 0xff, 0xff, 0x7f, 0x7f, 0, 0]);
    expect([...thresholds].map((v) => bandOpacity(v, -(2 ** 31)))).toEqual(new Array(8).fill(0));
  });

  it('tabulates every drawn band position by threshold', () => {
    const table = bandTable();
    expect(table.length).toBe(BAND_TABLE_SIZE.width * BAND_TABLE_SIZE.height);
    expect(BAND_TABLE_SIZE).toEqual({ width: 256, height: 251 });
    for (const t of [0, 1, 120, 250]) for (let v = 0; v < 256; v++) expect(table[t * 256 + v]).toBe(bandOpacity(v, t));
  });
});

describe('screen door', () => {
  it('raises the index matrix 0 entry to 1 and scales the rest by 16', () => {
    const rows = [0, 1, 2, 3].map((y) => [0, 1, 2, 3].map((x) => screenDoorThreshold(x, y)));
    expect(rows).toEqual([[1, 192, 48, 240], [128, 64, 176, 112], [32, 224, 16, 208], [160, 96, 144, 80]]);
  });

  it('never draws 0, always draws 0xFF and draws 0x7F where x + y is even, repeating every 4 pixels', () => {
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        expect(isScreenDoorDrawn(0, x, y)).toBe(false);
        expect(isScreenDoorDrawn(0xff, x, y)).toBe(true);
        expect(isScreenDoorDrawn(0x7f, x, y)).toBe((x + y) % 2 === 0);
      }
    }
  });

  it('is monotone in the opacity and tabulated by (y & 3) · 4 + (x & 3)', () => {
    const table = screenDoorTable();
    expect(table.length).toBe(SCREEN_DOOR_TABLE_SIZE.width * SCREEN_DOOR_TABLE_SIZE.height);
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const row = table.subarray((y * 4 + x) * 256, (y * 4 + x + 1) * 256);
        for (let a = 0; a < 256; a++) expect(row[a]).toBe(isScreenDoorDrawn(a, x, y) ? 0xff : 0);
        expect(row.findIndex((entry) => entry !== 0)).toBe(screenDoorThreshold(x, y));
      }
    }
  });
});
