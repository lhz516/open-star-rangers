import { describe, expect, it } from 'vitest';
import { ContentContractError } from '../../../content/contract-validation.ts';
import { syntheticInstrumentAssets } from '../../../content/hud/instruments.test-support.ts';
import type { MapContact, MapInformationRow, MapLabel, MapOpen, MapZoomMember } from '../../../core/projections/projection.ts';
import { readGlyphs, syntheticFont } from '../messages/messages.test-support.ts';
import type { CockpitPresentation, CockpitTick } from '../presentation/cockpit-contract.ts';
import { PresentationError } from '../presentation/cockpit-limits.ts';
import {
  cockpitBatch, cockpitContent, cockpitTick, createTestPresentation, FLIGHT_VIEW, isolatedDrawContext, MAP_VIEW, viewSwitched,
  type TickOptions,
} from '../presentation/cockpit.test-support.ts';
import type { IndexedSurface } from '../raster/indexed-surface.ts';
import type { MapPictureModule } from './map-picture.ts';
import { mapPictureGeometry } from './map-picture-geometry.ts';
import {
  contact, COST_UNAVAILABLE, createTestMapPicture, FONT_HEIGHT, mapImage, mapPatch, syntheticMapOpen, unitMarker, ZOOM,
} from './map-picture.test-support.ts';

// The map picture against hud §4.9, executable.md (map mouse input; zoom window, information window and labels) and
// spec DC-09/DC-11, with synthetic content only. Screen positions follow the synthetic geometry: main map (13, 37) side
// 301, information (314, 37) and zoom (314, 187), each 189 × 150; fonts/1 advance 6, height 7.

const ADVANCE = 6;
const at = (surface: IndexedSurface, x: number, y: number): number => surface.indices[y * surface.width + x];
const read = (surface: IndexedSurface, x: number, y: number, count: number, colour: number): string => readGlyphs(surface, x, y, count, ADVANCE, colour);
const mapRecord = () => cockpitContent().slots[1].instruments.find(({ type }) => type === 10)!;

/** One map draw of `map` at `tick` (clock 2 × tick) on a fresh B. */
function drawMap(map: MapOpen | null, { tick = 1, picture = createTestMapPicture() }: { readonly tick?: number; readonly picture?: MapPictureModule } = {}): IndexedSurface {
  const { context } = isolatedDrawContext(tick, { viewMode: MAP_VIEW, patch: mapPatch(map) });
  picture.instruments[10].draw(context, mapRecord());
  return context.back;
}

const player = (column = 84, row = 74, patch: Partial<MapContact> = {}): MapContact => contact(1, 0, column, row, patch);

describe('map picture: draw order and palette (0x49f8c)', () => {
  const scene = syntheticMapOpen({
    contacts: [
      contact(2, 3, 74, 74, { coverage: { radius: 10, style: 'disc' } }),
      player(84, 74, { coverage: { radius: 8, style: 'disc' } }),
      contact(3, 8, 74, 89, { coverage: { radius: 10, style: 'ring' } }),
      contact(5, 10, 150, 200),
      contact(4, 9, 150, 200, { target: true }),
    ],
    line: { from: { column: 84, row: 74 }, to: { column: 100, row: 120 } },
  });
  const back = drawMap(scene);

  it('draws friendly discs, then the player\'s disc, then hostile rings, then the grid', () => {
    expect(at(back, 92, 112)).toBe(0x12); // friendly and player discs overlap: the player's is later
    expect(at(back, 80, 112)).toBe(0x11);
    expect(at(back, 88, 116)).toBe(0x09); // ring over the friendly disc
    expect(at(back, 87, 105)).toBe(0x04); // grid line x = 13 + 37 through the disc
    expect(at(back, 90, 111)).toBe(0x04); // grid line y = 37 + 2 × 37
  });

  it('draws icons over the grid, the target\'s record 28 on top, the line, then the player\'s icon', () => {
    expect(at(back, 87, 111)).toBe(0x40 + 3);
    expect(at(back, 163, 237)).toBe(0x40 + 28); // the other icon at the same pixel is under it
    expect(at(back, 97, 111)).toBe(0x40 + 0); // the line's start lies under the player's icon
    expect(at(back, 113, 157)).toBe(0x08); // the line's end over record 26 at the cursor
    expect(at(back, 115, 157)).toBe(0x40 + 26);
  });

  it('writes the caption at the zoom window\'s origin + (4, 4), not at the main map\'s corner', () => {
    expect(read(back, ZOOM.x + 4, ZOOM.y + 4, 3, 0x0a)).toBe('MAP');
    expect(at(back, 17, 41)).toBe(0);
  });

  it('outlines information and zoom in 0xD and the main map in 8 at x + w and y + h, then the pointer box', () => {
    expect(at(back, 503, 100)).toBe(0x0d);
    expect(at(back, 400, 187)).toBe(0x0d);
    expect(at(back, 400, 337)).toBe(0x0d);
    expect(at(back, 314, 100)).toBe(0x08); // shared column: the main map outline is last
    expect(at(back, 100, 338)).toBe(0x08);
    expect(at(back, 13, 200)).toBe(0x08);
    expect(at(back, 100, 36)).toBe(0); // not inset or outset
    // Pointer box 37 × 75 at (113, 157): halves 18 and 37.
    for (const [x, y] of [[95, 150], [131, 150], [113, 120], [113, 194]]) expect(at(back, x, y)).toBe(0x0d);
    expect(at(back, 94, 150)).toBe(0);
  });

  it('lets the pointer box cover the outline where it is clamped to the main map', () => {
    const top = drawMap(syntheticMapOpen({ cursor: { ...syntheticMapOpen().cursor, pixel: { column: 100, row: 10 } } }));
    // Top edge at row 37 + 10 − 37 = 10 is outside: omitted; the vertical edges are clamped to start at row 37.
    expect(at(top, 95, 37)).toBe(0x0d);
    expect(at(top, 131, 37)).toBe(0x0d);
    expect(at(top, 96, 37)).toBe(0x08);
  });
});

describe('map picture: information rows (0x4ba80)', () => {
  const name = (index: number) => ({ type: 'pool', index }) as const;
  const rows: MapInformationRow[] = [
    { type: 'unit-name', entityId: 1, kindBit: 0, name: name(1) },
    { type: 'unit-values', entityId: 1, shield: { current: 50, maximum: 100 }, hull: { current: -5, maximum: 200 }, energy: { current: 1, maximum: 3 } },
    { type: 'unit-name', entityId: 7, kindBit: 11, name: name(7) },
    { type: 'count', kindBit: 7, count: 3 },
    { type: 'count', kindBit: 14, count: 2 },
  ];

  it('draws every row at (x + 4, y + 4 + k × font height) in 0x13, count rows in 0xA except 0x4000', () => {
    const back = drawMap(syntheticMapOpen({ information: { capacity: 21, rows } }));
    const y = (row: number) => 37 + 4 + FONT_HEIGHT * row;
    expect(read(back, 318, y(0), 4, 0x13)).toBe('P N1');
    // %.0f rounds half to even: −2.5 → −2; 1 ÷ 3 × 100 → 33.
    expect(read(back, 318, y(1), 11, 0x13)).toBe('S50 H-2 E33');
    expect(read(back, 318, y(2), 4, 0x13)).toBe('F N7');
    expect(read(back, 318, y(3), 2, 0x0a)).toBe('A3');
    expect(read(back, 318, y(4), 2, 0x13)).toBe('B2');
  });

  it('draws count rows past the capacity below the window, into the zoom area', () => {
    const many: MapInformationRow[] = Array.from({ length: 23 }, (_, index) => ({ type: 'count', kindBit: 7, count: index }));
    const back = drawMap(syntheticMapOpen({ information: { capacity: 21, rows: many } }));
    const y22 = 37 + 4 + FONT_HEIGHT * 22;
    expect(y22).toBeGreaterThan(ZOOM.y);
    expect(read(back, 318, y22, 3, 0x0a)).toBe('A22');
  });

  it('fails as a consumer fault on a zero full scale instead of drawing NaN', () => {
    const zero: MapInformationRow[] = [{ type: 'unit-values', entityId: 1, shield: { current: 0, maximum: 0 }, hull: { current: 1, maximum: 1 }, energy: { current: 1, maximum: 1 } }];
    expect(() => drawMap(syntheticMapOpen({ information: { capacity: 21, rows: zero } }))).toThrow(
      expect.objectContaining({ kind: 'invariant-violated', path: 'map.information.rows[0].shield' }),
    );
  });
});

describe('map picture: labels (0x4af78)', () => {
  const label = (row: number, patch: Partial<MapLabel> = {}): MapLabel => ({ entityId: 9, name: { type: 'pool', index: 9 }, pixel: { column: 200, row }, playerOrWingman: false, threatened: false, ...patch });
  const labelled = (labels: MapLabel[], tick = 1) => drawMap(syntheticMapOpen({ labels, cursor: { ...syntheticMapOpen().cursor, pixel: { column: 20, row: 280 } } }), { tick });

  it('puts the name below an icon in the upper half and above one in the lower half, with two leader lines', () => {
    const back = labelled([label(150), label(151, { entityId: 8, pixel: { column: 120, row: 151 }, name: { type: 'pool', index: 8 } })]);
    // Row 150 is not below half (trunc(301 / 2) = 150): text at y + 6.
    const below = 37 + 150 + 6;
    expect(read(back, 213, below, 2, 0x10)).toBe('N9');
    const leader = below + 3;
    expect([at(back, 209, leader), at(back, 208, leader), at(back, 207, leader), at(back, 210, leader)]).toEqual([0x10, 0x10, 0x10, 0]);
    expect(at(back, 213, 187)).toBe(0x10); // the diagonal leader starts at the icon pixel
    const above = 37 + 151 - FONT_HEIGHT - 6;
    expect(read(back, 133, above, 2, 0x10)).toBe('N8');
  });

  it('colours player and wingman names 0xF, others 0x10, and blinks threatened names on clock bit 5', () => {
    expect(read(labelled([label(40, { playerOrWingman: true })]), 213, 83, 2, 0x0f)).toBe('N9');
    expect(read(labelled([label(40, { threatened: true })], 16), 213, 83, 2, 0x0a)).toBe('N9'); // clock 32
    expect(read(labelled([label(40, { threatened: true })], 15), 213, 83, 2, 0x0f)).toBe('N9'); // clock 30
    expect(read(labelled([label(40, { threatened: true })], 48), 213, 83, 2, 0x0a)).toBe('N9'); // clock 96
    expect(read(labelled([label(40, { threatened: true })], 47), 213, 83, 2, 0x0f)).toBe('N9'); // clock 94
  });
});

describe('map picture: cost texts and the pointer', () => {
  // The player straight below the cursor, so the line (drawn after the cost text) stays off the text.
  const withPlayer = (patch: Partial<MapOpen> = {}) => syntheticMapOpen({ contacts: [player(100, 250)], line: { from: { column: 100, row: 250 }, to: { column: 100, row: 120 } }, ...patch });
  const cost = (percent: number | null, energy = 100, value = 50) => ({ cost: value, energy, percent });
  const cursorAt = (column: number, row: number) => ({ ...syntheticMapOpen().cursor, pixel: { column, row } });

  it('draws the cursor cost at the confirmed cursor + (2, 2) in three bands, only while the player has an icon', () => {
    expect(read(drawMap(withPlayer()), 115, 159, 3, 0x08)).toBe('50%');
    expect(read(drawMap(withPlayer({ cursorCost: cost(66) })), 115, 159, 3, 0x08)).toBe('66%');
    expect(read(drawMap(withPlayer({ cursorCost: cost(67) })), 115, 159, 3, 0x0f)).toBe('67%');
    expect(read(drawMap(withPlayer({ cursorCost: cost(100) })), 115, 159, 4, 0x0a)).toBe('100%');
    const noIcon = drawMap(syntheticMapOpen());
    expect(read(noIcon, 115, 159, 3, 0x08)).toBe('???');
  });

  it('moves the cursor cost left past s − 6 × advance and up past s − font height', () => {
    const near = drawMap(withPlayer({ cursor: cursorAt(265, 294) }));
    expect(read(near, 13 + 267, 37 + 296, 3, 0x08)).toBe('50%');
    const flipped = drawMap(withPlayer({ cursor: cursorAt(266, 295) }));
    expect(read(flipped, 13 + 266 - 36 - 2, 37 + 295 - FONT_HEIGHT - 2, 3, 0x08)).toBe('50%');
  });

  it('draws the project marker for E = 0 at the same anchor, coloured by c ≥ E (Δ-06)', () => {
    expect(read(drawMap(withPlayer({ cursorCost: cost(null, 0, 40) })), 115, 159, 3, 0x0a)).toBe(COST_UNAVAILABLE.toUpperCase());
    expect(read(drawMap(withPlayer({ cursorCost: cost(null, 0, 0) })), 115, 159, 3, 0x0a)).toBe('N/A');
    // E = 0 never takes a low band, even for a (wrapped, unreachable) negative c.
    expect(read(drawMap(withPlayer({ cursorCost: cost(null, 0, -1) })), 115, 159, 3, 0x0a)).toBe('N/A');
    const destination = { position: { x: 0, y: 0, z: 0 }, pixel: { column: 200, row: 40 }, inWorld: true, cost: cost(null, 0, 7) };
    expect(read(drawMap(withPlayer({ destination })), 216, 80, 3, 0x0a)).toBe('N/A');
  });

  it('draws record 27 and the destination cost at + (3, 3) in its own low band, only in the world', () => {
    const destination = { position: { x: 0, y: 0, z: 0 }, pixel: { column: 200, row: 40 }, inWorld: true, cost: cost(10) };
    const back = drawMap(withPlayer({ destination }));
    expect(at(back, 213, 77)).toBe(0x40 + 27);
    expect(read(back, 216, 80, 3, 0x0d)).toBe('10%');
    const outside = drawMap(withPlayer({ destination: { ...destination, inWorld: false } }));
    expect(at(outside, 213, 77)).toBe(0);
    expect(read(outside, 216, 80, 3, 0x0d)).toBe('???');
    const noIcon = drawMap(syntheticMapOpen({ destination }));
    expect(at(noIcon, 213, 77)).toBe(0x40 + 27);
    expect(read(noIcon, 216, 80, 3, 0x0d)).toBe('???');
  });

  it('lets only the pointer box and record 26 follow the local pointer', () => {
    const picture = createTestMapPicture({ pointer: () => ({ right: 0.5, down: 0.25 }) });
    const back = drawMap(withPlayer(), { picture });
    // Local pixel (150, 75): record 26 and the box there.
    expect(at(back, 163, 112)).toBe(0x40 + 26);
    expect(at(back, 163 - 18, 100)).toBe(0x0d);
    // Confirmed cursor (100, 120): the cost text and the line's end stay there.
    expect(read(back, 115, 159, 3, 0x08)).toBe('50%');
    expect(at(back, 113, 157)).toBe(0x08);
    expect(at(back, 114, 157)).toBe(0); // no record 26 at the confirmed cursor
    expect(picture.drawn()).toMatchObject({ pointer: { column: 150, row: 75 }, pointerSource: 'local' });
  });

  it('clamps the local pointer to the main map and falls back to the confirmed cursor without one', () => {
    const clamped = createTestMapPicture({ pointer: () => ({ right: 1, down: -0.5 }) });
    drawMap(withPlayer(), { picture: clamped });
    expect(clamped.drawn()).toMatchObject({ pointer: { column: 300, row: 0 }, pointerSource: 'local' });
    const none = createTestMapPicture({ pointer: () => null });
    drawMap(withPlayer(), { picture: none });
    expect(none.drawn()).toMatchObject({ pointer: { column: 100, row: 120 }, pointerSource: 'confirmed' });
  });
});

describe('map picture: line (0x4c674, Δ-07)', () => {
  const lineFrom = (column: number, row: number, inWorld: boolean) => drawMap(syntheticMapOpen({
    contacts: [player(column, row, { inWorld })], line: { from: { column, row }, to: { column: 100, row: 120 } },
  }));

  it('clips the player\'s end to the inclusive main-map box when the player is outside the world', () => {
    const back = lineFrom(-60, 120, false); // the cursor's row: exact clipping
    expect(at(back, 14, 157)).toBe(0x08);
    expect(at(back, 12, 157)).toBe(0);
    const diagonal = lineFrom(-100, -100, false);
    for (let x = 0; x < 13; x++) for (let y = 0; y < 480; y++) expect(at(diagonal, x, y)).toBe(0);
    expect(at(diagonal, 13, 37)).toBe(0x08);
  });

  it('draws the line straight from an in-world player and from the live position without an icon', () => {
    const back = lineFrom(250, 250, true);
    expect(at(back, 263, 287)).toBe(0x40 + 0); // the player's icon over the start
    const live = drawMap(syntheticMapOpen({ line: { from: { column: 100, row: 400 }, to: { column: 100, row: 120 } } }));
    expect(at(live, 113, 338)).toBe(0x08);
    expect(at(live, 113, 339)).toBe(0);
  });
});

describe('map picture: zoom window', () => {
  const members: MapZoomMember[] = [
    { entityId: 1, pixel: { column: 50, row: 50 }, boxed: false, distance: null },
    { entityId: 2, pixel: { column: 50, row: 50 }, boxed: true, distance: 1234 },
    { entityId: 3, pixel: { column: 120, row: 40 }, boxed: false, distance: 77 },
  ];
  const zoomMap = syntheticMapOpen({
    contacts: [player(10, 10), contact(2, 3, 20, 20), contact(3, 9, 30, 30, { target: true })],
    zoomMembers: members,
  });

  it('spreads the zoom icons with 0x4b56c and boxes the selected ones in 0xD', () => {
    const back = drawMap(zoomMap);
    expect(at(back, ZOOM.x + 50, ZOOM.y + 50)).toBe(0x80 + 0);
    // Entry 1 overlaps entry 0 (5 × 3 records): moved by (7, 5); box 6 × 4 over its first row and column.
    expect(at(back, ZOOM.x + 57, ZOOM.y + 55)).toBe(0x0d);
    expect(at(back, ZOOM.x + 62, ZOOM.y + 58)).toBe(0x0d);
    expect(at(back, ZOOM.x + 58, ZOOM.y + 56)).toBe(0x80 + 3);
    expect(at(back, ZOOM.x + 120, ZOOM.y + 40)).toBe(0x80 + 9);
  });

  it('draws the numbers only while the labels are on, the target\'s in 0xF, none for the player', async () => {
    const off = drawMap(zoomMap);
    expect(read(off, ZOOM.x + 122, ZOOM.y + 42, 2, 0x0f)).toBe('??');
    const picture = createTestMapPicture();
    labelsOn(picture);
    const on = drawMap(zoomMap, { picture });
    expect(read(on, ZOOM.x + 122, ZOOM.y + 42, 2, 0x0f)).toBe('77');
    expect(read(on, ZOOM.x + 59, ZOOM.y + 57, 4, 0x08)).toBe('1234');
    expect(read(on, ZOOM.x + 52, ZOOM.y + 52, 1, 0x08)).toBe('?');
  });
});

/** Turns the picture's labels on through one read call. */
function labelsOn(picture: MapPictureModule): void {
  const { context } = isolatedDrawContext(2, { viewMode: MAP_VIEW, patch: mapPatch(), mapRightButton: true });
  picture.prepare(context);
  expect(picture.labels().labelsOn).toBe(true);
}

/** Per tick: the view the tick ends in and the right button. */
type Plan = (tick: number) => { readonly map: boolean; readonly button?: boolean };

function tickOf(tick: number, plan: Plan): CockpitTick {
  const { map, button = false } = plan(tick);
  const before = tick === 1 ? false : plan(tick - 1).map;
  const viewMode = map ? MAP_VIEW : FLIGHT_VIEW;
  const options: TickOptions = {
    viewMode,
    mapRightButton: button,
    patch: map ? mapPatch() : undefined,
    events: map === before ? [] : [viewSwitched(tick, before ? MAP_VIEW : FLIGHT_VIEW, viewMode)],
  };
  return cockpitTick(tick, options);
}

/** Runs ticks 1…last of `plan` in batches of `sizes` (cycled), recording the label state after every tick. */
function run(plan: Plan, last: number, { sizes = [1], picture = createTestMapPicture() }: { readonly sizes?: readonly number[]; readonly picture?: MapPictureModule } = {}) {
  const presentation: CockpitPresentation = createTestPresentation({ modules: [picture], viewMode: FLIGHT_VIEW });
  const states = [picture.labels()];
  let tick = 1;
  for (let batch = 0; tick <= last; batch++) {
    const size = Math.min(sizes[batch % sizes.length], last - tick + 1);
    const ticks = Array.from({ length: size }, (_, at) => tickOf(tick + at, plan));
    presentation.advance(cockpitBatch(ticks));
    tick += size;
    if (size === 1) states.push(picture.labels());
  }
  return { presentation, picture, states };
}

const toggles = (states: readonly { readonly labelsOn: boolean }[]): number[] =>
  states.flatMap((state, tick) => (tick > 0 && state.labelsOn !== states[tick - 1].labelsOn ? [tick] : []));

describe('map picture: distance label toggle (DC-09)', () => {
  it('starts each run at false, 0, 0', () => {
    expect(createTestMapPicture().labels()).toEqual({ labelsOn: false, debounce: 0, readDue: 0 });
  });

  it('toggles a held button at passes 1, 17, 33 after the opening, not every 20 ticks', () => {
    const { states } = run((tick) => ({ map: tick >= 1, button: true }), 40);
    // Opening at tick 1 (pass 0); reads at ticks 2, 6, 10, …
    expect(toggles(states)).toEqual([2, 18, 34]);
    expect(states[2]).toEqual({ labelsOn: true, debounce: 18, readDue: 10 });
    expect(states[1]).toEqual({ labelsOn: false, debounce: 0, readDue: 2 });
  });

  it('reads at most once a tick and only when the clock is strictly above the due time', () => {
    const { states } = run((tick) => ({ map: true, button: tick === 5 }), 6);
    // Tick 5 (clock 10) is not above the due 10 of tick 2's read: the press between reads is not seen.
    expect(toggles(states)).toEqual([]);
    const seen = run((tick) => ({ map: true, button: tick === 6 }), 6);
    expect(toggles(seen.states)).toEqual([6]);
  });

  it('keeps the count across a reopening and tests before decrementing, the read before the draw call', () => {
    const plan: Plan = (tick) => ({ map: tick <= 11 || tick >= 20, button: tick === 2 || tick >= 20 });
    const { states } = run(plan, 30);
    const carried = states[19].debounce;
    expect(carried).toBe(7);
    expect(carried % 5).toBe(2); // a draw-before-read order would toggle one read earlier
    expect(states[19].labelsOn).toBe(true);
    expect(states[20].labelsOn).toBe(false); // the opening clears the labels, not the count
    expect(states[20].debounce).toBe(6);
    // Reads after the reopening at ticks 21, 25, 29: the first toggle is read ⌈(7 − 1) / 5⌉ + 1 = 3.
    expect(toggles(states.slice(20)).map((at) => at + 20)).toEqual([29]);
  });

  it('runs the read call on the tick that closes the map, without a draw call', () => {
    const { states, picture } = run((tick) => ({ map: tick === 1, button: tick === 2 }), 2);
    expect(states[2]).toEqual({ labelsOn: true, debounce: 19, readDue: 10 });
    expect(picture.drawn()).toBeNull();
  });

  it('gives the same state and picture for any grouping of the ticks into frames', () => {
    const plan: Plan = (tick) => ({ map: tick <= 13 || tick >= 18, button: tick % 7 !== 0 });
    const single = run(plan, 35);
    const grouped = run(plan, 35, { sizes: [5, 3, 2, 4] });
    expect(grouped.picture.labels()).toEqual(single.picture.labels());
    expect(grouped.picture.drawn()).toEqual(single.picture.drawn());
    expect(grouped.presentation.surfaces().back.indices).toEqual(single.presentation.surfaces().back.indices);
    expect(grouped.presentation.schedule().randomDraws).toBe(0);
  });
});

describe('map picture: drawn credential and lifecycle', () => {
  it('is set by each actual draw of an opening and revoked outside the map', () => {
    const plan: Plan = (tick) => ({ map: tick === 2 || tick === 3 || tick === 5 });
    const picture = createTestMapPicture();
    const presentation = createTestPresentation({ modules: [picture], viewMode: FLIGHT_VIEW });
    const after: unknown[] = [];
    for (let tick = 1; tick <= 5; tick++) {
      presentation.advance(cockpitBatch([tickOf(tick, plan)]));
      after.push(picture.drawn());
    }
    const geometry = { screen: { width: 640, height: 480 }, mainMap: { left: 13, top: 37, right: 314, bottom: 338 } };
    expect(after[0]).toBeNull();
    expect(after[1]).toEqual({ opening: 1, serial: 1, tick: 2, geometry, pointer: { column: 100, row: 120 }, pointerSource: 'confirmed' });
    expect(after[2]).toMatchObject({ opening: 1, serial: 2, tick: 3 });
    expect(after[3]).toBeNull();
    expect(after[4]).toMatchObject({ opening: 2, serial: 3, tick: 5 });
    // A 0-tick frame and repeated queries change nothing.
    presentation.advance(cockpitBatch([]));
    expect(picture.drawn()).toBe(after[4]);
    expect(picture.drawn()).toBe(picture.drawn());
    expect(presentation.schedule().randomDraws).toBe(0);
  });

  it('exports the same logical geometry from the map geometry content for map input', () => {
    const geometry = mapPictureGeometry(syntheticInstrumentAssets().mapGeometry);
    expect(geometry).toEqual({ screen: { width: 640, height: 480 }, mainMap: { left: 13, top: 37, right: 314, bottom: 338 } });
    const picture = createTestMapPicture();
    drawMap(syntheticMapOpen(), { picture });
    expect(picture.drawn()?.geometry).toEqual(geometry);
  });

  it('draws nothing and grants nothing without an open map, and rejects a map not ready', () => {
    const picture = createTestMapPicture();
    const back = drawMap(null, { picture });
    expect(back.indices.every((index) => index === 0)).toBe(true);
    expect(picture.drawn()).toBeNull();
    const closed = { state: 'closed', destination: null, markerEntityId: null, warpRequest: { accepted: true } } as unknown as MapOpen;
    expect(drawMap(closed, { picture }).indices.every((index) => index === 0)).toBe(true);
    const presentation = createTestPresentation({ modules: [createTestMapPicture()], viewMode: FLIGHT_VIEW });
    const notReady = cockpitTick(1, { viewMode: MAP_VIEW, events: [viewSwitched(1, FLIGHT_VIEW, MAP_VIEW)], patch: { map: { readiness: 'not-implemented' } } as never });
    expect(() => presentation.advance(cockpitBatch([notReady]))).toThrow(expect.objectContaining({ kind: 'invalid-input' }));
  });

  it('rejects a projection geometry other than the record\'s', () => {
    const map = syntheticMapOpen();
    expect(() => drawMap({ ...map, geometry: { ...map.geometry, main: { x: 14, y: 37, width: 301, height: 301 } } })).toThrow(
      expect.objectContaining({ kind: 'invariant-violated', path: 'map.geometry' }),
    );
  });

  it('revokes the credential at dispose and rejects later use', () => {
    const picture = createTestMapPicture();
    drawMap(syntheticMapOpen(), { picture });
    expect(picture.drawn()).not.toBeNull();
    picture.dispose();
    expect(picture.drawn()).toBeNull();
    expect(() => picture.labels()).toThrow(PresentationError);
    expect(() => picture.labels()).toThrow(expect.objectContaining({ kind: 'invalid-state' }));
  });
});

describe('map picture: content checks', () => {
  it('needs both tables\' 29 direct records', () => {
    expect(() => createTestMapPicture({ unitMarkers: Array.from({ length: 28 }, (_, at) => unitMarker(at)) })).toThrow(
      expect.objectContaining({ kind: 'invalid-input', path: 'map.unitMarkers' }),
    );
    const nearest = { ...mapImage(1, 1, () => 1), display: { nearest: 'palette/x' } } as never;
    expect(() => createTestMapPicture({ zoomIcons: Array.from({ length: 29 }, () => nearest) })).toThrow(
      expect.objectContaining({ path: 'map.zoomIcons[0]' }),
    );
  });

  it('needs a 1–5 byte printable ASCII cost marker in fonts/1\'s map', () => {
    for (const marker of ['', 'abcdef', 'a\x7f']) {
      expect(() => createTestMapPicture({ costUnavailable: marker })).toThrow(expect.objectContaining({ kind: 'invalid-input', path: 'map.costUnavailable' }));
    }
    expect(() => createTestMapPicture({ costUnavailable: 'n/a', font: syntheticFont([0x41, 0x4e], FONT_HEIGHT) })).toThrow(ContentContractError);
    expect(() => createTestMapPicture({ costUnavailable: 'na', font: syntheticFont([0x41, 0x4e], FONT_HEIGHT) })).not.toThrow();
  });
});
