/**
 * The message line's bounded queue (docs/original/formats/hud.md §4.7; docs/plan/p3/13/spec.md, 消息行 and D-01 定稿
 * DC-07/DC-08). Only appends at the tail (`0x4e9e8`), drops the head (`0x4e9b0`), expires the head (`0x4e964`) and
 * advances the head as the draw `0x4e6c0` does; it draws nothing. Queuing, first display, unshown expiry and scrolling
 * out are distinct: an item's start is the sample of its first logical display (null before, not 0), never its post.
 *
 * - **Bounds (Δ-05):** at most 64 items of at most 128 bytes, 8 KiB of text in all; a new item past any bound is
 *   dropped and counted in `drops`, never thrown (the original's only full behaviour drops the new item too).
 * - **Clock:** u32 mission clock samples; the expiry is post + unshown expiry (u32), dt and the shift are u32.
 */
import type { MessageIdentity } from '../../../core/world/world-state.ts';
import { COCKPIT_LIMITS } from '../presentation/cockpit-limits.ts';

/** Scrolling speed: mode 1 moves 48/64 pixels per clock unit, mode 2 (any other in the original) 120/64. */
export type MessageMode = 1 | 2;

/** The imported flight messages, or `incoming` for a G-03 summary. */
export type MessageSource = 'missionComplete' | 'beacon' | 'speedAssistOn' | 'speedAssistOff' | 'incoming';

/** fonts/0's advance in HI, which sets every item's width. */
export const MESSAGE_ADVANCE = 8;

/** What a post adds. */
export interface MessagePost {
  readonly source: MessageSource;
  /** The incoming message a G-03 summary stands for; null for imported texts. */
  readonly message: MessageIdentity | null;
  /** False when the uncovered feedback replaced a missing summary. */
  readonly covered: boolean;
  /** Byte string. */
  readonly text: string;
  readonly colour: number;
  readonly mode: MessageMode;
  /** Clock units an unshown item lasts as the head. */
  readonly unshownExpiry: number;
}

export interface MessageItem extends MessagePost {
  /** Order of posting from 1; identifies an item across snapshots. */
  readonly serial: number;
  /** 8 × bytes. */
  readonly width: number;
  /** The post sample + unshownExpiry, u32. */
  readonly expiry: number;
  /** The sample of the first logical display; null while unshown. */
  readonly firstShown: number | null;
}

/** The head as one logical display leaves it: offset of the text origin from x0. */
export interface ShownHead {
  readonly item: MessageItem;
  readonly offset: number;
}

type Mutable<T> = { -readonly [Key in keyof T]: T[Key] };

const SPEED: Readonly<Record<MessageMode, number>> = Object.freeze({ 1: 48, 2: 120 });

export class MessageQueue {
  readonly #items: Mutable<MessageItem>[] = [];
  #textBytes = 0;
  #serial = 0;
  #drops = 0;
  /** The original's clear flag: the next draw outside view 8 clears the whole rectangle. */
  clear = false;

  get length(): number {
    return this.#items.length;
  }

  get drops(): number {
    return this.#drops;
  }

  get head(): MessageItem | null {
    return this.#items[0] ?? null;
  }

  /** Appends at the tail; returns false and counts a drop when a bound would be passed. */
  post(post: MessagePost, sample: number): boolean {
    const { length } = post.text;
    if (this.#items.length >= COCKPIT_LIMITS.messages || length > COCKPIT_LIMITS.messageBytes || this.#textBytes + length > COCKPIT_LIMITS.messageTextBytes) {
      this.#drops++;
      return false;
    }
    this.#textBytes += length;
    this.#items.push({
      ...post, serial: ++this.#serial, width: length * MESSAGE_ADVANCE, expiry: (sample + post.unshownExpiry) >>> 0, firstShown: null,
    });
    return true;
  }

  /** `0x4e9b0`: drops the head if any and sets the clear flag either way. */
  dropHead(): void {
    this.#remove();
  }

  /** `0x4e964`: removes the head when it was never shown and `sample` is strictly past its expiry (u32). */
  expire(sample: number): void {
    const head = this.#items[0];
    if (head !== undefined && head.firstShown === null && sample >>> 0 > head.expiry) this.#remove();
  }

  /**
   * `0x4e6c0` steps 2, 4 and 5 for a line of inner width `innerWidth` (x1 − x0 − 1): starts the head at its first
   * display, computes the offset W − ((dt × speed mod 2³²) >> 6), and removes the head, returning null so that nothing
   * is drawn, once width + offset ≤ 0 (signed). Null without a head.
   */
  show(sample: number, innerWidth: number): ShownHead | null {
    const head = this.#items[0];
    if (head === undefined) return null;
    head.firstShown ??= sample >>> 0;
    const dt = (sample - head.firstShown) >>> 0;
    const offset = (innerWidth - (Math.imul(dt, SPEED[head.mode]) >>> 6)) | 0;
    if (((head.width + offset) | 0) <= 0) {
      this.#remove();
      return null;
    }
    return { item: head, offset };
  }

  #remove(): void {
    const head = this.#items.shift();
    if (head !== undefined) this.#textBytes -= head.text.length;
    this.clear = true;
  }
}
