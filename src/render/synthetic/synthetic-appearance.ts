/**
 * Synthetic look of the P1 demo: one shared, unlit geometry and material per entity kind, built
 * in code. The shapes and colours are invented engineering values, not original-game assets; P2
 * replaces them with Asset ID mappings. Contract: docs/plan/p1/07/spec.md "合成外观表".
 */
import { BoxGeometry, MeshBasicMaterial, OctahedronGeometry, type BufferGeometry } from 'three';
import type { SyntheticEntityKind } from './synthetic-render-frame.ts';

/** Frame background inside the 4:3 view; the letterbox around it is the container's black. */
export const SYNTHETIC_BACKGROUND_COLOR = 0x102040;
export const SYNTHETIC_KIND_COLORS: Readonly<Record<SyntheticEntityKind, number>> = Object.freeze({
  mover: 0xffd040,
  marker: 0x40ff80,
});

export interface SyntheticKindAppearance {
  readonly geometry: BufferGeometry;
  readonly material: MeshBasicMaterial;
}

export type SyntheticAppearance = Readonly<Record<SyntheticEntityKind, SyntheticKindAppearance>>;

export function createSyntheticAppearance(): SyntheticAppearance {
  const kind = (geometry: BufferGeometry, color: number): SyntheticKindAppearance =>
    Object.freeze({ geometry, material: new MeshBasicMaterial({ color }) });
  return Object.freeze({
    mover: kind(new BoxGeometry(1.2, 0.6, 0.8), SYNTHETIC_KIND_COLORS.mover),
    marker: kind(new OctahedronGeometry(0.45), SYNTHETIC_KIND_COLORS.marker),
  });
}

/** Disposes every shared geometry and material once, attempting all; returns their failures. */
export function disposeSyntheticAppearance(appearance: SyntheticAppearance): unknown[] {
  const errors: unknown[] = [];
  for (const { geometry, material } of Object.values(appearance)) {
    for (const resource of [geometry, material]) {
      try { resource.dispose(); } catch (cause) { errors.push(cause); }
    }
  }
  return errors;
}
