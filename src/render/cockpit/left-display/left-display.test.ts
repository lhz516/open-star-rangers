import { describe, expect, it } from 'vitest';
import type { CombatPlayer } from '../../../core/projections/projection.ts';
import { createDisplayInterference } from '../interference/display-interference.ts';
import type { CockpitDrawContext, CockpitTick } from '../presentation/cockpit-contract.ts';
import { PresentationError } from '../presentation/cockpit-limits.ts';
import { cockpitRandom } from '../presentation/cockpit-random.ts';
import {
  BASE_VIEW, cockpitBatch, cockpitTick, FLIGHT_VIEW, isolatedDrawContext, MAP_VIEW, syntheticEvent, TEST_SEED, viewSwitched, WARP_VIEW,
  type TickOptions,
} from '../presentation/cockpit.test-support.ts';
import { drawText, hudFont, type HudFont } from '../raster/glyph-text.ts';
import { createIndexedSurface, drawLine, outlineRect, type IndexedSurface } from '../raster/indexed-surface.ts';
import { ENERGY_HALF_WIDTHS } from './energy-page.ts';
import type { CommunicationPages } from '../communications/communication-pages.ts';
import { communicationPageDrawers, LEFT_PAGE_TABLE, type LeftPageDrawers } from './left-display.ts';
import {
  interferenceFrames, leftDisplayContent, leftDisplayFixture, levelImage, pageBackground, recordingPages, regularFont, smallFont,
  statusBackground, statusMessages, statusOverlay, syntheticPlayer, withPlayer, type LeftDisplayFixture, type PageCall,
} from './left-display.test-support.ts';

// Left display, type 6 (spec 左显示屏, DC-06, DC-10, DC-11; hud.md §4.4, DIAG 10489, SNIP 10487). Synthetic content
// only: the type-6 record of the synthetic slot 0 is (120, 340)–(219, 439), so the status copy's 97th column (216) is
// inside it. Expected pictures are built here from the recorded rules with the raster primitives.

const RECT = Object.freeze({ x0: 120, y0: 340, x1: 219, y1: 439 });
const WIDTH = 640;
const SMALL: HudFont = hudFont(smallFont(), 6, true);
const REGULAR: HudFont = hudFont(regularFont(), 8, false);
const NO_STARTUP = { statusMessages: statusMessages({ startupMessages: [] }) };

type Fields = Partial<Record<number, 0 | 1 | 2 | 3>>;
const fields = (values: Fields): CombatPlayer['subsystems'] =>
  Array.from({ length: 19 }, (_, field) => values[field] ?? 0) as unknown as CombatPlayer['subsystems'];

const at = (tick: number, player: CombatPlayer | null, options: TickOptions = {}): CockpitTick => cockpitTick(tick, { ...options, patch: withPlayer(player) });

/** Advances in batches of at most five ticks. */
function run(fixture: LeftDisplayFixture, ticks: readonly CockpitTick[]): void {
  for (let first = 0; first < ticks.length; first += 5) fixture.presentation.advance(cockpitBatch(ticks.slice(first, first + 5)));
}

const pixel = (surface: IndexedSurface, x: number, y: number): number => surface.indices[y * WIDTH + x];
const back = (fixture: LeftDisplayFixture): IndexedSurface => fixture.presentation.surfaces().back;
const screen = (fixture: LeftDisplayFixture): IndexedSurface => fixture.presentation.surfaces().screen;
const rectPixels = (surface: IndexedSurface, { x0, y0, x1, y1 } = RECT): number[] => {
  const out: number[] = [];
  for (let y = y0; y <= y1; y++) out.push(...surface.indices.subarray(y * WIDTH + x0, y * WIDTH + x1 + 1));
  return out;
};

/** The 96 × 100 status picture: background `background`, then the overlays of `overlays` in that order, colour key 0. */
function expectedPicture(background: number, overlays: readonly number[]): Uint8Array {
  const picture = new Uint8Array(96 * 100);
  const images = [statusBackground(background), ...overlays.map(statusOverlay)];
  images.forEach((image, at) => {
    for (let y = 0; y < 96; y++) for (let x = 0; x < 96; x++) {
      const index = image.indices[y * 96 + x];
      if (at === 0 || index !== 0) picture[y * 96 + x] = index;
    }
  });
  return picture;
}

/** A DIAG line typed to `typed` bytes, each line break ending a drawn line, with the cursor after the last part drawn. */
function drawTyped(surface: IndexedSurface, text: string, typed: number, cursor: boolean, x: number, y: number, colour: number): void {
  let [offset, top, width] = [0, y, 0];
  for (const part of text.split('\n')) {
    if (typed - offset < 1) break;
    const count = Math.min(part.length, typed - offset);
    drawText(surface, SMALL, part.slice(0, count), x, top, colour);
    [width, offset, top] = [count * SMALL.advance, offset + part.length + 1, top + SMALL.payload.height];
  }
  if (cursor) outlineRect(surface, x + width, top - SMALL.payload.height, SMALL.advance, SMALL.payload.height, colour);
}

interface ExpectedLine {
  readonly text: string;
  readonly typed: number;
  readonly cursor: boolean;
  readonly colour: number;
}

/** B after a status-page draw onto an empty B: the 97 × 96 copy at (x0, y0 + 1), row y0 in 0, both lines. */
function expectedStatusBack(picture: Uint8Array, upper: ExpectedLine, lower: ExpectedLine): IndexedSurface {
  const surface = createIndexedSurface(640, 480);
  for (let y = 0; y < 96; y++) for (let x = 0; x <= 96; x++) surface.indices[(RECT.y0 + 1 + y) * WIDTH + RECT.x0 + x] = picture[y * 96 + x];
  surface.indices.fill(0, RECT.y0 * WIDTH + RECT.x0, RECT.y0 * WIDTH + RECT.x1 + 1);
  drawTyped(surface, upper.text, upper.typed, upper.cursor, RECT.x0 + 4, RECT.y0 + 5, upper.colour);
  drawTyped(surface, lower.text, lower.typed, lower.cursor, RECT.x0 + 4, RECT.y1 - 20, lower.colour);
  return surface;
}

/** The rand values of the cockpit stream for TEST_SEED. */
const randoms = (count: number): number[] => {
  const stream = cockpitRandom(TEST_SEED);
  return Array.from({ length: count }, () => stream.next());
};

describe('status page picture (page 0)', () => {
  it('composes and copies the picture at the first page-0 call: background, overlays 1, 0, 2…8, row y0, both lines', () => {
    const player = (rebuilds: number) => syntheticPlayer({
      resources: { ...syntheticPlayer().resources, shield: { current: 230, maximum: 256 } },
      subsystems: fields({ 0: 2, 1: 2, 3: 1, 4: 1 }), statusDisplay: { blink: 0, rebuilds },
    });
    const fixture = leftDisplayFixture({ player: player(0) });
    run(fixture, [at(1, player(1))]);
    const [first] = randoms(1);
    const startup = (first & 0xff) < 0x55;
    // q = (230 << 8) / 256 = 0xE6: background 0; field 4 (state 1, even) matches phase 0, field 3 does not.
    const expected = expectedStatusBack(
      expectedPicture(0, [1, 0, 4]),
      { text: 'S89%', typed: 1, cursor: true, colour: 0x08 },
      startup ? { text: 'boot\nup', typed: 1, cursor: true, colour: 0x0c } : { text: 'n0\ndead', typed: 1, cursor: true, colour: 0x0f },
    );
    expect(back(fixture).indices).toEqual(expected.indices);
    // Overlay 0 over overlay 1 where they overlap; the reverse order would show 0x41 there.
    expect(pixel(back(fixture), RECT.x0 + 4, RECT.y0 + 1 + 15)).toBe(0x40);
    expect(pixel(back(fixture), RECT.x0 + 12, RECT.y0 + 1 + 15)).toBe(0x41);
    // The 97th column is the next picture row's first pixel.
    expect(pixel(back(fixture), RECT.x0 + 96, RECT.y0 + 1 + 5)).toBe(pixel(back(fixture), RECT.x0, RECT.y0 + 1 + 6));
    expect(rectPixels(screen(fixture))).toEqual(rectPixels(back(fixture)));
    expect(fixture.presentation.schedule().randomDraws).toBe(1);
  });

  it('composes with the previous tick’s blink only when rebuilds changes', () => {
    const player = (blink: 0 | 1, rebuilds: number) => syntheticPlayer({ subsystems: fields({ 2: 1, 3: 1 }), statusDisplay: { blink, rebuilds } });
    const fixture = leftDisplayFixture({ player: player(0, 0), display: leftDisplayContent(NO_STARTUP) });
    const field2 = (): number => pixel(back(fixture), RECT.x0 + 9, RECT.y0 + 1 + 15);
    const field3 = (): number => pixel(back(fixture), RECT.x0 + 22, RECT.y0 + 1 + 15);
    // Core (CK-01): tick 1 writes with phase 0 then flips to 1; tick 2 writes with phase 1.
    run(fixture, [at(1, player(1, 1))]);
    expect([field2(), field3()]).toEqual([0x42, 0x30]);
    // Phase 1 also selects background 1 for q = (800 << 8) ÷ 1000 = 0xCC.
    run(fixture, [at(2, player(1, 2))]);
    expect([field2(), field3()]).toEqual([0x31, 0x43]);
    // A phase change without a write keeps the picture.
    run(fixture, [at(3, player(0, 2)), at(4, player(0, 2))]);
    expect([field2(), field3()]).toEqual([0x31, 0x43]);
    expect(fixture.display.state().status).toMatchObject({ pending: false, seenRebuilds: 2, blink: 0 });
  });

  it('chooses the background from (shield << 8) ÷ c5C and the write’s phase', () => {
    const cases: [number, 0 | 1, number][] = [
      [0xe6, 1, 0], [0xe5, 0, 0], [0xe5, 1, 1], [0xc0, 0, 0], [0xbf, 1, 1], [0x80, 0, 1], [0x7f, 0, 1], [0x7f, 1, 2], [0x40, 0, 1], [0x3f, 1, 2], [0, 0, 2],
    ];
    for (const [ratio, blink, background] of cases) {
      const player = (rebuilds: number) => syntheticPlayer({
        resources: { ...syntheticPlayer().resources, shield: { current: ratio, maximum: 256 } }, statusDisplay: { blink, rebuilds },
      });
      const fixture = leftDisplayFixture({ player: player(0), display: leftDisplayContent(NO_STARTUP) });
      run(fixture, [at(1, player(1))]);
      expect(pixel(back(fixture), RECT.x0 + 5, RECT.y0 + 1 + 50), `q ${ratio}, phase ${blink}`).toBe(0x30 + background);
    }
  });

  it('faults on a zero shield full scale instead of drawing a made-up background', () => {
    const player = syntheticPlayer({ resources: { ...syntheticPlayer().resources, shield: { current: 5, maximum: 0 } }, statusDisplay: { blink: 0, rebuilds: 1 } });
    const fixture = leftDisplayFixture({ player: syntheticPlayer() });
    expect(() => run(fixture, [at(1, player)])).toThrow(PresentationError);
    expect(fixture.presentation.status()).toBe('failed');
  });
});

describe('status page lines (DIAG)', () => {
  const steady = syntheticPlayer({ statusDisplay: { blink: 0, rebuilds: 1 } });

  it('types one character per due step, due when next ≤ sample (not strict), with no catch-up', () => {
    const fixture = leftDisplayFixture({ player: steady, display: leftDisplayContent(NO_STARTUP) });
    const typed: number[] = [];
    for (let tick = 1; tick <= 8; tick++) {
      run(fixture, [at(tick, steady)]);
      typed.push(fixture.display.state().status.upper!.typed);
    }
    // Interval 4 at 2 units a tick: every second tick (a strict comparison would give 1, 1, 1, 2, 2, 2, 3, 3).
    expect(typed).toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
    expect(fixture.display.state().status.upper).toMatchObject({ text: 'S80%', holdEnd: 14 + 6, cursor: true });
  });

  it('with interval 0 types one character per call, passes a line break in the same step and draws exact pixels', () => {
    const display = leftDisplayContent({ statusMessages: statusMessages({ startupMessages: [], lower: { characterTicks: 0, holdTicks: 6 } }) });
    const player = syntheticPlayer({ subsystems: fields({ 0: 1 }), statusDisplay: { blink: 0, rebuilds: 1 } });
    const fixture = leftDisplayFixture({ player, display });
    const lower: number[] = [];
    for (let tick = 1; tick <= 6; tick++) {
      run(fixture, [at(tick, player)]);
      lower.push(fixture.display.state().status.lower!.typed);
    }
    // 'n0\nhit': n, 0 (and the break), h, i, t; then the cursor toggles.
    expect(lower).toEqual([1, 3, 4, 5, 6, 6]);
    expect(fixture.display.state().status.lower).toMatchObject({ text: 'n0\nhit', cursor: false, holdEnd: 10 + 6 });
    const expected = expectedStatusBack(
      expectedPicture(0, [0]),
      { text: 'S80%', typed: 3, cursor: true, colour: 0x08 },
      { text: 'n0\nhit', typed: 6, cursor: false, colour: 0x0f },
    );
    expect(back(fixture).indices).toEqual(expected.indices);
  });

  it('toggles the cursor once typed, releases the line after its hold and cycles the formats', () => {
    const display = leftDisplayContent({ statusMessages: statusMessages({ startupMessages: [], upper: { characterTicks: 0, holdTicks: 4 } }) });
    const fixture = leftDisplayFixture({ player: steady, display });
    const seen: string[] = [];
    const cursor: (boolean | null)[] = [];
    for (let tick = 1; tick <= 30; tick++) {
      run(fixture, [at(tick, steady)]);
      const upper = fixture.display.state().status.upper;
      if (upper !== null && seen.at(-1) !== upper.text) seen.push(upper.text);
      if (tick >= 4 && tick <= 7) cursor.push(upper?.cursor ?? null);
    }
    // 'S80%' is typed at tick 4 (hold end 8 + 4 = 12); tick 5 toggles the cursor, tick 6 toggles it again and releases
    // the line (12 ≤ 12); tick 7 makes the next message with the cursor visible.
    expect(cursor).toEqual([true, false, null, true]);
    expect(seen.slice(0, 5)).toEqual(['S80%', 'H90%\nok', 'Rbest', 'E500', 'S80%']);
  });

  it('formats the rating of the summed states, and format 2 itself when the sum exceeds every maximum', () => {
    const display = leftDisplayContent({ statusMessages: statusMessages({ startupMessages: [], upper: { characterTicks: 0, holdTicks: 0 } }) });
    const ratingOf = (values: Fields): string => {
      const player = syntheticPlayer({ subsystems: fields(values), statusDisplay: { blink: 0, rebuilds: 1 } });
      const fixture = leftDisplayFixture({ player, display });
      for (let tick = 1; tick <= 40; tick++) {
        run(fixture, [at(tick, player)]);
        const text = fixture.display.state().status.upper?.text ?? '';
        if (text.startsWith('R')) return text;
      }
      throw new Error('no rating message');
    };
    expect(ratingOf({})).toBe('Rbest');
    expect(ratingOf({ 0: 2, 1: 2, 2: 2, 3: 2, 4: 2, 5: 2 })).toBe('Rfair');
    expect(ratingOf({ 0: 2, 1: 2, 2: 2, 3: 2, 4: 1 })).toBe('Rgood');
    // Fields 10 (the status page's own) stays 0; 18 fields of 2 sum to 36 > 26.
    const heavy = Object.fromEntries(Array.from({ length: 19 }, (_, field) => [field, field === 10 ? 0 : 2])) as Fields;
    expect(ratingOf(heavy)).toBe('RR%s');
  });

  it('rolls one rand per lower message while start-up messages exist and shows them below 0x55', () => {
    const display = leftDisplayContent({ statusMessages: statusMessages({ lower: { characterTicks: 0, holdTicks: 0 } }) });
    const player = syntheticPlayer({ subsystems: fields({ 1: 1, 2: 2 }), statusDisplay: { blink: 0, rebuilds: 1 } });
    const fixture = leftDisplayFixture({ player, display });
    const texts: string[] = [];
    let previous: object | null = null;
    for (let tick = 1; tick <= 60; tick++) {
      run(fixture, [at(tick, player)]);
      const lower = fixture.display.state().status.lower;
      if (lower !== null && (previous === null || lower.typed === 1)) texts.push(lower.text);
      previous = lower;
    }
    const draws = fixture.presentation.schedule().randomDraws;
    expect(draws).toBeGreaterThan(5);
    const expected: string[] = [];
    let [startup, subsystem] = [0, 0];
    const words = ['ok', 'hit', 'dead'];
    const word = (field: number): string => words[field < 3 ? field : 0];
    for (const value of randoms(draws)) {
      if ((value & 0xff) < 0x55) expected.push(['boot\nup', 'go'][startup++ % 2]);
      else expected.push(`n${subsystem % 15}\n${word(subsystem++ % 15)}`);
    }
    expect(texts).toEqual(expected.slice(0, texts.length));
    expect(texts.length === draws || texts.length === draws - 1).toBe(true);
  });

  it('shows a start-up message only when the rand’s low byte is below 0x55', () => {
    const lowerFor = (value: number): string => {
      const fixture = leftDisplayFixture({ player: steady });
      const { context } = isolatedDrawContext(1, { patch: withPlayer(steady) });
      let draws = 0;
      const scripted = { ...context, random: { next: () => (draws++, value) } };
      fixture.display.instruments![6]!.draw(scripted, fixture.presentation.layout().slot!.instruments.find(({ type }) => type === 6)!);
      expect(draws).toBe(1);
      return fixture.display.state().status.lower!.text;
    };
    expect([0x54, 0x7f54, 0x55, 0xff].map(lowerFor)).toEqual(['boot\nup', 'boot\nup', 'n0\nok', 'n0\nok']);
  });

  it('makes no draw without start-up messages and faults on a state word past the three', () => {
    const fixture = leftDisplayFixture({ player: steady, display: leftDisplayContent(NO_STARTUP) });
    run(fixture, Array.from({ length: 20 }, (_, at0) => at(at0 + 1, steady)));
    expect(fixture.presentation.schedule().randomDraws).toBe(0);
    const broken = syntheticPlayer({ subsystems: fields({ 0: 3 }), statusDisplay: { blink: 0, rebuilds: 1 } });
    const failing = leftDisplayFixture({ player: broken, display: leftDisplayContent(NO_STARTUP) });
    expect(() => run(failing, [at(1, broken)])).toThrow(/state word/);
  });

  it('pauses typing on other pages, in interference, outside the cockpit views and in 0-tick frames', () => {
    const fixture = leftDisplayFixture({ player: steady, display: leftDisplayContent(NO_STARTUP) });
    run(fixture, [at(1, steady)]);
    const before = fixture.display.state().status;
    const energy = syntheticPlayer({ ...steady, leftPage: 1 });
    const jammed = syntheticPlayer({ ...steady, subsystems: fields({ 10: 2 }) });
    run(fixture, [at(2, energy), at(3, energy), at(4, jammed), at(5, jammed)]);
    run(fixture, [at(6, steady, { viewMode: MAP_VIEW, events: [viewSwitched(6, FLIGHT_VIEW, MAP_VIEW)] }), at(7, steady, { viewMode: MAP_VIEW })]);
    fixture.presentation.advance(cockpitBatch([]));
    expect(fixture.display.state().status).toEqual(before);
  });

  it('releases both lines at a view switch from or to the base view and keeps the cycle indices', () => {
    const fixture = leftDisplayFixture({ player: steady, display: leftDisplayContent(NO_STARTUP) });
    run(fixture, [at(1, steady)]);
    expect(fixture.display.state().status).toMatchObject({ upperIndex: 1, lowerIndex: 1 });
    run(fixture, [at(2, steady, { viewMode: BASE_VIEW, events: [viewSwitched(2, FLIGHT_VIEW, BASE_VIEW)] })]);
    expect(fixture.display.state().status).toMatchObject({ upper: null, lower: null, upperIndex: 1, lowerIndex: 1 });
    run(fixture, [at(3, steady, { events: [viewSwitched(3, BASE_VIEW, FLIGHT_VIEW)] })]);
    expect(fixture.display.state().status).toMatchObject({ upper: { text: 'H90%\nok', typed: 1 }, lower: { text: 'n1\nok' }, upperIndex: 2, lowerIndex: 2 });
    // A switch between flight views and the map is not a rebuild.
    run(fixture, [at(4, steady, { viewMode: MAP_VIEW, events: [viewSwitched(4, FLIGHT_VIEW, MAP_VIEW)] })]);
    expect(fixture.display.state().status.upper).not.toBeNull();
  });

  it('draws nothing and keeps every state without a player', () => {
    const fixture = leftDisplayFixture({ player: null });
    run(fixture, [at(1, null), at(2, null)]);
    expect(back(fixture).indices.every((index) => index === 0)).toBe(true);
    expect(fixture.presentation.schedule().randomDraws).toBe(0);
    expect(fixture.display.state()).toMatchObject({ page: 0, status: { upper: null, lower: null, seenRebuilds: null } });
  });
});

/** B after an energy-page draw on an empty B, from the recorded rules. */
function expectedEnergyBack(player: CombatPlayer): IndexedSurface {
  const surface = createIndexedSurface(640, 480);
  const { x0, y0, x1, y1 } = RECT;
  const copy = (image: ReturnType<typeof levelImage>, x: number, y: number, rows: number, key: boolean): void => {
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column <= image.width; column++) {
        const offset = row * image.width + column;
        if (offset >= image.width * image.height) continue;
        const index = image.indices[offset];
        if (!key || index !== 0) surface.indices[(y + row) * WIDTH + x + column] = index;
      }
    }
  };
  copy(pageBackground(), x0, y0 + 1, 96, false);
  surface.indices.fill(0, y0 * WIDTH + x0, y0 * WIDTH + x1 + 1);
  const [left, right] = [levelImage(player.allocation.shieldLevel), levelImage(player.allocation.chargeLevel)];
  copy(left, x0 + 18, y0 + 12, left.height - 1, true);
  copy(right, x1 - 18 - right.width, y0 + 12, right.height - 1, true);
  const [height, bottom] = [y1 - y0 - 6, y1 - 3];
  const halves = halfWidths();
  const bar = ({ current, maximum }: { current: number; maximum: number }, cx: number, colour: number, l: readonly number[], r: readonly number[], label: string): void => {
    const length = current >= maximum ? height : Math.trunc((height * current) / maximum);
    for (let [y, row] = [bottom, 0]; y >= bottom - length; y -= 2, row++) drawLine(surface, cx - l[row], y, cx + r[row], y, colour);
    drawText(surface, REGULAR, label, cx - 4, bottom - height, 0x08);
  };
  const five = Array<number>(50).fill(5);
  const labels = leftDisplayContent().hudText.entries;
  bar(player.resources['spare-power'], x0 + Math.trunc((x1 - x0) / 2), 0x0f, halves, halves, labels.leftEnergyBar1Label);
  bar(player.resources.shield, x0 + 8, 0x14, five, halves, labels.leftEnergyBar2Label);
  bar(player.resources.charge, x1 - 8, 0x0a, halves, five, labels.leftEnergyBar3Label);
  return surface;
}

/** The half-width table computed in doubles: t accumulated in f32 by f32(0.016) from entry 49 down. */
function halfWidths(): number[] {
  const table: number[] = [];
  let t = 0;
  for (let index = 49; index >= 0; index--) {
    table[index] = Math.min(Math.max(Math.trunc(45 * t * t * t), 5), 45);
    t = Math.fround(t + Math.fround(0.016));
  }
  return table;
}

describe('energy page (page 1)', () => {
  const energy = (patch: Partial<CombatPlayer> = {}) => syntheticPlayer({ leftPage: 1, energyPageRedraws: 3, ...patch });

  it('has the recorded half-width table, widest at the bottom, far from integer boundaries', () => {
    expect(ENERGY_HALF_WIDTHS).toEqual(halfWidths());
    expect(ENERGY_HALF_WIDTHS[49]).toBe(5);
    expect(ENERGY_HALF_WIDTHS[0]).toBe(21);
    expect(ENERGY_HALF_WIDTHS.every((value, index) => index === 0 || value <= ENERGY_HALF_WIDTHS[index - 1])).toBe(true);
  });

  it('draws the background, row y0, the two level records and the three bars with their labels', () => {
    const player = energy();
    const fixture = leftDisplayFixture({ player });
    run(fixture, [at(1, player)]);
    expect(back(fixture).indices).toEqual(expectedEnergyBack(player).indices);
    expect(rectPixels(screen(fixture))).toEqual(rectPixels(back(fixture)));
    // Negative controls: the gauge records are each a column wider than the image, and the bars start at the bottom.
    const left = levelImage(1);
    expect(pixel(back(fixture), RECT.x0 + 18 + left.width, RECT.y0 + 12)).toBe(left.indices[left.width]);
    expect(pixel(back(fixture), RECT.x0 + 49, RECT.y1 - 3)).toBe(0x0f);
  });

  it('redraws only for a new redraw count, a new view or the first entry', () => {
    const fixture = leftDisplayFixture({ player: energy() });
    run(fixture, [at(1, energy())]);
    const first = [...back(fixture).indices];
    const changed = { resources: { ...syntheticPlayer().resources, 'spare-power': { current: 90, maximum: 100 } } };
    run(fixture, [at(2, energy(changed)), at(3, energy(changed))]);
    expect([...back(fixture).indices]).toEqual(first);
    run(fixture, [at(4, energy({ ...changed, energyPageRedraws: 4 }))]);
    expect(back(fixture).indices).toEqual(expectedEnergyBack(energy(changed)).indices);
    expect(fixture.display.state().energy).toEqual({ lastView: FLIGHT_VIEW, seenRedraws: 4 });
    run(fixture, [at(5, energy({ ...changed, energyPageRedraws: 4 }), { viewMode: WARP_VIEW, events: [viewSwitched(5, FLIGHT_VIEW, WARP_VIEW)] })]);
    expect(fixture.display.state().energy).toEqual({ lastView: WARP_VIEW, seenRedraws: 4 });
    expect(rectPixels(back(fixture))).toEqual(rectPixels(expectedEnergyBack(energy(changed))));
  });

  it('draws a full bar at or above the scale (also scale 0), the bottom line at 0, truncates toward zero and faults on 0 with a negative value', () => {
    // Lines of the middle bar in column cx + 5, below the label (rows y0 + 12 … y1 − 3): a full bar has 43 there.
    const lines = (current: number, maximum: number): number => {
      const player = energy({ resources: { ...syntheticPlayer().resources, 'spare-power': { current, maximum } } });
      const fixture = leftDisplayFixture({ player });
      run(fixture, [at(1, player)]);
      let count = 0;
      for (let y = RECT.y0 + 12; y <= RECT.y1 - 3; y++) if (pixel(back(fixture), RECT.x0 + 54, y) === 0x0f) count++;
      return count;
    };
    expect([lines(150, 100), lines(100, 100), lines(5, 0), lines(0, 100), lines(-1, 100), lines(-50, 100), lines(4, 100)]).toEqual([43, 43, 43, 1, 1, 0, 2]);
    const failing = energy({ resources: { ...syntheticPlayer().resources, charge: { current: -1, maximum: 0 } } });
    const fixture = leftDisplayFixture({ player: failing });
    expect(() => run(fixture, [at(1, failing)])).toThrow(/non-zero full scale/);
  });
});

describe('page dispatcher', () => {
  const onPage = (page: CombatPlayer['leftPage'], values: Fields = {}) => syntheticPlayer({ leftPage: page, subsystems: fields(values), statusDisplay: { blink: 0, rebuilds: 1 } });

  it('refreshes each page when the sample is strictly past its next refresh, by the page table', () => {
    expect(LEFT_PAGE_TABLE.map(({ period }) => period)).toEqual([0, 0, 0x40, 0x10, 0x40, 0, 0x10]);
    for (const page of [2, 3, 5, 6] as const) {
      const calls: PageCall[] = [];
      const fixture = leftDisplayFixture({ player: onPage(page), pageCalls: calls });
      run(fixture, Array.from({ length: 80 }, (_, index) => at(index + 1, onPage(page))));
      const period = LEFT_PAGE_TABLE[page].period;
      const expected: number[] = [];
      let next = 0;
      for (let tick = 1; tick <= 80; tick++) {
        if (2 * tick <= next) continue;
        expected.push(tick);
        next = 2 * tick + period;
      }
      expect(calls.map(({ tick }) => tick), `page ${page}`).toEqual(expected);
      expect(calls.every(({ page: called, forced }) => called === page && !forced)).toBe(true);
    }
  });

  it('refreshes the new page at once after left-page-changed, even within its period', () => {
    const calls: PageCall[] = [];
    const fixture = leftDisplayFixture({ player: onPage(2), pageCalls: calls });
    run(fixture, [at(1, onPage(2)), at(2, onPage(3), { events: [syntheticEvent(2, 'left-page-changed', { page: 3, previousPage: 2, commandIndex: 0 })] })]);
    run(fixture, [at(3, onPage(2), { events: [syntheticEvent(3, 'left-page-changed', { page: 2, previousPage: 3, commandIndex: 1 })] }), at(4, onPage(2))]);
    expect(calls.map(({ page, tick }) => `${page}@${tick}`)).toEqual(['2@1', '3@2', '2@3']);
  });

  it('refreshes page 0 and the current page at once after a rebuild (a view switch from or to view 6)', () => {
    const calls: PageCall[] = [];
    const fixture = leftDisplayFixture({ player: onPage(2), pageCalls: calls });
    run(fixture, [at(1, onPage(2))]);
    expect(fixture.display.state().entries[2].nextRefresh).toBe(2 + 0x40);
    run(fixture, [at(2, onPage(2), { viewMode: BASE_VIEW, events: [viewSwitched(2, FLIGHT_VIEW, BASE_VIEW)] })]);
    expect(fixture.display.state().entries.map(({ nextRefresh }) => nextRefresh).slice(0, 3)).toEqual([0, 0, 0]);
    run(fixture, [at(3, onPage(2), { events: [viewSwitched(3, BASE_VIEW, FLIGHT_VIEW)] }), at(4, onPage(2))]);
    expect(calls.map(({ tick }) => tick)).toEqual([1, 3]);
  });

  it('draws the SNIP at field state 2 without a random draw, skipping unchanged frames, and the page again at state 0', () => {
    const jammed = onPage(0, { 10: 2 });
    const fixture = leftDisplayFixture({ player: jammed, display: leftDisplayContent(NO_STARTUP) });
    const frames: number[] = [];
    for (let tick = 1; tick <= 8; tick++) {
      run(fixture, [at(tick, jammed)]);
      frames.push(pixel(back(fixture), RECT.x0, RECT.y0 + 2) - 0x70);
    }
    // On at tick 1 (start 2): (clock − 2) × 12 >> 6 for clocks 2…16.
    expect(frames).toEqual([0, 0, 0, 1, 1, 1, 2, 2]);
    expect(fixture.display.state().entries[0]).toEqual({ on: true, start: 2, nextToggle: 0, nextRefresh: 0 });
    expect(fixture.interference.lastFrame()).toBe(2);
    expect(fixture.display.state().status.upper).toBeNull();
    run(fixture, [at(9, onPage(0))]);
    expect(fixture.display.state().entries[0].on).toBe(false);
    expect(pixel(back(fixture), RECT.x0 + 5, RECT.y0 + 1 + 50)).toBe(0x30);
    expect(fixture.presentation.schedule().randomDraws).toBe(0);
  });

  it('toggles at field state 1 after 0x40 + (rand & 0x3F) units with one draw per toggle, per page entry', () => {
    const flicker = onPage(2, { 13: 1 });
    const calls: PageCall[] = [];
    const fixture = leftDisplayFixture({ player: flicker, display: leftDisplayContent(NO_STARTUP), pageCalls: calls });
    const [r1, r2, r3] = randoms(3);
    // On at tick 1 (clock 2) until the clock is strictly past 2 + 0x40 + (r1 & 0x3F).
    const toggle = 2 + 0x40 + (r1 & 0x3f);
    const offTick = Math.floor(toggle / 2) + 1;
    run(fixture, Array.from({ length: offTick }, (_, index) => at(index + 1, flicker)));
    const offClock = 2 * offTick;
    expect(fixture.display.state().entries[2]).toEqual({ on: false, start: 2, nextToggle: offClock + 0x40 + (r2 & 0x3f), nextRefresh: offClock + 0x40 });
    expect(calls.map(({ tick }) => tick)).toEqual([offTick]);
    expect(fixture.presentation.schedule().randomDraws).toBe(2);
    // Page 3 shares field 13 but has its own entry: it switches on at its first call with its own draw.
    const next = offTick + 1;
    run(fixture, [at(next, onPage(3, { 13: 1 }), { events: [syntheticEvent(next, 'left-page-changed', { page: 3, previousPage: 2, commandIndex: 0 })] })]);
    expect(fixture.display.state().entries[3]).toMatchObject({ on: true, start: 2 * next, nextToggle: 2 * next + 0x40 + (r3 & 0x3f) });
    expect(fixture.display.state().entries[2].on).toBe(false);
    expect(fixture.presentation.schedule().randomDraws).toBe(3);
  });

  it('treats a field state of 3, which has no writer, like state 1', () => {
    const odd = onPage(1, { 11: 3 });
    const fixture = leftDisplayFixture({ player: odd });
    run(fixture, [at(1, odd)]);
    expect(fixture.display.state().entries[1]).toMatchObject({ on: true, start: 2, nextToggle: 2 + 0x40 + (randoms(1)[0] & 0x3f) });
    expect(fixture.presentation.schedule().randomDraws).toBe(1);
  });

  it('never shows interference on page 6, which has no field', () => {
    const calls: PageCall[] = [];
    const warp = syntheticPlayer({ leftPage: 6, subsystems: fields(Object.fromEntries(Array.from({ length: 19 }, (_, field) => [field, 2]))) });
    const fixture = leftDisplayFixture({ player: warp, pageCalls: calls });
    run(fixture, Array.from({ length: 20 }, (_, index) => at(index + 1, warp)));
    expect(calls.length).toBeGreaterThan(0);
    expect(fixture.display.state().entries[6].on).toBe(false);
    expect(fixture.presentation.schedule().randomDraws).toBe(0);
  });

  it('fills the rectangle with 0 before the call after page 5 shows a new message (0x4e418 → 0x4ce18)', () => {
    const after = (shown: boolean) => {
      const fixture = leftDisplayFixture({ player: onPage(5) });
      run(fixture, [at(1, onPage(5))]);
      // The SNIP that the same tick's call draws leaves column x1 and the rows below it alone.
      const started = syntheticEvent(2, 'incoming-started', { message: null, speaker: null, frameDurations: [], shown });
      run(fixture, [at(2, onPage(5, { 13: 2 }), { events: [started] })]);
      return { pending: fixture.display.state().clearPending, column: pixel(back(fixture), RECT.x1, RECT.y0 + 50), snip: pixel(back(fixture), RECT.x0, RECT.y0 + 50) };
    };
    expect(after(true)).toEqual({ pending: false, column: 0, snip: 0x70 });
    expect(after(false)).toEqual({ pending: false, column: 0xa5, snip: 0x70 });
  });

  it('draws forced every call, publishes nothing and keeps the refresh (directory +0x0C)', () => {
    const calls: PageCall[] = [];
    const fixture = leftDisplayFixture({ player: onPage(2), pageCalls: calls });
    const handler = fixture.display.instruments![6]!;
    const record = fixture.presentation.layout().slot!.instruments.find(({ type }) => type === 6)!;
    for (const tick of [1, 2, 3]) {
      const { context, published } = isolatedDrawContext(tick, { patch: withPlayer(onPage(2)) });
      const forced = { ...context, layout: { ...context.layout, slot: { ...context.layout.slot!, alwaysRedraw: true } } };
      handler.draw(forced, record);
      expect(published).toEqual([]);
    }
    expect(calls.map(({ tick, forced }) => [tick, forced])).toEqual([[1, true], [2, true], [3, true]]);
    expect(fixture.display.state().entries[2].nextRefresh).toBe(0);
  });

  it('gives the same pictures, states and draws however the ticks are grouped into frames', () => {
    const script = (tick: number): CockpitTick => {
      const page = tick < 10 ? 0 : tick < 16 ? 1 : 2;
      const values: Fields = tick >= 5 && tick < 12 ? { 10: 1, 11: 1 } : {};
      const player = syntheticPlayer({ leftPage: page, subsystems: fields(values), statusDisplay: { blink: (tick >> 3) & 1 ? 1 : 0, rebuilds: tick >> 2 }, energyPageRedraws: tick >> 3 });
      const events = tick === 10 || tick === 16 ? [syntheticEvent(tick, 'left-page-changed', { page, previousPage: page - 1, commandIndex: null })] : [];
      return at(tick, player, { events });
    };
    const outcome = (groups: readonly number[]) => {
      const fixture = leftDisplayFixture({ player: syntheticPlayer() });
      let tick = 1;
      for (const size of groups) {
        fixture.presentation.advance(cockpitBatch(Array.from({ length: size }, () => script(tick++))));
      }
      return { back: [...back(fixture).indices], screen: [...screen(fixture).indices], state: fixture.display.state(), draws: fixture.presentation.schedule().randomDraws };
    };
    const single = outcome(Array<number>(24).fill(1));
    expect(single.draws).toBeGreaterThan(0);
    expect(outcome([5, 0, 5, 2, 5, 5, 2])).toEqual(single);
  });

  it('draws nothing for a page without a drawer but keeps its refresh, and rejects drawers of other pages', () => {
    const calls: PageCall[] = [];
    const { 3: three, 4: four, 5: five, 6: six } = recordingPages(calls);
    const pages: LeftPageDrawers = { 3: three, 4: four, 5: five, 6: six };
    const fixture = leftDisplayFixture({ player: onPage(2), pages });
    run(fixture, [at(1, onPage(2))]);
    expect(calls).toEqual([]);
    expect(rectPixels(back(fixture)).every((index) => index === 0)).toBe(true);
    expect(fixture.display.state().entries[2].nextRefresh).toBe(2 + 0x40);
    for (const bad of [{ 1: () => true }, { 3: 'draw' }]) {
      expect(() => leftDisplayFixture({ pages: bad as unknown as LeftPageDrawers })).toThrow(/leftDisplay\.pages\./);
    }
  });

  it('dispatches pages 2–4 to subtask 18’s menu page and 5 to its incoming page, bound to their object', () => {
    class Pages implements CommunicationPages {
      readonly #log: string[];
      constructor(log: string[]) {
        this.#log = log;
      }
      drawMenuPage(context: CockpitDrawContext): boolean {
        this.#log.push(`menu ${context.projection.flight.combat.player!.leftPage}`);
        return false;
      }
      drawIncomingPage(context: CockpitDrawContext): boolean {
        this.#log.push(`incoming ${context.projection.flight.combat.player!.leftPage}`);
        return true;
      }
    }
    const log: string[] = [];
    const fixture = leftDisplayFixture({ player: onPage(2), pages: communicationPageDrawers(new Pages(log)) });
    const switched = (tick: number, page: 2 | 3 | 4 | 5, previousPage: number) =>
      at(tick, onPage(page), { events: [syntheticEvent(tick, 'left-page-changed', { page, previousPage, commandIndex: null })] });
    run(fixture, [at(1, onPage(2)), switched(2, 3, 2), switched(3, 4, 3), switched(4, 5, 4)]);
    expect(log).toEqual(['menu 2', 'menu 3', 'menu 4', 'incoming 5']);
  });

  it('shares the interference picture’s last frame with another display', () => {
    const interference = createDisplayInterference(interferenceFrames());
    const jammed = onPage(0, { 10: 2 });
    const fixture = leftDisplayFixture({ player: jammed, interference });
    run(fixture, [at(1, jammed)]);
    const { context } = isolatedDrawContext(1);
    expect(interference.draw(context, { x0: 500, y0: 340, x1: 599, y1: 439 }, 2, false)).toBe(false);
  });
});
