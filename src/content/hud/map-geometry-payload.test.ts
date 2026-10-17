import { describe, expect, it } from 'vitest';
import { asciiBytes as ascii, asciiText as text } from '../graphics/graphics-format.ts';
import { expectContractError } from '../graphics/graphics.test-support.ts';
import { deepFrozen } from '../logic/logic-content.test-support.ts';
import { payloadTransferList } from '../ownership.ts';
import { syntheticGroup } from '../synthetic-content.test-support.ts';
import { GRAPHICS_LIMITS } from '../graphics/graphics-format.ts';
import {
  MAP_GEOMETRY_FORMAT, MAP_GEOMETRY_LIMITS, decodeMapGeometryPayload, encodeMapGeometryPayload, readMapGeometry, type MapGeometry,
} from './map-geometry-payload.ts';

// Code-generated synthetic geometry; the values are not the original records'.
const CODE = 'invalid-flight-data-payload';

type Descriptor = Parameters<typeof decodeMapGeometryPayload>[1];
type MutableDescriptor = { id: string; role: string; kind: string; dependencies: { id: string; kind: string }[]; payloadIdentity: { schemaVersion: number } };

const decode = (bytes: Uint8Array, descriptor: unknown) => decodeMapGeometryPayload(bytes, descriptor as Descriptor);

/** A synthetic geometry: a 301-pixel main map at (13, 37) with a 190-pixel strip to its right. */
const geometry = (overrides: Record<string, unknown> = {}, rectangle: Record<string, unknown> = {}) => ({
  rectangle: { x0: 13, y0: 37, x1: 503, y1: 337, ...rectangle },
  redrawInterval: 3,
  informationLineHeight: 7,
  ...overrides,
});

/** The canonical bytes and a matching mutable descriptor for synthetic geometry. */
function syntheticAsset(content: unknown = geometry()) {
  const bytes = encodeMapGeometryPayload(content as MapGeometry);
  const [descriptor] = syntheticGroup('cockpit-hud-map', [{ id: 'data/hud/map-geometry', role: 'map-geometry', bytes }]).manifest.assets;
  return { bytes, descriptor };
}

function edited(edit: (json: string) => string) {
  const { bytes, descriptor } = syntheticAsset();
  const changed = edit(text(bytes));
  expect(changed).not.toBe(text(bytes));
  return { bytes: ascii(changed), descriptor };
}

describe('map geometry reader', () => {
  it('keeps the geometry as a deeply frozen copy isolated from its input', () => {
    const input = geometry();
    const read = readMapGeometry(input);
    expect(read).toEqual(input);
    expect(deepFrozen(read)).toBe(true);
    input.rectangle.x0 = 0;
    expect(read.rectangle.x0).toBe(13);
  });

  it.each([
    ['the screen corners with a 2-pixel side and 1-pixel strip', { x0: 0, y0: 0, x1: 3, y1: 1 }],
    ['the far screen edges', { x0: 0, y0: 0, x1: 639, y1: 479 }],
    ['a 1-pixel strip at the right edge', { x0: 158, y0: 0, x1: 639, y1: 479 }],
  ])('accepts %s', (_name, rectangle) => {
    expect(readMapGeometry(geometry({}, rectangle)).rectangle).toEqual(rectangle);
  });

  it('bounds the line height by the tallest font the font reader accepts', () => {
    expect(MAP_GEOMETRY_FORMAT.lineHeight).toBe(GRAPHICS_LIMITS.fontHeight);
  });

  it('accepts the u32 and line height bounds', () => {
    expect(readMapGeometry(geometry({ redrawInterval: 0, informationLineHeight: 1 }))).toMatchObject({ redrawInterval: 0, informationLineHeight: 1 });
    expect(readMapGeometry(geometry({ redrawInterval: 0xffff_ffff, informationLineHeight: 8 }))).toMatchObject({ redrawInterval: 0xffff_ffff, informationLineHeight: 8 });
  });

  it.each([
    ['a negative x0', geometry({}, { x0: -1 }), 'mapGeometry.rectangle.x0'],
    ['an x1 past the screen', geometry({}, { x1: 640 }), 'mapGeometry.rectangle.x1'],
    ['a y1 past the screen', geometry({}, { y1: 480 }), 'mapGeometry.rectangle.y1'],
    ['a y0 past the screen', geometry({}, { y0: 480, y1: 480 }), 'mapGeometry.rectangle.y0'],
    ['x1 left of x0', geometry({}, { x0: 20, x1: 19 }), 'mapGeometry.rectangle.x1'],
    ['y1 above y0', geometry({}, { y0: 40, y1: 39 }), 'mapGeometry.rectangle.y1'],
    ['a 1-pixel main map side', geometry({}, { y0: 40, y1: 40 }), 'mapGeometry.rectangle.y1'],
    ['no strip right of the main map', geometry({}, { x0: 0, y0: 0, x1: 2, y1: 1 }), 'mapGeometry.rectangle.x1'],
    ['a main map past x1', geometry({}, { x0: 0, y0: 0, x1: 100, y1: 200 }), 'mapGeometry.rectangle.x1'],
    ['a fractional coordinate', geometry({}, { y0: 1.5 }), 'mapGeometry.rectangle.y0'],
    ['a string coordinate', geometry({}, { x0: '13' }), 'mapGeometry.rectangle.x0'],
    ['a negative redraw interval', geometry({ redrawInterval: -1 }), 'mapGeometry.redrawInterval'],
    ['a redraw interval past u32', geometry({ redrawInterval: 2 ** 32 }), 'mapGeometry.redrawInterval'],
    ['a zero line height', geometry({ informationLineHeight: 0 }), 'mapGeometry.informationLineHeight'],
    ['a line height past the font limit', geometry({ informationLineHeight: 9 }), 'mapGeometry.informationLineHeight'],
    ['a non-finite line height', geometry({ informationLineHeight: Number.NaN }), 'mapGeometry.informationLineHeight'],
    ['a missing field', { rectangle: geometry().rectangle, redrawInterval: 3 }, 'mapGeometry.informationLineHeight'],
    ['an unknown field', geometry({ zoom: 1 }), 'mapGeometry'],
    ['a missing rectangle field', { ...geometry(), rectangle: { x0: 1, y0: 1, x1: 9 } }, 'mapGeometry.rectangle.y1'],
    ['an unknown rectangle field', geometry({}, { width: 1 }), 'mapGeometry.rectangle'],
    ['a rectangle that is an array', geometry({ rectangle: [13, 37, 503, 337] }), 'mapGeometry.rectangle'],
    ['a null geometry', null, 'mapGeometry'],
  ])('rejects %s', (_, input, path) => {
    expectContractError(() => readMapGeometry(input), CODE, path);
  });
});

describe('map geometry payload', () => {
  it('round-trips byte for byte as canonical JSON in reader field order', () => {
    const { bytes, descriptor } = syntheticAsset();
    expect(text(bytes)).toBe('{"rectangle":{"x0":13,"y0":37,"x1":503,"y1":337},"redrawInterval":3,"informationLineHeight":7}');
    const decoded = decode(bytes, descriptor);
    expect(decoded).toEqual(geometry());
    expect(encodeMapGeometryPayload(decoded)).toEqual(bytes);
    expect(bytes.buffer.byteLength).toBe(bytes.length);
  });

  it('encodes the longest geometry within the payload byte limit, reserving its length first', () => {
    const reserved: number[] = [];
    const longest = geometry({ redrawInterval: 0xffff_ffff, informationLineHeight: 8 }, { x0: 100, y0: 100, x1: 639, y1: 479 });
    const bytes = encodeMapGeometryPayload(longest as MapGeometry, length => reserved.push(length));
    expect(reserved).toEqual([bytes.length]);
    expect(bytes.length).toBeLessThanOrEqual(MAP_GEOMETRY_LIMITS.payloadBytes);
    expectContractError(() => encodeMapGeometryPayload(geometry({ informationLineHeight: 9 }) as MapGeometry), CODE, 'mapGeometry.informationLineHeight');
  });

  it.each([
    ['whitespace between tokens', (json: string) => json.replace('"x0":13', '"x0": 13'), 'non-canonical-payload', 'payload'],
    ['another field order', (json: string) => json.replace('"redrawInterval":3,"informationLineHeight":7', '"informationLineHeight":7,"redrawInterval":3'), 'non-canonical-payload', 'payload'],
    ['another rectangle field order', (json: string) => json.replace('"x0":13,"y0":37', '"y0":37,"x0":13'), 'non-canonical-payload', 'payload'],
    ['a longer number spelling', (json: string) => json.replace('"x0":13', '"x0":13.0'), 'non-canonical-payload', 'payload'],
    ['an exponent spelling', (json: string) => json.replace('"x1":503', '"x1":5.03e2'), 'non-canonical-payload', 'payload'],
    ['a repeated key', (json: string) => json.replace('"redrawInterval":3,', '"redrawInterval":3,"redrawInterval":3,'), 'non-canonical-payload', 'payload'],
    ['a degenerate rectangle', (json: string) => json.replace('"y1":337', '"y1":37'), CODE, 'mapGeometry.rectangle.y1'],
    ['a fractional interval', (json: string) => json.replace('"redrawInterval":3', '"redrawInterval":3.5'), CODE, 'mapGeometry.redrawInterval'],
    ['a missing field', (json: string) => json.replace(',"informationLineHeight":7', ''), CODE, 'mapGeometry.informationLineHeight'],
    ['an unknown field', (json: string) => json.replace('"redrawInterval":3,', '"redrawInterval":3,"zoom":1,'), CODE, 'mapGeometry'],
    ['a trailing newline', (json: string) => `${json}\n`, CODE, 'payload'],
    ['text that is not JSON', (json: string) => json.slice(0, -1), CODE, 'payload'],
  ])('rejects %s', (_, edit, code, path) => {
    const { bytes, descriptor } = edited(edit);
    expectContractError(() => decode(bytes, descriptor), code, path);
  });

  it('checks the byte limit before the descriptor and rejects transferred bytes', () => {
    expectContractError(() => decode(new Uint8Array(MAP_GEOMETRY_LIMITS.payloadBytes + 1), { role: 'unknown' }), CODE, 'payload');
    const { bytes, descriptor } = syntheticAsset();
    structuredClone(bytes, { transfer: [...payloadTransferList([bytes])] });
    expectContractError(() => decode(bytes, descriptor), 'payload-detached', 'payload');
  });

  it.each([
    ['another role', (d: MutableDescriptor) => { d.role = 'view-labels'; }, CODE, 'descriptor.role'],
    ['a kind other than data', (d: MutableDescriptor) => { Object.assign(d, { id: 'image/hud/map-geometry', kind: 'image' }); }, CODE, 'descriptor.kind'],
    ['another schema version', (d: MutableDescriptor) => { d.payloadIdentity.schemaVersion = 2; }, 'unsupported-payload-schema', 'descriptor.payloadIdentity.schemaVersion'],
    ['a dependency', (d: MutableDescriptor) => { d.dependencies.push({ id: 'font/synthetic-hud', kind: 'font' }); }, 'flight-data-reference-mismatch', 'descriptor.dependencies'],
  ] as const)('rejects a descriptor with %s', (_, change, code, path) => {
    const { bytes, descriptor } = syntheticAsset();
    change(descriptor as MutableDescriptor);
    expectContractError(() => decode(bytes, descriptor), code, path);
  });

  it('returns a deeply frozen result isolated from the input bytes and earlier results', () => {
    const { bytes, descriptor } = syntheticAsset();
    const first = decode(bytes, descriptor);
    expect(deepFrozen(first)).toBe(true);
    expect(() => { (first.rectangle as { x0: number }).x0 = 0; }).toThrowError(TypeError);
    const second = decode(bytes, descriptor);
    expect(second).not.toBe(first);
    bytes.fill(0x20);
    expect(first).toEqual(geometry());
    expect(second).toEqual(first);
  });
});
