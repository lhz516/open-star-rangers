import { describe, expect, it } from 'vitest';
import { ASSET_ID_LIMITS, readAssetId } from '../asset-id.ts';
import { payloadTransferList } from '../ownership.ts';
import { asciiBytes } from './graphics-format.ts';
import { encodeLayoutPayload, layoutPayloadLength, readLayoutPayload, type LayoutPayload } from './layout-payload.ts';
import { expectContractError, set16, set8, setText } from './graphics.test-support.ts';

const PANEL = readAssetId('image/synthetic-panel');
const GAUGE = readAssetId('image/synthetic-gauge');
const ARROW = readAssetId('image/synthetic-arrow');
const LONGEST = readAssetId(`image/${'a'.repeat(32)}/${'b'.repeat(32)}/${'c'.repeat(32)}/${'d'.repeat(23)}`);

// An asymmetric 7×5 layout: distinct x and y, IDs of different lengths, and elements not in ID order.
const sample = (): Omit<LayoutPayload, 'kind'> => ({
  frame: { width: 7, height: 5 },
  elements: [{ image: PANEL, x: 0, y: 4 }, { image: GAUGE, x: 6, y: 1 }, { image: ARROW, x: 2, y: 0 }],
});

const tableAt = 5;
const idsAt = tableAt + 3 * 5;

describe('layout payload schema 1', () => {
  it('lays out the frame, the element table and the ASCII image IDs in element order', () => {
    expect([...encodeLayoutPayload(sample())]).toEqual([
      7, 0, 5, 0, 3,
      0, 0, 4, 0, PANEL.length,
      6, 0, 1, 0, GAUGE.length,
      2, 0, 0, 0, ARROW.length,
      ...asciiBytes(PANEL), ...asciiBytes(GAUGE), ...asciiBytes(ARROW),
    ]);
    expect(layoutPayloadLength(sample())).toBe(idsAt + PANEL.length + GAUGE.length + ARROW.length);
  });

  it('uses an image ID at the Asset ID length limit for the longest-ID case', () => {
    expect(LONGEST).toHaveLength(ASSET_ID_LIMITS.totalLength);
  });

  it('round-trips into frozen data and encodes the same input to the same exclusive bytes', () => {
    const bytes = encodeLayoutPayload(sample());
    expect(payloadTransferList([bytes])).toEqual([bytes.buffer]);
    const layout = readLayoutPayload(bytes, 1);
    expect(layout).toEqual({ kind: 'layout', ...sample() });
    expect([layout, layout.frame, layout.elements, ...layout.elements].every(Object.isFrozen)).toBe(true);
    expect(encodeLayoutPayload(sample())).toEqual(bytes);
    bytes.fill(0);
    expect(layout).toEqual({ kind: 'layout', ...sample() });
  });

  it.each<[string, Omit<LayoutPayload, 'kind'>]>([
    ['a 1×1 frame with one element at the origin', { frame: { width: 1, height: 1 }, elements: [{ image: PANEL, x: 0, y: 0 }] }],
    ['a 640×480 frame with an element at its last pixel', { frame: { width: 640, height: 480 }, elements: [{ image: PANEL, x: 639, y: 479 }] }],
    ['16 elements', {
      frame: { width: 640, height: 480 },
      elements: Array.from({ length: 16 }, (_, index) => ({ image: readAssetId(`image/synthetic-${index}`), x: index, y: 15 - index })),
    }],
    ['an image ID of the longest length', { frame: { width: 2, height: 2 }, elements: [{ image: LONGEST, x: 1, y: 1 }] }],
  ])('round-trips %s', (_, input) => {
    expect(readLayoutPayload(encodeLayoutPayload(input), 1)).toEqual({ kind: 'layout', ...input });
  });

  it.each<[string, (bytes: Uint8Array) => unknown, string, string]>([
    ['schema 2', bytes => readLayoutPayload(bytes, 2), 'unsupported-payload-schema', 'payload.schemaVersion'],
    ['a truncated header', bytes => readLayoutPayload(bytes.subarray(0, 4), 1), 'invalid-graphics-payload', 'payload'],
    ['frame width 0', bytes => readLayoutPayload(set16(bytes, 0, 0), 1), 'invalid-graphics-payload', 'payload.frame.width'],
    ['frame width 641', bytes => readLayoutPayload(set16(bytes, 0, 641), 1), 'invalid-graphics-payload', 'payload.frame.width'],
    ['frame height 0', bytes => readLayoutPayload(set16(bytes, 2, 0), 1), 'invalid-graphics-payload', 'payload.frame.height'],
    ['frame height 481', bytes => readLayoutPayload(set16(bytes, 2, 481), 1), 'invalid-graphics-payload', 'payload.frame.height'],
    ['0 elements', bytes => readLayoutPayload(set8(bytes, 4, 0), 1), 'invalid-graphics-payload', 'payload.elements'],
    ['17 elements', bytes => readLayoutPayload(set8(bytes, 4, 17), 1), 'invalid-graphics-payload', 'payload.elements'],
    ['a truncated element table', bytes => readLayoutPayload(bytes.subarray(0, idsAt - 1), 1), 'invalid-graphics-payload', 'payload'],
    ['an empty image ID', bytes => readLayoutPayload(set8(bytes, tableAt + 5 + 4, 0), 1), 'invalid-graphics-payload', 'payload.elements[1].image'],
    ['an image ID longer than 128', bytes => readLayoutPayload(set8(bytes, tableAt + 5 + 4, 129), 1), 'invalid-graphics-payload', 'payload.elements[1].image'],
    ['truncated image IDs', bytes => readLayoutPayload(bytes.subarray(0, -1), 1), 'invalid-graphics-payload', 'payload'],
    ['a trailing byte', bytes => readLayoutPayload(Uint8Array.of(...bytes, 0), 1), 'invalid-graphics-payload', 'payload'],
    ['x at the frame width', bytes => readLayoutPayload(set16(bytes, tableAt + 5, 7), 1), 'invalid-graphics-payload', 'payload.elements[1].x'],
    ['y at the frame height', bytes => readLayoutPayload(set16(bytes, tableAt + 2, 5), 1), 'invalid-graphics-payload', 'payload.elements[0].y'],
    ['x beyond a narrowed frame', bytes => readLayoutPayload(set16(bytes, 0, 6), 1), 'invalid-graphics-payload', 'payload.elements[1].x'],
    ['a malformed image ID', bytes => readLayoutPayload(set8(bytes, idsAt + PANEL.length, 0x2f), 1), 'invalid-graphics-payload', 'payload.elements[1].image'],
    ['a palette reference', bytes => readLayoutPayload(setText(bytes, idsAt, 'palette/synthetic-x'.padEnd(PANEL.length, 'x')), 1), 'invalid-graphics-payload', 'payload.elements[0].image'],
  ])('reader rejects %s', (_, read, code, path) => expectContractError(() => read(encodeLayoutPayload(sample())), code, path));

  it('reader rejects two elements drawing the same image at the later element', () => {
    const [first, second] = [readAssetId('image/synthetic-a'), readAssetId('image/synthetic-b')];
    const bytes = encodeLayoutPayload({ frame: { width: 7, height: 5 }, elements: [{ image: first, x: 0, y: 0 }, { image: second, x: 1, y: 1 }] });
    const twoIdsAt = tableAt + 2 * 5;
    expectContractError(() => readLayoutPayload(setText(bytes, twoIdsAt + first.length, first), 1), 'invalid-graphics-payload', 'payload.elements[1].image');
  });

  it.each([
    ['frame width 0', { frame: { width: 0, height: 5 } }, 'layout.frame.width'],
    ['frame width 641', { frame: { width: 641, height: 5 } }, 'layout.frame.width'],
    ['a fractional frame width', { frame: { width: 6.5, height: 5 } }, 'layout.frame.width'],
    ['frame height 0', { frame: { width: 7, height: 0 } }, 'layout.frame.height'],
    ['frame height 481', { frame: { width: 7, height: 481 } }, 'layout.frame.height'],
    ['a missing frame', { frame: null }, 'layout.frame'],
    ['0 elements', { elements: [] }, 'layout.elements'],
    ['17 elements', { elements: Array.from({ length: 17 }, (_, index) => ({ image: `image/synthetic-${index}`, x: 0, y: 0 })) }, 'layout.elements'],
    ['an element that is not an object', { elements: [null] }, 'layout.elements[0]'],
    ['a negative x', { elements: [{ image: PANEL, x: -1, y: 0 }] }, 'layout.elements[0].x'],
    ['x at the frame width', { elements: [{ image: PANEL, x: 7, y: 0 }] }, 'layout.elements[0].x'],
    ['a fractional x', { elements: [{ image: PANEL, x: 0.5, y: 0 }] }, 'layout.elements[0].x'],
    ['y at the frame height', { elements: [{ image: PANEL, x: 0, y: 5 }] }, 'layout.elements[0].y'],
    ['a palette reference', { elements: [{ image: 'palette/synthetic-p', x: 0, y: 0 }] }, 'layout.elements[0].image'],
    ['a malformed image ID', { elements: [{ image: 'Image/Panel', x: 0, y: 0 }] }, 'layout.elements[0].image'],
    ['two elements drawing the same image', { elements: [{ image: PANEL, x: 0, y: 0 }, { image: GAUGE, x: 1, y: 0 }, { image: PANEL, x: 2, y: 0 }] }, 'layout.elements[2].image'],
  ])('encoder rejects %s', (_, overrides, path) => {
    expectContractError(() => encodeLayoutPayload({ ...sample(), ...overrides } as Omit<LayoutPayload, 'kind'>), 'invalid-graphics-payload', path);
  });
});
