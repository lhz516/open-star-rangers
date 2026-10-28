import { describe, expect, it } from 'vitest';
import type { CharMapEntry, FontPayload } from '../../../content/graphics/font-payload.ts';
import type { CockpitInstruments } from '../../../content/hud/instruments-payload.ts';
import type { Projection } from '../../../core/projections/projection.ts';
import { SUBSYSTEM_COUNT } from '../../../core/world/entity-table.ts';
import type { CockpitPresentation } from '../presentation/cockpit-contract.ts';
import { PresentationError } from '../presentation/cockpit-limits.ts';
import { cockpitRandom } from '../presentation/cockpit-random.ts';
import {
  cockpitBatch, cockpitContent, cockpitTick, cockpitTicks, createTestPresentation, FLIGHT_VIEW, TEST_SEED, viewSwitched, WARP_VIEW,
  type DeepPartial,
} from '../presentation/cockpit.test-support.ts';
import { hudFont } from '../raster/glyph-text.ts';
import { createCornerGauges, GAUGE_FIELDS, type CornerGaugesModule } from './corner-gauges.ts';

// Expectations from docs/original/formats/hud.md §4.2 and executable.md D16 (Confirmed, code; P3-13/02), derived by
// hand: a reading v shows n = chop((y1 − y0) × v) rows. Synthetic content, labels drawn with empty glyphs.

const LABELS = { 0: 'S0', 1: 'S1', 2: 'S2', 3: 'S3' } as const;
function blankFont(): FontPayload {
  const codes = [...new Set(Object.values(LABELS).join(''))].map((code) => code.charCodeAt(0)).sort((a, b) => a - b);
  const charMap: CharMapEntry[] = codes.map((code) => ({ code, glyph: code }));
  return Object.freeze({ kind: 'font', cellWidth: 8, height: 8, glyphRows: 8, glyphs: new Uint8Array(128 * 8), charMap: Object.freeze(charMap) });
}
const gauges = (): CornerGaugesModule => createCornerGauges({ font: hudFont(blankFont(), 8, false), labels: LABELS });

/** Records of types 0–3: 21 rows each (y1 − y0 = 20, every half-width 10), shaped bars growing up from y1. */
const RECTANGLES = { 0: [10, 330, 39, 350], 1: [600, 330, 629, 350], 2: [50, 330, 79, 350], 3: [560, 330, 589, 350] } as const;
const MODES = { 0: 0, 1: 1, 2: 0, 3: 0 } as const;
const COLOURS = { 0: 21, 1: 22, 2: 23, 3: 24 } as const;
const INTERVALS = { 0: 7, 1: 9, 2: 0, 3: 0 } as const;
type Gauge = 0 | 1 | 2 | 3;

function content(flatType0 = false): CockpitInstruments {
  return cockpitContent((mutable) => {
    for (const record of mutable.slots[0].instruments) {
      if (record.type > 3) continue;
      const type = record.type as Gauge;
      const [x0, y0, x1, y1] = RECTANGLES[type];
      record.rectangle = { x0, y0, x1, y1 };
      record.params = [MODES[type]];
      record.drawParam = COLOURS[type];
      record.redrawInterval = INTERVALS[type];
      // A flat bar of 151 rows for the damaged readings of 0–10 %.
      if (type === 0 && flatType0) Object.assign(record, { rectangle: { x0, y0: 320, x1, y1: 470 }, params: [] });
    }
  });
}

interface PlayerOptions {
  readonly speed?: number;
  readonly commanded?: number;
  readonly maximum?: number;
  readonly record?: number;
  readonly energy?: readonly [number, number];
  readonly shield?: readonly [number, number];
  readonly fields?: Readonly<Record<number, number>>;
}

/** A projection patch with a player of these readings. */
function player({ speed = 0, commanded = 0, maximum = 100, record = 100, energy = [100, 100], shield = [100, 100], fields = {} }: PlayerOptions = {}): DeepPartial<Projection> {
  const subsystems = Array.from({ length: SUBSYSTEM_COUNT }, (_, index) => fields[index] ?? 0);
  return {
    flight: {
      motion: { readiness: 'ready', player: { entityId: 1, speed, commandedSpeed: commanded, maximumSpeed: maximum, recordMaximumSpeed: record } },
      combat: {
        readiness: 'ready',
        player: {
          entityId: 1, subsystems,
          resources: { energy: { current: energy[0], maximum: energy[1] }, shield: { current: shield[0], maximum: shield[1] } },
          radar: { status: 0, contacts: [] },
        },
      },
    },
  } as DeepPartial<Projection>;
}

/** Rows k (from the anchor row y1) that hold `colour` in S at column x of gauge `type`'s anchored edge. */
function litRows(presentation: CockpitPresentation, type: Gauge, colour: number, column = 0): number[] {
  const { screen } = presentation.surfaces();
  const [x0, y0, x1, y1] = RECTANGLES[type];
  const x = MODES[type] === 0 ? x0 + column : x1 - column;
  return Array.from({ length: y1 - y0 + 1 }, (_, k) => k).filter((k) => screen.indices[(y1 - k) * 640 + x] === colour);
}

/** The rows of n: lines at 0, 2, …, 2(J − 1) and the closing row 2J − 1, J = ⌈n / 2⌉. */
function barOf(n: number): number[] {
  const lines = Math.max(0, Math.ceil(n / 2));
  if (lines === 0) return [];
  return [...Array.from({ length: lines }, (_, j) => 2 * j), 2 * lines - 1].sort((a, b) => a - b);
}

function start(options: { readonly content?: CockpitInstruments; readonly viewMode?: number } = {}): { presentation: CockpitPresentation; module: CornerGaugesModule } {
  const module = gauges();
  const presentation = createTestPresentation({ modules: [module], content: options.content ?? content(), viewMode: options.viewMode });
  return { presentation, module };
}

const advance = (presentation: CockpitPresentation, first: number, last: number, patch: DeepPartial<Projection>, viewMode = FLIGHT_VIEW): void => {
  for (let tick = first; tick <= last; tick += 5) presentation.advance(cockpitBatch(cockpitTicks(tick, Math.min(tick + 4, last), { patch, viewMode })));
};

function failure(run: () => unknown): PresentationError {
  try {
    run();
  } catch (error) {
    if (error instanceof PresentationError) return error;
    throw error;
  }
  throw new Error('expected a PresentationError');
}

describe('readings and full scales (D16)', () => {
  it('reads speed against the craft record’s +0xB8, never the falling maximum speed', () => {
    const { presentation } = start();
    advance(presentation, 1, 1, player({ speed: 150, record: 300, maximum: 150 }));
    // 150 ÷ 300 = 0.5: n = 10. Negative control: ÷ 150 would fill all 21 rows.
    expect(litRows(presentation, 0, COLOURS[0])).toEqual(barOf(10));
    expect(litRows(presentation, 0, COLOURS[0])).not.toEqual(barOf(20));
  });

  it('reads commanded speed against the maximum speed outside Warp and +0xB8 in Warp, and 0 when that is not above 0', () => {
    const flight = start();
    advance(flight.presentation, 1, 1, player({ commanded: 100, maximum: 200, record: 400 }));
    expect(litRows(flight.presentation, 1, COLOURS[1])).toEqual(barOf(10));
    const warp = start({ viewMode: WARP_VIEW });
    advance(warp.presentation, 1, 1, player({ commanded: 100, maximum: 200, record: 400 }), WARP_VIEW);
    expect(litRows(warp.presentation, 1, COLOURS[1])).toEqual(barOf(5));
    for (const maximum of [0, -5]) {
      const zero = start();
      zero.presentation.surfaces().screen.indices.fill(7);
      advance(zero.presentation, 1, 1, player({ commanded: 100, maximum, record: 400 }));
      expect(litRows(zero.presentation, 1, COLOURS[1])).toEqual([]);
      expect(litRows(zero.presentation, 1, 0)).toEqual(Array.from({ length: 21 }, (_, k) => k));
    }
  });

  it('faults on a zero full scale the original divides by, unless the reading is not taken', () => {
    const speed = start();
    expect(failure(() => advance(speed.presentation, 1, 1, player({ speed: 10, record: 0 })))).toMatchObject({ kind: 'invariant-violated', path: 'cockpit.gauges.type0.recordMaximumSpeed' });
    expect(speed.presentation.status()).toBe('failed');
    const energy = start();
    expect(failure(() => advance(energy.presentation, 1, 1, player({ energy: [0, 0] })))).toMatchObject({ kind: 'invariant-violated', path: 'cockpit.gauges.type2.energy.maximum' });
    const hidden = start();
    advance(hidden.presentation, 1, 1, player({ speed: 10, record: 0, fields: { [GAUGE_FIELDS[0]]: 2 } }));
    expect(hidden.presentation.status()).toBe('ready');
  });

  it('draws nothing and no random number without a player', () => {
    const { presentation } = start();
    presentation.surfaces().screen.indices.fill(7);
    advance(presentation, 1, 1, { flight: { motion: { player: null }, combat: { player: null } } });
    for (const type of [0, 1, 2, 3] as const) expect(litRows(presentation, type, 7)).toHaveLength(21);
    expect(presentation.schedule().randomDraws).toBe(0);
  });
});

describe('energy and shield colours and own timers (hud §4.2)', () => {
  // [type, value ×100, colour of the first draw (phase 1), of the second (phase 0), period]
  const cases: readonly (readonly [2 | 3, number, number, number, number])[] = [
    [2, 10, 0, 10, 0x10], [2, 30, 0x0f, 0, 0x20], [2, 60, COLOURS[2], COLOURS[2], 0x40],
    [3, 10, 0, COLOURS[3], 0x10], [3, 30, 0, COLOURS[3], 0x20], [3, 60, COLOURS[3], COLOURS[3], 0x20],
    [2, 25, 0x0f, 0, 0x20], [2, 50, COLOURS[2], COLOURS[2], 0x40], [3, 25, 0, COLOURS[3], 0x20], [3, 50, COLOURS[3], COLOURS[3], 0x20],
  ];

  it.each(cases)('type %i at %i %% draws %i, then %i a period of %i later (not strict)', (type, percent, first, second, period) => {
    const { presentation, module } = start();
    const resource = type === 2 ? { energy: [percent, 100] as const } : { shield: [percent, 100] as const };
    const patch = player(resource);
    // n = chop(20 × percent / 100); lines of colour 0 are indistinguishable from the cleared shape.
    const rows = barOf(Math.trunc((20 * percent) / 100));
    const timer = (): { due: number; period: number; phase: number } => (type === 2 ? module.timers().energy : module.timers().shield);
    advance(presentation, 1, 1, patch);
    expect(timer()).toEqual({ due: 2 + period, period, phase: 0 });
    if (first !== 0) expect(litRows(presentation, type, first)).toEqual(rows);
    else expect(litRows(presentation, type, 0)).toEqual(Array.from({ length: 21 }, (_, k) => k));
    // Clock 2 + period is the first sample at or after the due; one tick earlier the gauge holds.
    const dueTick = 1 + period / 2;
    advance(presentation, 2, dueTick - 1, player(type === 2 ? { energy: [100, 100] } : { shield: [100, 100] }));
    expect(timer()).toEqual({ due: 2 + period, period, phase: 0 });
    advance(presentation, dueTick, dueTick, patch);
    expect(timer()).toEqual({ due: 2 * dueTick + period, period, phase: 1 });
    if (second !== 0) expect(litRows(presentation, type, second)).toEqual(rows);
    else expect(litRows(presentation, type, 0)).toEqual(Array.from({ length: 21 }, (_, k) => k));
  });

  it('starts each run with energy due 0, period 0x40, phase 1 and shield due 0, period 0x20, phase 1', () => {
    expect(gauges().timers()).toEqual({ energy: { due: 0, period: 0x40, phase: 1 }, shield: { due: 0, period: 0x20, phase: 1 } });
  });

  it('holds before anything while the clock is below the due, even in a full redraw and when damaged', () => {
    const { presentation, module } = start();
    advance(presentation, 1, 1, player({ speed: 50, energy: [60, 100], shield: [60, 100] }));
    expect(module.timers().energy.due).toBe(2 + 0x40);
    // Tick 3 re-selects the flight layout: S goes black and every record is forced.
    const damaged = player({ speed: 50, energy: [60, 100], shield: [60, 100], fields: { [GAUGE_FIELDS[2]]: 1, [GAUGE_FIELDS[3]]: 1 } });
    presentation.advance(cockpitBatch([cockpitTick(2, { patch: damaged }), cockpitTick(3, { patch: damaged, events: [viewSwitched(3, FLIGHT_VIEW, FLIGHT_VIEW)] })]));
    expect(litRows(presentation, 0, COLOURS[0])).toEqual(barOf(10));
    expect(litRows(presentation, 2, 0)).toEqual(Array.from({ length: 21 }, (_, k) => k));
    expect(litRows(presentation, 3, 0)).toEqual(Array.from({ length: 21 }, (_, k) => k));
    expect(presentation.schedule().randomDraws).toBe(0);
  });
});

describe('damage (hud §4.2)', () => {
  it('state 1 draws rand & 3 and shows the reading on 3, otherwise a second draw scaled to 0–10 %', () => {
    const module = gauges();
    const presentation = createTestPresentation({ modules: [module], content: content(true) });
    const expected = cockpitRandom(TEST_SEED);
    const patch = player({ speed: 75, record: 100, fields: { [GAUGE_FIELDS[0]]: 1 } });
    const branches = new Set<string>();
    let draws = 0;
    // Type 0 (interval 7) is due at ticks 1, 5, 9, …; the others are undamaged and draw nothing random.
    for (let tick = 1; tick <= 81; tick += 4) {
      advance(presentation, tick, tick + 3, patch);
      let value = Math.fround(75 / 100);
      draws++;
      if ((expected.next() & 3) === 3) branches.add('true');
      else {
        draws++;
        value = Math.fround(expected.next() * Math.fround(1 / 32767) * 0.1);
        branches.add('random');
      }
      const { screen } = presentation.surfaces();
      const rows = Array.from({ length: 151 }, (_, k) => k).filter((k) => screen.indices[(470 - k) * 640 + 10] === COLOURS[0]);
      expect(rows).toEqual(barOf(Math.trunc(150 * value)));
      expect(presentation.schedule().randomDraws).toBe(draws);
    }
    expect([...branches].sort()).toEqual(['random', 'true']);
  });

  it('state 2 returns at once: the last picture stays, no number is drawn and the own timer stays', () => {
    const { presentation, module } = start();
    advance(presentation, 1, 1, player({ speed: 50, energy: [60, 100] }));
    const before = presentation.surfaces().screen.indices.slice();
    const timers = module.timers();
    const hidden = player({ speed: 90, energy: [10, 100], fields: { [GAUGE_FIELDS[0]]: 2, [GAUGE_FIELDS[2]]: 2 } });
    advance(presentation, 2, 40, hidden);
    expect(litRows(presentation, 0, COLOURS[0])).toEqual(barOf(10));
    expect(presentation.surfaces().screen.indices).toEqual(before);
    expect(module.timers().energy).toEqual(timers.energy);
    expect(presentation.schedule().randomDraws).toBe(0);
  });

  it('state 3, which no damage writes and the original draws as an uninitialised value, is a fault', () => {
    for (const type of [0, 1, 2, 3] as const) {
      const { presentation } = start();
      const error = failure(() => advance(presentation, 1, 1, player({ fields: { [GAUGE_FIELDS[type]]: 3 } })));
      expect(error).toMatchObject({ kind: 'invariant-violated', path: `cockpit.gauges.subsystems[${GAUGE_FIELDS[type]}]` });
    }
  });
});

describe('scheduling and visible persistence', () => {
  it('redraws each gauge only when the presentation schedules it, and S keeps the last copy in between', () => {
    const { presentation } = start();
    advance(presentation, 1, 1, player({ speed: 25 }));
    expect(litRows(presentation, 0, COLOURS[0])).toEqual(barOf(5));
    // Interval 7 at 2 units a tick: the next draw is at clock 10, tick 5.
    advance(presentation, 2, 4, player({ speed: 50 }));
    expect(litRows(presentation, 0, COLOURS[0])).toEqual(barOf(5));
    advance(presentation, 5, 5, player({ speed: 50 }));
    expect(litRows(presentation, 0, COLOURS[0])).toEqual(barOf(10));
  });

  it('is the same state and picture whether ticks come one by one or in batches', () => {
    const patch = (tick: number): DeepPartial<Projection> => player({ speed: tick * 7, commanded: 30, energy: [tick, 100], shield: [100 - tick, 100], fields: { [GAUGE_FIELDS[0]]: 1, [GAUGE_FIELDS[1]]: tick % 2, [GAUGE_FIELDS[2]]: 1, [GAUGE_FIELDS[3]]: (tick >> 1) % 2 } });
    const single = start();
    for (let tick = 1; tick <= 15; tick++) single.presentation.advance(cockpitBatch([cockpitTick(tick, { patch: patch(tick) })]));
    const batched = start();
    for (const [first, last] of [[1, 2], [3, 3], [4, 8], [9, 9], [10, 14], [15, 15]]) batched.presentation.advance(cockpitBatch(cockpitTicks(first, last, (tick) => ({ patch: patch(tick) }))));
    batched.presentation.advance(cockpitBatch([]));
    expect(batched.presentation.surfaces().screen.indices).toEqual(single.presentation.surfaces().screen.indices);
    expect(batched.presentation.surfaces().back.indices).toEqual(single.presentation.surfaces().back.indices);
    expect(batched.module.timers()).toEqual(single.module.timers());
    expect(batched.presentation.schedule()).toEqual(single.presentation.schedule());
    expect(single.presentation.schedule().randomDraws).toBeGreaterThan(0);
  });
});
