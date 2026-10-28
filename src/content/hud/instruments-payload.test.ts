import { describe, expect, it } from 'vitest';
import { asciiBytes as ascii, asciiText as text } from '../graphics/graphics-format.ts';
import { expectContractError } from '../graphics/graphics.test-support.ts';
import { deepFrozen } from '../logic/logic-content.test-support.ts';
import { payloadTransferList } from '../ownership.ts';
import { syntheticGroup } from '../synthetic-content.test-support.ts';
import {
  COCKPIT_INSTRUMENTS_LIMITS, checkCockpitInstruments, decodeCockpitInstrumentsPayload, encodeCockpitInstrumentsPayload,
  readCockpitInstruments, type CockpitInstrumentAssets, type CockpitInstruments,
} from './instruments-payload.ts';
import { syntheticCockpitInstruments, syntheticInstrumentAssets, type MutableCockpitInstruments } from './instruments.test-support.ts';

// Code-generated synthetic instruments; the values are not the original records'.
const CODE = 'invalid-flight-data-payload';
const PATH = 'cockpitInstruments';

type Descriptor = Parameters<typeof decodeCockpitInstrumentsPayload>[1];
type MutableDescriptor = { id: string; role: string; kind: string; dependencies: { id: string; kind: string }[]; payloadIdentity: { schemaVersion: number } };
type Slot = MutableCockpitInstruments['slots'][number];
type MutableLayout = { elements: { image: string; x: number; y: number }[] };
type MutableAssets = {
  front: MutableLayout;
  mapFrame: MutableLayout;
  mapGeometry: { rectangle: { x0: number; y0: number; x1: number; y1: number }; redrawInterval: number };
};

const decode = (bytes: Uint8Array, descriptor: unknown) => decodeCockpitInstrumentsPayload(bytes, descriptor as Descriptor);
const encode = (content: unknown, reserve?: (byteLength: number) => void) => encodeCockpitInstrumentsPayload(content as CockpitInstruments, reserve);
const read = (content: unknown) => readCockpitInstruments(content);

/** Synthetic content after `change`. */
function changed(change: (content: MutableCockpitInstruments) => void): MutableCockpitInstruments {
  const content = syntheticCockpitInstruments();
  change(content);
  return content;
}

const front = (content: MutableCockpitInstruments): Slot => content.slots[0]!;
const map = (content: MutableCockpitInstruments): Slot => content.slots[1]!;
/** Slot 0's record of `type`. */
const frontRecord = (content: MutableCockpitInstruments, type: number) => front(content).instruments.find(record => record.type === type)!;

const slotPath = (index: number, rest = '') => `${PATH}.slots[${index}]${rest}`;
/** The path of slot 0's record of `type` in the synthetic content. */
const recordPath = (type: number, rest = '') =>
  slotPath(0, `.instruments[${syntheticCockpitInstruments().slots[0]!.instruments.findIndex(record => record.type === type)}]${rest}`);

/** The canonical bytes and a matching mutable descriptor for synthetic instruments. */
function syntheticAsset(content: unknown = syntheticCockpitInstruments()) {
  const bytes = encode(content);
  const [descriptor] = syntheticGroup('cockpit-hud-map', [{ id: 'data/hud/instruments', role: 'cockpit-instruments', bytes }]).manifest.assets;
  return { bytes, descriptor };
}

function edited(edit: (json: string) => string) {
  const { bytes, descriptor } = syntheticAsset();
  const after = edit(text(bytes));
  expect(after).not.toBe(text(bytes));
  return { bytes: ascii(after), descriptor };
}

/** An image Asset ID of the full 128 characters, distinct per `index`. */
const longImage = (index: number) => {
  const id = `image/${'a'.repeat(32)}/${'b'.repeat(32)}/${'c'.repeat(32)}/x${String(index).padStart(2, '0')}`;
  return id.padEnd(128, 'z');
};

/** Valid content whose every field has its longest canonical spelling. */
function longestContent(): MutableCockpitInstruments {
  const longestF32 = Math.fround(-3.1593707594310484e-31);
  expect(String(longestF32)).toHaveLength(23);
  return changed(content => {
    content.slots.forEach((slot, slotIndex) => {
      if (slot.layout !== null) {
        slot.elements = Array.from({ length: 16 }, (_, index) => ({ image: longImage(slotIndex * 16 + index), pass: 0, everyFrame: false }));
      }
      for (const record of slot.instruments) {
        record.rectangle = { x0: 100, y0: 100, x1: 639, y1: 479 };
        record.redrawInterval = 0xffff_ffff;
        if (record.type <= 3) Object.assign(record, { drawParam: 255, params: [-0x8000_0000] });
        if (record.type === 9) record.params = [100, 639, 100, 639];
      }
    });
    content.targetViewDistances = Array.from({ length: 20 }, () => longestF32);
  });
}

describe('cockpit instruments reader', () => {
  it('keeps the content as a deeply frozen copy isolated from its input, in source order', () => {
    const input = syntheticCockpitInstruments();
    const result = read(input);
    expect(result).toEqual(input);
    expect(deepFrozen(result)).toBe(true);
    expect(result.slots[0].instruments.map(({ type }) => type)).toEqual([0, 1, 2, 3, 5, 7, 8, 6, 9, 12]);
    expect(result.slots[1].instruments.map(({ type }) => type)).toEqual([10, 8]);
    frontRecord(input, 0).rectangle.x0 = 0;
    front(input).elements[0]!.image = 'image/other';
    input.targetViewDistances[0] = 1;
    expect(result.slots[0].instruments[0]!.rectangle.x0).toBe(4);
    expect(result.slots[0].elements[0]!.image).toBe('image/synthetic/front-panel');
    expect(result.targetViewDistances[0]).toBe(12.5);
  });

  it('keeps slot 7 without a layout or elements and with its type-8 record', () => {
    const [, , external] = read(syntheticCockpitInstruments()).slots;
    expect(external).toEqual({
      slot: 7, layoutNumber: 8, alwaysRedraw: true, layout: null, elements: [],
      instruments: [{ type: 8, rectangle: { x0: 30, y0: 460, x1: 212, y1: 476 }, redrawInterval: 0, drawParam: 0, params: [] }],
    });
  });

  it.each([
    ['the whole screen and the u32 interval bound', (c: MutableCockpitInstruments) => Object.assign(frontRecord(c, 5), { rectangle: { x0: 0, y0: 0, x1: 639, y1: 479 }, redrawInterval: 0xffff_ffff })],
    ['a 1-pixel rectangle', (c: MutableCockpitInstruments) => { frontRecord(c, 12).rectangle = { x0: 639, y0: 479, x1: 639, y1: 479 }; }],
    ['the bar colour and mode bounds', (c: MutableCockpitInstruments) => Object.assign(frontRecord(c, 0), { drawParam: 255, params: [0x7fff_ffff] })],
    ['the i32 minimum as a bar mode', (c: MutableCockpitInstruments) => { frontRecord(c, 1).params = [-0x8000_0000]; }],
    ['type-9 ranges of single columns at the rectangle edges', (c: MutableCockpitInstruments) => { frontRecord(c, 9).params = [230, 230, 410, 410]; }],
    ['overlapping type-9 ranges', (c: MutableCockpitInstruments) => { frontRecord(c, 9).params = [300, 410, 230, 300]; }],
    ['a pass-1 element first and pass-0 elements after it', (c: MutableCockpitInstruments) => { front(c).elements.reverse(); }],
    ['16 elements', (c: MutableCockpitInstruments) => { front(c).elements = Array.from({ length: 16 }, (_, index) => ({ image: `image/e/${index}`, pass: 0, everyFrame: false })); }],
    ['denormal, extreme and negative distances', (c: MutableCockpitInstruments) => { c.targetViewDistances.splice(0, 3, 2 ** -149, Math.fround(3.4e38), -1.5); }],
    ['slot 0 records in ascending type order', (c: MutableCockpitInstruments) => { front(c).instruments.sort((left, right) => left.type - right.type); }],
  ])('accepts %s', (_, change) => {
    const content = changed(change);
    expect(read(content)).toEqual(content);
  });

  it('reads a distance of -0 as 0', () => {
    expect(Object.is(read(changed(c => { c.targetViewDistances[4] = -0; })).targetViewDistances[4], 0)).toBe(true);
  });

  it.each([
    // Content and slot identity.
    ['a missing field', { slots: [] }, `${PATH}.targetViewDistances`],
    ['an unknown field', changed(c => Object.assign(c, { version: 1 })), PATH],
    ['two slots', changed(c => { c.slots.pop(); }), `${PATH}.slots`],
    ['four slots', changed(c => { c.slots.push(c.slots[2]!); }), `${PATH}.slots`],
    ['slots out of order', changed(c => { c.slots.reverse(); }), slotPath(0, '.slot')],
    ['another slot index', changed(c => { front(c).slot = 1; }), slotPath(0, '.slot')],
    ['another layout number', changed(c => { map(c).layoutNumber = 5; }), slotPath(1, '.layoutNumber')],
    ['another always-redraw flag', changed(c => { c.slots[2]!.alwaysRedraw = false; }), slotPath(2, '.alwaysRedraw')],
    ['a truthy always-redraw flag', changed(c => Object.assign(c.slots[2]!, { alwaysRedraw: 1 })), slotPath(2, '.alwaysRedraw')],
    ['another layout', changed(c => { front(c).layout = 'layout/cockpit/rear'; }), slotPath(0, '.layout')],
    ['a layout for slot 7', changed(c => { c.slots[2]!.layout = 'layout/map/frame'; }), slotPath(2, '.layout')],
    ['a slot with an unknown field', changed(c => Object.assign(front(c), { palette: 'palette/hud' })), slotPath(0)],
    ['a null slot', changed(c => Object.assign(c.slots, { 1: null })), slotPath(1)],
    // Elements.
    ['a laid-out slot without elements', changed(c => { front(c).elements = []; }), slotPath(0, '.elements')],
    ['an element in slot 7', changed(c => { c.slots[2]!.elements.push({ image: 'image/x/y', pass: 0, everyFrame: true }); }), slotPath(2, '.elements')],
    ['a repeated image', changed(c => { map(c).elements[1]!.image = 'image/synthetic/map-border'; }), slotPath(1, '.elements[1].image')],
    ['a layout Asset ID as image', changed(c => { front(c).elements[0]!.image = 'layout/cockpit/front'; }), slotPath(0, '.elements[0].image')],
    ['an invalid Asset ID', changed(c => { front(c).elements[0]!.image = 'image/Panel'; }), slotPath(0, '.elements[0].image')],
    ['pass 2', changed(c => { front(c).elements[0]!.pass = 2; }), slotPath(0, '.elements[0].pass')],
    ['a numeric every-frame flag', changed(c => Object.assign(front(c).elements[0]!, { everyFrame: 0 })), slotPath(0, '.elements[0].everyFrame')],
    ['a pass-1 element drawn only in full redraws', changed(c => { front(c).elements[2]!.everyFrame = false; }), slotPath(0, '.elements[2].everyFrame')],
    ['an element with a layout position', changed(c => Object.assign(front(c).elements[0]!, { x: 0 })), slotPath(0, '.elements[0]')],
    // Records.
    ['a missing type', changed(c => { front(c).instruments.pop(); }), slotPath(0, '.instruments')],
    ['a repeated type', changed(c => { map(c).instruments[1]!.type = 10; }), slotPath(1, '.instruments[1].type')],
    ['type 4', changed(c => { frontRecord(c, 12).type = 4; }), recordPath(12, '.type')],
    ['type 11', changed(c => { frontRecord(c, 12).type = 11; }), recordPath(12, '.type')],
    ['type 13', changed(c => { frontRecord(c, 12).type = 13; }), recordPath(12, '.type')],
    ['a map record in slot 0', changed(c => { frontRecord(c, 12).type = 10; }), recordPath(12, '.type')],
    ['a gauge in slot 7', changed(c => { c.slots[2]!.instruments[0]!.type = 0; }), slotPath(2, '.instruments[0].type')],
    ['a string type', changed(c => Object.assign(frontRecord(c, 12), { type: '12' })), recordPath(12, '.type')],
    ['a last draw time', changed(c => Object.assign(frontRecord(c, 5), { lastDraw: 0 })), recordPath(5)],
    ['a record without params', changed(c => { delete (frontRecord(c, 5) as Partial<Slot['instruments'][number]>).params; }), recordPath(5, '.params')],
    ['a negative x0', changed(c => { frontRecord(c, 5).rectangle.x0 = -1; }), recordPath(5, '.rectangle.x0')],
    ['an x1 past the screen', changed(c => { frontRecord(c, 5).rectangle.x1 = 640; }), recordPath(5, '.rectangle.x1')],
    ['a y1 past the screen', changed(c => { frontRecord(c, 5).rectangle.y1 = 480; }), recordPath(5, '.rectangle.y1')],
    ['x1 left of x0', changed(c => { frontRecord(c, 5).rectangle.x1 = 259; }), recordPath(5, '.rectangle.x1')],
    ['y1 above y0', changed(c => { frontRecord(c, 5).rectangle.y1 = 329; }), recordPath(5, '.rectangle.y1')],
    ['a fractional coordinate', changed(c => { frontRecord(c, 5).rectangle.y0 = 330.5; }), recordPath(5, '.rectangle.y0')],
    ['a rectangle with a width field', changed(c => Object.assign(frontRecord(c, 5).rectangle, { width: 1 })), recordPath(5, '.rectangle')],
    ['a negative interval', changed(c => { frontRecord(c, 5).redrawInterval = -1; }), recordPath(5, '.redrawInterval')],
    ['an interval past u32', changed(c => { frontRecord(c, 5).redrawInterval = 2 ** 32; }), recordPath(5, '.redrawInterval')],
    ['a bar colour past u8', changed(c => { frontRecord(c, 3).drawParam = 256; }), recordPath(3, '.drawParam')],
    ['a draw parameter on another type', changed(c => { frontRecord(c, 5).drawParam = 1; }), recordPath(5, '.drawParam')],
    ['two bar parameters', changed(c => { frontRecord(c, 2).params = [1, 2]; }), recordPath(2, '.params')],
    ['a bar mode past i32', changed(c => { frontRecord(c, 2).params = [2 ** 31]; }), recordPath(2, '.params[0]')],
    ['a parameter on another type', changed(c => { frontRecord(c, 7).params = [0]; }), recordPath(7, '.params')],
    ['three type-9 parameters', changed(c => { frontRecord(c, 9).params = [230, 300, 340]; }), recordPath(9, '.params')],
    ['a type-9 range left of the rectangle', changed(c => { frontRecord(c, 9).params[0] = 229; }), recordPath(9, '.params[0]')],
    ['a type-9 range right of the rectangle', changed(c => { frontRecord(c, 9).params[3] = 411; }), recordPath(9, '.params[3]')],
    ['a reversed first type-9 range', changed(c => { frontRecord(c, 9).params = [300, 299, 340, 410]; }), recordPath(9, '.params[1]')],
    ['a reversed second type-9 range', changed(c => { frontRecord(c, 9).params = [230, 300, 341, 340]; }), recordPath(9, '.params[3]')],
    // Distances.
    ['19 distances', changed(c => { c.targetViewDistances.pop(); }), `${PATH}.targetViewDistances`],
    ['a NaN distance', changed(c => { c.targetViewDistances[3] = Number.NaN; }), `${PATH}.targetViewDistances[3]`],
    ['an infinite distance', changed(c => { c.targetViewDistances[3] = Number.POSITIVE_INFINITY; }), `${PATH}.targetViewDistances[3]`],
    ['a distance no f32 holds', changed(c => { c.targetViewDistances[3] = 0.1; }), `${PATH}.targetViewDistances[3]`],
    ['a string distance', changed(c => Object.assign(c.targetViewDistances, { 3: '1' })), `${PATH}.targetViewDistances[3]`],
    ['a sparse distance list', changed(c => { delete c.targetViewDistances[3]; }), `${PATH}.targetViewDistances`],
    ['a distance list with an extra field', changed(c => Object.assign(c.targetViewDistances, { extra: 1 })), `${PATH}.targetViewDistances`],
    ['a null content', null, PATH],
  ])('rejects %s', (_, input, path) => {
    expectContractError(() => read(input), CODE, path);
  });

  it.each([
    ['slots', 3, (c: MutableCockpitInstruments, items: unknown[]) => Object.assign(c, { slots: items }), `${PATH}.slots`],
    ['slot 0 elements', 16, (c: MutableCockpitInstruments, items: unknown[]) => Object.assign(front(c), { elements: items }), slotPath(0, '.elements')],
    ['slot 0 records', COCKPIT_INSTRUMENTS_LIMITS.recordsPerSlot, (c: MutableCockpitInstruments, items: unknown[]) => Object.assign(front(c), { instruments: items }), slotPath(0, '.instruments')],
    ['type-9 parameters', COCKPIT_INSTRUMENTS_LIMITS.params, (c: MutableCockpitInstruments, items: unknown[]) => Object.assign(frontRecord(c, 9), { params: items }), recordPath(9, '.params')],
    ['distances', 20, (c: MutableCockpitInstruments, items: unknown[]) => Object.assign(c, { targetViewDistances: items }), `${PATH}.targetViewDistances`],
  ])('checks the count of %s before reading any item', (_, limit, place, path) => {
    // At the limit the first item is read and fails; one past it the list fails before any item is read.
    expectContractError(() => read(changed(c => place(c, Array.from({ length: limit }, () => null)))), CODE, `${path}[0]`);
    expectContractError(() => read(changed(c => place(c, Array.from({ length: limit + 1 }, () => null)))), CODE, path);
  });
});

describe('cockpit instruments payload', () => {
  it('round-trips byte for byte as canonical JSON in reader field order', () => {
    const { bytes, descriptor } = syntheticAsset();
    const json = text(bytes);
    expect(json.startsWith('{"slots":[{"slot":0,"layoutNumber":0,"alwaysRedraw":false,"layout":"layout/cockpit/front",'
      + '"elements":[{"image":"image/synthetic/front-panel","pass":0,"everyFrame":false},')).toBe(true);
    expect(json).toContain('"instruments":[{"type":0,"rectangle":{"x0":4,"y0":320,"x1":40,"y1":470},"redrawInterval":7,"drawParam":21,"params":[2]},');
    expect(json).toContain('{"slot":7,"layoutNumber":8,"alwaysRedraw":true,"layout":null,"elements":[],"instruments":[{"type":8,');
    expect(json.endsWith('"targetViewDistances":[12.5,25,37.5,50,62.5,75,87.5,100,112.5,125,137.5,150,162.5,175,187.5,200,212.5,225,237.5,250]}')).toBe(true);
    const decoded = decode(bytes, descriptor);
    expect(decoded).toEqual(syntheticCockpitInstruments());
    expect(encodeCockpitInstrumentsPayload(decoded)).toEqual(bytes);
    expect(bytes.buffer.byteLength).toBe(bytes.length);
  });

  it('encodes the longest content within the payload byte limit, reserving its length first', () => {
    const reserved: number[] = [];
    const longest = longestContent();
    const bytes = encode(longest, length => reserved.push(length));
    expect(reserved).toEqual([bytes.length]);
    expect(bytes.length).toBeLessThanOrEqual(COCKPIT_INSTRUMENTS_LIMITS.payloadBytes);
    expect(decode(bytes, syntheticAsset(longest).descriptor)).toEqual(longest);
  });

  it('reads the content before encoding it', () => {
    const reserved: number[] = [];
    expectContractError(() => encode(changed(c => { front(c).elements[2]!.everyFrame = false; }), length => reserved.push(length)), CODE, slotPath(0, '.elements[2].everyFrame'));
    expect(reserved).toEqual([]);
  });

  it.each([
    ['whitespace between tokens', (json: string) => json.replace('"slot":0', '"slot": 0'), 'non-canonical-payload', 'payload'],
    ['another field order', (json: string) => json.replace('"slot":0,"layoutNumber":0', '"layoutNumber":0,"slot":0'), 'non-canonical-payload', 'payload'],
    ['another rectangle field order', (json: string) => json.replace('"x0":4,"y0":320', '"y0":320,"x0":4'), 'non-canonical-payload', 'payload'],
    ['a longer number spelling', (json: string) => json.replace('[12.5,', '[12.50,'), 'non-canonical-payload', 'payload'],
    ['an exponent spelling', (json: string) => json.replace(',25,', ',2.5e1,'), 'non-canonical-payload', 'payload'],
    ['a -0 distance', (json: string) => json.replace('[12.5,', '[-0,'), 'non-canonical-payload', 'payload'],
    ['a repeated key', (json: string) => json.replace('"slot":0,', '"slot":0,"slot":0,'), 'non-canonical-payload', 'payload'],
    ['a pass-1 element drawn only in full redraws', (json: string) => json.replace('"pass":1,"everyFrame":true', '"pass":1,"everyFrame":false'), CODE, 'cockpitInstruments.slots[0].elements[2].everyFrame'],
    ['a last draw time', (json: string) => json.replace('"params":[2]}', '"params":[2],"lastDraw":0}'), CODE, 'cockpitInstruments.slots[0].instruments[0]'],
    ['a trailing newline', (json: string) => `${json}\n`, CODE, 'payload'],
    ['text that is not JSON', (json: string) => json.slice(0, -1), CODE, 'payload'],
  ])('rejects %s', (_, edit, code, path) => {
    const { bytes, descriptor } = edited(edit);
    expectContractError(() => decode(bytes, descriptor), code, path);
  });

  it('checks the byte limit before the descriptor and rejects transferred bytes', () => {
    expectContractError(() => decode(new Uint8Array(COCKPIT_INSTRUMENTS_LIMITS.payloadBytes + 1), { role: 'unknown' }), CODE, 'payload');
    const { bytes, descriptor } = syntheticAsset();
    structuredClone(bytes, { transfer: [...payloadTransferList([bytes])] });
    expectContractError(() => decode(bytes, descriptor), 'payload-detached', 'payload');
  });

  it.each([
    ['another role', (d: MutableDescriptor) => { d.role = 'map-geometry'; }, CODE, 'descriptor.role'],
    ['a kind other than data', (d: MutableDescriptor) => { Object.assign(d, { id: 'image/hud/instruments', kind: 'image' }); }, CODE, 'descriptor.kind'],
    ['another schema version', (d: MutableDescriptor) => { d.payloadIdentity.schemaVersion = 2; }, 'unsupported-payload-schema', 'descriptor.payloadIdentity.schemaVersion'],
    ['a dependency', (d: MutableDescriptor) => { d.dependencies.push({ id: 'image/synthetic/front-panel', kind: 'image' }); }, 'flight-data-reference-mismatch', 'descriptor.dependencies'],
  ] as const)('rejects a descriptor with %s', (_, change, code, path) => {
    const { bytes, descriptor } = syntheticAsset();
    change(descriptor as MutableDescriptor);
    expectContractError(() => decode(bytes, descriptor), code, path);
  });

  it('returns a deeply frozen result isolated from the input bytes and earlier results', () => {
    const { bytes, descriptor } = syntheticAsset();
    const first = decode(bytes, descriptor);
    expect(deepFrozen(first)).toBe(true);
    expect(() => { (first.slots[0].instruments[0]!.rectangle as { x0: number }).x0 = 0; }).toThrowError(TypeError);
    expect(() => { (first.targetViewDistances as number[])[0] = 0; }).toThrowError(TypeError);
    const second = decode(bytes, descriptor);
    expect(second).not.toBe(first);
    expect(second.slots[0]).not.toBe(first.slots[0]);
    bytes.fill(0x20);
    expect(first).toEqual(syntheticCockpitInstruments());
    expect(second).toEqual(first);
  });
});

describe('cockpit instruments check', () => {
  const instruments = () => read(syntheticCockpitInstruments());
  /** The synthetic Assets after `change`. */
  const assets = (change: (assets: MutableAssets) => void): CockpitInstrumentAssets => {
    const result = structuredClone(syntheticInstrumentAssets()) as unknown as MutableAssets;
    change(result);
    return result as unknown as CockpitInstrumentAssets;
  };

  it('accepts the layouts and map geometry the instruments share facts with', () => {
    expect(() => checkCockpitInstruments(instruments(), syntheticInstrumentAssets())).not.toThrow();
  });

  it('finds the map record wherever slot 2 keeps it', () => {
    const content = changed(c => { map(c).instruments.reverse(); });
    expect(() => checkCockpitInstruments(read(content), syntheticInstrumentAssets(content))).not.toThrow();
    const moved = assets(a => { a.mapGeometry.redrawInterval = 1; });
    expectContractError(() => checkCockpitInstruments(read(content), moved), CODE, `${PATH}.slots[1].instruments[1].redrawInterval`);
  });

  it.each<readonly [string, (assets: MutableAssets) => void, string]>([
    ['a front layout with another element', a => { a.front.elements.push({ image: 'image/synthetic/extra', x: 0, y: 0 }); }, `${PATH}.slots[0].elements`],
    ['a front layout with fewer elements', a => { a.front.elements.pop(); }, `${PATH}.slots[0].elements`],
    ['map frame elements in another order', a => { a.mapFrame.elements.reverse(); }, `${PATH}.slots[1].elements[0].image`],
    ['another front image', a => { a.front.elements[2]!.image = 'image/synthetic/other'; }, `${PATH}.slots[0].elements[2].image`],
    ...(['x0', 'y0', 'x1', 'y1'] as const).map((field): readonly [string, (assets: MutableAssets) => void, string] => [
      `another map ${field}`, a => { a.mapGeometry.rectangle[field] += 1; }, `${PATH}.slots[1].instruments[0].rectangle`,
    ]),
    ['another map redraw interval', a => { a.mapGeometry.redrawInterval = 1; }, `${PATH}.slots[1].instruments[0].redrawInterval`],
  ])('rejects %s', (_, change, path) => {
    expectContractError(() => checkCockpitInstruments(instruments(), assets(change)), CODE, path);
  });
});
