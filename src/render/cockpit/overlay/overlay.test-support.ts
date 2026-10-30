import type { AssetId } from '../../../content/asset-id.ts';
import type { FontPayload } from '../../../content/graphics/font-payload.ts';
import type { CraftInfo } from '../../../content/rule-data/craft-info.ts';
import type { Vec3 } from '../../../core/contracts/domain-events.ts';
import type { CombatTarget, Projection, WeaponListReading } from '../../../core/projections/projection.ts';
import { SUBSYSTEM_COUNT, type Matrix3 } from '../../../core/world/entity-table.ts';
import type { CockpitPresentation, CockpitTick } from '../presentation/cockpit-contract.ts';
import { cockpitBatch, type DeepPartial } from '../presentation/cockpit.test-support.ts';
import { createFlightOverlay, type FlightOverlayInput, type FlightOverlayModule } from './flight-overlay.ts';

// Code-generated synthetic inputs for the overlay and indicator strip tests; never original data. Every glyph of the
// font is its cell's top-left pixel alone, so a text of n bytes at (x, y) sets exactly (x + 6i, y), i < n, after the
// HI advance of 6; lower-case bytes draw their upper-case glyph.

export const IDENTITY: Matrix3 = Object.freeze([1, 0, 0, 0, 1, 0, 0, 0, 1]) as unknown as Matrix3;
export const ORIGIN: Vec3 = Object.freeze({ x: 0, y: 0, z: 0 });

export function dotFont(): FontPayload {
  const glyphs = new Uint8Array(256 * 8);
  for (let code = 0; code < 256; code++) glyphs[code * 8] = 0x80;
  const charMap = Array.from({ length: 255 }, (_, index) => Object.freeze({ code: index + 1, glyph: index + 1 }));
  return Object.freeze({ kind: 'font', cellWidth: 8, height: 8, glyphRows: 8, glyphs, charMap: Object.freeze(charMap) });
}

export const OVERLAY_TEXT = Object.freeze({
  overlayAutopilotChange: 'A'.repeat(12),
  overlaySpeedAssistChange: 'S'.repeat(13),
  overlayPlayerState4: 'L'.repeat(14),
  overlayValueReadout: '%dv',
  overlayPercentReadout: '%d%%',
  overlayReadoutUnavailable: '--',
  overlayTargetDistance: '%dt',
  overlayEmptyWeaponSlot: 'NONE',
});

export const LABEL = 'DESTROYED-LABEL';
export const CRAFT_INFO_ID = 'data/craft-info' as AssetId;
export const GUN_NAME = 'GUN';
export const MISSILE_NAME = 'MSL';
export const TARGET_NAME = 'TARGET';

/** A radar stand-in whose cached direction tests set per entity. */
export function radarStub(directions: Record<number, { readonly a: number; readonly b: number }> = {}): FlightOverlayInput['radar'] & { directions: typeof directions } {
  return { directions, cachedDirection: (entityId) => directions[entityId] ?? { a: 0, b: 0 } };
}

export function overlayInput(overrides: Partial<FlightOverlayInput> = {}): FlightOverlayInput {
  return {
    font: dotFont(),
    hudText: OVERLAY_TEXT,
    viewLabels: { labels: [{ subMode: 8, text: LABEL }] },
    craftInfo: { id: CRAFT_INFO_ID, content: { guns: [{ name: GUN_NAME }], missiles: [{ name: 'X' }, { name: MISSILE_NAME }] } as unknown as CraftInfo },
    names: () => TARGET_NAME,
    radar: radarStub(),
    backPlane: () => 900,
    ...overrides,
  };
}

export const overlay = (overrides: Partial<FlightOverlayInput> = {}): FlightOverlayModule => createFlightOverlay(overlayInput(overrides));

export function weaponList(family: 'gun' | 'missile', options: { readonly mount?: number | null; readonly speed?: number; readonly range?: number; readonly ammunition?: number | null } = {}): WeaponListReading {
  const { mount = 0, speed = 1000, range = 1000, ammunition = family === 'missile' ? 3 : null } = options;
  return {
    index: 0, mount, weapon: mount === null ? null : { asset: CRAFT_INFO_ID, family, index: family === 'gun' ? 0 : 1 },
    ammunition: mount === null ? null : ammunition, damage: mount === null ? null : 0, status: 0, ballistics: mount === null ? null : { speed, range },
  };
}

export function target(position: Vec3, options: Partial<CombatTarget> = {}): CombatTarget {
  return {
    entityId: 9, kindBit: 7, name: { type: 'pool', index: 0 }, position, orientation: IDENTITY, distance: 0, speed: 100,
    shield: null, model: null, craftAt08: null, activeState: true, ...options,
  };
}

export interface PilotOptions {
  readonly progress?: number;
  readonly subsystem9?: number;
  readonly target?: CombatTarget | null;
  readonly speed?: number;
  readonly commanded?: number;
  readonly maximum?: number;
  readonly rates?: readonly [number, number];
  readonly weapons?: readonly [WeaponListReading, WeaponListReading];
  readonly position?: Vec3;
  readonly orientation?: Matrix3;
  readonly warnings?: { readonly attackerOnTail: boolean; readonly missileIncoming: boolean };
}

/** A projection patch with a player of these readings. */
export function pilot({
  progress = -1, subsystem9 = 0, target: aimed = null, speed = 0, commanded = 0, maximum = 100, rates = [0, 0],
  weapons = [weaponList('gun'), weaponList('missile')], position = ORIGIN, orientation = IDENTITY, warnings = { attackerOnTail: false, missileIncoming: false },
}: PilotOptions = {}): DeepPartial<Projection> {
  const subsystems = Array.from({ length: SUBSYSTEM_COUNT }, (_, index) => (index === 9 ? subsystem9 : 0));
  return {
    flight: {
      motion: {
        readiness: 'ready',
        player: { entityId: 1, position, orientation, speed, commandedSpeed: commanded, maximumSpeed: maximum, indicatorRates: { row1: rates[0], row3: rates[1] } },
      },
      combat: { readiness: 'ready', player: { entityId: 1, lock: { level: 0, losing: false, progress }, subsystems, target: aimed, weapons } },
    },
    communications: { readiness: 'ready', player: { entityId: 1 }, warnings },
  } as DeepPartial<Projection>;
}

/** Advances `ticks` in batches of at most five, the presentation's limit. */
export function advanceAll(presentation: CockpitPresentation, ticks: readonly CockpitTick[]): void {
  for (let start = 0; start < ticks.length; start += 5) presentation.advance(cockpitBatch(ticks.slice(start, start + 5)));
}
