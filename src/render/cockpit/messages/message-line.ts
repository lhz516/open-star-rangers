/**
 * The message line, type 8 (docs/original/formats/hud.md §4.7; docs/plan/p3/13/spec.md, 消息行 and D-01 定稿
 * DC-07/DC-08): one bounded queue per run (message-queue.ts), drawn in each layout's type-8 rectangle (slots 0, 2 and
 * 7) and kept across views. It consumes only the presentation's ordered tick events, never the Event Bus, so every
 * event is taken once; repeated queries, redraws and 0-tick frames change nothing.
 *
 * Per tick (cockpit-contract.ts):
 * - ① in event order: each `radio-flushed` drops the head then (a drop on an empty queue still sets the clear flag);
 *   `flight-message: beacon` drops the head and posts the beacon (0x0C, mode 1, 0x3C0); `flight-message:
 *   missionComplete` only posts (0x0C, mode 1, 0x280) with the previous tick's sample, as its own `radio-flushed`
 *   precedes it; `speed-assist-toggled` posts `speedAssistOn`/`Off` by `enabled` (0x0F, mode 2, 0x140).
 * - ③ the global callback expires the head; the type-8 record draws (never throttled: every record's interval is 0).
 *   In the base view (6), which has no slot, the global callback also advances the head as the draw in the base layout
 *   10097's slot 0 would, whose rectangle is slot 0's (hud §4.7), without pixels: the base page shows the same head.
 * - ④ `incoming-started` posts the G-03 summary (colour 8, mode 1, 0x200), so it is first shown by the next eligible
 *   draw; `radio-queued`, `radio-taken` and `incoming-ended` post nothing, and a message that starts and ends in one
 *   tick is still posted once.
 * - Without a player entity, and in views without a cockpit call (0x13), the line is frozen: no expiry, no draw.
 *
 * The read port (`snapshot`, `subscribe`) gives the base page the same head and the current incoming summary; it is
 * not a second queue, timer or replay. A change is published at the end of the hook that made it.
 */
import type { FontPayload } from '../../../content/graphics/font-payload.ts';
import type { InstrumentRecord } from '../../../content/hud/instruments-payload.ts';
import type { FlightMessages } from '../../../content/rule-data/flight-messages.ts';
import type { DomainEvent } from '../../../core/contracts/domain-events.ts';
import type { IncomingView } from '../../../core/projections/projection.ts';
import type { MessageIdentity, SpeakerSnapshot } from '../../../core/world/world-state.ts';
import type { CockpitDrawContext, CockpitModule, CockpitTickContext } from '../presentation/cockpit-contract.ts';
import { PresentationError } from '../presentation/cockpit-limits.ts';
import { drawText, hudFont, wholeGlyphRange, type HudFont } from '../raster/glyph-text.ts';
import { clearRect, fillRect, outlineRect } from '../raster/indexed-surface.ts';
import { checkSummaryText, resolveSummary, type IncomingCopy } from './message-copy.ts';
import { MESSAGE_ADVANCE, MessageQueue, type MessagePost, type MessageSource } from './message-queue.ts';

export interface MessageLineInput {
  /** fonts/0 (`font/hud/8x8-1`), the message line's HI font (advance 8, no upper-casing). */
  readonly font: FontPayload;
  /** `data/flight-messages`. */
  readonly flightMessages: FlightMessages;
  /** The app's G-03 copy. */
  readonly copy: IncomingCopy;
}

/** The queue head the base page shows; `origin` tells imported text from project text. */
export interface MessageLineHead {
  readonly serial: number;
  readonly source: MessageSource;
  readonly origin: 'original' | 'project';
  readonly text: string;
  /** The incoming message of a G-03 summary; null for imported texts. */
  readonly message: MessageIdentity | null;
  /** False when the uncovered feedback stands for a missing summary. */
  readonly covered: boolean;
}

/** The message playing now (the tick's `communications.player.incoming`) with its G-03 summary. */
export interface MessageLineIncoming {
  readonly message: MessageIdentity;
  readonly speaker: SpeakerSnapshot | null;
  /** Page 5 shows it. */
  readonly shown: boolean;
  readonly summary: string;
  readonly covered: boolean;
}

export interface MessageLineSnapshot {
  readonly head: MessageLineHead | null;
  readonly incoming: MessageLineIncoming | null;
  /** Queued items, the head included. */
  readonly length: number;
  /** New items dropped at a bound (Δ-05). */
  readonly messageDrops: number;
}

export type MessageLineListener = (snapshot: MessageLineSnapshot) => void;

export interface MessageLineModule extends CockpitModule {
  /** The state after the last processed hook; frozen, a new object only after a change. */
  snapshot(): MessageLineSnapshot;
  /**
   * Calls `listener` synchronously at the end of each hook that changed the snapshot; returns the unsubscribe. A
   * listener that throws fails the presentation like any hook.
   */
  subscribe(listener: MessageLineListener): () => void;
}

const PATH = 'messages';
const TYPE = 8;
/** hud §4.7 and executable.md, completion and beacon messages. */
const COMPLETION = Object.freeze({ colour: 0x0c, mode: 1, unshownExpiry: 0x280 } as const);
const BEACON = Object.freeze({ colour: 0x0c, mode: 1, unshownExpiry: 0x3c0 } as const);
const SPEED_ASSIST = Object.freeze({ colour: 0x0f, mode: 2, unshownExpiry: 0x140 } as const);
/** The original's incoming-text parameters, which the G-03 summary takes (DC-07). */
const INCOMING = Object.freeze({ colour: 8, mode: 1, unshownExpiry: 0x200 } as const);
/** The map view's outline colour (ps +0x28 = 8). */
const MAP_OUTLINE_COLOUR = 8;
const BLANK = 0;
/** The base view's layout number in the content, whose type-8 rectangle 10097's slot 0 repeats. */
const FRONT_LAYOUT = 0;

const sameIdentity = (a: MessageIdentity, b: MessageIdentity): boolean => a.table === b.table && a.face === b.face && a.index === b.index;
const sameSpeaker = (a: SpeakerSnapshot | null, b: SpeakerSnapshot | null): boolean => a === b || (a !== null && b !== null && a.entityId === b.entityId);

class MessageLine implements MessageLineModule {
  readonly name = 'message-line';
  readonly instruments = Object.freeze({ [TYPE]: Object.freeze({ draw: (context: CockpitDrawContext, record: InstrumentRecord) => this.#hook(() => this.#draw(context, record)) }) });
  readonly #font: HudFont;
  readonly #messages: FlightMessages;
  readonly #copy: IncomingCopy;
  readonly #queue = new MessageQueue();
  readonly #listeners = new Set<MessageLineListener>();
  #incoming: MessageLineIncoming | null = null;
  #snapshot: MessageLineSnapshot | null = null;
  #disposed = false;

  constructor({ font, flightMessages, copy }: MessageLineInput) {
    this.#font = hudFont(font, MESSAGE_ADVANCE, false);
    this.#messages = flightMessages;
    this.#copy = copy;
    checkSummaryText(copy.uncoveredSummary, font, `${PATH}.copy.uncoveredSummary`);
  }

  beforeDraw(context: CockpitTickContext, event: DomainEvent): void {
    this.#hook(() => {
      const { clock, clockUnitsPerTick } = context;
      switch (event.type) {
        case 'radio-flushed':
          this.#queue.dropHead();
          return;
        case 'flight-message':
          if (event.message === 'beacon') {
            this.#queue.dropHead();
            this.#post('beacon', BEACON, clock);
          } else {
            this.#post('missionComplete', COMPLETION, clock - clockUnitsPerTick);
          }
          return;
        case 'speed-assist-toggled':
          this.#post(event.enabled ? 'speedAssistOn' : 'speedAssistOff', SPEED_ASSIST, clock);
          return;
      }
    });
  }

  prepare(context: CockpitTickContext): void {
    this.#hook(() => {
      const incoming = context.projection.communications.player?.incoming ?? null;
      if (incoming === null) {
        this.#incoming = null;
        return;
      }
      const current = this.#incoming;
      if (current !== null && sameIdentity(current.message, incoming.message) && sameSpeaker(current.speaker, incoming.speaker) && current.shown === incoming.shown) return;
      this.#incoming = this.#incomingView(incoming);
    });
  }

  global(context: CockpitDrawContext): void {
    this.#hook(() => {
      if (this.#frozen(context)) return;
      this.#queue.expire(context.clock);
      if (context.layout.view === 'base') this.#advanceBase(context);
    });
  }

  afterDraw(context: CockpitTickContext, event: DomainEvent): void {
    this.#hook(() => {
      if (event.type !== 'incoming-started') return;
      const { text, covered } = resolveSummary(this.#copy, event.message, this.#font.payload, `${PATH}.copy`);
      this.#queue.post({ source: 'incoming', message: event.message, covered, text, ...INCOMING }, context.clock);
    });
  }

  dispose(): void {
    this.#disposed = true;
    this.#listeners.clear();
  }

  snapshot(): MessageLineSnapshot {
    this.#require('snapshot');
    return this.#snapshot ??= this.#build();
  }

  subscribe(listener: MessageLineListener): () => void {
    this.#require('subscribe');
    if (typeof listener !== 'function') throw new PresentationError('invalid-input', `${PATH}.subscribe`, 'needs a listener function');
    this.#listeners.add(listener);
    return () => void this.#listeners.delete(listener);
  }

  #require(operation: string): void {
    if (this.#disposed) throw new PresentationError('invalid-state', `${PATH}.${operation}`, 'is not allowed once the message line is disposed');
  }

  /** Runs one hook, then publishes the snapshot if the hook changed what it shows. */
  #hook(body: () => void): void {
    const queue = this.#queue;
    const serial = queue.head?.serial;
    const incoming = this.#incoming;
    const { length, drops } = queue;
    body();
    if (queue.head?.serial === serial && this.#incoming === incoming && queue.length === length && queue.drops === drops) return;
    this.#snapshot = null;
    const snapshot = this.snapshot();
    for (const listener of [...this.#listeners]) listener(snapshot);
  }

  #build(): MessageLineSnapshot {
    const head = this.#queue.head;
    return Object.freeze({
      head: head === null ? null : Object.freeze({
        serial: head.serial, source: head.source, origin: head.source === 'incoming' ? 'project' : 'original', text: head.text, message: head.message, covered: head.covered,
      }),
      incoming: this.#incoming,
      length: this.#queue.length,
      messageDrops: this.#queue.drops,
    });
  }

  #incomingView({ message, speaker, shown }: IncomingView): MessageLineIncoming {
    const { text, covered } = resolveSummary(this.#copy, message, this.#font.payload, `${PATH}.copy`);
    return Object.freeze({ message, speaker, shown, summary: text, covered });
  }

  /** Posts an imported flight message. */
  #post(source: Exclude<MessageSource, 'incoming'>, parameters: Pick<MessagePost, 'colour' | 'mode' | 'unshownExpiry'>, sample: number): void {
    this.#queue.post({ source, message: null, covered: true, text: this.#messages[source], ...parameters }, sample);
  }

  /** The original freezes the line without a player entity. */
  #frozen(context: CockpitTickContext): boolean {
    return context.projection.player.entityId === null;
  }

  /** The base layout's draw without pixels: it consumes the clear flag and advances the head in slot 0's rectangle. */
  #advanceBase({ content, clock }: CockpitDrawContext): void {
    const record = content.slots.find(({ layoutNumber }) => layoutNumber === FRONT_LAYOUT)?.instruments.find(({ type }) => type === TYPE);
    if (record === undefined) throw new PresentationError('invariant-violated', `${PATH}.base`, 'needs slot 0\'s type-8 record');
    this.#queue.clear = false;
    const { x0, x1 } = record.rectangle;
    this.#queue.show(clock, x1 - x0 - 1);
  }

  /**
   * `0x4e6c0` for the record's rectangle in the current view (hud §4.7 steps 1–7). Where the rectangle lies in world
   * rows (slot 7 in view 0x11), the world layers of later frames draw over what an earlier draw left in the buffer
   * (FC2: no whole-buffer clear), so each draw first uncovers those rows: an earlier fill with index 0 then shows the
   * world as the original's black space under it would, while this draw's fills cover it again.
   */
  #draw(context: CockpitDrawContext, { rectangle }: InstrumentRecord): void {
    if (this.#frozen(context)) return;
    const { back, layout, clock } = context;
    const { x0, y0, x1, y1 } = rectangle;
    const { worldRows } = layout;
    if (worldRows !== null && y0 <= worldRows.bottom && y1 >= worldRows.top) {
      clearRect(back, x0, Math.max(y0, worldRows.top), x1, Math.min(y1, worldRows.bottom));
    }
    const map = layout.view === 'map';
    const copies = !(layout.slot?.alwaysRedraw ?? false);
    const queue = this.#queue;
    if (queue.clear && !map) {
      fillRect(back, x0, y0, x1, y1, BLANK);
      if (copies) context.publish(rectangle);
      queue.clear = false;
    }
    const innerWidth = x1 - x0 - 1;
    const shown = queue.show(clock, innerWidth);
    if (shown === null) return;
    const { item: { text, colour }, offset } = shown;
    const { height } = this.#font.payload;
    const y = Math.trunc((y0 + y1 - height) / 2);
    if (map) fillRect(back, x0, y0, x1 - 1, y1 - 1, BLANK);
    else fillRect(back, x0, y, x1 - 1, y + height, BLANK);
    const { first, end } = wholeGlyphRange(text.length, offset, MESSAGE_ADVANCE, innerWidth);
    if (end > first) drawText(back, this.#font, text.slice(first, end), x0 + offset + first * MESSAGE_ADVANCE, y, colour, `${PATH}.text`);
    if (map) outlineRect(back, x0, y0, x1 - x0 - 1, y1 - y0 - 1, MAP_OUTLINE_COLOUR);
    else if (copies) context.publish({ x0, y0: y, x1: x1 - 1, y1: y + height });
  }
}

/** A message line for one run; register it first among the cockpit modules (global callback order 8, 6, 9, 12). */
export function createMessageLine(input: MessageLineInput): MessageLineModule {
  return new MessageLine(input);
}
