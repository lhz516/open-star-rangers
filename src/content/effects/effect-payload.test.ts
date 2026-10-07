import { describe, expect, it } from 'vitest';
import type { AssetDescriptor } from '../asset-contract.ts';
import { readAssetId } from '../asset-id.ts';
import { expectContractError, set16 as set16In, set32 as set32In, set8 } from '../graphics/graphics.test-support.ts';
import {
  EFFECT_LIMITS, MAX_FACE_WORDS, checkEffectBinding, effectPayloadLength, effectReferences, encodeEffectPayload, faceList, faceTriangles, readEffectPayload,
  type EffectKind, type EffectPayload,
} from './effect-payload.ts';
import { DEBRIS_TEXTURE, MISSILE_TEXTURE, syntheticDebris, syntheticMissile, syntheticProjectile } from './effects.test-support.ts';

// P2-06 AC-19 (payloads): code-generated payloads with arbitrary values only.

const PAYLOADS: Record<EffectKind, () => EffectPayload> = { projectile: syntheticProjectile, missile: syntheticMissile, debris: syntheticDebris };
const KINDS = Object.keys(PAYLOADS) as EffectKind[];

// Patched copies of an encoded payload.
const set16 = (bytes: Uint8Array, offset: number, value: number) => set16In(bytes.slice(), offset, value);
const set32 = (bytes: Uint8Array, offset: number, value: number) => set32In(bytes.slice(), offset, value);
function setF64(bytes: Uint8Array, offset: number, value: number): Uint8Array {
  const copy = bytes.slice();
  new DataView(copy.buffer).setFloat64(offset, value, true);
  return copy;
}

const NAN = 0x7fc0_0000;
const INFINITY = 0x7f80_0000;

describe('effect payloads', () => {
  it.each(KINDS)('round-trips the %s payload into frozen copies, bit for bit', kind => {
    const payload = PAYLOADS[kind]();
    const bytes = encodeEffectPayload(payload);
    expect(bytes.length).toBe(effectPayloadLength(payload));
    expect(bytes.byteOffset).toBe(0);
    expect(bytes.buffer.byteLength).toBe(bytes.length);
    const read = readEffectPayload(bytes, 2, kind);
    // toEqual compares numbers with Object.is, so negative zeros and subnormals are checked exactly.
    expect(read).toEqual(payload);
    expect(Object.isFrozen(read)).toBe(true);
    expect(encodeEffectPayload(read)).toEqual(bytes);
    bytes.fill(0xff);
    expect(read).toEqual(payload);
  });

  it('gives the same bytes for the same payload', () => {
    for (const kind of KINDS) expect(encodeEffectPayload(PAYLOADS[kind]())).toEqual(encodeEffectPayload(PAYLOADS[kind]()));
  });

  it('keeps every 64-bit constant bit for bit', () => {
    const payload = { ...syntheticMissile(), rotationScale: 5e-324, constants: { ...syntheticMissile().constants, bodyAngle: -Number.MAX_VALUE } };
    expect(readEffectPayload(encodeEffectPayload(payload), 2, 'missile')).toEqual(payload);
    const debris = { ...syntheticDebris(), mappingMultiplier: -Number.MAX_VALUE };
    expect(readEffectPayload(encodeEffectPayload(debris), 2, 'debris')).toEqual(debris);
  });

  it('checks face lists', () => {
    expect(faceList(Uint32Array.of(3, 0, 1, 2, 4, 3, 2, 1, 0, 0), 4, 0, 'f')).toEqual([[0, 1, 2], [3, 2, 1, 0]]);
    // A face may have as many corners as the shape has vertices.
    expect(faceList(Uint32Array.of(5, 4, 3, 2, 1, 0, 3, 0, 2, 4, 0), 5, 0, 'f')).toEqual([[4, 3, 2, 1, 0], [0, 2, 4]]);
    for (const words of [[0], [], [3, 0, 1, 2], [3, 0, 1, 2, 0, 0], [2, 0, 1, 0], [5, 0, 1, 2, 3, 0, 0], [3, 0, 1, 4, 0], [4, 0, 1, 2]]) {
      expectContractError(() => faceList(Uint32Array.from(words), 4, 0, 'f'), 'invalid-effect-payload', 'f');
    }
  });

  it('checks face lists of (vertex, normal) pairs and keeps only the vertex indices', () => {
    expect(faceList(Uint32Array.of(3, 0, 3, 1, 2, 2, 1, 4, 3, 0, 2, 1, 1, 2, 0, 3, 0), 4, 4, 'f')).toEqual([[0, 1, 2], [3, 2, 1, 0]]);
    // One face of 6 pairs, the shape of each original debris template, is 4 triangles; read as plain indices it is invalid.
    const hexagon = Uint32Array.of(6, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 0);
    expect(faceTriangles(hexagon, 6, 6, 'f')).toBe(4);
    expect(faceList(hexagon, 6, 6, 'f')).toEqual([[0, 1, 2, 3, 4, 5]]);
    expectContractError(() => faceTriangles(hexagon, 6, 0, 'f'), 'invalid-effect-payload', 'f');
  });

  it.each([
    ['a normal index equal to the normal count', [3, 0, 0, 1, 1, 2, 3, 0]],
    ['a vertex index equal to the vertex count', [3, 0, 0, 1, 1, 4, 0, 0]],
    ['a last pair cut to one word', [3, 0, 0, 1, 1, 2, 0]],
    ['pairs without the end marker', [3, 0, 0, 1, 1, 2, 2]],
    ['a list of plain indices', [3, 0, 1, 2, 0]],
    ['a face of 2 pairs', [2, 0, 0, 1, 1, 0]],
    ['no face', [0]],
  ])('rejects a pair list with %s', (_, words) => {
    expectContractError(() => faceTriangles(Uint32Array.from(words), 4, 3, 'f'), 'invalid-effect-payload', 'f');
  });

  describe('reader', () => {
    // Projectile: count, then template 0 (face list of 10 words at 2), template 1 (6 words), then 24-byte records.
    const projectile = encodeEffectPayload(syntheticProjectile());
    const T0_FACES = 4;
    const T0_VERTICES = T0_FACES + 40;
    const T0_CONSTANT = T0_VERTICES + 48 + 24 + 4;
    const RECORDS = 2 + (84 + 2 + 40) + (84 + 2 + 24);
    // Missile: texture (1 + 23 bytes), type count, face lists of 14, 11, 9 and 5 words (EXTRA_FACES is the last list's
    // first word), 6 constants, scale, colour.
    const missile = encodeEffectPayload(syntheticMissile());
    const TYPE_COUNT = 24;
    const EXTRA_FACES = TYPE_COUNT + 2 + (2 + 56) + (2 + 44) + (2 + 36) + 2;
    const CONSTANTS = EXTRA_FACES + 20;
    const ROTATION_SCALE = CONSTANTS + 48;
    const EXTRA_COLOUR = ROTATION_SCALE + 8;
    const TYPE_0 = EXTRA_COLOUR + 12;
    const TYPE_1 = TYPE_0 + 40;
    // Debris: texture (1 + 22 bytes), template 0 (face list of 17 words), template 1 (19 words: a pentagon of pairs
    // from D1_FACES, then a triangle whose corner count is word 11), scales and colours.
    const debris = encodeEffectPayload(syntheticDebris());
    const D0_VERTICES = 23 + 2 + 68;
    const D1_FACES = D0_VERTICES + 144 + 2;
    const SCALES = D1_FACES + 76 + 144;

    it.each<[string, EffectKind, Uint8Array, string]>([
      ['a truncated payload', 'projectile', projectile.subarray(0, -1), 'payload'],
      ['a trailing byte', 'projectile', Uint8Array.of(...projectile, 0), 'payload'],
      ['no records', 'projectile', set16(projectile, 0, 0), 'payload.records'],
      ['65 records', 'projectile', set16(projectile, 0, EFFECT_LIMITS.effectRecords + 1), 'payload.records'],
      ['a face of more corners than vertices', 'projectile', set32(projectile, T0_FACES, 5), 'payload.templates[0].faces'],
      ['a face of 2 corners', 'projectile', set32(projectile, T0_FACES, 2), 'payload.templates[0].faces'],
      ['a vertex index equal to the vertex count', 'projectile', set32(projectile, T0_FACES + 4, 4), 'payload.templates[0].faces'],
      ['a face list without its end marker', 'projectile', set32(projectile, T0_FACES + 36, 3), 'payload.templates[0].faces'],
      ['a NaN vertex', 'projectile', set32(projectile, T0_VERTICES + 8, NAN), 'payload.templates[0].vertices'],
      ['an infinite length constant', 'projectile', setF64(projectile, T0_CONSTANT, Infinity), 'payload.templates[0].lengthConstant'],
      ['an infinite width', 'projectile', set32(projectile, RECORDS + 4, INFINITY), 'payload.records[0].width'],
      ['a NaN colour', 'projectile', set32(projectile, RECORDS + 24 + 16, NAN), 'payload.records[1].colour[1]'],
      ['an empty texture ID', 'missile', set8(missile.slice(), 0, 0), 'payload.texture'],
      ['a model as texture', 'missile', Uint8Array.of(...missile.subarray(0, 1), ...[...'model'].map(c => c.charCodeAt(0)), ...missile.subarray(6)), 'payload.texture'],
      ['no missile types', 'missile', set16(missile, TYPE_COUNT, 0), 'payload.types'],
      ['33 missile types', 'missile', set16(missile, TYPE_COUNT, EFFECT_LIMITS.missileTypes + 1), 'payload.types'],
      ['an extra face beyond its 3 vertices', 'missile', set32(missile, EXTRA_FACES + 12, 3), 'payload.faces.extra'],
      ['a NaN constant', 'missile', setF64(missile, CONSTANTS + 8, NaN), 'payload.constants.bodyAngle'],
      ['a NaN rotation scale', 'missile', setF64(missile, ROTATION_SCALE, NaN), 'payload.rotationScale'],
      ['a truncated missile', 'missile', missile.subarray(0, -1), 'payload'],
      ['a truncated mapping multiplier', 'debris', debris.subarray(0, -1), 'payload'],
      ['an infinite mapping multiplier', 'debris', setF64(debris, debris.length - 8, Infinity), 'payload.mappingMultiplier'],
      ['a NaN mapping multiplier', 'debris', setF64(debris, debris.length - 8, NaN), 'payload.mappingMultiplier'],
      ['an infinite extra colour', 'missile', set32(missile, EXTRA_COLOUR, INFINITY), 'payload.extraColour[0]'],
      ['no parts', 'missile', set32(missile, TYPE_0, 0), 'payload.types[0].parts'],
      ['5 parts', 'missile', set32(missile, TYPE_0, 5), 'payload.types[0].parts'],
      ['2 segments', 'missile', set32(missile, TYPE_0 + 16, 2), 'payload.types[0].body.segments'],
      ['65 segments', 'missile', set32(missile, TYPE_0 + 16, EFFECT_LIMITS.ringSegments + 1), 'payload.types[0].body.segments'],
      ['a 25-bit body colour', 'missile', set32(missile, TYPE_0 + 20, 0x100_0000), 'payload.types[0].body.colour'],
      ['a NaN flag', 'missile', set32(missile, TYPE_0 + 36, NAN), 'payload.types[0].flag'],
      ['a 25-bit fin colour', 'missile', set32(missile, TYPE_1 + 24 + 16, 0x100_0000), 'payload.types[1].fins[0].colour'],
      ['a NaN debris vertex', 'debris', set32(debris, D0_VERTICES, NAN), 'payload.templates[0].vertices'],
      ['a debris face beyond its 6 vertices', 'debris', set32(debris, D1_FACES + 4, 6), 'payload.templates[1].faces'],
      ['a debris face beyond its 6 normals', 'debris', set32(debris, D1_FACES + 8, 6), 'payload.templates[1].faces'],
      ['a debris face that ends inside a pair', 'debris', set32(debris, D1_FACES + 44, 4), 'payload.templates[1].faces'],
      ['an infinite scale', 'debris', set32(debris, SCALES + 8, INFINITY), 'payload.untexturedScales[2]'],
      ['a NaN textured colour', 'debris', set32(debris, SCALES + 32, NAN), 'payload.texturedColour[0]'],
    ])('rejects %s', (_, kind, bytes, path) => expectContractError(() => readEffectPayload(bytes, 2, kind), 'invalid-effect-payload', path));

    it('keeps per-vertex words that are not finite floats', () => {
      expect(readEffectPayload(debris, 2, 'debris').templates[0].perVertex[3]).toBe(0x7fc0_0001);
    });

    it('rejects other schemas, kinds and inputs', () => {
      for (const kind of KINDS) expectContractError(() => readEffectPayload(encodeEffectPayload(PAYLOADS[kind]()), 1, kind), 'unsupported-payload-schema', 'payload.schemaVersion');
      expectContractError(() => readEffectPayload(projectile, 2, 'laser' as EffectKind), 'invalid-effect-payload', 'payload.kind');
      expectContractError(() => readEffectPayload([...projectile], 2, 'projectile'), 'invalid-effect-payload', 'payload');
      const moved = projectile.slice();
      structuredClone(moved.buffer, { transfer: [moved.buffer] });
      expectContractError(() => readEffectPayload(moved, 2, 'projectile'), 'payload-detached', 'payload');
    });
  });

  describe('encoder', () => {
    const projectile = syntheticProjectile();
    const [template] = projectile.templates;
    const missile = syntheticMissile();
    const [type] = missile.types;

    it.each<[string, unknown, string]>([
      ['an unknown kind', { ...projectile, kind: 'laser' }, 'effect.kind'],
      ['a width that is not a 32-bit float', { ...projectile, records: [{ ...projectile.records[0], width: 0.1 }] }, 'effect.records[0].width'],
      ['65 records', { ...projectile, records: Array(65).fill(projectile.records[0]) }, 'effect.records'],
      ['a selector beyond 32 bits', { ...projectile, records: [{ ...projectile.records[0], selector: 2 ** 32 }] }, 'effect.records[0].selector'],
      ['a two-channel colour', { ...projectile, records: [{ ...projectile.records[0], colour: [1, 2] }] }, 'effect.records[0].colour'],
      ['a holey record list', { ...projectile, records: [, projectile.records[0]] }, 'effect.records'], // eslint-disable-line no-sparse-arrays
      ['five width markers', { ...projectile, templates: [{ ...template, widthMarkers: new Uint32Array(5) }, template] }, 'effect.templates[0].widthMarkers'],
      ['a negative length marker', { ...projectile, templates: [template, { ...template, lengthMarker: -1 }] }, 'effect.templates[1].lengthMarker'],
      ['vertices as a plain array', { ...projectile, templates: [{ ...template, vertices: [...template.vertices] }, template] }, 'effect.templates[0].vertices'],
      ['words after the end marker', { ...projectile, templates: [{ ...template, faces: Uint32Array.of(3, 0, 1, 2, 0, 0) }, template] }, 'effect.templates[0].faces'],
      ['an empty face list', { ...projectile, templates: [{ ...template, faces: Uint32Array.of(0) }, template] }, 'effect.templates[0].faces'],
      ['a non-image texture', { ...missile, texture: 'sound/synthetic' }, 'effect.texture'],
      ['fins that do not match the parts', { ...missile, types: [{ ...type, parts: 2 }] }, 'effect.types[0].fins'],
      ['an infinite constant', { ...missile, constants: { ...missile.constants, extraStep: Infinity } }, 'effect.constants.extraStep'],
      ['a missing constant', { ...missile, constants: { ...missile.constants, extraStep: undefined } }, 'effect.constants.extraStep'],
      ['a missing mapping multiplier', { ...syntheticDebris(), mappingMultiplier: undefined }, 'effect.mappingMultiplier'],
      ['fractional segments', { ...missile, types: [{ ...type, body: { ...type.body, segments: 3.5 } }] }, 'effect.types[0].body.segments'],
      ['33 types', { ...missile, types: Array(33).fill(type) }, 'effect.types'],
      ['four textured scales', { ...syntheticDebris(), texturedScales: [1, 2, 3, 4] }, 'effect.texturedScales'],
      ['a short per-vertex list', { ...syntheticDebris(), templates: [{ ...syntheticDebris().templates[0], perVertex: new Uint32Array(17) }, syntheticDebris().templates[1]] }, 'effect.templates[0].perVertex'],
    ])('rejects %s', (_, input, path) => expectContractError(() => encodeEffectPayload(input as EffectPayload), 'invalid-effect-payload', path));

    it('accepts face lists up to the u16 word count and rejects longer ones', () => {
      /** `quads` quadrilaterals and `triangles` triangles on vertices 0–2 of the 6-vertex element, then the end marker. */
      const faces = (quads: number, triangles: number) =>
        Uint32Array.of(...Array.from({ length: quads }, () => [4, 0, 1, 2, 1]).flat(), ...Array.from({ length: triangles }, () => [3, 0, 1, 2]).flat(), 0);
      const longest = faces(2, 16_381);
      expect(longest).toHaveLength(MAX_FACE_WORDS);
      const accepted = { ...missile, faces: { ...missile.faces, element: longest } };
      expect(readEffectPayload(encodeEffectPayload(accepted), 2, 'missile').faces.element).toEqual(longest);
      expectContractError(() => encodeEffectPayload({ ...missile, faces: { ...missile.faces, element: faces(0, 16_384) } }),
        'invalid-effect-payload', 'effect.faces.element');
    });

    it('rejects transferred arrays', () => {
      const faces = Uint32Array.of(3, 0, 1, 2, 0);
      structuredClone(faces.buffer, { transfer: [faces.buffer] });
      expectContractError(() => encodeEffectPayload({ ...missile, faces: { ...missile.faces, extra: faces } }), 'payload-detached', 'effect.faces.extra');
    });
  });
});

describe('effect payload binding', () => {
  function descriptor(kind: 'data' | 'model', role: string, dependencies: readonly string[]): AssetDescriptor {
    return {
      id: readAssetId(`${kind}/synthetic`), kind, role, group: 'models',
      dependencies: dependencies.map(id => ({ kind: 'image' as const, id: readAssetId(id) })),
      payloadIdentity: { schemaVersion: 1, byteLength: 0, fingerprint: `sha256:${'0'.repeat(64)}` } as AssetDescriptor['payloadIdentity'],
    };
  }

  it('accepts data descriptors of the payload role whose dependencies are exactly its images', () => {
    expect(effectReferences(syntheticProjectile())).toEqual([]);
    expect(effectReferences(syntheticMissile())).toEqual([{ id: MISSILE_TEXTURE, kind: 'image' }]);
    expect(() => checkEffectBinding(descriptor('data', 'projectile', []), syntheticProjectile())).not.toThrow();
    expect(() => checkEffectBinding(descriptor('data', 'missile', [MISSILE_TEXTURE]), syntheticMissile())).not.toThrow();
    expect(() => checkEffectBinding(descriptor('data', 'debris', [DEBRIS_TEXTURE]), syntheticDebris())).not.toThrow();
  });

  it.each<[string, AssetDescriptor, EffectPayload, string]>([
    ['a model descriptor', descriptor('model', 'projectile', []), syntheticProjectile(), 'asset.kind'],
    ['another role', descriptor('data', 'missile', [DEBRIS_TEXTURE]), syntheticDebris(), 'asset.role'],
    ['a projectile with an image', descriptor('data', 'projectile', [MISSILE_TEXTURE]), syntheticProjectile(), 'asset.dependencies'],
    ['a missile without its image', descriptor('data', 'missile', []), syntheticMissile(), 'asset.dependencies'],
    ['debris with another image', descriptor('data', 'debris', [MISSILE_TEXTURE]), syntheticDebris(), 'asset.dependencies'],
  ])('rejects %s', (_, asset, payload, path) => expectContractError(() => checkEffectBinding(asset, payload), 'binding-mismatch', path));
});
