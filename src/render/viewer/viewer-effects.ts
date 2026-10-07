/**
 * Effects in the viewer (P2-11 S-07, S-09): each effect payload is listed by projectile record, missile type and debris
 * shape, and every shape's polygon faces are fanned from their first corner. Data comes only from the content
 * expansions; how a shape looks is in viewer-presentation.ts.
 */
import type { EffectPayload } from '../../content/effects/effect-payload.ts';
import { expandDebris, expandMissiles, expandProjectiles, type EffectShape } from '../../content/effects/expand-effects.ts';

export type EffectViewLabel = 'record' | 'missile-type' | 'untextured-shape' | 'textured-shape';

/** One listed view of an effect payload: a projectile record, a missile type, or one debris shape. */
export interface EffectView {
  readonly label: EffectViewLabel;
  /** Position among the views with this label. */
  readonly index: number;
  /** A missile type's body and fins, then its element and its extra element when present. */
  readonly shapes: readonly EffectShape[];
}

/** Every view of a payload in source order: records, missile types, or the untextured then the textured debris shapes. */
export function effectViews(payload: EffectPayload): readonly EffectView[] {
  const view = (label: EffectViewLabel, index: number, shapes: EffectShape[]): EffectView => Object.freeze({ label, index, shapes: Object.freeze(shapes) });
  switch (payload.kind) {
    case 'projectile':
      return Object.freeze(expandProjectiles(payload).map((shape, index) => view('record', index, [shape])));
    case 'missile':
      return Object.freeze(expandMissiles(payload).map(({ parts, element, extra }, index) =>
        view('missile-type', index, [...parts, element, ...(extra ? [extra] : [])])));
    case 'debris': {
      const { untextured, textured } = expandDebris(payload);
      return Object.freeze([
        ...untextured.map((shape, index) => view('untextured-shape', index, [shape])),
        ...textured.map((shape, index) => view('textured-shape', index, [shape])),
      ]);
    }
  }
}

/** Triangle indices of polygon faces, each fanned from its first corner: corners − 2 triangles per face. */
export function fanTriangles(faces: readonly (readonly number[])[]): Uint16Array {
  const indices: number[] = [];
  for (const face of faces) {
    for (let corner = 1; corner + 1 < face.length; corner++) indices.push(face[0], face[corner], face[corner + 1]);
  }
  return Uint16Array.from(indices);
}
