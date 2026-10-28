import type { AssetId } from '../../../content/asset-id.ts';
import type { ImagePayload } from '../../../content/graphics/image-payload.ts';
import { HUD_TEXT_KEYS, readHudText } from '../../../content/hud/hud-text-payload.ts';
import { syntheticHudText } from '../../../content/hud/hud-text.test-support.ts';
import type { CockpitInstruments, InclusiveRectangle, InstrumentRecord } from '../../../content/hud/instruments-payload.ts';
import type { ModelGeometry, ModelPayload } from '../../../content/models/model-payload.ts';
import type { CombatPlayer, CombatTarget, MotionPlayer, Projection } from '../../../core/projections/projection.ts';
import type { Matrix3, NameReference } from '../../../core/world/entity-table.ts';
import { createDisplayInterference } from '../interference/display-interference.ts';
import { interferenceFrames, regularFont, syntheticImage, syntheticPlayer } from '../left-display/left-display.test-support.ts';
import { cockpitContent, type DeepPartial } from '../presentation/cockpit.test-support.ts';
import { createTargetDisplay, type TargetDisplayInput, type TargetDisplayModule, type TargetDisplayText } from './target-display.ts';

// Code-generated synthetic content for the right display; never original data. The target is a flat 10 × 4 rectangle
// in its model's z = 0 plane, the player straight behind it on −z, so with view distance 25 its silhouette covers device
// columns 30–69 and rows 42–57 exactly (sx = 50 + 4x, sy = 50 − 4y).

/** The display rectangle of the HI record (hud §4.5): 96 × 97 at (491, 346). */
export const RECT = Object.freeze({ x0: 491, y0: 346, x1: 586, y1: 442 });

/** Slot 0's type-7 record at `RECT` with `interval` (0: every logical display). */
export function targetContent(interval = 0, rectangle: InclusiveRectangle = RECT): CockpitInstruments {
  return cockpitContent((content) => {
    const record = content.slots[0].instruments.find(({ type }) => type === 7)!;
    record.rectangle = { ...rectangle };
    record.redrawInterval = interval;
  });
}

export const targetRecord = (content: CockpitInstruments): InstrumentRecord => content.slots[0].instruments.find(({ type }) => type === 7)!;

export const IDENTITY = Object.freeze([1, 0, 0, 0, 1, 0, 0, 0, 1]) as unknown as Matrix3;
export const MODEL_ID = 'model/synthetic-target' as AssetId;

/** Background texel (x, y): 0x80 + (x + 2y) mod 64, so every stretched column and row is identifiable. */
export const backgroundTexel = (x: number, y: number): number => 0x80 + ((x + 2 * y) % 64);
export const targetBackground = (): ImagePayload => syntheticImage(96, 96, backgroundTexel);

/** A flat rectangle of half-width `w` and half-height `h` in the z = 0 plane, two triangles clockwise as seen from −z. */
export function rectangleGeometry(w = 5, h = 2): ModelGeometry {
  return {
    positions: Float32Array.of(-w, h, 0, w, h, 0, w, -h, 0, -w, -h, 0),
    uvs: new Float32Array(8),
    normals: new Float32Array(12),
    indices: Uint16Array.of(0, 1, 2, 0, 2, 3),
    cornerShading: new Uint16Array(6),
    shadingSlotCount: 1,
  };
}

/** A model whose list 0 holds one part per geometry; lists 1 and 2 are ignored by the display. */
export function syntheticModel(geometries: readonly ModelGeometry[] = [rectangleGeometry()]): ModelPayload {
  const part = (geometry: number) => Object.freeze({ sourceFlags: 2, colour: [1, 2, 3] as const, geometry, texture: null });
  return Object.freeze({
    kind: 'model',
    geometries: Object.freeze([...geometries]),
    partLists: Object.freeze([Object.freeze(geometries.map((_, index) => part(index))), Object.freeze([]), Object.freeze([part(0)])]) as unknown as ModelPayload['partLists'],
    soundSlots: Object.freeze([null, null, null, null, null]) as unknown as ModelPayload['soundSlots'],
  });
}

const TEXT_KEYS: readonly (keyof TargetDisplayText)[] = [
  'targetWarpNotice', 'targetNone', 'targetDistance', 'targetDistanceScaled', 'targetBlockValue', 'targetCraftPercent',
  'targetCraftValueScaledTwice', 'targetCraftValueScaledOnce', 'targetMarkerBlockValue', 'targetMarkerCraftPercent',
  'targetMarkerCraftValue', 'mapMarkerName',
];

/** The display's synthetic texts: `t<schema position>` plus the key's conversions (for example `t2 %.0f`). */
export function targetText(): TargetDisplayText {
  const { entries } = readHudText(syntheticHudText('t'));
  return Object.freeze(Object.fromEntries(TEXT_KEYS.map((key) => [key, entries[key]]))) as TargetDisplayText;
}

/** The synthetic text of `key` (`t` and its schema position, then its conversions). */
export const textOf = (key: keyof TargetDisplayText): string => targetText()[key];
export const keyPosition = (key: keyof TargetDisplayText): number => HUD_TEXT_KEYS.indexOf(key);

/** Names by pool index: `n<index>`. */
export const syntheticNames = (name: NameReference): string => (name.type === 'pool' ? `n${name.index}` : '');

export function targetDisplayInput(patch: Partial<TargetDisplayInput> = {}): TargetDisplayInput {
  return {
    font: regularFont(),
    background: targetBackground(),
    palettes: new Map(),
    hudText: targetText(),
    interference: createDisplayInterference(interferenceFrames()),
    models: new Map([[MODEL_ID, syntheticModel()]]),
    names: syntheticNames,
    ...patch,
  };
}

export const createSyntheticTargetDisplay = (patch: Partial<TargetDisplayInput> = {}): TargetDisplayModule => createTargetDisplay(targetDisplayInput(patch));

/** A craft target 100 units ahead of the player on +z (kind bit 1, view distance 25 in the synthetic table). */
export function syntheticTarget(patch: Partial<CombatTarget> = {}): CombatTarget {
  return Object.freeze({
    entityId: 7,
    kindBit: 1,
    name: Object.freeze({ type: 'pool', index: 3 }),
    position: Object.freeze({ x: 0, y: 0, z: 0 }),
    orientation: IDENTITY,
    distance: 100,
    speed: 42.5,
    shield: Object.freeze({ current: 800, maximum: 1000 }),
    model: MODEL_ID,
    craftAt08: 123_456,
    ...patch,
  }) as CombatTarget;
}

/** The kind-25 map marker as a target. */
export const markerTarget = (patch: Partial<CombatTarget> = {}): CombatTarget => syntheticTarget({
  entityId: 9, kindBit: 25, name: Object.freeze({ type: 'map-marker' }), speed: null, shield: null, model: null, craftAt08: null, ...patch,
});

/** The player's motion: at (0, 0, −distance) looking along +z unless `orientation` says otherwise. */
export const motionPlayer = (distance = 100, orientation: Matrix3 = IDENTITY): MotionPlayer =>
  ({ entityId: 1, position: { x: 0, y: 0, z: -distance }, orientation }) as unknown as MotionPlayer;

export type Fields = Partial<Record<number, 0 | 1 | 2 | 3>>;
export const subsystems = (values: Fields = {}): CombatPlayer['subsystems'] =>
  Array.from({ length: 19 }, (_, field) => values[field] ?? 0) as unknown as CombatPlayer['subsystems'];

/** The projection patch with a player whose target is `target` (no player when null) and its motion. */
export function withTarget(target: CombatTarget | null | undefined, { fields = {}, motion = motionPlayer(target?.distance ?? 100), player = {} }: {
  readonly fields?: Fields;
  readonly motion?: MotionPlayer;
  readonly player?: Partial<CombatPlayer>;
} = {}): DeepPartial<Projection> {
  const combat = target === undefined ? null : syntheticPlayer({ target, subsystems: subsystems(fields), ...player });
  return { flight: { motion: { player: combat === null ? null : motion }, combat: { player: combat } } } as DeepPartial<Projection>;
}

/** The device of a render from the recorded rules: the stretched background, `colour` over the inclusive box [c0, r0, c1, r1]. */
export function expectedDevice(box: readonly [number, number, number, number] | null = null, colour = 0x10): Uint8Array {
  const size = 100;
  const device = new Uint8Array(size * size);
  for (let v = 0; v < size; v++) for (let u = 0; u < size; u++) device[v * size + u] = backgroundTexel(Math.floor((96 * u) / 100), Math.floor((96 * v) / 100));
  if (box !== null) {
    const [c0, r0, c1, r1] = box;
    for (let v = r0; v <= r1; v++) device.fill(colour, v * size + c0, v * size + c1 + 1);
  }
  return device;
}

/** The synthetic rectangle's silhouette with the player straight behind: device columns 30–69, rows 42–57. */
export const WIDE: readonly [number, number, number, number] = Object.freeze([30, 42, 69, 57]);
