import { addBudgets, EMPTY_BUDGET_USAGE, type BudgetRecord } from '../../content/budget.ts';
import {
  effectPayloadLength, effectReferences, MISSILE_CONSTANTS,
  type DebrisVisuals, type EffectPayload, type MissileType, type MissileVisuals, type ProjectileVisuals,
} from '../../content/effects/effect-payload.ts';
import { bitsOf } from '../../content/effects/effects.test-support.ts';
import { effectExpansionSize } from '../../content/effects/expand-effects.ts';
import { syntheticLeExecutable, type SyntheticEntry } from '../synthetic.test-support.ts';
import { MISSILE_RECORD_BYTES } from './effect-declarations.ts';
import { PRODUCTION_EFFECT_DECLARATIONS, PRODUCTION_EFFECT_REGIONS, PRODUCTION_RENS_ENTRY } from './production-effects.ts';
import { PRODUCTION_GRAPHICS_REGION_WRITES } from './production-graphics.test-support.ts';

// Synthetic effect sources at the production RENS entry and executable regions, generated in code from arbitrary
// values; never original data. The expected payloads come first and are written into the regions their uses name, so
// the effect step must read them back exactly.

/** A face list of `quads` quadrilaterals and `triangles` triangles over vertices 0 to `vertices` − 1, ending with 0. */
function faces(quads: number, triangles: number, vertices: number): Uint32Array {
  const corner = (face: number, index: number) => (face * 2 + index) % vertices;
  return Uint32Array.of(
    ...Array.from({ length: quads }, (_, face) => [4, corner(face, 0), corner(face, 1), corner(face, 2), corner(face, 3)]).flat(),
    ...Array.from({ length: triangles }, (_, face) => [3, corner(face + quads, 0), corner(face + quads, 2), corner(face + quads, 1)]).flat(),
    0,
  );
}

/** `count` arbitrary finite 32-bit floats, including a negative zero and a subnormal. */
const floats = (count: number, seed: number) => Float32Array.from({ length: count }, (_, index) =>
  index === 1 ? -0 : index === 2 ? Math.fround(2.5e-44) : Math.fround(((index * 7 + seed) % 23) / 8 - 1.375));

/** The projectile payload: production face lists hold 17 words, so 4 triangles each. */
export function syntheticProjectileSource(): ProjectileVisuals {
  const template = (seed: number) => Object.freeze({
    faces: faces(0, 4, 4),
    vertices: floats(12, seed),
    widthMarkers: Uint32Array.from({ length: 6 }, (_, index) => 0x1234_0000 + seed * 16 + index),
    lengthMarker: 0x8765_4321 + seed,
    lengthConstant: seed / 3,
  });
  return {
    kind: 'projectile',
    templates: [template(1), template(2)],
    records: Array.from({ length: 5 }, (_, index) => ({
      selector: index === 3 ? 0xffff_fffe : 0,
      width: Math.fround(0.375 * (index + 1)),
      length: Math.fround(-1.25 + index),
      colour: [Math.fround(index / 5), -0, Math.fround(3.125 - index)] as const,
    })),
  };
}

/** Nine missile types, as the production table region holds, with every part count and flag kind. */
export function syntheticMissileSource(): MissileVisuals {
  const type = (index: number): MissileType => {
    const parts = 1 + (index % 4);
    return {
      parts,
      body: { r0: Math.fround(0.5 + index / 8), r1: Math.fround(0.25 * index), length: Math.fround(6 - index), segments: 3 + index * 7, colour: (index * 0x01_2345) & 0xff_ffff },
      fins: Array.from({ length: parts - 1 }, (_, fin) => ({
        params: [Math.fround(0.125 * (fin + 1)), Math.fround(-0.5 * index), Math.fround(fin), Math.fround(1.75)] as const,
        colour: 0x10_2030 * (fin + 1),
      })),
      element: [Math.fround(0.625 + index), Math.fround(0.375), Math.fround(index === 4 ? 0 : 2.5 - index / 4)] as const,
      flag: [0, -0, 1.5, Math.fround(-2.75)][index % 4],
    };
  };
  return {
    kind: 'missile',
    texture: PRODUCTION_EFFECT_DECLARATIONS.find(({ role }) => role === 'missile')!.texture!,
    types: Array.from({ length: 9 }, (_, index) => type(index)),
    // Production face lists hold 49, 16, 31 and 5 words.
    faces: { fin: faces(0, 12, 9), element: faces(3, 0, 6), flaggedElement: faces(6, 0, 6), extra: faces(0, 1, 3) },
    // Every constant differs. The element step is non-zero, so the element ring is a visible surface, not one point.
    constants: {
      finColourScale: -0.1875, bodyAngle: -0.125, bodyColourScale: -0.0625, elementStep: Math.PI / 3, extraOffset: 0.0625,
      extraStep: 0.125,
    } satisfies Record<(typeof MISSILE_CONSTANTS)[number], number>,
    // A low word that an 8-bit immediate gives by sign extension.
    rotationScale: new Float64Array(Uint32Array.of(0xffff_ff80, 0x4012_3456).buffer)[0],
    // The third channel comes from an 8-bit immediate: the 32-bit float with bits 5.
    extraColour: [Math.fround(0.875), Math.fround(-3.5), floatFromBits(5)] as const,
  };
}

/**
 * The debris payload: production face lists hold 14 words, which fit exactly one hexagon of (vertex, normal) index
 * pairs; here the corners run in two different orders, their normal indices differ from the vertex indices, and
 * neither list is valid when read as plain vertex indices.
 */
export function syntheticDebrisSource(): DebrisVisuals {
  const template = (seed: number) => Object.freeze({
    faces: seed === 3
      ? Uint32Array.of(6, 0, 5, 2, 3, 4, 1, 1, 0, 3, 2, 5, 4, 0)
      : Uint32Array.of(6, 5, 0, 4, 1, 3, 2, 2, 3, 1, 4, 0, 5, 0),
    // The textured hexagon stays on one side of the cylinder seam for pixel checks.
    vertices: seed === 4 ? Float32Array.of(-1, -1, 2, -2, -0.5, 2, -2, 0.5, 2, -1, 1, 2, -0.5, 0.5, 2, -0.5, -0.5, 2) : floats(18, seed),
    perVertex: Uint32Array.from({ length: 18 }, (_, index) => (index * 0x0101_0101 + seed) >>> 0),
  });
  return {
    kind: 'debris',
    texture: PRODUCTION_EFFECT_DECLARATIONS.find(({ role }) => role === 'debris')!.texture!,
    templates: [template(3), template(4)],
    untexturedScales: [Math.fround(0.3125), Math.fround(1.0625), Math.fround(2.1875)],
    texturedScales: [Math.fround(0.4375), Math.fround(1.5625)],
    // Channels 1 and 2 come from 8-bit immediates: bits 0 and 0x7f.
    untexturedColour: [Math.fround(0.75), 0, floatFromBits(0x7f)],
    texturedColour: [Math.fround(0.5625), Math.fround(0.6875), Math.fround(0.1875)],
    mappingMultiplier: 1.625,
  };
}

const le = (size: number, write: (view: DataView) => void): Uint8Array => {
  const bytes = new Uint8Array(size);
  write(new DataView(bytes.buffer));
  return bytes;
};
const wordBytes = (words: ArrayLike<number>) => le(words.length * 4, view => Array.from(words).forEach((word, index) => view.setUint32(index * 4, word, true)));
const floatBytes = (values: ArrayLike<number>) => le(values.length * 4, view => Array.from(values).forEach((value, index) => view.setFloat32(index * 4, value, true)));
const f64Bytes = (...values: number[]) => le(values.length * 8, view => values.forEach((value, index) => view.setFloat64(index * 8, value, true)));
/** The 32-bit float with these bits. */
const floatFromBits = (bits: number): number => new Float32Array(Uint32Array.of(bits).buffer)[0];
/** An immediate operand of `length` bytes holding these 32 bits; an 8-bit one must sign-extend to them. */
function immediate(bits: number, length: number): Uint8Array {
  if (length === 4) return wordBytes([bits]);
  if ((((bits & 0xff) << 24) >> 24) >>> 0 !== bits) throw new Error('the bits do not fit an 8-bit immediate');
  return Uint8Array.of(bits & 0xff);
}

function missileTable(types: readonly MissileType[]): Uint8Array {
  return le(types.length * MISSILE_RECORD_BYTES, view => types.forEach(({ parts, body, fins, element, flag }, index) => {
    const at = index * MISSILE_RECORD_BYTES;
    view.setUint32(at, parts, true);
    // Runtime handle slots and unused fin slots hold arbitrary bytes the step ignores.
    for (let slot = 4; slot < 0x1c; slot += 4) view.setUint32(at + slot, 0xa5a5_0000 + slot, true);
    [body.r0, body.r1, body.length].forEach((value, field) => view.setFloat32(at + 0x1c + field * 4, value, true));
    view.setInt32(at + 0x28, body.segments, true);
    view.setUint32(at + 0x2c, body.colour, true);
    for (let fin = 0; fin < 3; fin++) {
      const finAt = at + 0x30 + fin * 0x14;
      if (fin >= fins.length) {
        view.setUint32(finAt + 16, 0xffff_ffff, true);
        continue;
      }
      fins[fin].params.forEach((value, field) => view.setFloat32(finAt + field * 4, value, true));
      view.setUint32(finAt + 16, fins[fin].colour, true);
    }
    [...element, flag].forEach((value, field) => view.setFloat32(at + 0x6c + field * 4, value, true));
  }));
}

/** The bytes each region use holds for a payload, at the use's production length. */
function regionBytes(payload: EffectPayload, use: string, length: number): Uint8Array {
  switch (payload.kind) {
    case 'projectile': {
      const [, template, field, , index] = /^template-(\d)-(vertices|faces|length-constant|width-marker|length-marker)(-(\d))?$/.exec(use)!;
      const t = payload.templates[Number(template)];
      return field === 'vertices' ? floatBytes(t.vertices) : field === 'faces' ? wordBytes(t.faces) : field === 'length-constant' ? f64Bytes(t.lengthConstant)
        : field === 'length-marker' ? wordBytes([t.lengthMarker]) : wordBytes([t.widthMarkers[Number(index)]]);
    }
    case 'missile': {
      const colour = /^extra-colour-(\d)$/.exec(use);
      if (colour) return immediate(bitsOf(payload.extraColour[Number(colour[1])]), length);
      const [low, high] = new Uint32Array(Float64Array.of(payload.rotationScale).buffer);
      const byUse: Record<string, () => Uint8Array> = {
        types: () => missileTable(payload.types),
        'type-count': () => wordBytes([payload.types.length]),
        'fin-faces': () => wordBytes(payload.faces.fin),
        'element-faces': () => wordBytes(payload.faces.element),
        'flagged-element-faces': () => wordBytes(payload.faces.flaggedElement),
        'extra-faces': () => wordBytes(payload.faces.extra),
        constants: () => f64Bytes(...MISSILE_CONSTANTS.map(name => payload.constants[name])),
        'rotation-scale-high': () => wordBytes([high]),
        'rotation-scale-low': () => immediate(low, length),
      };
      return byUse[use]();
    }
    case 'debris': {
      if (use === 'mapping-multiplier') return f64Bytes(payload.mappingMultiplier);
      const [, name, field] = /^(untextured|textured)-(vertices|per-vertex|faces|scale-\d|colour-\d)$/.exec(use)!;
      const textured = name === 'textured';
      const template = payload.templates[textured ? 1 : 0];
      if (field === 'vertices') return floatBytes(template.vertices);
      if (field === 'per-vertex') return wordBytes(template.perVertex);
      if (field === 'faces') return wordBytes(template.faces);
      const index = Number(field.at(-1));
      if (field.startsWith('scale')) return floatBytes([(textured ? payload.texturedScales : payload.untexturedScales)[index]]);
      return immediate(bitsOf((textured ? payload.texturedColour : payload.untexturedColour)[index]), length);
    }
  }
}

/** The synthetic payload of each production effect Asset, by Asset ID. */
export const syntheticEffectPayloads = (): ReadonlyMap<string, EffectPayload> => new Map(PRODUCTION_EFFECT_DECLARATIONS.map(({ asset, role }) =>
  [asset.id, role === 'projectile' ? syntheticProjectileSource() : role === 'missile' ? syntheticMissileSource() : syntheticDebrisSource()]));

let pristine: Uint8Array | undefined;

/**
 * A synthetic LE executable of four objects whose production regions hold `payloads` and the production graphics
 * regions `PRODUCTION_GRAPHICS_REGION_WRITES`; every other byte is a generated pattern. `edit` may change the region bytes of an Asset's use first, and `fixups` adds fixup records by page map
 * index. Object 1 is a single page. Without arguments it returns a copy of one executable built once.
 */
export function syntheticEffectExecutable(
  payloads?: ReadonlyMap<string, EffectPayload>,
  edit?: (id: string, use: string, bytes: Uint8Array) => Uint8Array,
  fixups?: Readonly<Record<number, readonly number[]>>,
): Uint8Array {
  if (payloads === undefined && edit === undefined && fixups === undefined) return (pristine ??= buildExecutable(syntheticEffectPayloads(), bytes => bytes, {})).slice();
  return buildExecutable(payloads ?? syntheticEffectPayloads(), edit ? (bytes, id, use) => edit(id, use, bytes) : bytes => bytes, fixups ?? {});
}

function buildExecutable(
  payloads: ReadonlyMap<string, EffectPayload>,
  edit: (bytes: Uint8Array, id: string, use: string) => Uint8Array,
  fixups: Readonly<Record<number, readonly number[]>>,
): Uint8Array {
  const writes = [...PRODUCTION_EFFECT_REGIONS].flatMap(([id, regions]) => regions.map(({ use, object, offset, length }) =>
    ({ object, offset, bytes: edit(regionBytes(payloads.get(id)!, use, length), id, use) })));
  // The graphics step reads its own regions of the same executable.
  writes.push(...PRODUCTION_GRAPHICS_REGION_WRITES);
  const objects = [1, 2, 3, 4].map(object => {
    const size = Math.max(16, ...writes.filter(write => write.object === object).map(({ offset, bytes }) => offset + bytes.length));
    const bytes = Uint8Array.from({ length: size }, (_, index) => (index * 13 + object) & 0xff);
    for (const write of writes.filter(candidate => candidate.object === object)) bytes.set(write.bytes, write.offset);
    return { bytes };
  });
  return syntheticLeExecutable({ objects, fixups });
}

/** The RENS entry holding the projectile records after a 96-byte header with the record table pointer and count. */
export function syntheticRensEntry(payload: ProjectileVisuals = syntheticProjectileSource(), count = payload.records.length): SyntheticEntry {
  const data = le(0x60 + payload.records.length * 28, view => {
    for (let at = 0; at < 0x58; at += 4) view.setUint32(at, 0x0102_0304 * (at + 1), true);
    view.setUint32(0x58, 0x60, true);
    view.setUint32(0x5c, count, true);
    payload.records.forEach(({ selector, width, length, colour }, index) => {
      const at = 0x60 + index * 28;
      view.setUint32(at, selector, true);
      [width, length].forEach((value, field) => view.setFloat32(at + 4 + field * 4, value, true));
      view.setUint32(at + 12, 0, true);
      colour.forEach((value, field) => view.setFloat32(at + 16 + field * 4, value, true));
    });
  });
  return { id: PRODUCTION_RENS_ENTRY, type: 'RENS', data, relocations: [0x58] };
}

/** The effect step's conversion usage on the synthetic sources, from the payload layout and expansion sizes. */
export const PRODUCTION_EFFECT_USAGE: BudgetRecord = [...syntheticEffectPayloads().values()].reduce((usage, payload) => {
  const { vertices, triangles } = effectExpansionSize(payload);
  return addBudgets(usage, {
    ...EMPTY_BUDGET_USAGE, assets: 1, dependencyEdges: effectReferences(payload).length, payloadBytes: effectPayloadLength(payload), vertices, triangles,
  }, 'usage');
}, EMPTY_BUDGET_USAGE);
