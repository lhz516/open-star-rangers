import type { AssetId } from '../asset-id.ts';
import {
  EFFECT_SHAPES as S, faceList, faceTriangles, invalid, projectileTemplate,
  type DebrisTemplate, type DebrisVisuals, type EffectColour, type EffectPayload, type MissileVisuals, type ProjectileVisuals,
} from './effect-payload.ts';

// Expansion of effect payloads by the builder rules in docs/original/formats/executable.md (effect geometry data).
// Arithmetic is in 64-bit floats; every result component is rounded to 32 bits once, at the end. No normals, shading
// or texture coordinates are produced.

/** Raw parameters of the missile element's texture rotations; how they become coordinates is not traced yet. */
export interface EffectMapping {
  readonly rotationStep: number;
  readonly rotationScale: number;
}

export interface EffectShape {
  /** x, y, z per vertex. */
  readonly positions: Float32Array;
  /** Vertex indices of each face, 3 corners up to the shape's vertex count, in source order. */
  readonly faces: readonly (readonly number[])[];
  /** Three floats in the builder's argument order, or null when the builder sets no colour. */
  readonly colour: EffectColour | null;
  readonly texture: AssetId | null;
  /** Debris only: the template's per-vertex words, unchanged. */
  readonly perVertex: Uint32Array | null;
  /** Missile element only. */
  readonly mapping: EffectMapping | null;
}

export interface MissileVisual {
  /** The body, then its fins. */
  readonly parts: readonly EffectShape[];
  readonly element: EffectShape;
  readonly extra: EffectShape | null;
}

export interface DebrisShapes {
  /** One per untextured scale. */
  readonly untextured: readonly EffectShape[];
  /** One per textured scale. */
  readonly textured: readonly EffectShape[];
}

export interface ExpansionSize {
  readonly vertices: number;
  /** Corners − 2 per face, as a consumer triangulates them. */
  readonly triangles: number;
}

/** Face lists of a shape, parsed once and shared by every shape built from the same list. */
type Faces = EffectShape['faces'];

const f32Bits = (() => {
  const floats = new Float32Array(1);
  const bits = new Uint32Array(floats.buffer);
  return (value: number): number => {
    floats[0] = value;
    return bits[0];
  };
})();

/** A frozen copy of a colour rounded to 32 bits, or null; a non-finite channel is `invalid-effect-payload`. */
function roundColour(colour: EffectColour | null, path: string): EffectColour | null {
  if (colour === null) return null;
  const [red, green, blue] = colour.map(Math.fround);
  if (![red, green, blue].every(Number.isFinite)) invalid(`${path}.colour`, 'must expand to finite values');
  return Object.freeze([red, green, blue] as const);
}

/**
 * A frozen shape from x, y, z coordinates computed in 64 bits, rounded to 32 bits here, and faces already checked
 * against them. A non-finite coordinate is `invalid-effect-payload`.
 */
function shape(
  coordinates: readonly number[], faces: Faces, path: string,
  { colour = null, texture = null, perVertex = null, mapping = null }: Partial<Pick<EffectShape, 'colour' | 'texture' | 'perVertex' | 'mapping'>> = {},
): EffectShape {
  const positions = Float32Array.from(coordinates);
  if (!positions.every(Number.isFinite)) invalid(`${path}.positions`, 'must expand to finite values');
  return Object.freeze({ positions, faces, colour: roundColour(colour, path), texture, perVertex: perVertex?.slice() ?? null, mapping });
}

/** The coordinates `point` gives at angles 0, step, 2 × step, …, with the angle accumulated by addition. */
function ring(count: number, step: number, point: (cos: number, sin: number) => readonly number[]): number[] {
  const coordinates: number[] = [];
  let angle = 0;
  for (let index = 0; index < count; index++, angle += step) coordinates.push(...point(Math.cos(angle), Math.sin(angle)));
  return coordinates;
}

/** The body's quadrilaterals (2j, 2j + 2, 2j + 3, 2j + 1), each index modulo 2n. */
function ringFaces(segments: number): Faces {
  const wrap = (index: number) => index % (2 * segments);
  return Object.freeze(Array.from({ length: segments }, (_, j) => Object.freeze([2 * j, wrap(2 * j + 2), wrap(2 * j + 3), 2 * j + 1])));
}

/** A packed colour's bits 16–23, 8–15 and 0–7, each times `scale`. */
const packedColour = (packed: number, scale: number): EffectColour => [(packed >>> 16) * scale, ((packed >>> 8) & 0xff) * scale, (packed & 0xff) * scale];

/** One shape per record, in record order. */
export function expandProjectiles(payload: ProjectileVisuals, path = 'payload'): readonly EffectShape[] {
  const faces = payload.templates.map((template, index) => faceList(template.faces, S.projectileVertices, 0, `${path}.templates[${index}].faces`));
  return Object.freeze(payload.records.map((record, index) => {
    const which = projectileTemplate(record.selector);
    const template = payload.templates[which];
    const coordinates = Array.from(template.vertices, (value, component) => {
      const axis = component % 3;
      const bits = f32Bits(value);
      const widened = bits === template.widthMarkers[axis * 2] || bits === template.widthMarkers[axis * 2 + 1] ? Math.fround(value * record.width) : value;
      return axis === 2 && f32Bits(widened) === template.lengthMarker ? widened * (record.length * template.lengthConstant) : widened;
    });
    return shape(coordinates, faces[which], `${path}.records[${index}]`, { colour: record.colour });
  }));
}

/** The body, fins, element and optional extra element of each missile type, in type order. */
export function expandMissiles(payload: MissileVisuals, path = 'payload'): readonly MissileVisual[] {
  const { constants: c, faces: words } = payload;
  const faces = {
    fin: faceList(words.fin, S.finVertices, 0, `${path}.faces.fin`),
    element: faceList(words.element, S.elementVertices, 0, `${path}.faces.element`),
    flaggedElement: faceList(words.flaggedElement, S.elementVertices, 0, `${path}.faces.flaggedElement`),
    extra: faceList(words.extra, S.extraVertices, 0, `${path}.faces.extra`),
  };
  const mapping = Object.freeze({ rotationStep: c.rotationStep, rotationScale: payload.rotationScale });
  return Object.freeze(payload.types.map((type, index) => {
    const at = `${path}.types[${index}]`;
    const { r0, r1, length, segments } = type.body;
    const body = shape(
      ring(segments, c.bodyAngle / segments, (cos, sin) => [r0 * cos, r0 * sin, 0, r1 * cos, r1 * sin, length]),
      ringFaces(segments), `${at}.body`, { colour: packedColour(type.body.colour, c.bodyColourScale) },
    );
    const fins = type.fins.map(({ params: [p0, p1, p2, p3], colour }, fin) => shape([
      0, 0, p2 + p3,
      p0, 0, p3, -p0, 0, p3, 0, p0, p3, 0, -p0, p3,
      p1, 0, p3, -p1, 0, p3, 0, p1, p3, 0, -p1, p3,
    ], faces.fin, `${at}.fins[${fin}]`, { colour: packedColour(colour, c.finColourScale) }));
    const [e0, e1, e2] = type.element;
    const element = shape(
      ring(S.elementVertices / 2, c.elementStep, (cos, sin) => [e0 * cos, e0 * sin, 0, e1 * cos, e1 * sin, -e2]),
      type.flag === 0 ? faces.element : faces.flaggedElement, `${at}.element`, { texture: payload.texture, mapping },
    );
    // The extra element exists when the flag's bits are not zero, so a negative zero flag adds it too.
    let extra: EffectShape | null = null;
    if (!Object.is(type.flag, 0)) {
      const z = -e2 + c.extraOffset;
      const radius = e0 + (-z * (e1 - e0)) / e2;
      extra = shape(ring(S.extraVertices, c.extraStep, (cos, sin) => [radius * cos, radius * sin, z]), faces.extra, `${at}.extra`, { colour: payload.extraColour });
    }
    return Object.freeze({ parts: Object.freeze([body, ...fins]), element, extra });
  }));
}

/** The untextured shapes at each untextured scale and the textured shapes at each textured scale. */
export function expandDebris(payload: DebrisVisuals, path = 'payload'): DebrisShapes {
  const shapes = (template: DebrisTemplate, scales: readonly number[], name: string, colour: EffectColour, texture: AssetId | null) => {
    const faces = faceList(template.faces, S.debrisVertices, S.debrisNormals, `${path}.templates[${name === 'untextured' ? 0 : 1}].faces`);
    return Object.freeze(scales.map((scale, index) =>
      shape(Array.from(template.vertices, value => value * scale), faces, `${path}.${name}[${index}]`, { colour, texture, perVertex: template.perVertex })));
  };
  const [plain, textured] = payload.templates;
  return Object.freeze({
    untextured: shapes(plain, payload.untexturedScales, 'untextured', payload.untexturedColour, null),
    textured: shapes(textured, payload.texturedScales, 'textured', payload.texturedColour, payload.texture),
  });
}

/** The vertices and triangles a payload expands to, computed from its counts and face lists without expanding it. */
export function effectExpansionSize(payload: EffectPayload, path = 'payload'): ExpansionSize {
  switch (payload.kind) {
    case 'projectile': {
      const perTemplate = payload.templates.map(({ faces }, index) => faceTriangles(faces, S.projectileVertices, 0, `${path}.templates[${index}].faces`));
      return Object.freeze({
        vertices: payload.records.length * S.projectileVertices,
        triangles: payload.records.reduce((sum, { selector }) => sum + perTemplate[projectileTemplate(selector)], 0),
      });
    }
    case 'missile': {
      const { faces } = payload;
      const fin = faceTriangles(faces.fin, S.finVertices, 0, `${path}.faces.fin`);
      const element = faceTriangles(faces.element, S.elementVertices, 0, `${path}.faces.element`);
      const flagged = faceTriangles(faces.flaggedElement, S.elementVertices, 0, `${path}.faces.flaggedElement`);
      const extra = faceTriangles(faces.extra, S.extraVertices, 0, `${path}.faces.extra`);
      return Object.freeze(payload.types.reduce((size, { body, fins, flag }) => {
        const hasExtra = !Object.is(flag, 0);
        return {
          vertices: size.vertices + 2 * body.segments + fins.length * S.finVertices + S.elementVertices + (hasExtra ? S.extraVertices : 0),
          triangles: size.triangles + 2 * body.segments + fins.length * fin + (flag === 0 ? element : flagged) + (hasExtra ? extra : 0),
        };
      }, { vertices: 0, triangles: 0 }));
    }
    case 'debris': {
      const [plain, textured] = payload.templates.map(({ faces }, index) => faceTriangles(faces, S.debrisVertices, S.debrisNormals, `${path}.templates[${index}].faces`));
      return Object.freeze({
        vertices: (S.untexturedScales + S.texturedScales) * S.debrisVertices,
        triangles: S.untexturedScales * plain + S.texturedScales * textured,
      });
    }
  }
}
