import { gun, mount } from '../../content/rule-data/rule-data.test-support.ts';
import type { Command, TickInput } from '../contracts/tick-input.ts';
import type { MapPixel } from '../world/map-rule-data.ts';
import { aiProgramsContent, asCreateInput, craftInfoContent, declaration, missionFrame, worldInput, type WorldInputParts } from '../world/create-world.test-support.ts';
import { tickInput } from '../world/world.test-support.ts';

// P3-09's synthetic map and Warp chain (docs/plan/p3/09/spec.md, AC-11; docs/plan/p3/02/spec.md, MW-02 to MW-08):
// code-generated content and inputs, never original data, shared by map-warp-chains.test.ts and map-warp-replay.test.ts.
//
// The synthetic frame: 6 × 6 sectors of S = 15000 runtime units, the reference scale 8000 times 1.875, so the world is
// ±45000 and the map's side of 400 pixels gives 225 units a pixel (pixel p ↦ 225 p − 45000; x ↦ trunc((x + 45000) ÷ 225)).
// A tick is 2 clock units.

/** The entity IDs in instantiation order (P3-02: declarations in index order), then the marker the first select creates. */
export const PLAYER_ID = 1;
export const NEAR_HOSTILE_ID = 2;
export const FAR_HOSTILE_ID = 3;
export const MARKER_ID = 4;

/** Runtime positions: the declared reference positions times 1.875. */
export const PLAYER_START = Object.freeze({ x: 187.5, y: 375, z: 0 });
export const NEAR_HOSTILE_POSITION = Object.freeze({ x: 187.5, y: 375, z: 112.5 });
export const FAR_HOSTILE_POSITION = Object.freeze({ x: 4537.5, y: 4537.5, z: 600 });

/**
 * The player at runtime (187.5, 375, 0) facing +z; a kind-7 hostile dead ahead at z 112.5 (the same map pixel, so the
 * map's de-overlap moves its icon); a kind-8 hostile far away at (4537.5, 4537.5, 600), beyond every friendly's
 * coverage. Neither hostile moves (+0xB8 0).
 */
export function chainMission() {
  const mission = missionFrame();
  mission.declarations = [
    declaration(0, { craftType: 0, position: { x: 100, y: 200, z: 0 } }),
    declaration(1, { craftType: 7, position: { x: 100, y: 200, z: 60 } }),
    declaration(2, { craftType: 8, position: { x: 2420, y: 2420, z: 320 } }),
  ];
  return mission;
}

/** The player's Warp cost pairs: 100 per 1000 units up to 10000 units, 200 beyond (warp.test.ts's). */
const WARP_PAIRS = Object.freeze([Object.freeze({ at00: 10, at04: 100 }), Object.freeze({ at00: 1000, at04: 200 })]);
/** Craft +0xA4: the Warp interval, in seconds (64 clock units each). */
export const WARP_INTERVAL_SECONDS = 2;
/** Craft +0xA8: the transit's seconds; a short Warp's factor 0.5 gives L = 7. */
export const TRANSIT_SECONDS = 14;

/**
 * The synthetic craft info (every record's +0x0C 250 and energy capacity 1000) with the player's Warp fields above, a
 * Warp segment length +0xB8 of 64, hull 400 and one fixed gun (speed 2000, 62.5 a tick; cost 5; damage 400) that kills a
 * kind-7 craft (shield 300, hull 12) with one shot; the hostiles do not move.
 */
export function chainCraftInfo() {
  const info = craftInfoContent();
  info.hitDamageScale = 1;
  info.guns = info.guns.map(() => gun({ at08: 2000, at14: 8, at18: 5, at1C: 400, at24: 64, at28: 0 }));
  Object.assign(info.craft[0], {
    pairs: WARP_PAIRS.map((pair) => ({ ...pair })), atA4: WARP_INTERVAL_SECONDS, atA8: TRANSIT_SECONDS, atB8: 64, at9C: 400,
    mounts: [mount({ weapon: 0, at20: 0, at34: 0 })], mountLists: [[0], [], []],
  });
  for (const kindBit of [7, 8]) info.craft[kindBit].atB8 = 0;
  return info;
}

/**
 * The synthetic AI programs with every table record selecting only kind 0x10, which nothing instantiates, so that the
 * hostiles get no program and hold still: the interpreter would otherwise steer and fire them (P3-08/16).
 */
export function chainAiPrograms() {
  const programs = aiProgramsContent();
  for (const program of programs.programs) program.kindMask = 0x10;
  return programs;
}

export const chainInput = (parts: WorldInputParts = {}) =>
  asCreateInput(worldInput({ mission: chainMission(), craftInfo: chainCraftInfo(), aiPrograms: chainAiPrograms(), ...parts }));

/** The map's side and the world's minimum and units per pixel in this frame. */
export const MAP_SIDE = 400;
export const WORLD_MIN = -45000;
export const UNITS_PER_PIXEL = 225;

/** The near hostile's icon: its own pixel (200, 201) is the player's, so 0x4b3a8 moves it by (+3, +3). */
export const NEAR_ICON_PIXEL: MapPixel = Object.freeze({ column: 203, row: 204 });
/** The far hostile's own pixel, trunc(49537.5 ÷ 225) = 220 on both axes. */
export const FAR_PIXEL: MapPixel = Object.freeze({ column: 220, row: 220 });

/** A pixel's centre as a normalised map point, which quantises back onto that pixel. */
export const pointAt = ({ column, row }: MapPixel) => ({ right: (column + 0.5) / MAP_SIDE, down: (row + 0.5) / MAP_SIDE });
export const selectAt = (pixel: MapPixel): Command => ({ type: 'map-point', operation: 'select', ...pointAt(pixel) });
/** A hover onto pixel (40, 80). */
export const HOVER: Command = Object.freeze({ type: 'map-point', operation: 'hover', right: 0.1, down: 0.2 });
export const HOVER_PIXEL: MapPixel = Object.freeze({ column: 40, row: 80 });

/** The ticks of the chain's steps. */
export const OPEN_TICK = 4;
export const NEAR_SELECT_TICK = 5;
export const FAR_SELECT_TICK = 6;
export const CLOSE_TICK = 7;
export const FIRE_TICK = 8;
export const FRIENDLY_TICK = 9;
export const WARP_TICK = 10;

/**
 * Ticks 1–3 bring the player in (the automatic selection takes the near hostile at tick 3). Then: open the map; select
 * the near hostile's icon, then hover elsewhere; select the far hostile's pixel, which has no icon; close the map; fire
 * at the near hostile; select a friendly target, the marker; request the Warp.
 */
export const CHAIN_COMMANDS: Readonly<Record<number, readonly Command[]>> = Object.freeze({
  [OPEN_TICK]: [{ type: 'toggle-map' }],
  [NEAR_SELECT_TICK]: [selectAt(NEAR_ICON_PIXEL), HOVER],
  [FAR_SELECT_TICK]: [selectAt(FAR_PIXEL)],
  [CLOSE_TICK]: [{ type: 'toggle-map' }],
  [FIRE_TICK]: [{ type: 'fire', channel: 'primary' }],
  [FRIENDLY_TICK]: [{ type: 'target', operation: 'friendly' }],
  [WARP_TICK]: [{ type: 'request-warp' }],
});

export const chainScript = (tick: number): TickInput => tickInput(CHAIN_COMMANDS[tick] ?? []);

/** Past the Warp's completion (tick 639 in this run; the tests find it rather than assume it) by a few ticks. */
export const CHAIN_TICKS = 660;
