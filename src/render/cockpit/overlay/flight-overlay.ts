/**
 * The flight-view overlay `0x45de0` with its erase `0x456e4`, and the destruction view's label (docs/original/formats/
 * hud.md §4.6; P3-13 spec, F1 叠加与被毁视角标签, DC-05, DC-10, DC-12, Δ-04, Δ-08 and D-02 定稿), as one run's module.
 *
 * - **Erase (`eraseOverlay`, views 0xC and 0x11, before the world):** repaints last call's marks with index 0. In the
 *   world rows that is the same as not drawing them, so they are uncovered and the world shows through; a mark the
 *   draw wrote into rows 316–478 becomes index 0 in B and shows only when an instrument copy covers it (DC-05). The
 *   two text boxes are erased only while their erase flag is set, so a text drawn before a skip stays. The first erase
 *   after a reset is skipped (`0x175998`). The colour-0 reticle of a skip is uncovered by the next erase: the world
 *   layers draw over that index-0 shape, and where they draw nothing the world's background is index 0 as well.
 * - **Draw (`drawOverlay`):** nothing without a player. View 0x11 draws the label (sub-mode 8, fonts/1, 0x0F) at (0,0)
 *   and returns. View 0xC: the skip hold-off; subsystem 9 at 2 skips, at 1 skips with probability 44/256 once the
 *   overlay has shown for 0x40 units (one draw of the cockpit stream, Q-13); a skip clears the mark flags, draws the
 *   reticle in colour 0 and holds for 0x20 units. Otherwise, in the original's order: the rate indicator; with a
 *   target that has a movement block the off-centre pointer (the radar's cached direction, which the radar's draw of
 *   this tick updates only later), the target box with the lock rings and the name, the locked text, the missile
 *   line, the lead marks and the gun line; the autopilot and speed-assist texts; the reticle; the readouts; without
 *   such a target both weapon lines out of range.
 * - **Inputs:** the same tick's projection and camera (DC-10: no interpolation, so no placement serial is needed), the
 *   lock progress as `0x2e080` gives it (−1, 0, positive), Core's speed-assist events in ① (Δ-08). The visual state
 *   drives no sound and is not shared with P3-14 (D-02 DD-01, DD-03).
 * - **Resets:** the run starts as after `0x45420`, `0x456ac` and `0x459a0(0xC)` (Δ-04: the original resets only at
 *   program start, whose first erase is skipped too, and on entering the base view, hud §4.6); every switch into view
 *   6 resets again, and every switch with a new view, or into 0x11,
 *   runs `0x459a0`. The autopilot flag is always clear (G-09), so after each reset the next overlay call draws the
 *   autopilot text once in 0x0F.
 */
import type { AssetId } from '../../../content/asset-id.ts';
import type { FontPayload } from '../../../content/graphics/font-payload.ts';
import type { HudTextEntries } from '../../../content/hud/hud-text-payload.ts';
import type { ViewLabels } from '../../../content/hud/view-labels-payload.ts';
import type { CraftInfo } from '../../../content/rule-data/craft-info.ts';
import type { DomainEvent } from '../../../core/contracts/domain-events.ts';
import type { CombatPlayer, CombatTarget, MotionPlayer, WeaponListReading } from '../../../core/projections/projection.ts';
import type { RenderState } from '../../../core/projections/render-state.ts';
import type { EntityId, NameReference } from '../../../core/world/entity-table.ts';
import { chop32 } from '../gauges/gauge-bars.ts';
import type { CockpitDrawContext, CockpitModule, CockpitTickContext } from '../presentation/cockpit-contract.ts';
import { COCKPIT_LIMITS, PresentationError } from '../presentation/cockpit-limits.ts';
import { drawText, hudFont, type HudFont } from '../raster/glyph-text.ts';
import { createIndexedSurface, drawCircle, drawLine, fillRect, plot, toInt16, type IndexedSurface } from '../raster/indexed-surface.ts';
import { formatText } from '../raster/text-format.ts';
import {
  cameraSpace, fitsOnScreen, inAimBox, matrixRow, onScreen, OVERLAY_CENTRE, rateFigure, readoutDistance, screenPoint, smoothRate,
  weaponDistance, type OverlayPoint, type RateFigure,
} from './overlay-geometry.ts';

type OverlayTextKey =
  | 'overlayAutopilotChange' | 'overlaySpeedAssistChange' | 'overlayPlayerState4' | 'overlayValueReadout' | 'overlayPercentReadout'
  | 'overlayReadoutUnavailable' | 'overlayTargetDistance' | 'overlayEmptyWeaponSlot';

export interface FlightOverlayInput {
  /** fonts/1 (`font/hud/8x8-2`), drawn with advance 6 and upper-casing in HI (`0x49694`). */
  readonly font: FontPayload;
  readonly hudText: Pick<HudTextEntries, OverlayTextKey>;
  /** `data/hud/view-labels`: the destruction view's label. */
  readonly viewLabels: ViewLabels;
  /** `data/craft-info` and its Asset ID, which the weapon readings name: the weapon names (record +0x04). */
  readonly craftInfo: { readonly id: AssetId; readonly content: CraftInfo };
  /** The byte string of an object's name snapshot (the app resolves it from the mission setup). */
  readonly names: (name: NameReference) => string;
  /** The radar module of the same run: its cached in-plane directions (DC-12). */
  readonly radar: { cachedDirection(entityId: EntityId): { readonly a: number; readonly b: number } };
  /** P3-12's back plane B for the tick's Render State (PV4); the box adds its cross while z < B. */
  readonly backPlane: (render: RenderState) => number;
}

/** A read-only view of the overlay's clocks and phases after the last processed tick. */
export interface FlightOverlayState {
  /** The view `0x459a0` last set up. */
  readonly mode: number;
  readonly skip: { readonly holdUntil: number; readonly visibleUntil: number };
  readonly reticle: { readonly phase: 0 | 1; readonly due: number; readonly pulse: number };
  readonly aim: boolean;
  /** The lock progress the last call read (−1 after a view switch). */
  readonly progress: number;
  readonly lockedRing: { readonly radius: number; readonly phase: 0 | 1; readonly due: number };
  readonly lockedText: { readonly phase: 0 | 1; readonly due: number };
  readonly weaponBlink: { readonly phase: 0 | 1; readonly due: number };
  readonly autopilot: { readonly step: number; readonly previous: boolean; readonly due: number };
  readonly speedAssist: { readonly counter: number; readonly due: number };
  /** The smoothed rates (rad/s, f32) and their update clock. */
  readonly rate: { readonly pitch: number; readonly roll: number; readonly due: number; readonly lastSeconds: number };
  readonly readouts: { readonly texts: readonly string[]; readonly due: number };
}

export interface FlightOverlayModule extends CockpitModule {
  state(): FlightOverlayState;
}

const PATH = 'cockpit.overlay';
const { x: CX, y: CY } = OVERLAY_CENTRE;
const FLIGHT_VIEW = 0x0c;
const WARP_VIEW = 0x01;
const BASE_VIEW = 0x06;
const EXTERNAL_VIEW = 0x11;
const DESTRUCTION_SUB_MODE = 8;
/** fonts/1 in HI. */
const ADVANCE = 6;

// The HI parameter block `0x17599c` (read from the image, P3-13/04 and /21).
const RETICLE = Object.freeze({ radius: 20, steps: 10, tickInner: 12, tickOuter: 32, bar: 4, aimRadius: 24, aimSteps: 14 });
const PANEL = Object.freeze({ x: CX - 86, y: CY + 132, characters: 22 });
const TEXT_Y = CY - 48;
const POINTER = Object.freeze({ inner: 21, outer: 40 });
const LEAD = Object.freeze({ base: 10, circle: 10, steps: 8, kinds: 0x93780 });
const BOX = Object.freeze({ depth: 850, shift: 4, max: 100, min: 8, cross: 3, tick: 4, corner: 4, nameGap: 3, nameBytes: 16 });
const RINGS = Object.freeze({ gap: 8, outerBelow: 60, partial: 100, lockedStart: 80, lockedStep: 8, lockedMin: 14 });
const LOCKED_TEXT = Object.freeze({ y: CY + 34, bytes: 14 });
const READOUTS = Object.freeze([[-85, 20], [-85, 28], [56, 20], [56, 28]] as const);
/** Clock periods in units of 1/64 s. */
const PERIOD = Object.freeze({ rate: 4, readouts: 0x10, reticle: 8, weaponBlink: 0x20, lockedText: 8, lockedRing: 2, textStep: 0x26, hold: 0x20, visible: 0x40 });
const SKIP_BELOW = 0x2c;
const AUTOPILOT_BYTES = 12;
const ASSIST_BYTES = 13;
/** `0x19ba04`–`0x19ba23`: four 8-byte readout buffers that sprintf writes and the drawing reads as C strings. */
const READOUT_BUFFER = 32;
const READOUT_SLOT = 8;
/** `0x171c80` is copied as 4 bytes, so the placeholder holds at most 3 bytes and its NUL. */
const PLACEHOLDER_COPY = 4;
const TIME_LIMIT = 10_000;
const FORMAT_BYTES = 64;

const COLOUR = Object.freeze({
  reticle: 0x0c, alternate: 10, stem: 10, figure: 0x13, pointer: 0x0f, box: 0x0f, locked: 10, ring: 0x0f, partial: 10, name: 0x0f,
  lead: 0x10, inRange: 0x10, outOfRange: 10, label: 0x0f, speed: 0x0f, throttle: 0x12, closing: 0x10, negative: 10, time: 0x10,
  autopilotOn: 0x10, autopilotOff: 0x0f, assistOn: 0x0c, assistOff: 0x13,
});

/** The original's u32 due test: the stored time is strictly below the clock. */
const isDue = (time: number, clock: number): boolean => time >>> 0 < clock >>> 0;
const after = (clock: number, period: number): number => (clock + period) >>> 0;
const toggle = (phase: 0 | 1): 0 | 1 => (phase === 0 ? 1 : 0);
/** `0x5a4d4`'s 16-bit step counter: a negative count never reaches −1 within a circle, which is then drawn whole. */
const partialSteps = (steps: number): number | undefined => (toInt16(steps) < 0 ? undefined : toInt16(steps));

function fail(kind: 'invalid-input' | 'invariant-violated', path: string, reason: string): never {
  throw new PresentationError(kind, `${PATH}.${path}`, reason);
}

/** Inclusive box. */
interface Box {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

const box = (x0: number, y0: number, x1: number, y1: number): Box => Object.freeze({ x0, y0, x1, y1 });
const CENTRE: OverlayPoint = Object.freeze({ x: CX, y: CY });
const ORIGIN: OverlayPoint = Object.freeze({ x: 0, y: 0 });

/** A line between two stored points, which the original reads back as 16-bit values. */
function line(surface: IndexedSurface, from: OverlayPoint, to: OverlayPoint, colour: number): void {
  drawLine(surface, toInt16(from.x), toInt16(from.y), toInt16(to.x), toInt16(to.y), colour);
}

const fill = (surface: IndexedSurface, { x0, y0, x1, y1 }: Box, colour: number): void => fillRect(surface, x0, y0, x1, y1, colour);

/** `0x47acc`: four 2-point corner brackets of arm 4 at ±s and, with `cross`, the centre cross ±3 and the inner side ticks. */
function targetBox(surface: IndexedSurface, x: number, y: number, s: number, cross: boolean, colour: number): void {
  const segment = (x0: number, y0: number, x1: number, y1: number): void => drawLine(surface, toInt16(x0), toInt16(y0), toInt16(x1), toInt16(y1), colour);
  const { cross: c, tick: t, corner: k } = BOX;
  if (cross) {
    segment(x - c, y, x + c, y);
    segment(x, y - c, x, y + c);
    segment(x - s, y, x - s + t, y);
    segment(x + s, y, x + s - t, y);
    segment(x, y - s, x, y - s + t);
    segment(x, y + s, x, y + s - t);
  }
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    const [cx, cy] = [x + sx * s, y + sy * s];
    segment(cx, cy, cx - sx * k, cy - sy);
    segment(cx, cy, cx - sx, cy - sy * k);
  }
}

/** sprintf into the readout buffers: the text and its NUL; nothing past the buffers is kept (a project bound). */
function writeC(buffer: Uint8Array, offset: number, text: string): void {
  for (let index = 0; index <= text.length && offset + index < buffer.length; index++) buffer[offset + index] = index < text.length ? text.charCodeAt(index) : 0;
}

/** The C string at `offset`, ending at its NUL or at the buffers' end. */
function readC(buffer: Uint8Array, offset: number): string {
  let text = '';
  for (let at = offset; at < buffer.length && buffer[at] !== 0; at++) text += String.fromCharCode(buffer[at]);
  return text;
}

/** Everything `0x45420` zeroes (`0x19b888`–`0x19ba23`) and `0x459a0` partly resets. */
class Marks {
  mode = FLIGHT_VIEW;
  /** `0x19b898`: 1 for the overlay views (0xC), 2 in Warp, 0 otherwise; 0x11 keeps it. */
  flag = 1;
  inner = CENTRE;
  outer = CENTRE;
  previousInner = CENTRE;
  target = CENTRE;
  depth = 0;
  boxShown = false;
  half = 0;
  progress = -1;
  nameShown = false;
  nameWidth = 0;
  ringShown = false;
  outerRingShown = false;
  lockedRingShown = false;
  aim = false;
  lead = CENTRE;
  leadRadius = 0;
  leadSteps = 0;
  leadCircle = false;
  leadRing = false;
  leadLine = false;
  /** The weapon box in 0xC, the label box in 0x11. */
  panel = box(0, 0, 0, 0);
  /** Set at its first draw; the zeroed memory's box until then. */
  lockedBox = box(0, 0, 0, 0);
  lockedShown = false;
  autopilotBox = box(0, 0, 0, 0);
  autopilotDue = 0;
  autopilotStep = 0;
  autopilotPrevious = true;
  autopilotErase = false;
  assistBox = box(0, 0, 0, 0);
  assistDue = 0;
  assistErase = false;
  figure: RateFigure = { stemY: 0, points: Array.from({ length: 8 }, () => ORIGIN) };
  pitch = 0;
  roll = 0;
  rateDue = 0;
  lastSeconds = 0;
  readoutDue = 0;
  readoutBoxes: Box[] = [];
  readonly readouts = new Uint8Array(READOUT_BUFFER);
}

/** The drawing inputs of `0x47500`; null for its erase call. */
interface TargetDraw {
  readonly target: CombatTarget;
  readonly behind: boolean;
  readonly clock: number;
}

class FlightOverlay implements FlightOverlayModule {
  readonly name = 'flight-overlay';
  readonly #font: HudFont;
  readonly #text: FlightOverlayInput['hudText'];
  readonly #label: string;
  readonly #craftInfo: FlightOverlayInput['craftInfo'];
  readonly #names: FlightOverlayInput['names'];
  readonly #radar: FlightOverlayInput['radar'];
  readonly #backPlane: FlightOverlayInput['backPlane'];
  /** The marks one `0x456e4` call repaints, applied to B at its end. */
  readonly #eraser = createIndexedSurface(COCKPIT_LIMITS.surface.width, COCKPIT_LIMITS.surface.height, true);
  #marks = new Marks();
  #started = false;
  /** `0x175998`. */
  #skipErase = false;
  /** The colour-0 reticle of the last skip, still covering the world. */
  #skipReticle: { readonly aim: boolean; readonly pulse: number } | null = null;
  // The statics `0x175b00`–`0x175b34` and the speed-assist counter `0x174b28`, from their image values per run (Δ-04).
  #reticlePhase: 0 | 1 = 0;
  #pulse = 0;
  #reticleDue = 0;
  #holdUntil = 0;
  #visibleUntil = 0;
  #lockedRingDue = 0;
  #lockedRadius = 0;
  #lockedRingPhase: 0 | 1 = 0;
  #weaponDue = 0;
  #weaponBlink: 0 | 1 = 0;
  #lockedTextDue = 0;
  #lockedTextPhase: 0 | 1 = 1;
  #assistCounter = 0;

  constructor({ font, hudText, viewLabels, craftInfo, names, radar, backPlane }: FlightOverlayInput) {
    this.#font = hudFont(font, ADVANCE, true);
    this.#text = hudText;
    this.#label = viewLabels.labels[0].text;
    this.#craftInfo = craftInfo;
    this.#names = names;
    this.#radar = radar;
    this.#backPlane = backPlane;
    const fixed = [['overlayAutopilotChange', AUTOPILOT_BYTES], ['overlaySpeedAssistChange', ASSIST_BYTES], ['overlayPlayerState4', LOCKED_TEXT.bytes]] as const;
    for (const [key, bytes] of fixed) if (hudText[key].length !== bytes) fail('invalid-input', `hudText.${key}`, `must be the ${bytes} bytes the code draws`);
    if (hudText.overlayReadoutUnavailable.length >= PLACEHOLDER_COPY) fail('invalid-input', 'hudText.overlayReadoutUnavailable', 'must fit its 4-byte copy with the NUL');
    const probe = createIndexedSurface(1, 1);
    const drawn: readonly (readonly [string, string])[] = [
      ...fixed.map(([key]) => [`hudText.${key}`, hudText[key]] as const), ['hudText.overlayEmptyWeaponSlot', hudText.overlayEmptyWeaponSlot], ['viewLabels', this.#label],
    ];
    for (const [path, text] of drawn) drawText(probe, this.#font, text, -0x4000, -0x4000, 0, `${PATH}.${path}`);
  }

  state(): FlightOverlayState {
    const marks = this.#marks;
    return Object.freeze({
      mode: marks.mode,
      skip: Object.freeze({ holdUntil: this.#holdUntil, visibleUntil: this.#visibleUntil }),
      reticle: Object.freeze({ phase: this.#reticlePhase, due: this.#reticleDue, pulse: this.#pulse }),
      aim: marks.aim,
      progress: marks.progress,
      lockedRing: Object.freeze({ radius: this.#lockedRadius, phase: this.#lockedRingPhase, due: this.#lockedRingDue }),
      lockedText: Object.freeze({ phase: this.#lockedTextPhase, due: this.#lockedTextDue }),
      weaponBlink: Object.freeze({ phase: this.#weaponBlink, due: this.#weaponDue }),
      autopilot: Object.freeze({ step: marks.autopilotStep, previous: marks.autopilotPrevious, due: marks.autopilotDue }),
      speedAssist: Object.freeze({ counter: this.#assistCounter, due: marks.assistDue }),
      rate: Object.freeze({ pitch: marks.pitch, roll: marks.roll, due: marks.rateDue, lastSeconds: marks.lastSeconds }),
      readouts: Object.freeze({ texts: Object.freeze(READOUTS.map((_, slot) => readC(marks.readouts, slot * READOUT_SLOT))), due: marks.readoutDue }),
    });
  }

  beforeDraw(context: CockpitTickContext, event: DomainEvent): void {
    this.#start(context);
    switch (event.type) {
      case 'view-switched':
        // `0x3f158`: its case for view 6 resets (`0x45420`, `0x456ac`); leaving view 6 resets only after a LO switch.
        if (event.viewMode === BASE_VIEW) this.#reset();
        if (event.viewMode === EXTERNAL_VIEW || event.viewMode !== event.fromViewMode) this.#switchView(event.viewMode, event.subMode);
        return;
      case 'speed-assist-toggled':
        if (event.enabled) this.#startAssistFlash();
        return;
      case 'speed-assist-released':
        this.#startAssistFlash();
        return;
      case 'speed-matched':
        if (event.origin === 'assist' && event.speedDifferenceExceeded) this.#startAssistFlash();
        return;
    }
  }

  eraseOverlay(context: CockpitDrawContext): void {
    this.#start(context);
    const marks = this.#marks;
    const eraser = this.#eraser;
    if (this.#skipReticle !== null) this.#reticle(eraser, 0, this.#skipReticle.aim, this.#skipReticle.pulse, 0);
    this.#skipReticle = null;
    if (this.#skipErase) this.#skipErase = false;
    else {
      if (marks.mode === EXTERNAL_VIEW) fill(eraser, marks.panel, 0);
      else if (marks.flag === 1) {
        line(eraser, marks.inner, marks.outer, 0);
        line(eraser, marks.previousInner, marks.outer, 0);
        this.#drawFigure(eraser, false);
        this.#targetMarks(eraser, null);
        if (marks.leadCircle) drawCircle(eraser, marks.lead.x, marks.lead.y, LEAD.circle, 0);
        if (marks.leadRing) drawCircle(eraser, marks.lead.x, marks.lead.y, toInt16(marks.leadRadius), 0, marks.leadSteps);
        if (marks.leadLine) line(eraser, CENTRE, marks.lead, 0);
        fill(eraser, marks.panel, 0);
        if (marks.lockedShown) fill(eraser, marks.lockedBox, 0);
        if (marks.aim) drawCircle(eraser, CX, CY, RETICLE.aimRadius, 0, RETICLE.aimSteps);
      }
      if (marks.autopilotErase) fill(eraser, marks.autopilotBox, 0);
      if (marks.assistErase) fill(eraser, marks.assistBox, 0);
      marks.autopilotErase = false;
      marks.assistErase = false;
      for (const readout of marks.readoutBoxes) fill(eraser, readout, 0);
    }
    this.#applyErase(context.back);
  }

  drawOverlay(context: CockpitDrawContext): void {
    this.#start(context);
    const marks = this.#marks;
    const { combat: { player: combat }, motion: { player: motion } } = context.projection.flight;
    if (combat === null || motion === null) return;
    marks.progress = combat.lock.progress;
    const { back, clock, random } = context;
    if (marks.mode === EXTERNAL_VIEW) {
      drawText(back, this.#font, this.#label, marks.panel.x0, marks.panel.y0, COLOUR.label, `${PATH}.label`);
      return;
    }
    if (marks.flag === 0 || this.#holdUntil >>> 0 > clock >>> 0) return;
    const subsystem = combat.subsystems[9];
    if (subsystem === 2 || (isDue(this.#visibleUntil, clock) && subsystem === 1 && (random.next() & 0xff) < SKIP_BELOW)) {
      Object.assign(marks, { leadCircle: false, leadRing: false, leadLine: false, lockedShown: false, boxShown: false, ringShown: false, outerRingShown: false, lockedRingShown: false });
      this.#holdUntil = after(clock, PERIOD.hold);
      this.#visibleUntil = 0;
      this.#reticle(back, 0, marks.aim, this.#pulse, this.#reticlePhase);
      this.#skipReticle = { aim: marks.aim, pulse: this.#pulse };
      return;
    }
    this.#holdUntil = 0;
    if (this.#visibleUntil === 0) this.#visibleUntil = after(clock, PERIOD.visible);
    this.#rateIndicator(back, clock, motion);
    const target = combat.target;
    const tracked = target !== null && target.speed !== null;
    if (target !== null) {
      const view = cameraSpace(context.camera, target.position);
      // Behind the camera the aim flag keeps its value; the point is used only in front of z = 1.
      const point = view.z >= 0 ? screenPoint(view) : marks.target;
      if (view.z >= 0) marks.aim = inAimBox(point);
      if (tracked) {
        this.#pointer(back, target.entityId);
        if (view.z > 1) {
          marks.depth = chop32(view.z);
          marks.target = point;
          this.#targetMarks(back, { target, behind: view.z < this.#backPlane(context.render), clock });
          if (marks.progress >= 0) this.#lockedText(back, clock);
        }
        this.#weaponsAndLead(context, combat, motion, target);
      }
    }
    this.#autopilotText(back, clock);
    this.#assistText(back, clock);
    if (isDue(this.#reticleDue, clock)) {
      this.#reticlePhase = toggle(this.#reticlePhase);
      this.#reticleDue = after(clock, PERIOD.reticle);
    }
    this.#pulse = this.#pulse >= RETICLE.aimSteps ? 0 : this.#pulse + 1;
    this.#reticle(back, COLOUR.reticle, marks.aim, this.#pulse, this.#reticlePhase);
    this.#readouts(back, clock, motion, target);
    if (!tracked) {
      this.#weaponLine(back, clock, combat.weapons[0], false, 0);
      this.#weaponLine(back, clock, combat.weapons[1], false, 1);
    }
  }

  /** The run's start: the state after `0x45420` and `0x456ac` (Δ-04), then the set-up of tick 0's view when it is not 0xC. */
  #start(context: CockpitTickContext): void {
    if (this.#started) return;
    this.#started = true;
    this.#reset();
    const initial = context.previousViewMode;
    if (initial === FLIGHT_VIEW) return;
    const switched = context.events.find((event) => event.type === 'view-switched');
    this.#switchView(initial, switched?.type === 'view-switched' ? switched.fromSubMode : context.render.subMode);
  }

  /** `0x45420` with `0x456ac`: `0x19b888`–`0x19ba23` from their initial values and the first erase skipped. */
  #reset(): void {
    this.#marks = new Marks();
    this.#skipErase = true;
    this.#skipReticle = null;
    this.#switchView(FLIGHT_VIEW, 0);
  }

  /** `0x459a0`; the fill of a previous label box is moot, as the layout select has just cleared B. */
  #switchView(viewMode: number, subMode: number): void {
    const marks = this.#marks;
    const { height } = this.#font.payload;
    marks.mode = viewMode;
    if (viewMode === FLIGHT_VIEW) {
      marks.flag = 1;
      marks.panel = box(PANEL.x, PANEL.y, PANEL.x + ADVANCE * PANEL.characters, PANEL.y + (height + 1) * 2);
    } else if (viewMode === WARP_VIEW) marks.flag = 2;
    else if (viewMode === EXTERNAL_VIEW) {
      if (subMode !== DESTRUCTION_SUB_MODE) fail('invariant-violated', 'label', `has no label for sub-mode ${subMode}: the slice has only the destruction view's`);
      marks.panel = box(0, 0, this.#label.length * ADVANCE + 1, height + 1);
    } else marks.flag = 0;
    const textBox = (bytes: number): Box => {
      const width = ADVANCE * bytes + 1;
      const x0 = CX - (width >> 1);
      return box(x0, TEXT_Y, x0 + width + 1, TEXT_Y + 1 + height);
    };
    Object.assign(marks, {
      inner: CENTRE, outer: CENTRE, previousInner: CENTRE, target: CENTRE, lead: CENTRE, progress: -1, leadCircle: false, leadRing: false, leadLine: false,
      leadSteps: 0, rateDue: 0, lastSeconds: 0, readoutDue: 0, autopilotErase: true, assistErase: true,
      autopilotBox: textBox(AUTOPILOT_BYTES), assistBox: textBox(ASSIST_BYTES),
      readoutBoxes: READOUTS.map(([dx, dy]) => box(CX + dx, CY + dy, CX + dx + ADVANCE * 4, CY + dy + height + 1)),
    });
  }

  /** Started by the rule only at 0 (the autopilot is always off, G-09); only the overlay advances it. */
  #startAssistFlash(): void {
    if (this.#assistCounter === 0) this.#assistCounter = 1;
  }

  /** Writes index 0 to every pixel the erase marked and uncovers it, then forgets the marks. */
  #applyErase(back: IndexedSurface): void {
    const marked = this.#eraser.coverage!;
    const coverage = back.coverage!;
    const stride = marked.length / back.height;
    marked.forEach((bits, index) => {
      if (bits === 0) return;
      const start = Math.floor(index / stride) * back.width + (index % stride) * 8;
      for (let bit = 0; bit < 8; bit++) if (bits & (0x80 >> bit)) back.indices[start + bit] = 0;
      coverage[index] &= ~bits;
    });
    marked.fill(0);
  }

  /** `0x466b4`: rings and ticks, and with the aim flag the pulse ring; all in 0 for a skip or an erase. */
  #reticle(surface: IndexedSurface, colour: number, aim: boolean, pulse: number, phase: 0 | 1): void {
    const lit = colour !== 0;
    drawCircle(surface, CX, CY, RETICLE.radius, lit && aim && phase === 0 ? COLOUR.alternate : colour, RETICLE.steps);
    if (aim) drawCircle(surface, CX, CY, RETICLE.aimRadius, lit && phase === 1 ? COLOUR.alternate : colour, pulse);
    const { tickInner: inner, tickOuter: outer, bar } = RETICLE;
    for (const sign of [-1, 1]) {
      drawLine(surface, CX, CY + sign * inner, CX, CY + sign * outer, colour);
      drawLine(surface, CX - bar, CY + sign * inner, CX + bar, CY + sign * inner, colour);
      drawLine(surface, CX + sign * inner, CY, CX + sign * outer, CY, colour);
      drawLine(surface, CX + sign * inner, CY - bar, CX + sign * inner, CY + bar, colour);
    }
    plot(surface, CX, CY, colour);
  }

  /** `0x46fe0`: new geometry every 4 units from the rates smoothed over the f32 seconds, drawn every call. */
  #rateIndicator(back: IndexedSurface, clock: number, motion: MotionPlayer): void {
    const marks = this.#marks;
    if (isDue(marks.rateDue, clock)) {
      marks.rateDue = after(clock, PERIOD.rate);
      const seconds = Math.fround(clock / 64);
      const step = Math.fround(seconds - marks.lastSeconds);
      marks.pitch = smoothRate(marks.pitch, motion.indicatorRates.row1, step);
      marks.roll = smoothRate(marks.roll, motion.indicatorRates.row3, step);
      marks.figure = rateFigure(marks.pitch, marks.roll);
      marks.lastSeconds = seconds;
    }
    this.#drawFigure(back, true);
  }

  #drawFigure(surface: IndexedSurface, lit: boolean): void {
    const { stemY, points: [x0, x1, x2, x3, x4, x5, x6, x7] } = this.#marks.figure;
    const colour = lit ? COLOUR.figure : 0;
    line(surface, CENTRE, { x: CX, y: stemY }, lit ? COLOUR.stem : 0);
    line(surface, x0, x1, colour);
    line(surface, x2, x4, colour);
    line(surface, x2, x6, colour);
    line(surface, x3, x5, colour);
    line(surface, x3, x7, colour);
  }

  /** The off-centre pointer, drawn only without the aim flag; its points are kept either way. */
  #pointer(back: IndexedSurface, entityId: EntityId): void {
    const marks = this.#marks;
    const { a, b } = this.#radar.cachedDirection(entityId);
    const at = (radius: number): OverlayPoint => ({ x: chop32(Math.fround(radius * b + CX)), y: chop32(Math.fround(radius * -a + CY)) });
    const [inner, outer] = [at(POINTER.inner), at(POINTER.outer)];
    if (!marks.aim) {
      line(back, inner, outer, COLOUR.pointer);
      line(back, marks.inner, outer, COLOUR.pointer);
    }
    marks.previousInner = marks.inner;
    marks.inner = inner;
    marks.outer = outer;
  }

  /** `0x47500`: the box, the lock rings and the name at the stored point; `draw` null repaints the shown ones in 0. */
  #targetMarks(surface: IndexedSurface, draw: TargetDraw | null): void {
    const marks = this.#marks;
    const { x, y } = marks.target;
    if (draw !== null) {
      marks.half = Math.min(Math.max((BOX.depth - marks.depth) >> BOX.shift, BOX.min), BOX.max);
      const h = marks.half;
      marks.boxShown = onScreen(x - h, y - h) && onScreen(x + h, y + h) && onScreen(x + h, y - h) && onScreen(x - h, y + h);
    }
    if (marks.boxShown) targetBox(surface, x, y, marks.half - 1, draw === null || draw.behind, draw === null ? 0 : marks.progress === 0 ? COLOUR.locked : COLOUR.box);
    const progress = marks.progress;
    const circle = (radius: number, colour: number, steps?: number): void => drawCircle(surface, x, y, toInt16(radius), colour, steps);
    if (progress > 0) {
      const outer = RINGS.gap + progress;
      if (draw === null) {
        if (marks.ringShown && fitsOnScreen(x, y, progress)) circle(progress, 0);
        if (marks.outerRingShown && fitsOnScreen(x, y, outer)) circle(outer, 0);
      } else {
        marks.ringShown = fitsOnScreen(x, y, progress);
        if (marks.ringShown) circle(progress, COLOUR.ring);
        marks.outerRingShown = progress < RINGS.outerBelow && fitsOnScreen(x, y, outer);
        if (marks.outerRingShown) circle(outer, COLOUR.ring);
        if (marks.ringShown) {
          circle(progress, 0, partialSteps(progress >> 1));
          circle(progress, COLOUR.partial, partialSteps(RINGS.partial - progress));
        }
        if (marks.outerRingShown) {
          circle(outer, 0, partialSteps(progress >> 1));
          circle(outer, COLOUR.partial, partialSteps((RINGS.outerBelow - progress) >> 2));
        }
      }
      this.#lockedRadius = RINGS.lockedStart;
    } else if (progress === 0) {
      if (draw === null) {
        if (marks.lockedRingShown) circle(this.#lockedRadius, 0);
      } else {
        if (isDue(this.#lockedRingDue, draw.clock)) {
          this.#lockedRadius -= RINGS.lockedStep;
          if (this.#lockedRadius < RINGS.lockedMin) this.#lockedRadius = RINGS.lockedStart;
          this.#lockedRingPhase = toggle(this.#lockedRingPhase);
          this.#lockedRingDue = after(draw.clock, PERIOD.lockedRing);
        }
        const radius = this.#lockedRadius;
        marks.lockedRingShown = fitsOnScreen(x, y, radius);
        if (marks.lockedRingShown) {
          circle(radius, this.#lockedRingPhase === 0 ? 11 : 10);
          circle(radius, this.#lockedRingPhase === 0 ? 10 : 11, partialSteps(radius >> 2));
        }
      }
    }
    const { height } = this.#font.payload;
    const top = y + marks.half + BOX.nameGap;
    if (draw === null) {
      const left = x - (marks.nameWidth >> 1);
      if (marks.nameShown) fill(surface, box(left, top, left + marks.nameWidth, top + height), 0);
      return;
    }
    const name = this.#names(draw.target.name).slice(0, BOX.nameBytes);
    marks.nameWidth = name.length * ADVANCE;
    const left = x - (marks.nameWidth >> 1);
    const right = left + marks.nameWidth;
    marks.nameShown = onScreen(left, top) && onScreen(right, top + height) && onScreen(right, top) && onScreen(left, top + height);
    if (marks.nameShown) drawText(surface, this.#font, name, left, top, COLOUR.name, `${PATH}.targetName`);
  }

  /** `0x47e50`: while the progress is 0, the locked text in phase 1 of its own 8-unit clock. */
  #lockedText(back: IndexedSurface, clock: number): void {
    const marks = this.#marks;
    if (marks.progress !== 0) return;
    if (isDue(this.#lockedTextDue, clock)) {
      this.#lockedTextPhase = toggle(this.#lockedTextPhase);
      if (this.#lockedTextPhase === 0) marks.lockedShown = true;
      this.#lockedTextDue = after(clock, PERIOD.lockedText);
    }
    if (this.#lockedTextPhase === 0) return;
    const width = ADVANCE * LOCKED_TEXT.bytes + 1;
    const x0 = CX - (width >> 1);
    marks.lockedBox = box(x0, LOCKED_TEXT.y, x0 + width, LOCKED_TEXT.y + this.#font.payload.height);
    drawText(back, this.#font, this.#text.overlayPlayerState4, x0, LOCKED_TEXT.y, COLOUR.locked, `${PATH}.lockedText`);
    marks.lockedShown = true;
  }

  /**
   * The missile line (in range while d < its range), then, with the guns in range (d ≤ range), the lead marks and the
   * gun line. A list without a mount leaves the previous list's speed and range in place, as the original's stack does.
   */
  #weaponsAndLead({ back, clock, camera }: CockpitDrawContext, { weapons }: CombatPlayer, motion: MotionPlayer, target: CombatTarget): void {
    const distance = weaponDistance(motion.position, target.position);
    let ballistics = weapons[1].ballistics;
    this.#weaponLine(back, clock, weapons[1], ballistics !== null && distance < ballistics.range, 1);
    ballistics = weapons[0].ballistics ?? ballistics;
    const inRange = ballistics !== null && distance <= ballistics.range;
    if (inRange) this.#leadMarks(back, camera, target, Math.fround((target.speed! / ballistics!.speed) * distance));
    this.#weaponLine(back, clock, weapons[0], inRange, 0);
  }

  /** Lead point = target + R2 × `scale`; with z > 1 it sets the aim flag and, for kinds 0x93780, draws the marks. */
  #leadMarks(back: IndexedSurface, camera: CockpitDrawContext['camera'], { position, orientation, kindBit }: CombatTarget, scale: number): void {
    const marks = this.#marks;
    const forward = matrixRow(orientation, 2);
    const lead = {
      x: Math.fround(position.x + Math.fround(forward.x * scale)),
      y: Math.fround(position.y + Math.fround(forward.y * scale)),
      z: Math.fround(position.z + Math.fround(forward.z * scale)),
    };
    const view = cameraSpace(camera, lead);
    if (!(view.z > 1)) return;
    const point = screenPoint(view);
    marks.aim = inAimBox(point);
    marks.lead = point;
    if (((1 << kindBit) & LEAD.kinds) === 0) {
      Object.assign(marks, { leadCircle: false, leadRing: false, leadLine: false });
      return;
    }
    marks.leadRadius = chop32(LEAD.base + scale);
    marks.leadRing = fitsOnScreen(point.x, point.y, marks.leadRadius);
    if (marks.leadRing) {
      marks.leadSteps = (marks.leadSteps + 1) % LEAD.steps;
      drawCircle(back, point.x, point.y, toInt16(marks.leadRadius), COLOUR.lead, marks.leadSteps);
    }
    marks.leadCircle = fitsOnScreen(point.x, point.y, LEAD.circle);
    if (marks.leadCircle) drawCircle(back, point.x, point.y, LEAD.circle, COLOUR.lead);
    marks.leadLine = onScreen(point.x, point.y);
    if (marks.leadLine) line(back, CENTRE, point, COLOUR.lead);
  }

  /** `0x47d5c`: a weapon line, shown while in range or in blink phase 1 (0x20 units); the ammunition after the name. */
  #weaponLine(back: IndexedSurface, clock: number, list: WeaponListReading, inRange: boolean, row: 0 | 1): void {
    if (isDue(this.#weaponDue, clock)) {
      this.#weaponBlink = toggle(this.#weaponBlink);
      this.#weaponDue = after(clock, PERIOD.weaponBlink);
    }
    if (!inRange && this.#weaponBlink === 0) return;
    const colour = inRange ? COLOUR.inRange : COLOUR.outOfRange;
    const { x0, y0 } = this.#marks.panel;
    const y = y0 + (this.#font.payload.height + 1) * row;
    const name = this.#weaponName(list, row);
    drawText(back, this.#font, name, x0, y, colour, `${PATH}.weapons[${row}]`);
    const ammunition = list.mount === null ? null : list.ammunition;
    if (ammunition === null || ammunition < 0) return;
    drawText(back, this.#font, String(ammunition), x0 + name.length * ADVANCE + ADVANCE, y, ammunition === 0 ? COLOUR.outOfRange : colour, `${PATH}.ammunition`);
  }

  /** `0x2dcf0`: the record's name, or the empty-slot text without a mount. */
  #weaponName({ mount, weapon }: WeaponListReading, row: number): string {
    if (mount === null) return this.#text.overlayEmptyWeaponSlot;
    if (weapon === null || weapon.asset !== this.#craftInfo.id) fail('invariant-violated', `weapons[${row}].weapon`, `must name a record of ${this.#craftInfo.id}`);
    const { guns, missiles } = this.#craftInfo.content;
    const record = (weapon.family === 'gun' ? guns : missiles)[weapon.index];
    return record?.name ?? fail('invariant-violated', `weapons[${row}].weapon.index`, `has no ${weapon.family} record ${weapon.index}`);
  }

  /** `0x46b78` with the autopilot flag clear: after a reset, step 4 draws once in 0x0F and sets the erase flag. */
  #autopilotText(back: IndexedSurface, clock: number): void {
    const marks = this.#marks;
    const engaged = false;
    if (!engaged && !marks.autopilotPrevious && marks.autopilotStep === 5) return;
    if (engaged === marks.autopilotPrevious) {
      if (isDue(marks.autopilotDue, clock)) {
        marks.autopilotDue = after(clock, PERIOD.textStep);
        marks.autopilotStep++;
      }
    } else {
      marks.autopilotStep = engaged ? 0 : 4;
      marks.autopilotDue = after(clock, PERIOD.textStep);
    }
    marks.autopilotPrevious = engaged;
    const step = marks.autopilotStep;
    if (step === 0 || step === 1 || step === 3 || step === 4) {
      const { x0, y0 } = marks.autopilotBox;
      drawText(back, this.#font, this.#text.overlayAutopilotChange, x0, y0, step < 2 ? COLOUR.autopilotOn : COLOUR.autopilotOff, `${PATH}.autopilot`);
      if (step === 1 || step === 4) {
        marks.autopilotErase = true;
        marks.autopilotStep++;
      }
    } else if (step > 5) marks.autopilotStep = 0;
  }

  /** `0x46d38`: steps every 0x26 units; 2 and 3 in 0xC, 5 and 6 in 0x13; 3 and 6 set the erase flag; past 7 it stops. */
  #assistText(back: IndexedSurface, clock: number): void {
    const marks = this.#marks;
    if (this.#assistCounter === 0) return;
    if (isDue(marks.assistDue, clock)) {
      marks.assistDue = after(clock, PERIOD.textStep);
      this.#assistCounter++;
    }
    const counter = this.#assistCounter;
    if (counter === 2 || counter === 3 || counter === 5 || counter === 6) {
      const { x0, y0 } = marks.assistBox;
      drawText(back, this.#font, this.#text.overlaySpeedAssistChange, x0, y0, counter < 4 ? COLOUR.assistOn : COLOUR.assistOff, `${PATH}.speedAssist`);
      if (counter === 3 || counter === 6) {
        marks.assistErase = true;
        this.#assistCounter++;
      }
    } else if (counter > 7) this.#assistCounter = 0;
  }

  /** `0x47f4c`: the four texts refreshed every 0x10 units into the C buffers, drawn every call. */
  #readouts(back: IndexedSurface, clock: number, motion: MotionPlayer, target: CombatTarget | null): void {
    const marks = this.#marks;
    const buffer = marks.readouts;
    const text = this.#text;
    if (isDue(marks.readoutDue, clock)) {
      const format = (template: string, value: number, slot: number): void => writeC(buffer, slot * READOUT_SLOT, formatText(template, [value], FORMAT_BYTES, `${PATH}.readouts[${slot}]`));
      const placeholder = (slot: number): void => {
        for (let index = 0; index < PLACEHOLDER_COPY; index++) buffer[slot * READOUT_SLOT + index] = text.overlayReadoutUnavailable.charCodeAt(index) || 0;
      };
      format(text.overlayValueReadout, chop32(motion.speed), 0);
      format(text.overlayPercentReadout, chop32((motion.commandedSpeed * 100) / motion.maximumSpeed), 1);
      if (target === null || target.speed === null) {
        placeholder(2);
        placeholder(3);
      } else {
        const [own, theirs] = [matrixRow(motion.orientation, 2), matrixRow(target.orientation, 2)];
        const closing = -(theirs.x * own.x + theirs.z * own.z + theirs.y * own.y) * target.speed + motion.speed;
        format(text.overlayValueReadout, chop32(closing), 2);
        const stored = Math.fround(closing);
        const time = chop32(readoutDistance(motion.position, target.position) / stored);
        if (stored < 1 || time > TIME_LIMIT) placeholder(3);
        else format(text.overlayTargetDistance, time, 3);
      }
      marks.readoutBoxes = marks.readoutBoxes.map(({ x0, y0, y1 }, slot) => box(x0, y0, readC(buffer, slot * READOUT_SLOT).length * ADVANCE + x0 + 1, y1));
      marks.readoutDue = after(clock, PERIOD.readouts);
    }
    const colours = [COLOUR.speed, COLOUR.throttle, buffer[2 * READOUT_SLOT] === 0x2d ? COLOUR.negative : COLOUR.closing, COLOUR.time];
    marks.readoutBoxes.forEach(({ x0, y0 }, slot) => drawText(back, this.#font, readC(buffer, slot * READOUT_SLOT), x0, y0, colours[slot], `${PATH}.readouts[${slot}]`));
  }
}

/** The flight overlay and destruction label of one run, reading the same run's radar module. */
export function createFlightOverlay(input: FlightOverlayInput): FlightOverlayModule {
  return new FlightOverlay(input);
}
