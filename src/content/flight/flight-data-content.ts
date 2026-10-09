import type { AssetReference } from '../asset-contract.ts';

// Canonical flight presentation data of the `models` group (P3-03 spec, 规范 payload): four `data` roles stored as
// canonical JSON (canonical-json.ts). Field order here is the canonical encoding order. Values keep their source values;
// what they mean and the rules that use them belong to P3-07 and P3-12. Sources and types:
// docs/original/formats/executable.md (RENS 10751 header), docs/original/formats/textures.md §6–§7 (ANIM, EXPL) and
// docs/original/formats/hud.md §3 (EXIC, NEBC).

export const FLIGHT_DATA_ROLES = Object.freeze(['scene-settings', 'explosion-table', 'explosion-animation', 'nebula-backgrounds'] as const);
export type FlightDataRole = typeof FLIGHT_DATA_ROLES[number];

/** Payload schema version of each role; a shape or meaning change of a role increments its own version. */
export const FLIGHT_DATA_SCHEMA_VERSIONS: Readonly<Record<FlightDataRole, number>> = Object.freeze({
  'scene-settings': 1,
  'explosion-table': 1,
  'explosion-animation': 1,
  'nebula-backgrounds': 1,
});

/**
 * Structural limits, shared by the readers and the source parsers: twice the slice's observed value, rounded up to a
 * power of two (P3-03 spec, 限值与预算). `explosionListItems`: an EXIC list, observed at most 7. `animationFrames`: an
 * ANIM's frames, observed at most 12. `nebulaImages`: NEBC 10661, observed 15. `payloadBytes` bounds the bytes read
 * before parsing; every payload within the other limits encodes within it.
 */
export const FLIGHT_DATA_LIMITS = Object.freeze({
  payloadBytes: 16_384,
  explosionListItems: 16,
  animationFrames: 32,
  nebulaImages: 32,
});

/** Counts fixed by the source formats, not adjustable limits. */
export const FLIGHT_DATA_FORMAT = Object.freeze({
  /** EXIC 10211 holds three lists. */
  explosionLists: 3,
  /** Each light colour of the RENS header is three f32 values. */
  colourComponents: 3,
  /** The RENS header holds three screen flash records. */
  screenFlashes: 3,
});

/** Three f32 values in stored order; their range and channel meaning are Unconfirmed. */
export type SceneColour = readonly [number, number, number];

/** The f32 values that set the 3D device value `0x175210` (Likely distance thresholds, U-027, U-028). */
export interface SceneDeviceValues {
  /** RENS +0x1C: set when the viewport is built while the value is still zero, and restored once no counted visual remains. */
  readonly base: number;
  /** RENS +0x20: applied while a visual of a kind in the mask 0x1C7C is present. */
  readonly kinds1c7c: number;
  /** RENS +0x24: applied while a visual of a kind in the mask 0xF8000 is present. */
  readonly kindsF8000: number;
}

/** One screen flash record of the RENS header (+0x28, +0x38 or +0x48), read when that flash starts. */
export interface ScreenFlash {
  /** u32: ANDed with a random value at each new random draw. */
  readonly randomMask: number;
  /** f32: the flash ends once the elapsed float clock exceeds it; (duration − elapsed) / duration scales the level. */
  readonly duration: number;
  /** u32: added to the tick clock to schedule the next random draw. */
  readonly drawIntervalTicks: number;
  /** i32: the level, multiplied by the remaining fraction. */
  readonly level: number;
}

/**
 * The RENS 10751 header +0x00–+0x57 (role `scene-settings`). The unread bytes +0x19–+0x1B are not converted; the record
 * array at +0x58 is `data/projectile-visuals`.
 */
export interface SceneSettings {
  /** RENS +0x00–+0x08: colour of the light the scene creates with type 3 (Likely directional). */
  readonly lightType3Colour: SceneColour;
  /** RENS +0x0C–+0x14: colour of the light created with type 0 (Likely ambient). */
  readonly lightType0Colour: SceneColour;
  /** RENS +0x18, u8: passed to the 3D device (method at vtable +0x34) whenever the viewport is rebuilt; meaning Unconfirmed. */
  readonly deviceByte: number;
  readonly deviceValues: SceneDeviceValues;
  /** In stored order, the flashes started by `0x48d64`, `0x48dbc` and `0x48e14`. */
  readonly screenFlashes: readonly [ScreenFlash, ScreenFlash, ScreenFlash];
}

/** One EXPL record. */
export interface ExplosionEntry {
  /** EXPL +0: the explosion's sound, a `sound` Asset. */
  readonly sound: AssetReference;
  /** EXPL +4: the explosion's animation, an `explosion-animation` `data` Asset. */
  readonly animation: AssetReference;
}

/** EXIC 10211 and its EXPL records (role `explosion-table`); which entry an explosion uses is P3-07's rule. */
export interface ExplosionTable {
  /** The three EXIC lists in stored order, each in list order; an entry may repeat. */
  readonly lists: readonly [readonly ExplosionEntry[], readonly ExplosionEntry[], readonly ExplosionEntry[]];
}

/** One ANIM (role `explosion-animation`): the data hold no per-frame or per-animation parameter; timing is code (U-001). */
export interface ExplosionAnimation {
  /** `image` Assets in display order, at least one. */
  readonly frames: readonly AssetReference[];
}

/** NEBC 10661 (role `nebula-backgrounds`); the start index and the six directions are P3-12's rules (U-018). */
export interface NebulaBackgrounds {
  /** `image` Assets in NEBC order. */
  readonly images: readonly AssetReference[];
}

/** A flight data payload with the descriptor role that selects its shape. */
export type FlightDataPayload =
  | { readonly role: 'scene-settings'; readonly content: SceneSettings }
  | { readonly role: 'explosion-table'; readonly content: ExplosionTable }
  | { readonly role: 'explosion-animation'; readonly content: ExplosionAnimation }
  | { readonly role: 'nebula-backgrounds'; readonly content: NebulaBackgrounds };
