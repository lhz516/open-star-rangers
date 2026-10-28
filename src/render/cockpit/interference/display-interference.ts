/**
 * The displays' interference picture (docs/plan/p3/13/spec.md, 左显示屏 SNIP 干扰 and D-01 定稿 DC-10/DC-11;
 * docs/original/formats/hud.md, SNIP 10487 and §4.4/§4.5), shared by the left display (`0x4ce30`) and the right display
 * (`0x42d80`, subtask 20).
 *
 * - **Frames:** the imported frames `image/hud/display-interference/frame-<i>` (opaque, direct, one size); the SNIP
 *   entry is never parsed again here.
 * - **Gate:** each display, and each left page, keeps its own on/off, start and next toggle (`InterferenceGate`). The
 *   two primitives are the branches both displays share: field state 2 switches on and records the start when it was
 *   off; a due toggle at state 1 flips, records the start when switching on, and draws one rand for the next toggle,
 *   clock + 0x40 + (rand & 0x3F). When a toggle is due and what state 0 does differ between the displays and stay with
 *   them.
 * - **Picture (`0x4d010`):** frame ((clock − start) × 12, u32) >> 6, modulo the frame count, opaque at (x0, y0 + 1);
 *   the rectangle is published unless the call is forced. An unforced call whose frame equals the shared "last frame"
 *   `0x175ed4` (−1 at first) draws nothing; every call leaves its frame there. One `DisplayInterference` serves both
 *   displays of a run, so two displays in interference can skip each other's update, as in the original (DC-10).
 * - **Per run (Δ-04):** the original never resets the gates or the last frame; here they start afresh with each run.
 */
import { fail } from '../../../content/contract-validation.ts';
import type { ImagePayload } from '../../../content/graphics/image-payload.ts';
import type { InclusiveRectangle } from '../../../content/hud/instruments-payload.ts';
import type { RandSource } from '../../../core/rules/original-random.ts';
import type { CockpitDrawContext } from '../presentation/cockpit-contract.ts';
import { COCKPIT_LIMITS } from '../presentation/cockpit-limits.ts';
import { blit } from '../raster/indexed-surface.ts';

/** The state-1 toggle interval: 0x40 + (rand & 0x3F) clock units. */
export const INTERFERENCE_TOGGLE = Object.freeze({ base: 0x40, randomMask: 0x3f });

/** Frame = ((clock − start) × 12, u32) >> 6 (`0x4d010`). */
const FRAME_STEP = 12;
const FRAME_SHIFT = 6;

/** One display's (or one left page's) interference state; only its owner and the primitives below change it. */
export interface InterferenceGate {
  on: boolean;
  /** u32 clock of the last switch on. */
  start: number;
  /** u32 clock after which the next toggle (or the state-2 switch on) is due. */
  nextToggle: number;
}

/** The original's static initial values: off, start 0, next toggle 0. */
export const createInterferenceGate = (): InterferenceGate => ({ on: false, start: 0, nextToggle: 0 });

/** Field state 2: switches on, recording the start when it was off; the next toggle is not advanced. */
export function holdInterference(gate: InterferenceGate, clock: number): void {
  if (gate.on) return;
  gate.on = true;
  gate.start = clock >>> 0;
}

/** A due toggle at field state 1: flips, records the start when switching on, and draws one rand for the next toggle. */
export function toggleInterference(gate: InterferenceGate, clock: number, random: RandSource): void {
  const sample = clock >>> 0;
  gate.on = !gate.on;
  if (gate.on) gate.start = sample;
  gate.nextToggle = (sample + INTERFERENCE_TOGGLE.base + (random.next() & INTERFERENCE_TOGGLE.randomMask)) >>> 0;
}

/** The frame `0x4d010` picks: ((clock − start) × 12, u32) >> 6, modulo the frame count once it reaches it. */
export function interferenceFrame(clock: number, start: number, frameCount: number): number {
  const frame = (Math.imul((clock - start) >>> 0, FRAME_STEP) >>> 0) >>> FRAME_SHIFT;
  return frame < frameCount ? frame : frame % frameCount;
}

/** The interference picture of one run, shared by the left and right displays. */
export interface DisplayInterference {
  readonly frameCount: number;
  /** The shared "last frame" `0x175ed4`: −1 until the first call. */
  lastFrame(): number;
  /**
   * `0x4d010` for the display rectangle `rect` with interference since `start`: draws the frame into B at
   * (x0, y0 + 1) and publishes `rect` unless `forced`; an unforced call of the last frame draws nothing. Returns
   * whether it drew.
   */
  draw(context: CockpitDrawContext, rect: InclusiveRectangle, start: number, forced: boolean): boolean;
}

/** Checks the imported frames: at least one opaque `direct` image, all of one size within the screen. */
function checkFrames(frames: readonly ImagePayload[], path: string): readonly ImagePayload[] {
  if (!Array.isArray(frames) || frames.length === 0) fail('binding-mismatch', path, 'must be a non-empty list of frames');
  const [{ width, height }] = frames;
  frames.forEach((frame, index) => {
    const at = `${path}[${index}]`;
    if (frame?.kind !== 'image' || frame.display !== 'direct' || frame.mask !== null) fail('binding-mismatch', at, 'must be an opaque direct image');
    if (frame.width !== width || frame.height !== height) fail('binding-mismatch', at, 'must have the size of the first frame');
  });
  if (width > COCKPIT_LIMITS.surface.width || height > COCKPIT_LIMITS.surface.height) fail('binding-mismatch', path, 'must fit the screen');
  return Object.freeze([...frames]);
}

/** One run's interference picture over the imported frames; the last frame starts at −1. */
export function createDisplayInterference(frames: readonly ImagePayload[], path = 'interference.frames'): DisplayInterference {
  const checked = checkFrames(frames, path);
  let last = -1;
  return Object.freeze({
    frameCount: checked.length,
    lastFrame: () => last,
    draw(context: CockpitDrawContext, rect: InclusiveRectangle, start: number, forced: boolean): boolean {
      const frame = interferenceFrame(context.clock, start, checked.length);
      if (!forced && frame === last) return false;
      last = frame;
      blit(context.back, checked[frame], rect.x0, rect.y0 + 1, 'opaque');
      if (!forced) context.publish(rect);
      return true;
    },
  });
}
