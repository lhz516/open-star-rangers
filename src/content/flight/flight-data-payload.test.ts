import { describe, expect, it } from 'vitest';
import { bitsOf } from '../effects/effects.test-support.ts';
import { asciiBytes as ascii, asciiText as text } from '../graphics/graphics-format.ts';
import { expectContractError } from '../graphics/graphics.test-support.ts';
import { deepFrozen } from '../logic/logic-content.test-support.ts';
import { payloadTransferList } from '../ownership.ts';
import { FLIGHT_DATA_FORMAT, FLIGHT_DATA_LIMITS, FLIGHT_DATA_ROLES, type FlightDataRole } from './flight-data-content.ts';
import { decodeFlightDataPayload, encodeFlightDataPayload, flightDataDependencies } from './flight-data-payload.ts';
import { readFlightDataContent } from './flight-data-readers.ts';
import {
  syntheticExplosionTable, syntheticFlightAsset, syntheticFlightPayload, syntheticSceneSettings,
} from './flight-data.test-support.ts';

type Descriptor = Parameters<typeof decodeFlightDataPayload>[1];
type MutableDescriptor = { role: string; kind: string; dependencies: { id: string; kind: string }[]; payloadIdentity: { schemaVersion: number } };

const decode = (bytes: Uint8Array, descriptor: unknown) => decodeFlightDataPayload(bytes, descriptor as Descriptor);
const shortImages = (count: number) => Array.from({ length: count }, (_, index) => ({ id: `image/frame/${index}`, kind: 'image' }));

/** The asset of `role` with its bytes replaced by `edit` of their text. */
function edited(role: FlightDataRole, edit: (json: string) => string) {
  const { bytes, descriptor } = syntheticFlightAsset(role);
  const changed = edit(text(bytes));
  expect(changed).not.toBe(text(bytes));
  return { bytes: ascii(changed), descriptor };
}

/** An Asset ID of exactly the 128-character limit. */
const longId = (kind: string, index: number): string => {
  const head = `${kind}/${'a'.repeat(32)}/${'b'.repeat(32)}/${'c'.repeat(32)}/`;
  const tail = String(index).padStart(2, '0');
  return head + 'd'.repeat(128 - head.length - tail.length) + tail;
};

/** Content of `role` at every structural limit, with the longest IDs and the longest number spellings. */
function largestContent(role: FlightDataRole): unknown {
  const reference = (kind: string, index: number) => ({ id: longId(kind, index), kind });
  const images = (count: number) => Array.from({ length: count }, (_, index) => reference('image', index));
  switch (role) {
    case 'scene-settings': {
      const float = -Math.fround(1.1754942106924411e-38);
      const flash = { randomMask: 0xffff_ffff, duration: float, drawIntervalTicks: 0xffff_ffff, level: -0x8000_0000 };
      return {
        lightType3Colour: [float, float, float], lightType0Colour: [float, float, float], deviceByte: 255,
        deviceValues: { base: float, kinds1c7c: float, kindsF8000: float }, screenFlashes: [flash, flash, flash],
      };
    }
    case 'explosion-table': return {
      lists: Array.from({ length: FLIGHT_DATA_FORMAT.explosionLists }, (_, list) => Array.from({ length: FLIGHT_DATA_LIMITS.explosionListItems },
        (_, index) => ({ sound: reference('sound', index), animation: reference('data', list * 20 + index) }))),
    };
    case 'explosion-animation': return { frames: images(FLIGHT_DATA_LIMITS.animationFrames) };
    case 'nebula-backgrounds': return { images: images(FLIGHT_DATA_LIMITS.nebulaImages) };
  }
}

describe('flight data payload encoding', () => {
  it.each(FLIGHT_DATA_ROLES)('round-trips %s byte for byte', role => {
    const { bytes, descriptor } = syntheticFlightAsset(role);
    const decoded = decode(bytes, descriptor);
    expect(decoded.role).toBe(role);
    expect(encodeFlightDataPayload(decoded)).toEqual(bytes);
    expect(decoded).toEqual(readFlightDataContent(role, JSON.parse(text(bytes))));
  });

  it('writes contract field order without whitespace and keeps every f32 bit, a denormal included', () => {
    const input = syntheticSceneSettings();
    input.deviceValues.kindsF8000 = -0;
    const { bytes, descriptor } = syntheticFlightAsset('scene-settings', input);
    const json = text(bytes);
    expect(json.startsWith('{"lightType3Colour":[0.30000001192092896,1.401298464324817e-45,-1.5],"lightType0Colour":')).toBe(true);
    expect(json).toContain('"deviceValues":{"base":1250.5,"kinds1c7c":3.4028234663852886e+38,"kindsF8000":0}');
    expect(json).toContain('"screenFlashes":[{"randomMask":4294967295,"duration":0.75,"drawIntervalTicks":17,"level":-2147483648}');
    expect(json).not.toMatch(/\s/);
    const decoded = decode(bytes, descriptor);
    const read = decoded.role === 'scene-settings' ? decoded.content : undefined;
    const floats = [...input.lightType3Colour, ...input.lightType0Colour, input.deviceValues.base, input.deviceValues.kinds1c7c];
    const decodedFloats = [...read!.lightType3Colour, ...read!.lightType0Colour, read!.deviceValues.base, read!.deviceValues.kinds1c7c];
    expect(decodedFloats.map(bitsOf)).toEqual(floats.map(bitsOf));
  });

  it('encodes equal content to equal bytes in a buffer of their own', () => {
    const first = syntheticFlightAsset('explosion-table').bytes;
    const second = syntheticFlightAsset('explosion-table').bytes;
    expect(second).toEqual(first);
    expect(second.buffer).not.toBe(first.buffer);
    expect(first.buffer.byteLength).toBe(first.byteLength);
    expect(payloadTransferList([first, second])).toHaveLength(2);
  });

  it.each(FLIGHT_DATA_ROLES)('encodes %s at every structural limit within the payload byte limit', role => {
    const reserved: number[] = [];
    const bytes = encodeFlightDataPayload(syntheticFlightPayload(role, largestContent(role)), byteLength => reserved.push(byteLength));
    expect(reserved).toEqual([bytes.length]);
    expect(bytes.length).toBeLessThanOrEqual(FLIGHT_DATA_LIMITS.payloadBytes);
  });

  it('rejects content its reader rejects, before reserving', () => {
    const table = syntheticExplosionTable();
    table.lists[1].push(...Array.from({ length: FLIGHT_DATA_LIMITS.explosionListItems - 1 }, () => table.lists[1][0]));
    const reserved: number[] = [];
    expectContractError(() => encodeFlightDataPayload(syntheticFlightPayload('explosion-table', table), length => reserved.push(length)),
      'invalid-flight-data-payload', 'explosionTable.lists[1]');
    expect(reserved).toEqual([]);
    const scene = syntheticSceneSettings();
    scene.screenFlashes[2].duration = Number.POSITIVE_INFINITY;
    expectContractError(() => encodeFlightDataPayload(syntheticFlightPayload('scene-settings', scene)), 'invalid-flight-data-payload', 'sceneSettings.screenFlashes[2].duration');
  });

  it('lists each referenced Asset once, in ascending ID order, as the dependencies', () => {
    expect(flightDataDependencies(syntheticFlightPayload('explosion-table')).map(({ id }) => id)).toEqual([
      'data/synthetic-animation/01', 'data/synthetic-animation/02', 'data/synthetic-animation/03', 'data/synthetic-animation/04',
      'data/synthetic-animation/05', 'sound/synthetic/boom-a', 'sound/synthetic/boom-b', 'sound/synthetic/boom-c',
    ]);
    expect(flightDataDependencies(syntheticFlightPayload('nebula-backgrounds')).map(({ id }) => id)).toEqual([
      'image/synthetic-nebula/a', 'image/synthetic-nebula/b', 'image/synthetic-nebula/c',
    ]);
    expect(flightDataDependencies(syntheticFlightPayload('scene-settings'))).toEqual([]);
    const dependencies = flightDataDependencies(syntheticFlightPayload('explosion-animation'));
    expect(dependencies).toEqual([1, 2, 3].map(index => ({ id: `image/synthetic-frame/0${index}`, kind: 'image' })));
    expect(deepFrozen(dependencies)).toBe(true);
    expectContractError(() => flightDataDependencies(syntheticFlightPayload('explosion-animation', { frames: [] })),
      'invalid-flight-data-payload', 'explosionAnimation.frames');
  });
});

describe('flight data payload decoding', () => {
  it.each([
    ['scene-settings', 'whitespace between tokens', (json: string) => json.replace('"deviceByte":199', '"deviceByte": 199'), 'non-canonical-payload', 'payload'],
    ['scene-settings', 'another field order', (json: string) => json.replace('"randomMask":0,"duration":64', '"duration":64,"randomMask":0'), 'non-canonical-payload', 'payload'],
    ['scene-settings', '-0', (json: string) => json.replace('"level":0}', '"level":-0}'), 'non-canonical-payload', 'payload'],
    ['scene-settings', 'a longer number spelling', (json: string) => json.replace('"base":1250.5', '"base":1.2505e3'), 'non-canonical-payload', 'payload'],
    ['scene-settings', 'a repeated key', (json: string) => json.replace('"deviceByte":199', '"deviceByte":199,"deviceByte":199'), 'non-canonical-payload', 'payload'],
    ['scene-settings', 'a non-finite number', (json: string) => json.replace('"duration":64', '"duration":1e999'), 'invalid-flight-data-payload', 'sceneSettings.screenFlashes[2].duration'],
    ['scene-settings', 'a number an f32 cannot hold', (json: string) => json.replace('"duration":64', '"duration":0.1'), 'invalid-flight-data-payload', 'sceneSettings.screenFlashes[2].duration'],
    ['scene-settings', 'a missing field', (json: string) => json.replace('"drawIntervalTicks":17,', ''), 'invalid-flight-data-payload', 'sceneSettings.screenFlashes[0].drawIntervalTicks'],
    ['scene-settings', 'an unknown field', (json: string) => json.replace('"deviceByte":199', '"deviceByte":199,"unread":0'), 'invalid-flight-data-payload', 'sceneSettings'],
    ['scene-settings', 'a wrong type', (json: string) => json.replace('"deviceByte":199', '"deviceByte":"199"'), 'invalid-flight-data-payload', 'sceneSettings.deviceByte'],
    ['scene-settings', 'a trailing newline', (json: string) => `${json}\n`, 'invalid-flight-data-payload', 'payload'],
    ['scene-settings', 'text that is not JSON', (json: string) => json.slice(0, -1), 'invalid-flight-data-payload', 'payload'],
    ['explosion-table', 'an escaped character', (json: string) => json.replace('boom-a', '\\u0062oom-a'), 'non-canonical-payload', 'payload'],
    ['explosion-table', 'a fourth list', (json: string) => json.replace(/\]\]\}$/, '],[]]}'), 'invalid-flight-data-payload', 'explosionTable.lists'],
    ['explosion-table', 'a reference of the wrong kind', (json: string) => json.replace('{"id":"sound/synthetic/boom-c","kind":"sound"}', '{"id":"data/synthetic/boom-c","kind":"data"}'), 'invalid-flight-data-payload', 'explosionTable.lists[1][0].sound.kind'],
    ['explosion-animation', 'no frame', (json: string) => json.replace(/\[.*\]/, '[]'), 'invalid-flight-data-payload', 'explosionAnimation.frames'],
    ['nebula-backgrounds', 'an ID that is no Asset ID', (json: string) => json.replace('image/synthetic-nebula/c', 'image/synthetic-nebula/C'), 'invalid-flight-data-payload', 'nebulaBackgrounds.images[2].id'],
  ] as const)('rejects %s with %s', (role, _, edit, code, path) => {
    const { bytes, descriptor } = edited(role, edit);
    expectContractError(() => decode(bytes, descriptor), code, path);
  });

  it.each([
    ['scene-settings', 'sceneSettings.screenFlashes', () => {
      const scene = syntheticSceneSettings();
      return { ...scene, screenFlashes: [...scene.screenFlashes, null] };
    }],
    ['explosion-table', 'explosionTable.lists[0]', () => {
      const table = syntheticExplosionTable();
      return { lists: [[...table.lists[0], ...Array.from({ length: FLIGHT_DATA_LIMITS.explosionListItems - 3 }, () => table.lists[0][0]), null], [], []] };
    }],
    ['explosion-animation', 'explosionAnimation.frames', () => ({ frames: [...shortImages(FLIGHT_DATA_LIMITS.animationFrames), null] })],
    ['nebula-backgrounds', 'nebulaBackgrounds.images', () => ({ images: [...shortImages(FLIGHT_DATA_LIMITS.nebulaImages), null] })],
  ] as const)('checks the %s structural limit before reading the items', (role, path, content) => {
    const { descriptor } = syntheticFlightAsset(role);
    expectContractError(() => decode(ascii(JSON.stringify(content())), descriptor), 'invalid-flight-data-payload', path);
  });

  it('rejects non-ASCII bytes before parsing and checks the byte limit before the descriptor', () => {
    const { bytes, descriptor } = syntheticFlightAsset('nebula-backgrounds');
    const changed = new Uint8Array(bytes);
    changed[text(bytes).indexOf('nebula')] = 0xe9;
    expectContractError(() => decode(changed, descriptor), 'invalid-flight-data-payload', 'payload');
    expectContractError(() => decode(new Uint8Array(FLIGHT_DATA_LIMITS.payloadBytes + 1), { role: 'unknown' }), 'invalid-flight-data-payload', 'payload');
  });

  it('rejects transferred bytes', () => {
    const { bytes, descriptor } = syntheticFlightAsset('explosion-animation');
    structuredClone(bytes, { transfer: [...payloadTransferList([bytes])] });
    expectContractError(() => decode(bytes, descriptor), 'payload-detached', 'payload');
  });

  it.each([
    ['scene-settings', 'a dependency', (d: MutableDescriptor) => { d.dependencies.push({ id: 'image/synthetic-frame/01', kind: 'image' }); }],
    ['explosion-table', 'a missing sound', (d: MutableDescriptor) => { d.dependencies.pop(); }],
    ['explosion-table', 'a missing animation', (d: MutableDescriptor) => { d.dependencies.shift(); }],
    ['explosion-table', 'an unreferenced Asset', (d: MutableDescriptor) => { d.dependencies.push({ id: 'sound/synthetic/zz-extra', kind: 'sound' }); }],
    ['explosion-animation', 'another frame', (d: MutableDescriptor) => { d.dependencies[2] = { id: 'image/synthetic-frame/09', kind: 'image' }; }],
    ['explosion-animation', 'no dependency', (d: MutableDescriptor) => { d.dependencies.length = 0; }],
    ['nebula-backgrounds', 'a missing image', (d: MutableDescriptor) => { d.dependencies.splice(1, 1); }],
  ] as const)('rejects a %s descriptor with %s', (role, _, change) => {
    const { bytes, descriptor } = syntheticFlightAsset(role);
    change(descriptor as MutableDescriptor);
    expectContractError(() => decode(bytes, descriptor), 'flight-data-reference-mismatch', 'descriptor.dependencies');
  });

  it.each([
    ['an unknown role', (d: MutableDescriptor) => { d.role = 'view-labels'; }, 'invalid-flight-data-payload', 'descriptor.role'],
    ['a kind other than data', (d: MutableDescriptor) => { Object.assign(d, { id: 'image/nebula-backgrounds', kind: 'image' }); }, 'invalid-flight-data-payload', 'descriptor.kind'],
    ['another schema version', (d: MutableDescriptor) => { d.payloadIdentity.schemaVersion = 2; }, 'unsupported-payload-schema', 'descriptor.payloadIdentity.schemaVersion'],
  ] as const)('rejects a descriptor with %s', (_, change, code, path) => {
    const { bytes, descriptor } = syntheticFlightAsset('nebula-backgrounds');
    change(descriptor as MutableDescriptor);
    expectContractError(() => decode(bytes, descriptor), code, path);
  });

  it('reads another role\'s bytes with the descriptor role\'s reader', () => {
    const { bytes } = syntheticFlightAsset('nebula-backgrounds');
    const { descriptor } = syntheticFlightAsset('explosion-animation');
    expectContractError(() => decode(bytes, descriptor), 'invalid-flight-data-payload', 'explosionAnimation.frames');
  });

  it('returns a deeply frozen result isolated from the input bytes and earlier results, and never echoes content', () => {
    const { bytes, descriptor } = syntheticFlightAsset('explosion-table');
    const first = decode(bytes, descriptor);
    expect(deepFrozen(first)).toBe(true);
    expect(() => { (first.content as { lists: unknown }).lists = []; }).toThrowError(TypeError);
    const second = decode(bytes, descriptor);
    expect(second).not.toBe(first);
    bytes.fill(0x20);
    expect(first.content).toEqual(syntheticExplosionTable());
    expect(second).toEqual(first);
    const failure = edited('nebula-backgrounds', json => json.replace('image/synthetic-nebula/a', 'image/synthetic-nebula/a\\u0001'));
    expectContractError(() => decode(failure.bytes, failure.descriptor), 'invalid-flight-data-payload', 'nebulaBackgrounds.images[1].id', ['synthetic-nebula']);
    const scene = edited('scene-settings', json => json.replace('"deviceByte":199', '"deviceByte":1999'));
    expectContractError(() => decode(scene.bytes, scene.descriptor), 'invalid-flight-data-payload', 'sceneSettings.deviceByte', ['1999']);
  });
});
