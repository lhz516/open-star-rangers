import { describe, expect, it } from 'vitest';
import type { DomainEvent } from '../../../core/contracts/domain-events.ts';
import type { MessageIdentity } from '../../../core/world/world-state.ts';
import type { CockpitPresentation } from '../presentation/cockpit-contract.ts';
import {
  BASE_VIEW, cockpitBatch, cockpitContent, cockpitTick, createTestPresentation, DESTRUCTION_SUB_MODE, EXTERNAL_VIEW, FLIGHT_VIEW,
  isolatedDrawContext, MAP_VIEW, syntheticEvent, viewSwitched, type TickOptions,
} from '../presentation/cockpit.test-support.ts';
import { isCovered, type IndexedSurface } from '../raster/indexed-surface.ts';
import { createMessageLine, type MessageLineModule, type MessageLineSnapshot } from './message-line.ts';
import { FLIGHT_MESSAGES, glyphOrigins, message, pixelsIn, readGlyphs, syntheticCopy, syntheticFont } from './messages.test-support.ts';

// hud §4.7 and DC-07 with synthetic content: slot rectangles set to the HI geometry of hud §4.7 (slot 0
// (229,456)–(411,472), W 181, text rows 460–467; slot 2 (152,411)–(392,427), W 239; slot 7 (229,4)–(411,20)).

const FONT = syntheticFont();
const SLOT0 = { x0: 229, y0: 456, x1: 411, y1: 472 };
const SLOT2 = { x0: 152, y0: 411, x1: 392, y1: 427 };
const SLOT7 = { x0: 229, y0: 4, x1: 411, y1: 20 };
const CONTENT = cockpitContent((content) => {
  const [front, map, external] = content.slots;
  front.instruments.find(({ type }) => type === 8)!.rectangle = { ...SLOT0 };
  map.instruments.find(({ type }) => type === 8)!.rectangle = { ...SLOT2 };
  external.instruments[0].rectangle = { ...SLOT7 };
});
const TEXT_ROW = 460;
const PLAYER = { player: { entityId: 7 } } as const;

const flushed = (tick: number, cause = 'docking-cancel'): DomainEvent => syntheticEvent(tick, 'radio-flushed', { cause, removed: 0, interrupted: 'none' });
const flightMessage = (tick: number, text: 'beacon' | 'missionComplete'): DomainEvent => syntheticEvent(tick, 'flight-message', { message: text });
const assist = (tick: number, enabled: boolean): DomainEvent => syntheticEvent(tick, 'speed-assist-toggled', { enabled, commandIndex: 0 });
const started = (tick: number, identity: MessageIdentity = message(20011, 1)): DomainEvent =>
  syntheticEvent(tick, 'incoming-started', { message: identity, speaker: null, frameDurations: [1], shown: true });
const ended = (tick: number, identity: MessageIdentity = message(20011, 1)): DomainEvent =>
  syntheticEvent(tick, 'incoming-ended', { message: identity, speaker: null, callback: 'none', countdownStarted: false });
const radioQueued = (tick: number): DomainEvent =>
  syntheticEvent(tick, 'radio-queued', { message: message(20011, 1), callback: 'none', speaker: null, position: 'sorted', length: 1 });
const radioTaken = (tick: number): DomainEvent => syntheticEvent(tick, 'radio-taken', { message: message(20011, 1), speaker: null });

function line(overrides: Partial<Parameters<typeof createMessageLine>[0]> = {}): MessageLineModule {
  return createMessageLine({ font: FONT, flightMessages: FLIGHT_MESSAGES, copy: syntheticCopy(), ...overrides });
}

interface Run {
  readonly presentation: CockpitPresentation;
  readonly line: MessageLineModule;
  /** Advances ticks first…last (options per tick), in groups of at most five. */
  advance(first: number, last: number, options?: (tick: number) => TickOptions): void;
}

function start(options: { viewMode?: number; line?: MessageLineModule; player?: boolean } = {}): Run {
  const module = options.line ?? line();
  const patch = options.player === false ? {} : PLAYER;
  const presentation = createTestPresentation({ modules: [module], content: CONTENT, viewMode: options.viewMode ?? FLIGHT_VIEW, patch });
  let viewMode = options.viewMode ?? FLIGHT_VIEW;
  let subMode = 0;
  return {
    presentation,
    line: module,
    advance(first, last, perTick = () => ({})) {
      for (let tick = first; tick <= last; tick += 5) {
        const ticks = [];
        for (let at = tick; at <= Math.min(last, tick + 4); at++) {
          const tickOptions = perTick(at);
          for (const event of tickOptions.events ?? []) {
            if (event.type === 'view-switched') ({ viewMode, subMode } = event);
          }
          ticks.push(cockpitTick(at, { viewMode, subMode, patch, ...tickOptions }));
        }
        presentation.advance(cockpitBatch(ticks));
      }
    },
  };
}

const back = (run: Run): IndexedSurface => run.presentation.surfaces().back;
const coveredIn = (surface: IndexedSurface, { x0, y0, x1, y1 }: typeof SLOT0): number => {
  let covered = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (isCovered(surface, x, y)) covered++;
  return covered;
};
const screen = (run: Run): IndexedSurface => run.presentation.surfaces().screen;
const at = (events: Record<number, readonly DomainEvent[]>) => (tick: number): TickOptions => ({ events: events[tick] ?? [] });

describe('message line queue order and phases', () => {
  it('drops one head per radio-flushed before the draw, the completion message only posting after its own flush', () => {
    const run = start();
    run.advance(1, 2, at({
      1: [assist(1, true), assist(1, false), flightMessage(1, 'beacon')],
      2: [flushed(2, 'completion-message'), flightMessage(2, 'missionComplete')],
    }));
    // Tick 1: on, off, then the beacon drops `on` and queues behind `off`; tick 2: the flush drops `off`.
    expect(run.line.snapshot()).toMatchObject({ head: { source: 'beacon', origin: 'original', text: 'Beacon on' }, length: 2, messageDrops: 0 });
    run.advance(3, 3, at({ 3: [flushed(3)] }));
    expect(run.line.snapshot()).toMatchObject({ head: { source: 'missionComplete', text: 'Mission done' }, length: 1 });
  });

  it('posts the G-03 summary after the draw, so it is first shown by the next tick, in any grouping', () => {
    const events = at({ 3: [started(3)], 4: [assist(4, true)] });
    const states: MessageLineSnapshot[] = [];
    const pictures: number[][] = [];
    for (const groups of [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10], [5, 10], [2, 5, 10]]) {
      const run = start();
      let from = 1;
      for (const to of groups) {
        run.advance(from, to, events);
        from = to + 1;
      }
      states.push(run.line.snapshot());
      pictures.push(glyphOrigins(back(run), TEXT_ROW, 8, SLOT0.x0, SLOT0.x1));
    }
    expect(states[1]).toEqual(states[0]);
    expect(states[2]).toEqual(states[0]);
    expect(pictures[1]).toEqual(pictures[0]);
    expect(pictures[2]).toEqual(pictures[0]);
    // First shown at tick 4 (clock 8): at tick 10, dt 12 → offset 181 − 9 = 172, one whole glyph at x0 + 172.
    expect(pictures[0]).toEqual([SLOT0.x0 + 172]);
    // Negative control: the beacon posted before tick 4's draw is first shown at tick 4 too, while a summary shown at
    // its own tick 3 would stand at x0 + 171 at tick 10.
    const early = start();
    early.advance(1, 10, at({ 4: [flightMessage(4, 'beacon')] }));
    expect(glyphOrigins(back(early), TEXT_ROW, 0x0c, SLOT0.x0, SLOT0.x1)).toEqual([SLOT0.x0 + 172]);
  });

  it('is not shown in the tick it starts: the draw saw an empty queue', () => {
    const run = start();
    run.advance(1, 8, at({ 1: [started(1)] }));
    expect(run.line.snapshot().head).toMatchObject({ source: 'incoming', origin: 'project', text: 'Summary 1', covered: true });
    // First shown at tick 2 (clock 4): at tick 8, dt 12 → offset 181 − 9 = 172. A beacon of tick 1, shown at tick 1,
    // stands at dt 14 → 181 − 10 = x0 + 171.
    expect(glyphOrigins(back(run), TEXT_ROW, 8, SLOT0.x0, SLOT0.x1)).toEqual([SLOT0.x0 + 172]);
    const beacon = start();
    beacon.advance(1, 8, at({ 1: [flightMessage(1, 'beacon')] }));
    expect(glyphOrigins(back(beacon), TEXT_ROW, 0x0c, SLOT0.x0, SLOT0.x1)).toEqual([SLOT0.x0 + 171]);
  });

  it('posts a message that starts and ends in one tick once, and nothing for radio-queued, radio-taken or incoming-ended', () => {
    const run = start();
    run.advance(1, 2, at({ 1: [radioQueued(1), radioTaken(1)], 2: [ended(2)] }));
    expect(run.line.snapshot()).toMatchObject({ head: null, length: 0 });
    run.advance(3, 3, at({ 3: [started(3), ended(3)] }));
    expect(run.line.snapshot()).toMatchObject({ head: { source: 'incoming' }, length: 1 });
  });

  it('ends in the same state and publications for any frame grouping of a sequence across views', () => {
    const events: Record<number, readonly DomainEvent[]> = {
      1: [assist(1, true), assist(1, false)],
      2: [started(2, message(20011, 4))],
      3: [flushed(3)],
      4: [flightMessage(4, 'beacon')],
      5: [viewSwitched(5, FLIGHT_VIEW, MAP_VIEW), started(5, message(20985, 0)), ended(5, message(20985, 0))],
      7: [assist(7, true)],
      8: [viewSwitched(8, MAP_VIEW, FLIGHT_VIEW)],
      9: [flushed(9, 'completion-message'), flightMessage(9, 'missionComplete')],
      11: [flushed(11), flushed(11)],
      12: [viewSwitched(12, FLIGHT_VIEW, EXTERNAL_VIEW, DESTRUCTION_SUB_MODE)],
    };
    const outcomes = [Array.from({ length: 15 }, (_, index) => index + 1), [5, 10, 15], [2, 2, 5, 5, 10, 14, 15]].map((groups) => {
      const module = line();
      const presentation = createTestPresentation({ modules: [module], content: CONTENT, patch: PLAYER });
      const published: MessageLineSnapshot[] = [];
      module.subscribe((snapshot) => published.push(snapshot));
      let view = { viewMode: FLIGHT_VIEW, subMode: 0 };
      let next = 1;
      for (const to of groups) {
        const ticks = [];
        for (; next <= to; next++) {
          const tickEvents = events[next] ?? [];
          for (const event of tickEvents) if (event.type === 'view-switched') view = { viewMode: event.viewMode, subMode: event.subMode };
          ticks.push(cockpitTick(next, { ...view, patch: PLAYER, events: tickEvents }));
        }
        if (ticks.length === 0) presentation.advance(cockpitBatch([]));
        for (let index = 0; index < ticks.length; index += 5) presentation.advance(cockpitBatch(ticks.slice(index, index + 5)));
      }
      const { back: b, screen: s } = presentation.surfaces();
      return { snapshot: module.snapshot(), published, back: [...b.indices], coverage: [...b.coverage!], screen: [...s.indices] };
    });
    expect(outcomes[1]).toEqual(outcomes[0]);
    expect(outcomes[2]).toEqual(outcomes[0]);
    // on, off, A; −on; −off +beacon; +B (uncovered); +on; −A +completion; −beacon −B: `on` and the completion remain.
    expect(outcomes[0].snapshot).toMatchObject({ head: { source: 'speedAssistOn' }, length: 2, messageDrops: 0 });
    expect(outcomes[0].published.length).toBeGreaterThan(5);
  });

  it('gives the speed assist its texts by the switched state, colour 0x0F and mode 2 (120/64 pixels a unit)', () => {
    const run = start();
    run.advance(1, 7, at({ 1: [assist(1, true)] }));
    // First shown at clock 2; at tick 7 dt 12 → offset 181 − (1440 >> 6 = 22) = 159.
    expect(glyphOrigins(back(run), TEXT_ROW, 0x0f, SLOT0.x0, SLOT0.x1)).toEqual([SLOT0.x0 + 159, SLOT0.x0 + 167]);
    expect(readGlyphs(back(run), SLOT0.x0 + 159, TEXT_ROW, 2, 8, 0x0f)).toBe('As');
    run.advance(8, 8, at({ 8: [flushed(8), assist(8, false)] }));
    expect(run.line.snapshot().head).toMatchObject({ source: 'speedAssistOff', text: 'Assist off' });
  });
});

describe('message line drawing (hud §4.7 steps 1–7)', () => {
  /** Calls the global callback and the type-8 draw for `tick` on fresh surfaces, as a logical display would. */
  function display(module: MessageLineModule, tick: number, options: Parameters<typeof isolatedDrawContext>[1] = {}) {
    const draw = isolatedDrawContext(tick, { content: CONTENT, patch: PLAYER, ...options });
    module.global!(draw.context);
    const record = draw.context.layout.slot!.instruments.find(({ type }) => type === 8)!;
    module.instruments![8]!.draw(draw.context, record);
    return draw;
  }

  it('scrolls by W − ((dt × 48) >> 6) from the first display, removing the item at width + offset ≤ 0 without drawing', () => {
    const module = line();
    module.beforeDraw!(isolatedDrawContext(1, { content: CONTENT }).context, flightMessage(1, 'beacon'), 0);
    const first = display(module, 1);
    // The beacon's head drop on the empty queue set the clear flag: the whole rectangle first. Then dt 0: offset W =
    // 181, no whole glyph fits; the band is cleared and copied.
    expect(first.published).toEqual([SLOT0, { x0: SLOT0.x0, y0: 460, x1: SLOT0.x1 - 1, y1: 468 }]);
    // Width 72 ('Beacon on'). dt 336 (tick 169): offset 181 − 252 = −71, drawn (nothing whole is left).
    const last = display(module, 169);
    expect(module.snapshot().head).toMatchObject({ source: 'beacon' });
    expect(last.published).toHaveLength(1);
    expect(pixelsIn(last.surfaces.back, SLOT0.x0, SLOT0.y0, SLOT0.x1, SLOT0.y1)).toEqual([]);
    // dt 338 (tick 170): offset −72, width + offset = 0: removed, nothing drawn or copied this time.
    const removed = display(module, 170);
    expect(module.snapshot().head).toBeNull();
    expect(removed.published).toEqual([]);
    // The next draw clears the whole rectangle once.
    expect(display(module, 171).published).toEqual([SLOT0]);
    expect(display(module, 172).published).toEqual([]);
  });

  it('draws whole glyphs only: none cut on the left, the rightmost pixel at most x1 − 3', () => {
    const module = line();
    module.afterDraw!(isolatedDrawContext(1, { content: CONTENT }).context, started(1, message(20011, 123456)), 0);
    display(module, 2);
    // 'Summary 123456' (14 bytes). dt 12 (tick 8): offset 172, glyph 0 only, at x0 + 172, its marker at x1 − 3.
    const right = display(module, 8).surfaces.back;
    expect(glyphOrigins(right, TEXT_ROW, 8, SLOT0.x0, SLOT0.x1)).toEqual([SLOT0.x0 + 172]);
    expect(pixelsIn(right, SLOT0.x1 - 2, SLOT0.y0, SLOT0.x1, SLOT0.y1)).toEqual([]);
    expect(right.indices[TEXT_ROW * 640 + SLOT0.x1 - 3]).toBe(8);
    // dt 246 (tick 125): offset −3; glyph 0 would be cut, so the first drawn is glyph 1 at x0 + 5.
    const left = display(module, 125).surfaces.back;
    const origins = glyphOrigins(left, TEXT_ROW, 8, 0, 639);
    expect(origins[0]).toBe(SLOT0.x0 + 5);
    expect(readGlyphs(left, SLOT0.x0 + 5, TEXT_ROW, 13, 8, 8)).toBe('ummary 123456');
    expect(pixelsIn(left, 0, TEXT_ROW, SLOT0.x0 + 4, TEXT_ROW + 7)).toEqual([]);
  });

  it('expires only an unshown head strictly past its expiry, before the draw, so a stale next item starts at once', () => {
    const post = isolatedDrawContext(1, { content: CONTENT }).context;
    // A long head (58 bytes, shown at tick 1), then a completion message posted at tick 112 with tick 111's sample
    // (expiry 222 + 0x280 = 862) and one at tick 113 (expiry 864).
    const long = 'x'.repeat(58);
    const longLine = line({ copy: syntheticCopy({ summary: () => long }) });
    longLine.afterDraw!(post, started(1), 0);
    display(longLine, 1);
    longLine.beforeDraw!(isolatedDrawContext(112, { content: CONTENT }).context, flightMessage(112, 'missionComplete'), 0);
    longLine.beforeDraw!(isolatedDrawContext(113, { content: CONTENT }).context, flightMessage(113, 'missionComplete'), 0);
    // Removal at dt 860 → clock 862, tick 431.
    display(longLine, 430);
    expect(longLine.snapshot()).toMatchObject({ head: { source: 'incoming' }, length: 3 });
    display(longLine, 431);
    expect(longLine.snapshot()).toMatchObject({ head: { source: 'missionComplete' }, length: 2 });
    // Tick 432, clock 864: the first completion (expiry 862) expires; the second (expiry 864, not strictly past) shows.
    const stale = display(longLine, 432);
    expect(longLine.snapshot()).toMatchObject({ head: { source: 'missionComplete' }, length: 1 });
    expect(stale.published).toEqual([SLOT0, { x0: SLOT0.x0, y0: 460, x1: SLOT0.x1 - 1, y1: 468 }]);
    // Expiry never touches a shown head.
    display(longLine, 1000);
    expect(longLine.snapshot()).toMatchObject({ length: 0 });
  });

  it('expires at most one item per logical display and never an item behind the head', () => {
    const module = line();
    const post = isolatedDrawContext(1, { content: CONTENT }).context;
    for (let index = 0; index < 3; index++) module.beforeDraw!(post, assist(1, true), index);
    // Unshown: all three are past 2 + 0x140 at tick 200, but one global call removes only the head.
    module.global!(isolatedDrawContext(200, { content: CONTENT, patch: PLAYER }).context);
    expect(module.snapshot().length).toBe(2);
    module.global!(isolatedDrawContext(161, { content: CONTENT, patch: PLAYER }).context);
    // Clock 322 is equal to the expiry: not strictly past.
    expect(module.snapshot().length).toBe(2);
  });

  it('in the map view clears no rectangle, fills (x0, y0)–(x1 − 1, y1 − 1) and outlines it in colour 8 only with a head', () => {
    const module = line();
    module.beforeDraw!(isolatedDrawContext(1, { content: CONTENT }).context, flushed(1), 0);
    const empty = display(module, 1, { viewMode: MAP_VIEW });
    expect(pixelsIn(empty.surfaces.back, 0, 0, 639, 479)).toEqual([]);
    expect(empty.surfaces.back.coverage!.some((bits) => bits !== 0)).toBe(false);
    module.beforeDraw!(isolatedDrawContext(2, { content: CONTENT }).context, flightMessage(2, 'beacon'), 0);
    display(module, 2, { viewMode: MAP_VIEW });
    const map = display(module, 8, { viewMode: MAP_VIEW });
    const outline = pixelsIn(map.surfaces.back, 0, 0, 639, 479).filter((pixel) => pixel.endsWith('=8'));
    // Columns 152–390, rows 411–425.
    expect(outline).toContain('152,411=8');
    expect(outline).toContain('390,425=8');
    expect(outline).not.toContain('391,411=8');
    expect(outline).toHaveLength(2 * 239 + 2 * 13);
    expect(map.published).toEqual([]);
    // dt 12 → offset 239 − 9 = 230 at text row 415.
    expect(glyphOrigins(map.surfaces.back, 415, 0x0c, SLOT2.x0, SLOT2.x1)).toEqual([SLOT2.x0 + 230]);
    // The flag the map left set still clears the rectangle at the next forward draw.
    expect(display(module, 9).published[0]).toEqual(SLOT0);
  });

  it('keeps the queue and the start across views and recomputes the offset from the new width', () => {
    const run = start();
    run.advance(1, 20, at({ 1: [flightMessage(1, 'beacon')] }));
    const forward = glyphOrigins(back(run), TEXT_ROW, 0x0c, SLOT0.x0, SLOT0.x1)[0] - SLOT0.x0;
    const toMap = start();
    toMap.advance(1, 20, at({ 1: [flightMessage(1, 'beacon')], 20: [viewSwitched(20, FLIGHT_VIEW, MAP_VIEW)] }));
    expect(glyphOrigins(back(toMap), 415, 0x0c, SLOT2.x0, SLOT2.x1)[0] - SLOT2.x0).toBe(forward + 58);
    expect(toMap.line.snapshot()).toEqual(run.line.snapshot());
  });

  it('draws the destruction view\'s slot 7 line without copying it, the frame-end copy showing it', () => {
    const run = start();
    run.advance(1, 2, at({
      1: [assist(1, true), assist(1, false)],
      2: [flushed(2, 'player-destroyed'), viewSwitched(2, FLIGHT_VIEW, EXTERNAL_VIEW, DESTRUCTION_SUB_MODE)],
    }));
    expect(run.line.snapshot()).toMatchObject({ head: { source: 'speedAssistOff' }, length: 1 });
    // Tick 2's clear covered the whole rectangle with index 0 over the world for that display.
    expect(coveredIn(back(run), SLOT7)).toBe(183 * 17);
    run.advance(3, 8);
    // Shown at tick 2 (clock 4); tick 8 dt 12, mode 2 → offset 181 − 22 = 159, text rows 8–15.
    expect(glyphOrigins(screen(run), 8, 0x0f, SLOT7.x0, SLOT7.x1)).toEqual([SLOT7.x0 + 159, SLOT7.x0 + 167]);
    // Later displays cover only the band they fill (rows 8–16 to x1 − 1); the rest shows the world again.
    expect(coveredIn(back(run), SLOT7)).toBe(182 * 9);
    // Width 80 leaves at q ≥ 261, dt ≥ 140: removed at tick 72, cleared at 73, then nothing covers the world.
    run.advance(9, 73);
    expect(run.line.snapshot().length).toBe(0);
    expect(coveredIn(back(run), SLOT7)).toBe(183 * 17);
    run.advance(74, 74);
    expect(coveredIn(back(run), SLOT7)).toBe(0);
  });

  it('runs no expiry or draw without a player entity or in a view without a cockpit call', () => {
    for (const run of [start({ player: false }), start({ viewMode: 0x13 })]) {
      run.advance(1, 200, at({ 1: [assist(1, true), assist(1, false)] }));
      expect(run.line.snapshot()).toMatchObject({ length: 2 });
      expect(pixelsIn(back(run), 0, 0, 639, 479)).toEqual([]);
    }
  });

  it('advances the head in the base view with slot 0\'s width, without pixels', () => {
    const run = start({ viewMode: BASE_VIEW });
    run.advance(1, 169, at({ 1: [flightMessage(1, 'beacon')] }));
    expect(run.line.snapshot().head).toMatchObject({ source: 'beacon' });
    run.advance(170, 170);
    expect(run.line.snapshot().head).toBeNull();
    expect(pixelsIn(back(run), 0, 0, 639, 479)).toEqual([]);
    expect(pixelsIn(screen(run), 0, 0, 639, 479)).toEqual([]);
  });
});

describe('message line limits and copy', () => {
  it('keeps 64 items and drops the 65th new item with a count, never throwing', () => {
    const run = start();
    run.advance(1, 1, at({ 1: Array.from({ length: 64 }, () => assist(1, true)) }));
    expect(run.line.snapshot()).toMatchObject({ length: 64, messageDrops: 0 });
    run.advance(2, 2, at({ 2: [assist(2, false)] }));
    expect(run.line.snapshot()).toMatchObject({ length: 64, messageDrops: 1, head: { source: 'speedAssistOn' } });
    expect(run.presentation.status()).toBe('ready');
  });

  it('keeps a 128-byte item and drops a 129-byte one', () => {
    const run = start({ line: line({ flightMessages: { ...FLIGHT_MESSAGES, speedAssistOn: 'a'.repeat(128), speedAssistOff: 'b'.repeat(129) } }) });
    run.advance(1, 1, at({ 1: [assist(1, true), assist(1, false)] }));
    expect(run.line.snapshot()).toMatchObject({ length: 1, messageDrops: 1 });
  });

  it('shows the explicit uncovered copy for a message no summary covers', () => {
    const run = start();
    run.advance(1, 1, at({ 1: [started(1, message(20985, 3))] }));
    expect(run.line.snapshot().head).toMatchObject({ text: 'Not covered', covered: false, origin: 'project', message: { table: 20985, index: 3 } });
  });

  it('rejects summaries past 58 bytes, outside 0x20–0x7E, with 0x7B or outside fonts/0\'s map', () => {
    for (const bad of ['x'.repeat(59), 'tab\there', 'brace{', '']) {
      expect(() => line({ copy: syntheticCopy({ uncoveredSummary: bad }) })).toThrow(expect.objectContaining({ kind: 'invalid-input' }));
    }
    expect(() => line({ copy: syntheticCopy({ uncoveredSummary: 'x'.repeat(58) }) })).not.toThrow();
    expect(() => line({ font: syntheticFont([0x20, 0x4e]), copy: syntheticCopy({ uncoveredSummary: 'N n' }) })).toThrow(expect.objectContaining({ code: 'unmapped-character' }));
    const run = start({ line: line({ copy: syntheticCopy({ summary: () => 'y'.repeat(59) }) }) });
    expect(() => run.advance(1, 1, at({ 1: [started(1)] }))).toThrow(expect.objectContaining({ kind: 'invalid-input' }));
    expect(run.presentation.status()).toBe('failed');
  });
});

describe('message line read port', () => {
  const incoming = (identity: MessageIdentity, shown = true) => ({ communications: { player: { incoming: { message: identity, speaker: null, frame: 0, frameCount: 1, shown } } } });

  it('publishes the same head and the current incoming summary once per change, without replay', () => {
    const run = start();
    const seen: MessageLineSnapshot[] = [];
    const unsubscribe = run.line.subscribe((snapshot) => seen.push(snapshot));
    run.advance(1, 1, at({ 1: [flightMessage(1, 'beacon')] }));
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBe(run.line.snapshot());
    expect(run.line.snapshot()).toBe(run.line.snapshot());
    run.presentation.advance(cockpitBatch([]));
    run.advance(2, 3);
    expect(seen).toHaveLength(1);
    run.advance(4, 4, () => ({ patch: { ...PLAYER, ...incoming(message(20011, 2)) } }));
    expect(seen).toHaveLength(2);
    expect(seen[1].incoming).toEqual({ message: message(20011, 2), speaker: null, shown: true, summary: 'Summary 2', covered: true });
    run.advance(5, 5, () => ({ patch: { ...PLAYER, ...incoming(message(20011, 2)) } }));
    expect(seen).toHaveLength(2);
    run.advance(6, 6, () => ({ patch: { ...PLAYER, ...incoming(message(20019, 0), false) } }));
    expect(seen[2].incoming).toMatchObject({ summary: 'Not covered', covered: false, shown: false });
    unsubscribe();
    run.advance(7, 7);
    expect(seen).toHaveLength(3);
    expect(run.line.snapshot().incoming).toBeNull();
  });

  it('rejects use after dispose', () => {
    const run = start();
    run.presentation.dispose();
    expect(() => run.line.snapshot()).toThrow(expect.objectContaining({ kind: 'invalid-state' }));
    expect(() => run.line.subscribe(() => undefined)).toThrow(expect.objectContaining({ kind: 'invalid-state' }));
  });

  it('draws no random numbers', () => {
    const run = start();
    run.advance(1, 30, at({ 1: [flightMessage(1, 'beacon'), assist(1, true)], 2: [started(2)] }));
    expect(run.presentation.schedule().randomDraws).toBe(0);
  });
});
