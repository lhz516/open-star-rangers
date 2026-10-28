/**
 * One typed DIAG line of the status page (docs/plan/p3/13/spec.md, 文字与格式化 and 左显示屏 页 0;
 * docs/original/formats/hud.md, DIAG 10489 "Timing"): the message object of `0x4f050` and its step-and-draw `0x4f108`.
 *
 * - A message keeps its bytes; each line break separates two drawn lines (the original turns it into a NUL).
 * - A step is due when next ≤ sample (u32, not strict). It types one more character, passing a line break in the same
 *   step, until the whole text is typed; after that every step toggles the cursor. next := sample + interval. One step
 *   per call at most and never a catch-up, so an interval of 0 still gives one step per call.
 * - Drawing: each part up to the typed count on its own line (pitch = the font height) at x; the cursor, when visible,
 *   is a one-pixel outline of advance × height right after the last part drawn. It starts visible.
 * - The call that finishes typing sets hold end := sample + hold; the page releases the line once the whole text is
 *   typed and hold end ≤ sample, and the next page call makes a new message.
 */
import { drawText, type HudFont } from '../raster/glyph-text.ts';
import { outlineRect, toInt16, type IndexedSurface } from '../raster/indexed-surface.ts';

const LINE_BREAK = '\n';

export interface DiagTiming {
  /** Clock units between steps. */
  readonly characterTicks: number;
  /** Clock units the typed message stays. */
  readonly holdTicks: number;
}

/** The read-only state of one line. */
export interface DiagLineState {
  readonly text: string;
  readonly colour: number;
  /** Bytes typed, line breaks included. */
  readonly typed: number;
  /** u32 sample at which the next step is due. */
  readonly next: number;
  /** u32 sample at which the typed message ends; 0 until it is typed. */
  readonly holdEnd: number;
  readonly cursor: boolean;
}

export class DiagLine {
  readonly text: string;
  readonly colour: number;
  readonly #timing: DiagTiming;
  #typed = 0;
  #next = 0;
  #holdEnd = 0;
  #cursor = true;

  constructor(text: string, colour: number, timing: DiagTiming) {
    this.text = text;
    this.colour = colour;
    this.#timing = timing;
  }

  /** The next step is due at `clock` (`0x4d0e0`'s draw test). */
  due(clock: number): boolean {
    return this.#next <= clock >>> 0;
  }

  /** Typed out and held to its end: the page releases it after this call. */
  finished(clock: number): boolean {
    return this.text.length <= this.#typed && this.#holdEnd <= clock >>> 0;
  }

  /** `0x4f108`: at most one step, then the parts and the cursor with the top-left of the first part at (x, y). */
  stepAndDraw(surface: IndexedSurface, font: HudFont, x: number, y: number, clock: number): void {
    const sample = clock >>> 0;
    const { text, colour } = this;
    if (this.#next <= sample) {
      if (this.#holdEnd === 0) {
        do this.#typed++;
        while (this.#typed < text.length && text[this.#typed] === LINE_BREAK);
      } else this.#cursor = !this.#cursor;
      this.#next = (sample + this.#timing.characterTicks) >>> 0;
    }
    const { advance, payload: { height } } = font;
    let [offset, top, width] = [0, y, 0];
    while (this.#typed - offset >= 1) {
      const end = text.indexOf(LINE_BREAK, offset);
      const length = (end < 0 ? text.length : end) - offset;
      const count = Math.min(length, this.#typed - offset);
      drawText(surface, font, text.slice(offset, offset + count), x, top, colour, 'diag');
      width = count * advance;
      offset += length + 1;
      top += height;
    }
    if (this.#cursor) outlineRect(surface, toInt16(x + width), toInt16(top - height), advance, height, colour);
    if (this.#typed === text.length && this.#holdEnd === 0) this.#holdEnd = (sample + this.#timing.holdTicks) >>> 0;
  }

  state(): DiagLineState {
    return Object.freeze({ text: this.text, colour: this.colour, typed: this.#typed, next: this.#next, holdEnd: this.#holdEnd, cursor: this.#cursor });
  }
}
