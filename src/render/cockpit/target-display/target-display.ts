/**
 * The right (target) display, instrument type 7 (`0x42d80`; docs/original/formats/hud.md §4.5, SNIP 10487;
 * executable.md T7; docs/plan/p3/13/spec.md, 右侧目标显示屏 and D-01 定稿 DC-05/DC-10/DC-11). It reads the tick's
 * projection only: the target is `flight.combat.player.target` (Core clears it, CR-10), never the Render State's visible
 * set, and nothing here writes Core state.
 *
 * Each call, with a player, in the original's order:
 *
 * 1. **Force:** a pending device switch (every `view-switched`, and the run's first call) or a new target (by entity)
 *    forces this call; a new target also drops the old scene.
 * 2. **Subsystem 14:** state 2 switches the interference on (start recorded when off); 1 and 3 toggle it with one
 *    rand once the sample is strictly past the next toggle, and set the next refresh to 0; 0 reads nothing. With a
 *    non-zero state and the interference on, the shared SNIP picture (`0x4d010`) is drawn and the call ends.
 * 3. **Departure notice:** after a `target-cleared` event of cause `warp` (the original's +0xCC = 1 branch), the next
 *    20 calls each copy the device's last picture, draw `targetWarpNotice` and publish.
 * 4. **No target:** once the sample is strictly past the next refresh, the device is cleared to the background, the
 *    next refresh := sample + 0x80 and the call is forced; a forced call copies the device and draws `targetNone`.
 * 5. **Target:** forced or past the next refresh, the readouts are formatted and the device rendered (the model in its
 *    shield colour; the map marker, kind bit 25, draws no model), next refresh := sample + 9. Then the device, the
 *    four readouts, the name and, for the marker, the crosshair are drawn. A target without a model or a movement
 *    block (the original's failed `0x44070`) draws nothing and is dropped, so the next call retries it.
 *
 * Every draw copies the device window from ((100 − w) >> 1, (100 − h) >> 1), w × h the rectangle's size, over one
 * column and one row more than the rectangle to (x0, y0) of B, and covers the whole rectangle, which is published
 * unless the slot is always redrawn (directory +0x0C): with the slot-0 records the display draws exactly when it
 * copies. All text is fonts/0 in colour 8.
 *
 * **Per run (Δ-04):** every timer, the interference gate, the countdown and the scene start from the original's initial
 * values; the SNIP "last frame" is the one `DisplayInterference` shared with the left display (DC-10).
 */
import type { AssetId } from '../../../content/asset-id.ts';
import { fail } from '../../../content/contract-validation.ts';
import { nearestColourMap } from '../../../content/graphics/expand-image.ts';
import type { FontPayload } from '../../../content/graphics/font-payload.ts';
import { glyphsFor } from '../../../content/graphics/glyph-lookup.ts';
import type { ImagePayload } from '../../../content/graphics/image-payload.ts';
import type { PalettePayload } from '../../../content/graphics/palette-payload.ts';
import type { HudTextEntries } from '../../../content/hud/hud-text-payload.ts';
import type { InclusiveRectangle, InstrumentRecord } from '../../../content/hud/instruments-payload.ts';
import type { ModelPayload } from '../../../content/models/model-payload.ts';
import type { DomainEvent } from '../../../core/contracts/domain-events.ts';
import type { CombatTarget, ResourceReading } from '../../../core/projections/projection.ts';
import type { EntityId, NameReference } from '../../../core/world/entity-table.ts';
import {
  createInterferenceGate, holdInterference, toggleInterference, type DisplayInterference, type InterferenceGate,
} from '../interference/display-interference.ts';
import type { CockpitDrawContext, CockpitModule, CockpitTickContext, InstrumentHandler } from '../presentation/cockpit-contract.ts';
import { checkImagePixels, PresentationError } from '../presentation/cockpit-limits.ts';
import { drawText, hudFont, type HudFont } from '../raster/glyph-text.ts';
import { blit, drawLine, type IndexedSurface } from '../raster/indexed-surface.ts';
import { formatText } from '../raster/text-format.ts';
import { TARGET_BACKGROUND_SIZE, TARGET_DEVICE, TargetScene } from './target-scene.ts';

export type TargetDisplayText = Pick<HudTextEntries,
  | 'targetWarpNotice' | 'targetNone' | 'targetDistance' | 'targetDistanceScaled' | 'targetBlockValue' | 'targetCraftPercent'
  | 'targetCraftValueScaledTwice' | 'targetCraftValueScaledOnce' | 'targetMarkerBlockValue' | 'targetMarkerCraftPercent'
  | 'targetMarkerCraftValue' | 'mapMarkerName'>;

/** The models a target's `model` Asset ID can name; a `ReadonlyMap` of the run's model payloads fits. */
export interface TargetModels {
  get(id: AssetId): ModelPayload | undefined;
}

export interface TargetDisplayInput {
  /** fonts/0 (`font/hud/8x8-1`), advance = its cell width. */
  readonly font: FontPayload;
  /** TEX 11089: 96 × 96, opaque, shown directly or through the nearest colours of the cockpit palette. */
  readonly background: ImagePayload;
  /** The background's own palette and, when it is shown through nearest colours, its target (the cockpit palette). */
  readonly palettes: ReadonlyMap<AssetId, PalettePayload>;
  readonly hudText: TargetDisplayText;
  /** The run's interference picture, shared with the left display. */
  readonly interference: DisplayInterference;
  /** The run's model payloads by Asset ID; the app composition (subtask 24) provides them. */
  readonly models: TargetModels;
  /** The byte string of a target's name (the app resolves it); the map marker's is `mapMarkerName`. */
  readonly names: (name: NameReference) => string;
}

/** What the display keeps for a run: no GPU resource; the CPU device and the background are its only pictures. */
export interface TargetDisplayBudget {
  /** Decoded background pixels, within the cockpit's image budget (DC-08). */
  readonly imagePixels: number;
  /** The CPU device. */
  readonly devicePixels: number;
  /** GPU render targets (and depth attachments): none, the scene is drawn on the CPU. */
  readonly renderTargets: 0;
}

export interface TargetDisplayState {
  /** The entity the display shows (the original's counted reference `0x19b1c0`); null for none. */
  readonly shown: EntityId | null;
  /** `0x17547c`: the sample after which the next refresh is due. */
  readonly nextRefresh: number;
  /** `0x19b1e0`: calls left that show the departure notice. */
  readonly notice: number;
  /** `0x19b1dc`: a device switch forces the next call. */
  readonly forcePending: boolean;
  readonly interference: Readonly<InterferenceGate>;
}

export interface TargetDisplayModule extends CockpitModule {
  readonly instruments: { readonly 7: InstrumentHandler };
  readonly budget: TargetDisplayBudget;
  state(): TargetDisplayState;
  /** The device's picture; callers only read it. */
  device(): IndexedSurface;
}

const PATH = 'targetDisplay';
const SUBSYSTEM = 14;
const MARKER_KIND_BIT = 25;
/** Kinds 0x2000 and 0x4000 (`byte +5 & 0x60`): always the full-shield colour. */
const ALWAYS_FULL_KIND_BITS: readonly number[] = [13, 14];
const VIEW_DISTANCE_BITS = 20;
const NOTICE_CALLS = 20;
const TARGET_PERIOD = 9;
const EMPTY_PERIOD = 0x80;
const TEXT_COLOUR = 8;
const CROSSHAIR_COLOUR = 0x0f;
/** Model colours by shield state (`0x429c0` textures): full, reduced, empty. */
const SHADES = Object.freeze({ full: 0x10, reduced: 0x0f, empty: 0x0a });
const SHIELD_RATIO = 0.25;
const MILLI = 0.001;
const DISTANCE_LIMIT = 99_999;
const VALUE_LIMIT = 1_000;
/** The four readouts' buffers are 10 bytes apart (`0x19b204`…`0x19b222`); a longer text would overflow (not reproduced). */
const LINE_BYTES = 9;
/** The bytes `%.0f` and `%%` can add to a readout. */
const DIGITS = '-0123456789%';
/** Texts drawn as they are; every other text is a format string. */
const VERBATIM_KEYS: readonly string[] = ['targetWarpNotice', 'targetNone', 'mapMarkerName'];
/** HI text places, relative to the rectangle (`0x42d80`). */
const PLACE = Object.freeze({
  left: 3, top: 2, speedTop: 11, bottom: 8, nameBottom: 17, rightBase: 33, valueBase: 17, step: 8, valueTwice: -12,
  markerSpeedRight: 33, markerValueRight: 17, markerShieldLeft: 19,
});

interface Line {
  readonly text: string;
  readonly x: number;
}

/** The four readouts in drawing order: distance, speed, shield, craft value (`0x19b20e`, `0x19b222`, `0x19b218`, `0x19b204`). */
type Lines = readonly [Line, Line, Line, Line];

const EMPTY_LINE: Line = Object.freeze({ text: '', x: 0 });

/** 8 pixels for each threshold `value` (f32) is above. */
const steps = (value: number, thresholds: readonly number[]): number => PLACE.step * thresholds.filter((threshold) => value > threshold).length;

/** The background's cockpit palette indices: its own indices, through the nearest colours of the target when given. */
function backgroundTexels(image: ImagePayload, palettes: ReadonlyMap<AssetId, PalettePayload>): Uint8Array {
  const at = `${PATH}.background`;
  if (image?.kind !== 'image' || image.mask !== null) fail('binding-mismatch', at, 'must be an opaque image');
  if (image.width !== TARGET_BACKGROUND_SIZE || image.height !== TARGET_BACKGROUND_SIZE) fail('binding-mismatch', at, 'must be 96 × 96');
  checkImagePixels([image], at);
  if (image.display === 'direct') return image.indices;
  const palette = (id: AssetId): PalettePayload => palettes.get(id) ?? fail('binding-mismatch', `${PATH}.palettes`, `must hold ${id}`);
  const source = palette(image.palette);
  const entries = source.entries.length / 3;
  if (image.indices.some((index) => index >= entries)) fail('palette-index-out-of-range', `${at}.indices`, 'must address entries of its own palette');
  const map = nearestColourMap(source, palette(image.display.nearest));
  return image.indices.map((index) => map[index]);
}

/** The literal bytes of a text format: everything but its conversions, `%%` giving `%`. */
const literalBytes = (format: string): string => format.replace(/%(%|\.0f|d|s)/g, (_, conversion: string) => (conversion === '%' ? '%' : ''));

class TargetDisplay implements TargetDisplayModule {
  readonly name = 'target-display';
  readonly instruments = Object.freeze({
    7: Object.freeze({
      activate: (_context: CockpitTickContext, record: InstrumentRecord) => this.#checkRectangle(record.rectangle),
      draw: (context: CockpitDrawContext, record: InstrumentRecord) => this.#draw(context, record.rectangle),
    }),
  });
  readonly budget: TargetDisplayBudget;
  readonly #font: HudFont;
  readonly #text: TargetDisplayText;
  readonly #interference: DisplayInterference;
  readonly #models: TargetModels;
  readonly #names: (name: NameReference) => string;
  readonly #scene: TargetScene;
  readonly #gate = createInterferenceGate();
  #shown: EntityId | null = null;
  #nextRefresh = 0;
  #notice = 0;
  // The flight start switches the display like any view switch (`0x3f158` → `0x42b04`).
  #forcePending = true;
  #lines: Lines = [EMPTY_LINE, EMPTY_LINE, EMPTY_LINE, EMPTY_LINE];

  constructor({ font, background, palettes, hudText, interference, models, names }: TargetDisplayInput) {
    if (typeof names !== 'function' || typeof models?.get !== 'function') {
      throw new PresentationError('invalid-input', PATH, 'needs a model lookup and a name resolver');
    }
    this.#font = hudFont(font, font.cellWidth, false);
    const checkGlyphs = (text: string, path: string): void => void glyphsFor(font, Array.from(text, (character) => character.charCodeAt(0)), path);
    for (const [key, text] of Object.entries(hudText)) checkGlyphs(VERBATIM_KEYS.includes(key) ? text : literalBytes(text), `${PATH}.hudText.${key}`);
    checkGlyphs(DIGITS, `${PATH}.digits`);
    this.#scene = new TargetScene(backgroundTexels(background, palettes));
    this.#text = hudText;
    this.#interference = interference;
    this.#models = models;
    this.#names = names;
    const { size } = TARGET_DEVICE;
    this.budget = Object.freeze({ imagePixels: background.width * background.height, devicePixels: size * size, renderTargets: 0 });
  }

  beforeDraw(_context: CockpitTickContext, event: DomainEvent): void {
    if (event.type === 'view-switched') {
      this.#forcePending = true;
      this.#scene.rebuild();
    } else if (event.type === 'target-cleared' && event.cause === 'warp') this.#notice = NOTICE_CALLS;
  }

  state(): TargetDisplayState {
    const { on, start, nextToggle } = this.#gate;
    return Object.freeze({
      shown: this.#shown, nextRefresh: this.#nextRefresh, notice: this.#notice, forcePending: this.#forcePending,
      interference: Object.freeze({ on, start, nextToggle }),
    });
  }

  device(): IndexedSurface {
    return this.#scene.device;
  }

  /** The device window and the extra column and row must lie in the 100 × 100 device. */
  #checkRectangle({ x0, y0, x1, y1 }: InclusiveRectangle): void {
    const { size } = TARGET_DEVICE;
    for (const extent of [x1 - x0 + 1, y1 - y0 + 1]) {
      if (((size - extent) >> 1) + extent > size - 1) fail('binding-mismatch', `${PATH}.rectangle`, 'must fit the device with one more column and row');
    }
  }

  /** `0x59608`: the device window over the rectangle and one more column and row, at (x0, y0). */
  #copyDevice(back: IndexedSurface, { x0, y0, x1, y1 }: InclusiveRectangle): void {
    const [width, height] = [x1 - x0 + 1, y1 - y0 + 1];
    const { size } = TARGET_DEVICE;
    const [left, top] = [(size - width) >> 1, (size - height) >> 1];
    blit(back, this.#scene.device, x0, y0, 'opaque', { x0: left, y0: top, x1: left + width, y1: top + height });
  }

  /** `0x42d80`. */
  #draw(context: CockpitDrawContext, rect: InclusiveRectangle): void {
    const player = context.projection.flight.combat.player;
    if (player === null) return;
    const { target } = player;
    const sample = context.clock >>> 0;
    const always = context.layout.slot?.alwaysRedraw === true;
    let force = this.#forcePending;
    this.#forcePending = false;
    const id = target?.entityId ?? null;
    if (id !== this.#shown) {
      this.#shown = id;
      force = true;
    }
    const state = player.subsystems[SUBSYSTEM];
    if (state !== 0) {
      if (state === 2) holdInterference(this.#gate, sample);
      else if (sample > this.#gate.nextToggle) {
        toggleInterference(this.#gate, sample, context.random);
        this.#nextRefresh = 0;
      }
      if (this.#gate.on) {
        this.#interference.draw(context, rect, this.#gate.start, always);
        return;
      }
    }
    const { back } = context;
    if (this.#notice >= 1) {
      this.#notice--;
      this.#copyDevice(back, rect);
      drawText(back, this.#font, this.#text.targetWarpNotice, rect.x0 + PLACE.left, rect.y1 - PLACE.bottom, TEXT_COLOUR, `${PATH}.notice`);
      if (!always) context.publish(rect);
      return;
    }
    if (target === null) {
      if (sample > this.#nextRefresh) {
        this.#scene.render(null);
        this.#nextRefresh = (sample + EMPTY_PERIOD) >>> 0;
        force = true;
      }
      if (force || always) {
        this.#copyDevice(back, rect);
        drawText(back, this.#font, this.#text.targetNone, rect.x0 + PLACE.left, rect.y1 - PLACE.bottom, TEXT_COLOUR, `${PATH}.none`);
      }
      if (force && !always) context.publish(rect);
      return;
    }
    const marker = target.kindBit === MARKER_KIND_BIT;
    let drew = false;
    if (force || sample > this.#nextRefresh) {
      if (marker) {
        this.#lines = this.#markerLines(target, rect);
        this.#scene.render(null);
      } else {
        const motion = context.projection.flight.motion.player;
        if (motion === null) throw new PresentationError('invariant-violated', `${PATH}.player`, 'must have a motion reading');
        const model = target.model === null ? null : this.#models.get(target.model) ?? fail('binding-mismatch', `${PATH}.models`, `must hold ${target.model}`);
        if (model === null || target.speed === null) {
          this.#shown = null;
          return;
        }
        const { shield, craftAt08 } = craftReadings(target);
        this.#lines = this.#targetLines(target, target.speed, shield, craftAt08, rect);
        this.#scene.render({
          model, colour: shade(shield, target.kindBit), target, distance: target.distance, viewDistance: viewDistance(context, target), player: motion,
        });
      }
      this.#nextRefresh = (sample + TARGET_PERIOD) >>> 0;
      drew = true;
    }
    if (drew || always) {
      this.#copyDevice(back, rect);
      const [distance, speed, shield, value] = this.#lines;
      this.#line(back, distance, rect.y0 + PLACE.top);
      this.#line(back, speed, rect.y0 + PLACE.speedTop);
      this.#line(back, shield, rect.y1 - PLACE.bottom);
      this.#line(back, value, rect.y1 - PLACE.bottom);
      const name = target.name.type === 'map-marker' ? this.#text.mapMarkerName : this.#names(target.name);
      drawText(back, this.#font, name, rect.x0 + PLACE.left, rect.y1 - PLACE.nameBottom, TEXT_COLOUR, `${PATH}.name`);
      if (marker) drawCrosshair(back, rect);
    }
    if (drew && !always) context.publish(rect);
  }

  #line(back: IndexedSurface, { text, x }: Line, y: number): void {
    drawText(back, this.#font, text, x, y, TEXT_COLOUR, `${PATH}.line`);
  }

  #format(key: keyof TargetDisplayText, args: readonly number[]): string {
    return formatText(this.#text[key], args, LINE_BYTES, `${PATH}.hudText.${key}`);
  }

  /** The distance readout of both branches: f32 below 99,999, else the f32 times 0.001 (printed in double). */
  #distance(target: CombatTarget, rect: InclusiveRectangle): Line {
    const near = target.distance < DISTANCE_LIMIT;
    const printed = near ? target.distance : target.distance * MILLI;
    const text = this.#format(near ? 'targetDistance' : 'targetDistanceScaled', [printed]);
    return { text, x: rect.x1 - (PLACE.rightBase + steps(Math.fround(printed), [9_999, 999, 99, 10])) };
  }

  #markerLines(target: CombatTarget, rect: InclusiveRectangle): Lines {
    return [
      this.#distance(target, rect),
      { text: this.#format('targetMarkerBlockValue', []), x: rect.x1 - PLACE.markerSpeedRight },
      { text: this.#format('targetMarkerCraftPercent', []), x: rect.x0 + PLACE.markerShieldLeft },
      { text: this.#format('targetMarkerCraftValue', []), x: rect.x1 - PLACE.markerValueRight },
    ];
  }

  #targetLines(target: CombatTarget, speed: number, shield: ResourceReading, craftAt08: number, rect: InclusiveRectangle): Lines {
    // FILD/FILD/FDIVP × 100.0, stored f32; 0 when c5C ≤ 0.
    const percent = shield.maximum > 0 ? Math.fround((shield.current / shield.maximum) * 100) : 0;
    const once = Math.fround(craftAt08 * MILLI);
    const twice = craftAt08 * MILLI > VALUE_LIMIT;
    const value = twice ? once * MILLI : once;
    return [
      this.#distance(target, rect),
      { text: this.#format('targetBlockValue', [speed]), x: rect.x1 - (PLACE.rightBase + steps(speed, [99, 10])) },
      { text: this.#format('targetCraftPercent', [percent]), x: rect.x0 + PLACE.left + PLACE.step * [100, 10].filter((limit) => percent < limit).length },
      {
        text: this.#format(twice ? 'targetCraftValueScaledTwice' : 'targetCraftValueScaledOnce', [value]),
        x: (twice ? PLACE.valueTwice : 0) + rect.x1 - (PLACE.valueBase + steps(Math.fround(value), [99, 10])),
      },
    ];
  }
}

/** A craft target's shield and craft record value, which kind bits 0–19 always have (CK-03). */
function craftReadings({ shield, craftAt08 }: CombatTarget): { readonly shield: ResourceReading; readonly craftAt08: number } {
  if (shield === null || craftAt08 === null) throw new PresentationError('invariant-violated', `${PATH}.target`, 'must have a shield and a craft record value');
  return { shield, craftAt08 };
}

/** `0x44070`'s colour: empty below shield 1 (not kinds 0x2000/0x4000), full above a quarter or for those kinds. */
function shade(shield: ResourceReading, kindBit: number): number {
  const alwaysFull = ALWAYS_FULL_KIND_BITS.includes(kindBit);
  if (shield.current < 1 && !alwaysFull) return SHADES.empty;
  return shield.current / shield.maximum > SHIELD_RATIO || alwaysFull ? SHADES.full : SHADES.reduced;
}

/** `targetViewDistances[kindBit]`: the 20-entry table covers every kind the player can target except the marker. */
function viewDistance(context: CockpitDrawContext, { kindBit }: CombatTarget): number {
  if (!Number.isInteger(kindBit) || kindBit < 0 || kindBit >= VIEW_DISTANCE_BITS) {
    throw new PresentationError('invariant-violated', `${PATH}.target.kindBit`, 'must have a view distance (bits 0–19)');
  }
  return context.content.targetViewDistances[kindBit];
}

/** The marker's crosshair in 0x0F about the rectangle's centre: ±16 axes, ±8 diagonals, 4-pixel brackets at ±24. */
function drawCrosshair(back: IndexedSurface, { x0, y0, x1, y1 }: InclusiveRectangle): void {
  const cx = x0 + Math.trunc((x1 - x0) / 2);
  const cy = y0 + Math.trunc((y1 - y0) / 2);
  const line = (ax: number, ay: number, bx: number, by: number): void => drawLine(back, cx + ax, cy + ay, cx + bx, cy + by, CROSSHAIR_COLOUR);
  line(0, -16, 0, 16);
  line(-16, 0, 16, 0);
  line(-8, -8, 8, 8);
  line(-8, 8, 8, -8);
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      line(24 * sx, 24 * sy, 20 * sx, 24 * sy);
      line(24 * sx, 24 * sy, 24 * sx, 20 * sy);
    }
  }
}

/** The right display of one run; its content is checked before anything else (a `ContentContractError`). */
export function createTargetDisplay(input: TargetDisplayInput): TargetDisplayModule {
  return new TargetDisplay(input);
}
