/**
 * Instrument types 0–3, the corner gauges (docs/original/formats/hud.md §4.2, executable.md D16; P3-13 spec,
 * 前视驾驶舱与仪表 and D-01 定稿): speed `0x4117c`, commanded speed `0x41238`, energy `0x4131c` and shield
 * `0x41484`, each drawn as its record's bar (gauge-bars.ts) when the presentation schedules the record.
 *
 * - **Readings:** speed ÷ the craft record's +0xB8 (`MotionPlayer.recordMaximumSpeed`, never the falling
 *   `maximumSpeed`); commanded speed ÷ +0xB8 in view mode 1 (Warp), otherwise ÷ `maximumSpeed`, and 0 unless that full
 *   scale is above 0; energy ÷ c54 and shield ÷ c5C. Each quotient is stored as f32. Only type 1 tests its divisor:
 *   the others divide by a positive content value in every shipped record, and a zero there, where the original's
 *   division faults, is `invariant-violated`.
 * - **Damage:** types 0–3 read subsystem fields 17, 18, 16 and 15. State 0 shows the reading; state 1 draws one number
 *   and shows the reading when its low two bits are 3, otherwise draws another and shows rand × f32(1/32767) × 0.1;
 *   state 2 returns at once, drawing and copying nothing, so the last picture stays. State 3 has no writer; the
 *   original would draw an uninitialised value, which cannot be reproduced, so it is `invariant-violated`.
 * - **Colours and own timers:** types 0 and 1 use the record colour (+0x14). Energy and shield have their own due time,
 *   period and phase (energy 0/0x40/1, shield 0/0x20/1 at the start of each run, Δ-04): with the slot's +0x0C clear the
 *   handler returns before anything while the clock is below its due (the full redraw does not bypass this); a call at
 *   or after the due (not strict, u32) toggles the phase after choosing the colour from the old phase and sets the due
 *   a period ahead. f32 thresholds are "≥ 0.25" and "≥ 0.5", so NaN takes the lowest band.
 * - Without a player every handler returns at once.
 */
import type { InstrumentRecord } from '../../../content/hud/instruments-payload.ts';
import type { CombatPlayer, MotionPlayer } from '../../../core/projections/projection.ts';
import type { RandSource } from '../../../core/rules/original-random.ts';
import { WARP_VIEW_MODE } from '../../../core/systems/view-switch.ts';
import type { CockpitDrawContext, CockpitModule, InstrumentHandler } from '../presentation/cockpit-contract.ts';
import { PresentationError } from '../presentation/cockpit-limits.ts';
import type { HudFont } from '../raster/glyph-text.ts';
import { drawFlatBar, drawShapedBar } from './gauge-bars.ts';

export type CornerGaugeType = 0 | 1 | 2 | 3;

export interface CornerGaugesInput {
  /** fonts/0 with advance 8 and no upper-casing, as the HI bars draw their labels. */
  readonly font: HudFont;
  /** The 2-byte labels by type: `data/hud/text`'s `barGauge0Label` … `barGauge3Label`. */
  readonly labels: { readonly [Type in CornerGaugeType]: string };
}

/** One of the energy and shield gauges' own timers. */
export interface GaugeTimer {
  /** u32 clock sample from which the next call draws. */
  readonly due: number;
  /** The period the last call chose. */
  readonly period: number;
  readonly phase: 0 | 1;
}

export interface CornerGaugeTimers {
  readonly energy: GaugeTimer;
  readonly shield: GaugeTimer;
}

export interface CornerGaugesModule extends CockpitModule {
  /** The energy and shield gauges' timers after the last processed tick. */
  timers(): CornerGaugeTimers;
}

/** The subsystem field each gauge reads. */
export const GAUGE_FIELDS = Object.freeze({ 0: 17, 1: 18, 2: 16, 3: 15 } as const);
/** `0x1719be`: the f32 nearest 1/32767, the damaged reading's scale before × 0.1. */
const RANDOM_SCALE = Math.fround(1 / 32767);
const RANDOM_RANGE = 0.1;

const LOW = 0.25;
const HALF = 0.5;
const ENERGY_LOW_COLOUR = 10;
const ENERGY_MIDDLE_COLOUR = 0x0f;

const fault = (path: string, reason: string): never => {
  throw new PresentationError('invariant-violated', `cockpit.gauges.${path}`, reason);
};

/** A quotient whose divisor the original does not test: a zero divisor faults there. */
function quotient(value: number, scale: number, path: string): number {
  if (scale === 0) fault(path, 'has a zero full scale, where the original’s division faults');
  return Math.fround(value / scale);
}

/** The reading of the gauge reading `field`, or null when state 2 hides it (hud §4.2). */
function damagedReading(combat: CombatPlayer, field: number, random: RandSource, reading: () => number): number | null {
  switch (combat.subsystems[field]) {
    case 0:
      return reading();
    case 1:
      if ((random.next() & 3) === 3) return reading();
      return Math.fround(random.next() * RANDOM_SCALE * RANDOM_RANGE);
    case 2:
      return null;
    default:
      return fault(`subsystems[${field}]`, `has a state the original draws as an uninitialised value (${combat.subsystems[field]})`);
  }
}

class Timer implements GaugeTimer {
  due = 0;
  period: number;
  phase: 0 | 1 = 1;

  constructor(period: number) {
    this.period = period;
  }

  /** Whether a call at `clock` returns before anything (the slot's +0x0C clear and the clock below the due). */
  holds(clock: number, local: boolean): boolean {
    return local && clock >>> 0 < this.due;
  }

  /** After the colour is chosen: at or after the due, toggle the phase and set the due a period ahead. */
  advance(clock: number, period: number): void {
    this.period = period;
    if (this.due > clock >>> 0) return;
    this.due = (clock + period) >>> 0;
    this.phase = this.phase === 0 ? 1 : 0;
  }

  snapshot(): GaugeTimer {
    return Object.freeze({ due: this.due, period: this.period, phase: this.phase });
  }
}

/** The four corner gauges as one module; a new run creates a new one. */
export function createCornerGauges({ font, labels }: CornerGaugesInput): CornerGaugesModule {
  const energy = new Timer(0x40);
  const shield = new Timer(0x20);

  const bar = (context: CockpitDrawContext, record: InstrumentRecord, type: CornerGaugeType, value: number, colour: number, local: boolean): void => {
    const [mode] = record.params;
    if (mode === undefined) drawFlatBar(context, record.rectangle, value, colour, font, labels[type], local);
    else drawShapedBar(context, record.rectangle, mode, value, colour, font, labels[type], local);
  };
  const local = (context: CockpitDrawContext): boolean => !(context.layout.slot?.alwaysRedraw ?? false);

  /** Types 0 and 1: the record colour, no timer. */
  const speedGauge = (type: 0 | 1, reading: (motion: MotionPlayer, context: CockpitDrawContext) => number): InstrumentHandler => ({
    draw(context, record) {
      const { combat, motion } = context.projection.flight;
      if (combat.player === null || motion.player === null) return;
      const player = motion.player;
      const value = damagedReading(combat.player, GAUGE_FIELDS[type], context.random, () => reading(player, context));
      if (value !== null) bar(context, record, type, value, record.drawParam, local(context));
    },
  });

  /** Types 2 and 3: the own timer gates, the reading chooses the colour from the old phase. */
  const resourceGauge = (type: 2 | 3, timer: Timer, reading: (combat: CombatPlayer) => number, colour: (value: number, record: InstrumentRecord) => readonly [number, number]): InstrumentHandler => ({
    draw(context, record) {
      const combat = context.projection.flight.combat.player;
      if (combat === null) return;
      const isLocal = local(context);
      if (timer.holds(context.clock, isLocal)) return;
      const value = damagedReading(combat, GAUGE_FIELDS[type], context.random, () => reading(combat));
      if (value === null) return;
      const [chosen, period] = colour(value, record);
      timer.advance(context.clock, period);
      bar(context, record, type, value, chosen, isLocal);
    },
  });

  return {
    name: 'corner-gauges',
    instruments: {
      0: speedGauge(0, ({ speed, recordMaximumSpeed }) => quotient(speed, recordMaximumSpeed, 'type0.recordMaximumSpeed')),
      1: speedGauge(1, ({ commandedSpeed, maximumSpeed, recordMaximumSpeed }, { layout }) => {
        const scale = layout.viewMode === WARP_VIEW_MODE ? recordMaximumSpeed : maximumSpeed;
        return 0 < scale ? Math.fround(commandedSpeed / scale) : 0;
      }),
      2: resourceGauge(2, energy, ({ resources: { energy: { current, maximum } } }) => quotient(current, maximum, 'type2.energy.maximum'), (value, record) => {
        if (!(value >= LOW)) return [energy.phase === 1 ? 0 : ENERGY_LOW_COLOUR, 0x10];
        if (!(value >= HALF)) return [energy.phase === 1 ? ENERGY_MIDDLE_COLOUR : 0, 0x20];
        return [record.drawParam, 0x40];
      }),
      3: resourceGauge(3, shield, ({ resources: { shield: { current, maximum } } }) => quotient(current, maximum, 'type3.shield.maximum'), (value, record) => {
        if (!(value >= LOW)) return [shield.phase === 1 ? 0 : record.drawParam, 0x10];
        return [!(value >= HALF) && shield.phase === 1 ? 0 : record.drawParam, 0x20];
      }),
    },
    timers: () => Object.freeze({ energy: energy.snapshot(), shield: shield.snapshot() }),
  };
}
