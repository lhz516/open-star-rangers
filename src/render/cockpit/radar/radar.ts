/**
 * Instrument type 5, the radar (docs/original/formats/hud.md §4.3 and executable.md T6; P3-13 spec, 前视驾驶舱与仪表,
 * DC-08 and DC-12): `0x401e8` with its build `0x402a0`/`0x40370`, the entry drawing `0x4017c`, the pre-pass `0x40160`
 * and the background `0x40b7c`, as one run's module.
 *
 * - **Draw (when the record is due):** with the slot's +0x0C clear it clears the disc spans to 0; without a player it
 *   stops there. Outside Warp it rebuilds the entries when the rebuild due is below the clock (strict, u32; due :=
 *   clock + 5), toggles the blink when its due is below the clock (strict; due := clock + 0x10), draws the entries and
 *   marks them drawn. In every view it then draws the rings, and copies the spans. In Warp (view mode 1) nothing is
 *   rebuilt, drawn or toggled: only the cleared disc and the rings reach the screen.
 * - **Pre-pass (every logical display of views 0xC, 1, 0x11):** once after each draw of the entries, it tests the
 *   blink the same way and erases the entries in B with index 0 (not copied).
 * - **Entries:** Core's contacts in order (`radar.contacts`, at most 120 with the target box, CR-11 Δ7), projected with
 *   the tick's camera (radar-geometry.ts) and classified as T6; the player's target is followed by its box. At
 *   status 1 the build adds rand & 7 noise entries (5 draws each: direction, colour, blink, shape) and, while noise
 *   remains, one draw for a fake box (rand & 7 = 2); at status 2 it has no contact and 60 noise entries (300 draws).
 *   Entries beyond 120 are not kept but every draw is still made, and `noiseDropped` counts them (DC-08).
 * - **Direction cache:** each contact's last good projection values, 0 for a new entity, kept while the entity is
 *   presentable; at status 2 nothing is rebuilt, so the cache stays. The flight overlay's off-centre pointer reads it.
 *
 * Timers and the blink start at 0 for each run (Δ-04).
 */
import type { InstrumentRecord } from '../../../content/hud/instruments-payload.ts';
import type { EntityId } from '../../../core/world/entity-table.ts';
import type { CombatPlayer, RadarContact } from '../../../core/projections/projection.ts';
import { randomDirection } from '../../../core/rules/random-direction.ts';
import { chop32 } from '../gauges/gauge-bars.ts';
import type { CockpitDrawContext, CockpitModule } from '../presentation/cockpit-contract.ts';
import { COCKPIT_LIMITS, PresentationError } from '../presentation/cockpit-limits.ts';
import { drawCircle, drawLine, fillRect, outlineRect, plot, toInt16, type IndexedSurface } from '../raster/indexed-surface.ts';
import { planeOffsets, radarGeometry, radarPoint, ZERO_DIRECTION, type RadarDirection, type RadarGeometry } from './radar-geometry.ts';

/** The shape routines: 1 px `0x40a80`, plus `0x40a98`, 3 × 3 X `0x40ad4`, 5 × 5 X `0x40b24`, target box `0x409f4`. */
export type RadarShape = 'pixel' | 'plus' | 'cross' | 'large-cross' | 'box';

export interface RadarEntry {
  readonly x: number;
  readonly y: number;
  readonly colour: number;
  readonly blink: boolean;
  readonly shape: RadarShape;
}

export interface RadarState {
  readonly entries: readonly RadarEntry[];
  /** Set by a draw of the entries, cleared by the next pre-pass that erases them. */
  readonly drawn: boolean;
  readonly rebuildDue: number;
  readonly blinkPhase: 0 | 1;
  readonly blinkDue: number;
  /** Noise and fake boxes the 120-entry limit did not keep, since the start (`radarNoiseDropped`, DC-08). */
  readonly noiseDropped: number;
}

export interface RadarModule extends CockpitModule {
  /** The state after the last processed tick. */
  state(): RadarState;
  /** The cached in-plane direction of a contact (a up, b right); 0 for an entity the radar has not projected. */
  cachedDirection(entityId: EntityId): { readonly a: number; readonly b: number };
}

export const RADAR_REBUILD_PERIOD = 5;
export const RADAR_BLINK_PERIOD = 0x10;
/** Background rings and centre. */
export const RADAR_RING_COLOUR = 0x0d;
/** A blinking entry in blink phase 0. */
export const RADAR_BLINK_COLOUR = 0x0a;
const BOX_COLOUR = 0x0f;
/** The partial ring at 0.5r: its first steps per octant from the axes. */
const HALF_RING_STEPS = 8;
const STATUS_2_NOISE = 60;
const FAKE_BOX_DRAW = 2;

/** T6: friendly missile 0x10, near 0x10, far 0xF; hostile missile 0xC, near 0xA, far 9; marker 8. */
function contactColour({ class: kind, missile, near }: RadarContact): number {
  if (kind === 'friendly') return missile || near ? 0x10 : 0x0f;
  if (missile) return 0x0c;
  if (kind === 'marker') return 0x08;
  return near ? 0x0a : 0x09;
}

function contactShape({ class: kind, missile }: RadarContact, side: boolean): RadarShape {
  if (missile) return 'large-cross';
  return kind === 'marker' || side ? 'plus' : 'cross';
}

const STATUS_2_SHAPES: readonly RadarShape[] = Object.freeze(['pixel', 'plus', 'cross', 'pixel']);

/** One shape at (x, y), coordinates passed as the original's 16-bit values. */
function drawShape(surface: IndexedSurface, { x, y, shape }: RadarEntry, colour: number): void {
  const at = (dx: number, dy: number): readonly [number, number] => [toInt16(x + dx), toInt16(y + dy)];
  const line = (from: readonly [number, number], to: readonly [number, number]): void => drawLine(surface, ...from, ...to, colour);
  switch (shape) {
    case 'pixel':
      plot(surface, ...at(0, 0), colour);
      return;
    case 'plus':
      line(at(0, -1), at(0, 1));
      line(at(-1, 0), at(1, 0));
      return;
    case 'cross':
    case 'large-cross': {
      const reach = shape === 'cross' ? 1 : 2;
      line(at(-reach, -reach), at(reach, reach));
      line(at(-reach, reach), at(reach, -reach));
      return;
    }
    case 'box':
      outlineRect(surface, ...at(-2, -2), 5, 5, colour);
      for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2]] as const) plot(surface, ...at(dx, dy), 0);
  }
}

/** The radar module of one run. */
export function createRadar(): RadarModule {
  let entries: readonly RadarEntry[] = Object.freeze([]);
  let drawn = false;
  let rebuildDue = 0;
  let blinkPhase: 0 | 1 = 0;
  let blinkDue = 0;
  let noiseDropped = 0;
  let geometry: RadarGeometry | null = null;
  const directions = new Map<EntityId, RadarDirection>();

  const testBlink = (clock: number): void => {
    if (!(blinkDue < clock >>> 0)) return;
    blinkPhase = blinkPhase === 0 ? 1 : 0;
    blinkDue = (clock + RADAR_BLINK_PERIOD) >>> 0;
  };

  const drawEntries = (surface: IndexedSurface, erase: boolean): void => {
    for (const entry of entries) drawShape(surface, entry, erase ? 0 : entry.blink && blinkPhase === 0 ? RADAR_BLINK_COLOUR : entry.colour);
  };

  /** `0x40370`: the entries of this tick from the player's radar reading. */
  const build = (context: CockpitDrawContext, disc: RadarGeometry, { status, contacts }: CombatPlayer['radar']): RadarEntry[] => {
    const { random, camera } = context;
    const built: RadarEntry[] = [];
    let count = 0;
    const keep = (entry: RadarEntry): void => {
      count++;
      if (built.length < COCKPIT_LIMITS.radarEntries) built.push(Object.freeze(entry));
      else noiseDropped++;
    };
    if (status !== 2) {
      const offsets = planeOffsets(camera);
      for (const contact of contacts) {
        const point = radarPoint(contact.position, camera, offsets, disc, directions.get(contact.entityId) ?? ZERO_DIRECTION);
        directions.set(contact.entityId, point.direction);
        const { x, y } = point;
        built.push(Object.freeze({ x, y, colour: contactColour(contact), blink: contact.missile, shape: contactShape(contact, point.side) }));
        if (contact.target) built.push(Object.freeze({ x, y, colour: BOX_COLOUR, blink: false, shape: 'box' }));
      }
      if (built.length > COCKPIT_LIMITS.radarEntries) {
        throw new PresentationError('invariant-violated', 'cockpit.radar.contacts', `must not exceed ${COCKPIT_LIMITS.radarEntries} entries with the target box`);
      }
      count = built.length;
      const presentable = new Set(context.render.entities.map(({ id }) => id));
      for (const id of directions.keys()) if (!presentable.has(id)) directions.delete(id);
    }
    /** One noise entry: a random direction (two draws), then colour, blink and shape draws. */
    const noise = (shapeOf: (rand: number) => RadarShape): RadarEntry => {
      const { x, y } = randomDirection(random);
      const colour = (random.next() & 1) === 1 ? 10 : 9;
      const blink = (random.next() & 1) === 1;
      return { x: disc.cx + chop32(x * disc.scale), y: disc.cy + chop32(y * disc.scale), colour, blink, shape: shapeOf(random.next()) };
    };
    if (status === 1) {
      const end = count + (random.next() & 7);
      while (count < end) {
        const entry = noise((rand) => ((rand & 1) === 1 ? 'plus' : 'cross'));
        keep(entry);
        if (count < end && (random.next() & 7) === FAKE_BOX_DRAW) keep({ ...entry, colour: BOX_COLOUR, blink: false, shape: 'box' });
      }
    } else if (status === 2) {
      while (count < STATUS_2_NOISE) keep(noise((rand) => STATUS_2_SHAPES[rand & 3]));
    }
    return built;
  };

  const background = (surface: IndexedSurface, { cx, cy, radius, rings }: RadarGeometry): void => {
    drawCircle(surface, cx, cy, rings.half, RADAR_RING_COLOUR, HALF_RING_STEPS);
    drawCircle(surface, cx, cy, rings.tenth, RADAR_RING_COLOUR);
    drawCircle(surface, cx, cy, rings.nineTenths, RADAR_RING_COLOUR);
    drawCircle(surface, cx, cy, radius, RADAR_RING_COLOUR);
    plot(surface, cx, cy, RADAR_RING_COLOUR);
  };

  const requireGeometry = (record: InstrumentRecord): RadarGeometry => {
    if (geometry === null) throw new PresentationError('invariant-violated', 'cockpit.radar', `draws record ${record.type} before its slot activated it`);
    return geometry;
  };

  return {
    name: 'radar',
    instruments: {
      5: {
        activate(_context, record) {
          geometry = radarGeometry(record.rectangle);
        },
        prePass(context) {
          if (!drawn) return;
          drawn = false;
          testBlink(context.clock);
          drawEntries(context.back, true);
        },
        draw(context, record) {
          const disc = requireGeometry(record);
          const local = !(context.layout.slot?.alwaysRedraw ?? false);
          const { back, clock } = context;
          if (local) for (const { y, x0, x1 } of disc.spans) fillRect(back, x0, y, x1, y, 0);
          const player = context.projection.flight.combat.player;
          if (player !== null) {
            if (context.layout.view !== 'warp') {
              if (rebuildDue < clock >>> 0) {
                entries = Object.freeze(build(context, disc, player.radar));
                rebuildDue = (clock + RADAR_REBUILD_PERIOD) >>> 0;
              }
              testBlink(clock);
              drawEntries(back, false);
              drawn = true;
            }
            background(back, disc);
          }
          if (local) for (const { y, x0, x1 } of disc.spans) context.publishRow(y, x0, x1);
        },
      },
    },
    state: () => Object.freeze({ entries, drawn, rebuildDue, blinkPhase, blinkDue, noiseDropped }),
    cachedDirection(entityId) {
      const { a, b } = directions.get(entityId) ?? ZERO_DIRECTION;
      return Object.freeze({ a, b });
    },
  };
}
