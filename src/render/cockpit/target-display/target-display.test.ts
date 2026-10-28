import { describe, expect, it } from 'vitest';
import { ContentContractError } from '../../../content/contract-validation.ts';
import type { AssetId } from '../../../content/asset-id.ts';
import type { PalettePayload } from '../../../content/graphics/palette-payload.ts';
import type { CombatTarget, Projection } from '../../../core/projections/projection.ts';
import { createDisplayInterference } from '../interference/display-interference.ts';
import { createLeftDisplay } from '../left-display/left-display.ts';
import { interferenceFrames, leftDisplayContent, regularFont, statusMessages, syntheticImage } from '../left-display/left-display.test-support.ts';
import type { CockpitModule, CockpitTick } from '../presentation/cockpit-contract.ts';
import { PresentationError } from '../presentation/cockpit-limits.ts';
import { cockpitRandom } from '../presentation/cockpit-random.ts';
import {
  cockpitBatch, cockpitTick, createTestPresentation, FLIGHT_VIEW, isolatedDrawContext, MAP_VIEW, syntheticEvent, syntheticProjection, TEST_SEED,
  viewSwitched, WARP_VIEW, type DeepPartial, type IsolatedDraw, type TickOptions,
} from '../presentation/cockpit.test-support.ts';
import { drawText, hudFont } from '../raster/glyph-text.ts';
import { createIndexedSurface, drawLine, type IndexedSurface } from '../raster/indexed-surface.ts';
import type { TargetDisplayModule, TargetDisplayText } from './target-display.ts';
import {
  backgroundTexel, createSyntheticTargetDisplay, expectedDevice, markerTarget, RECT, syntheticTarget, targetContent, targetRecord, targetText,
  textOf, WIDE, withTarget, type Fields,
} from './target-display.test-support.ts';

// Right display, type 7 (spec 右侧目标显示屏, DC-05, DC-10, DC-11; hud.md §4.5, SNIP 10487; executable.md T7). Synthetic
// content only; the type-7 record is the HI rectangle (491, 346)–(586, 442), called every logical display (interval 0)
// unless a test says otherwise, so the display's own timers decide. The clock is 2 units per tick. Expected pictures
// are built here from the recorded rules.

const CONTENT = targetContent();
const RECORD = targetRecord(CONTENT);
const WIDTH = 640;
const REGULAR = hudFont(regularFont(), 8, false);
const TEXT = 8;

type Text = readonly [text: string, x: number, y: number];

/** The synthetic text of `key` with its `%.0f` conversions replaced by `values` in order and `%%` by `%`. */
function fmt(key: keyof TargetDisplayText, ...values: string[]): string {
  let next = 0;
  return textOf(key).replace(/%\.0f|%%/g, (conversion) => (conversion === '%%' ? '%' : values[next++]));
}

/** B after one draw onto an empty B: device window (2, 1)–(98, 98) at (491, 346), then `texts` in colour 8. */
function expectedBack(device: Uint8Array, texts: readonly Text[]): IndexedSurface {
  const surface = createIndexedSurface(WIDTH, 480);
  for (let row = 0; row <= 97; row++) surface.indices.set(device.subarray((row + 1) * 100 + 2, (row + 1) * 100 + 99), (RECT.y0 + row) * WIDTH + RECT.x0);
  for (const [text, x, y] of texts) drawText(surface, REGULAR, text, x, y, TEXT);
  return surface;
}

/** The four readouts and the name of the default target (distance 100, speed 42.5, shield 80 %, value 123.456). */
const TARGET_TEXTS: readonly Text[] = [
  [fmt('targetDistance', '100'), 537, 348], [fmt('targetBlockValue', '42'), 545, 357], [fmt('targetCraftPercent', '80'), 502, 434],
  [fmt('targetCraftValueScaledOnce', '123'), 553, 434], ['n3', 494, 425],
];

/** One type-7 call on a fresh B and S at `tick`. */
function call(display: TargetDisplayModule, tick: number, patch: DeepPartial<Projection>, options: TickOptions = {}): IsolatedDraw {
  const draw = isolatedDrawContext(tick, { ...options, content: CONTENT, patch });
  display.instruments[7].draw(draw.context, RECORD);
  return draw;
}

const drew = (draw: IsolatedDraw): boolean => draw.published.length > 0;
const blank = ({ surfaces: { back } }: IsolatedDraw): boolean => back.indices.every((index) => index === 0);

/** The ticks in first…last at which `display` drew, each call's patch from `patch(tick)`. */
function drawTicks(display: TargetDisplayModule, first: number, last: number, patch: (tick: number) => DeepPartial<Projection>): number[] {
  const ticks: number[] = [];
  for (let tick = first; tick <= last; tick++) {
    const draw = call(display, tick, patch(tick));
    // A call draws exactly when it publishes the whole rectangle.
    if (drew(draw)) {
      expect(draw.published).toEqual([RECT]);
      ticks.push(tick);
    } else expect(blank(draw)).toBe(true);
  }
  return ticks;
}

const pixel = (surface: IndexedSurface, x: number, y: number): number => surface.indices[y * WIDTH + x];

/** Pixel-exact equality of two pictures, with the full diff only on a mismatch (a plain diff of 307,200 values is slow). */
function expectSame(actual: Uint8Array, expected: Uint8Array): void {
  if (actual.length !== expected.length || actual.some((index, at) => index !== expected[at])) expect(actual).toEqual(expected);
}
const event = (tick: number, type: 'target-cleared' | 'view-switched', fields: Record<string, unknown> = {}) => syntheticEvent(tick, type, fields);

describe('target picture', () => {
  it('copies the device window over the rectangle and one more column and row, draws the readouts and the name, publishes', () => {
    const display = createSyntheticTargetDisplay();
    const draw = call(display, 1, withTarget(syntheticTarget()));
    expectSame(draw.surfaces.back.indices, expectedBack(expectedDevice(WIDE), TARGET_TEXTS).indices);
    expect(draw.published).toEqual([RECT]);
    // Column 587 and row 443 are written to B but never sent to S.
    expect(pixel(draw.surfaces.back, 587, 400)).not.toBe(0);
    expect(pixel(draw.surfaces.back, 500, 443)).not.toBe(0);
    expect(pixel(draw.surfaces.screen, 587, 400)).toBe(0);
    expect(pixel(draw.surfaces.screen, 500, 443)).toBe(0);
    expect(pixel(draw.surfaces.screen, 586, 442)).toBe(pixel(draw.surfaces.back, 586, 442));
    expect(display.device()).toBeDefined();
    expect(display.budget).toEqual({ imagePixels: 96 * 96, devicePixels: 100 * 100, renderTargets: 0 });
  });

  it('takes the model from the target\'s binding, never from the Render State', () => {
    // The Render State lists no entity at all; the target still shows its model.
    const display = createSyntheticTargetDisplay();
    const draw = call(display, 1, withTarget(syntheticTarget()), { render: { entities: [] } });
    expect(pixel(draw.surfaces.back, 538, 394)).toBe(0x10);
  });

  it.each([
    ['above a quarter', 800, 1000, 1, 0x10],
    ['just above a quarter', 251, 1000, 1, 0x10],
    ['at a quarter', 250, 1000, 1, 0x0f],
    ['at 1', 1, 1000, 1, 0x0f],
    ['below 1', 0, 1000, 1, 0x0a],
    ['negative', -5, 1000, 1, 0x0a],
    ['c5C 0 with a shield', 5, 0, 1, 0x10],
    ['kind 0x2000 at 0', 0, 1000, 13, 0x10],
    ['kind 0x4000 below a quarter', 200, 1000, 14, 0x10],
  ])('colours the model by shield state: %s', (_name, current, maximum, kindBit, colour) => {
    const display = createSyntheticTargetDisplay();
    const draw = call(display, 1, withTarget(syntheticTarget({ shield: { current, maximum }, kindBit })));
    // Device (49, 49) is inside the silhouette; device (10, 10) is background.
    expect(pixel(draw.surfaces.back, 538, 394)).toBe(colour);
    expect(pixel(draw.surfaces.back, 499, 355)).toBe(backgroundTexel(9, 9));
  });

  it('uses the view distance of the target\'s kind bit (negative control: the next entry draws a smaller model)', () => {
    // Kind bit 2 has 37.5 in the synthetic table: columns 36–62, rows 45–54.
    const display = createSyntheticTargetDisplay();
    const draw = call(display, 1, withTarget(syntheticTarget({ kindBit: 2 })));
    expectSame(draw.surfaces.back.indices, expectedBack(expectedDevice([36, 45, 62, 54]), TARGET_TEXTS).indices);
    expect(() => call(createSyntheticTargetDisplay(), 1, withTarget(syntheticTarget({ kindBit: 20 })))).toThrow(PresentationError);
  });
});

describe('readouts', () => {
  /** B's four readout lines after a draw of `target` (the player placed so that the device picture stays the same). */
  function readouts(patch: Partial<CombatTarget>, texts: readonly Text[]): void {
    const target = syntheticTarget(patch);
    const draw = call(createSyntheticTargetDisplay(), 1, withTarget(target));
    expectSame(draw.surfaces.back.indices, expectedBack(expectedDevice(WIDE, target.shield!.current / target.shield!.maximum > 0.25 ? 0x10 : 0x0f), texts).indices);
  }
  const others = (from: number): readonly Text[] => TARGET_TEXTS.slice(from);

  it.each([
    // f32 distance below 99,999; otherwise × 0.001 (printed in double, thresholds on its f32).
    [10, '10', 553],
    [10.5, '10', 545],
    [99.5, '100', 537],
    [99_998.5, '99998', 521],
    [99_999, '100', 537],
    [150_000.5, '150', 537],
  ])('distance %d → %s at x %d', (distance, text, x) => {
    readouts({ distance }, [[fmt(distance < 99_999 ? 'targetDistance' : 'targetDistanceScaled', text), x, 348], ...others(1)]);
  });

  it.each([
    [10, '10', 553],
    [10.5, '10', 545],
    [99.5, '100', 537],
  ])('speed %d → %s at x %d', (speed, text, x) => {
    readouts({ speed }, [TARGET_TEXTS[0], [fmt('targetBlockValue', text), x, 357], ...others(2)]);
  });

  it.each([
    [1000, 1000, '100', 494],
    [995, 1000, '100', 502],
    [5, 1000, '0', 510],
    [-200, 0, '0', 510],
  ])('shield %d of %d → %s %% from x %d (0 when c5C ≤ 0)', (current, maximum, text, x) => {
    const target = syntheticTarget({ shield: { current, maximum } });
    const draw = call(createSyntheticTargetDisplay(), 1, withTarget(target));
    expectSame(draw.surfaces.back.indices, expectedBack(expectedDevice(WIDE, current < 1 ? 0x0a : current / maximum > 0.25 ? 0x10 : 0x0f), [
      ...TARGET_TEXTS.slice(0, 2), [fmt('targetCraftPercent', text), x, 434], ...others(3),
    ]).indices);
  });

  it.each([
    [1_000_000, 'targetCraftValueScaledOnce', '1000', 553],
    [1_000_100, 'targetCraftValueScaledTwice', '1', 557],
    [2_500_000, 'targetCraftValueScaledTwice', '2', 557],
    [15_000, 'targetCraftValueScaledOnce', '15', 561],
  ] as const)('craft value %d → %s %s at x %d (−12 when scaled twice)', (craftAt08, key, text, x) => {
    readouts({ craftAt08 }, [...TARGET_TEXTS.slice(0, 3), [fmt(key, text), x, 434], TARGET_TEXTS[4]]);
  });
});

describe('marker branch (kind bit 25)', () => {
  it('draws no model, the three marker texts, the distance, the name mapMarkerName and the crosshair in 0x0F', () => {
    const display = createSyntheticTargetDisplay();
    const draw = call(display, 1, withTarget(markerTarget()));
    const expected = expectedBack(expectedDevice(), [
      [fmt('targetDistance', '100'), 537, 348], [textOf('targetMarkerBlockValue'), 553, 357], [fmt('targetMarkerCraftPercent'), 510, 434],
      [textOf('targetMarkerCraftValue'), 569, 434], [textOf('mapMarkerName'), 494, 425],
    ]);
    const line = (x0: number, y0: number, x1: number, y1: number) => drawLine(expected, x0, y0, x1, y1, 0x0f);
    line(538, 378, 538, 410);
    line(522, 394, 554, 394);
    line(530, 386, 546, 402);
    line(530, 402, 546, 386);
    for (const [x, y, dx, dy] of [[514, 370, 1, 1], [562, 370, -1, 1], [514, 418, 1, -1], [562, 418, -1, -1]]) {
      line(x, y, x + 4 * dx, y);
      line(x, y, x, y + 4 * dy);
    }
    expectSame(draw.surfaces.back.indices, expected.indices);
    expect(draw.published).toEqual([RECT]);
  });
});

describe('schedule', () => {
  it('refreshes a target when forced or once the sample is strictly past the last refresh + 9', () => {
    const display = createSyntheticTargetDisplay();
    expect(drawTicks(display, 1, 16, () => withTarget(syntheticTarget()))).toEqual([1, 6, 11, 16]);
    expect(display.state().nextRefresh).toBe(32 + 9);
  });

  it('compares the refresh strictly: a sample equal to the last refresh + 9 is not due', () => {
    const display = createSyntheticTargetDisplay();
    call(display, 1, withTarget(syntheticTarget()));
    const at = (clock: number): IsolatedDraw => {
      const draw = isolatedDrawContext(6, { content: CONTENT, patch: withTarget(syntheticTarget()) });
      display.instruments[7].draw({ ...draw.context, clock }, RECORD);
      return draw;
    };
    expect(drew(at(11))).toBe(false);
    expect(drew(at(12))).toBe(true);
  });

  it('forces a new target (by entity) and the call after a view switch', () => {
    const display = createSyntheticTargetDisplay();
    const target = (tick: number) => withTarget(syntheticTarget({ entityId: tick < 3 ? 7 : 8 }));
    expect(drawTicks(display, 1, 8, target)).toEqual([1, 3, 8]);
    const switched = isolatedDrawContext(9, { content: CONTENT });
    display.beforeDraw!(switched.context, event(9, 'view-switched'), 0);
    expect(display.state().forcePending).toBe(true);
    expect(drawTicks(display, 9, 10, (tick) => target(tick))).toEqual([9]);
  });

  it('without a target, refreshes every 0x80 strictly; a forced call copies the device as it is', () => {
    const display = createSyntheticTargetDisplay();
    const target = (tick: number) => withTarget(tick === 1 ? syntheticTarget() : null);
    // Tick 2 is forced by the change (sample 4 is not past 11): it copies the device that still shows the model.
    call(display, 1, target(1));
    const second = call(display, 2, target(2));
    expectSame(second.surfaces.back.indices, expectedBack(expectedDevice(WIDE), [[textOf('targetNone'), 494, 434]]).indices);
    expect(drawTicks(display, 3, 6, target)).toEqual([6]);
    // Tick 6 (sample 12) rendered the empty scene: next refresh 12 + 0x80 = 140, so tick 70 (140) waits and 71 draws.
    expect(display.state().nextRefresh).toBe(140);
    expect(drawTicks(display, 7, 71, target)).toEqual([71]);
    const empty = call(createSyntheticTargetDisplay(), 1, target(2));
    expectSame(empty.surfaces.back.indices, expectedBack(expectedDevice(), [[textOf('targetNone'), 494, 434]]).indices);
  });

  it('shows the departure notice for 20 calls after target-cleared (warp), over the device\'s last picture', () => {
    const display = createSyntheticTargetDisplay();
    call(display, 1, withTarget(syntheticTarget()));
    const cleared = isolatedDrawContext(2, { content: CONTENT });
    display.beforeDraw!(cleared.context, event(2, 'target-cleared', { cause: 'warp', playerEntityId: 1, previousTarget: 7 }), 0);
    const notice = expectedBack(expectedDevice(WIDE), [[textOf('targetWarpNotice'), 494, 434]]);
    for (let tick = 2; tick <= 21; tick++) {
      const draw = call(display, tick, withTarget(null));
      expectSame(draw.surfaces.back.indices, notice.indices);
      expect(draw.published).toEqual([RECT]);
      expect(display.state().notice).toBe(21 - tick);
    }
    const after = call(display, 22, withTarget(null));
    expectSame(after.surfaces.back.indices, expectedBack(expectedDevice(), [[textOf('targetNone'), 494, 434]]).indices);
    // Other causes show no notice.
    const other = createSyntheticTargetDisplay();
    other.beforeDraw!(cleared.context, event(2, 'target-cleared', { cause: 'invalid', playerEntityId: 1, previousTarget: 7 }), 0);
    expect(other.state().notice).toBe(0);
  });

  it('draws nothing for a target without a movement block and retries it at every call', () => {
    const display = createSyntheticTargetDisplay();
    expect(drawTicks(display, 1, 3, () => withTarget(syntheticTarget({ speed: null })))).toEqual([]);
    expect(display.state().shown).toBeNull();
    expect(drawTicks(display, 4, 4, () => withTarget(syntheticTarget()))).toEqual([4]);
    expect(display.state().shown).toBe(7);
  });

  it('does nothing without a player', () => {
    const display = createSyntheticTargetDisplay();
    expect(drawTicks(display, 1, 3, () => withTarget(undefined))).toEqual([]);
    expect(display.state()).toEqual({ shown: null, nextRefresh: 0, notice: 0, forcePending: true, interference: { on: false, start: 0, nextToggle: 0 } });
  });
});

describe('interference (subsystem 14)', () => {
  /** A presentation with the display at tick 0 and `fields` from tick 1; `extra` modules are registered first. */
  function fixture(target: CombatTarget | null, fields: (tick: number) => Fields, extra: readonly CockpitModule[] = [], interference = createDisplayInterference(interferenceFrames())) {
    const display = createSyntheticTargetDisplay({ interference });
    const presentation = createTestPresentation({ modules: [...extra, display], content: CONTENT, patch: withTarget(target) });
    const tick = (at: number): CockpitTick => cockpitTick(at, { patch: withTarget(target, { fields: fields(at) }) });
    return { display, presentation, tick };
  }
  const frameAt = (surface: IndexedSurface): number => pixel(surface, 500, RECT.y0 + 10) - 0x70;

  it('state 2 shows the SNIP frames without a rand, skipping a repeated frame; state 0 reads nothing', () => {
    const { display, presentation, tick } = fixture(syntheticTarget(), (at) => ({ 14: at <= 6 ? 2 : 0 }));
    const frames: number[] = [];
    for (let at = 1; at <= 6; at++) {
      presentation.advance(cockpitBatch([tick(at)]));
      frames.push(frameAt(presentation.surfaces().screen));
    }
    // Start 2: frame ((clock − 2) × 12) >> 6 is 0 for ticks 1–3, 1 from tick 4.
    expect(frames).toEqual([0, 0, 0, 1, 1, 1]);
    expect(presentation.schedule().randomDraws).toBe(0);
    expect(display.state().interference).toEqual({ on: true, start: 2, nextToggle: 0 });
    // State 0: the gate stays on but is not read; the content is due again (the state-2 path never touched the refresh).
    presentation.advance(cockpitBatch([tick(7)]));
    expect(pixel(presentation.surfaces().screen, 538, 394)).toBe(0x10);
    expect(display.state().interference.on).toBe(true);
  });

  it('state 1 toggles once the sample is strictly past the next toggle, one rand each, and forces the next refresh', () => {
    const { display, presentation, tick } = fixture(syntheticTarget(), () => ({ 14: 1 }));
    const stream = cockpitRandom(TEST_SEED);
    let next = 0;
    let on = false;
    let toggles = 0;
    for (let at = 1; at <= 120; at++) {
      const sample = 2 * at;
      if (sample > next) {
        on = !on;
        next = sample + 0x40 + (stream.next() & 0x3f);
        toggles++;
      }
      presentation.advance(cockpitBatch([tick(at)]));
      expect(display.state().interference).toMatchObject({ on, nextToggle: next });
      // Off: the content is drawn at once (the toggle set the next refresh to 0).
      if (!on) expect(pixel(presentation.surfaces().screen, 538, 394)).toBe(0x10);
    }
    expect(toggles).toBeGreaterThan(2);
    expect(presentation.schedule().randomDraws).toBe(toggles);
  });

  it('a toggle sets the next refresh to 0, so the content returns as soon as the interference ends', () => {
    // No target: the refresh after tick 1 (sample 2) would wait for sample 130, but the toggles at 4 and 106 reset it.
    const { display, presentation, tick } = fixture(null, (at) => ({ 14: at >= 2 ? 1 : 0 }));
    const stream = cockpitRandom(TEST_SEED);
    const nextToggle = 4 + 0x40 + (stream.next() & 0x3f);
    // The toggle off is the first tick whose sample (2 per tick) is past the next toggle.
    const offTick = Math.floor(nextToggle / 2) + 1;
    const advance = (from: number, to: number) => {
      for (let at = from; at <= to; at++) presentation.advance(cockpitBatch([tick(at)]));
    };
    advance(1, offTick - 1);
    expect(display.state().interference).toEqual({ on: true, start: 4, nextToggle });
    expect(frameAt(presentation.surfaces().screen)).toBeLessThan(9);
    advance(offTick, offTick);
    const sample = 2 * offTick;
    expect(sample).toBeLessThanOrEqual(130);
    expect(display.state()).toMatchObject({ interference: { on: false, nextToggle: sample + 0x40 + (stream.next() & 0x3f) }, nextRefresh: sample + 0x80 });
    expect(pixel(presentation.surfaces().screen, 538, 394)).toBe(backgroundTexel(47, 47));
  });

  it('shares the last SNIP frame with the left display, so the second display in interference skips (DC-10)', () => {
    const LEFT = { x: 130, y: 350 };
    function run(shared: boolean): number {
      const interference = createDisplayInterference(interferenceFrames());
      const patch = withTarget(syntheticTarget());
      const left = createLeftDisplay({
        content: leftDisplayContent({ statusMessages: statusMessages({ startupMessages: [] }) }),
        interference: shared ? interference : createDisplayInterference(interferenceFrames()), initial: syntheticProjection(0, {}, patch),
      });
      const { presentation, tick } = fixture(syntheticTarget(), () => ({ 10: 2, 14: 2 }), [left], interference);
      presentation.advance(cockpitBatch([tick(1)]));
      return pixel(presentation.surfaces().back, LEFT.x, LEFT.y);
    }
    // Type 7 comes before type 6 in slot 0: it draws frame 0 first; the left display's frame 0 is then skipped.
    expect(run(true)).toBe(0);
    expect(run(false)).toBe(0x70);
  });
});

describe('within the presentation', () => {
  it('in Warp, B is emptied every display but S keeps the rectangle until the display draws again', () => {
    const display = createSyntheticTargetDisplay();
    const view = { viewMode: WARP_VIEW };
    const presentation = createTestPresentation({ modules: [display], content: CONTENT, patch: withTarget(syntheticTarget()), ...view });
    const at = (tick: number) => cockpitTick(tick, { ...view, patch: withTarget(syntheticTarget()) });
    presentation.advance(cockpitBatch([at(1)]));
    const shown = presentation.surfaces().screen.indices.slice();
    presentation.advance(cockpitBatch([at(2)]));
    const { back, screen } = presentation.surfaces();
    expect(pixel(back, 538, 394)).toBe(0);
    expectSame(screen.indices, shown);
    expect(pixel(screen, 538, 394)).toBe(0x10);
  });

  it('forces the first call back from the map, copying the rebuilt device (index 0, Unconfirmed)', () => {
    const display = createSyntheticTargetDisplay();
    const presentation = createTestPresentation({ modules: [display], content: CONTENT, patch: withTarget(null) });
    const at = (tick: number, viewMode = FLIGHT_VIEW, events: TickOptions['events'] = []) => cockpitTick(tick, { viewMode, events, patch: withTarget(null) });
    presentation.advance(cockpitBatch([at(1), at(2), at(3, MAP_VIEW, [viewSwitched(3, FLIGHT_VIEW, MAP_VIEW)]), at(4, FLIGHT_VIEW, [viewSwitched(4, MAP_VIEW, FLIGHT_VIEW)])]));
    const expected = expectedBack(new Uint8Array(100 * 100), [[textOf('targetNone'), 494, 434]]);
    const { screen } = presentation.surfaces();
    for (let y = RECT.y0; y <= RECT.y1; y++) {
      expect(screen.indices.subarray(y * WIDTH + RECT.x0, y * WIDTH + RECT.x1 + 1)).toEqual(expected.indices.subarray(y * WIDTH + RECT.x0, y * WIDTH + RECT.x1 + 1));
    }
  });

  it('gives the same pictures, state and draws for any grouping of the same ticks, and changes nothing for empty batches', () => {
    const script = (tick: number): CockpitTick => {
      const target = tick < 9 ? syntheticTarget() : tick < 15 ? null : syntheticTarget({ entityId: 8, shield: { current: 100, maximum: 1000 } });
      const events = tick === 9 ? [syntheticEvent(9, 'target-cleared', { cause: 'warp', playerEntityId: 1, previousTarget: 7 })] : [];
      return cockpitTick(tick, { events, patch: withTarget(target, { fields: { 14: tick >= 18 ? 1 : 0 } }) });
    };
    const ticks = Array.from({ length: 30 }, (_, at) => script(at + 1));
    const outcome = (groups: readonly number[]) => {
      const display = createSyntheticTargetDisplay();
      const presentation = createTestPresentation({ modules: [display], content: CONTENT, patch: withTarget(syntheticTarget()) });
      let first = 0;
      for (const size of groups) {
        presentation.advance(cockpitBatch(ticks.slice(first, first + size)));
        first += size;
      }
      const { back, screen } = presentation.surfaces();
      return { back: back.indices.slice(), screen: screen.indices.slice(), state: display.state(), draws: presentation.schedule().randomDraws };
    };
    const single = outcome(Array<number>(30).fill(1));
    expect(single.draws).toBeGreaterThan(0);
    expect(outcome([5, 0, 5, 2, 5, 5, 3, 0, 5])).toEqual(single);
  });
});

describe('content', () => {
  it('refuses a background that is not an opaque 96 × 96 image', () => {
    expect(() => createSyntheticTargetDisplay({ background: syntheticImage(95, 96, () => 1) })).toThrow(ContentContractError);
    expect(() => createSyntheticTargetDisplay({ background: { ...syntheticImage(96, 96, () => 1), mask: new Uint8Array(12 * 96) } })).toThrow(ContentContractError);
  });

  it('maps a nearest-colour background through its target palette', () => {
    const SOURCE = 'palette/synthetic/own' as AssetId;
    const TARGET = 'palette/synthetic/cockpit' as AssetId;
    const entry = (k: number) => [4 * (k & 63), 4 * (k >> 6), 0];
    const palette = (pick: (index: number) => number): PalettePayload => ({ kind: 'palette', entries: Uint8Array.from(Array.from({ length: 256 }, (_, index) => entry(pick(index))).flat()) }) as PalettePayload;
    const background = { ...syntheticImage(96, 96, backgroundTexel), palette: SOURCE, display: { nearest: TARGET } };
    const display = createSyntheticTargetDisplay({ background, palettes: new Map([[SOURCE, palette((index) => 255 - index)], [TARGET, palette((index) => index)]]) });
    call(display, 1, withTarget(null));
    expect(display.device().indices).toEqual(expectedDevice().map((index) => 255 - index));
    expect(() => createSyntheticTargetDisplay({ background, palettes: new Map() })).toThrow(ContentContractError);
  });

  it('checks every text byte against fonts/0 and needs a model lookup and a name resolver', () => {
    expect(() => createSyntheticTargetDisplay({ hudText: { ...targetText(), targetNone: 'no\u00e9' } })).toThrow(ContentContractError);
    expect(() => createSyntheticTargetDisplay({ hudText: { ...targetText(), targetDistance: '\u00e9%.0f' } })).toThrow(ContentContractError);
    expect(() => createSyntheticTargetDisplay({ names: undefined as never })).toThrow(PresentationError);
    expect(() => createSyntheticTargetDisplay({ models: undefined as never })).toThrow(PresentationError);
  });

  it('refuses a rectangle the device window cannot cover with its extra column and row', () => {
    const display = createSyntheticTargetDisplay();
    expect(() => createTestPresentation({ modules: [display], content: targetContent(0, { x0: 500, y0: 340, x1: 599, y1: 439 }) })).toThrow(ContentContractError);
    expect(() => createTestPresentation({ modules: [createSyntheticTargetDisplay()], content: targetContent(0, { x0: 500, y0: 340, x1: 598, y1: 438 }) })).not.toThrow();
  });

  it('fails when the content lacks the target\'s model', () => {
    expect(() => call(createSyntheticTargetDisplay({ models: new Map() }), 1, withTarget(syntheticTarget()))).toThrow(ContentContractError);
  });
});
