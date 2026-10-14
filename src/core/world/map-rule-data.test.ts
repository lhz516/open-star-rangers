import { describe, expect, it } from 'vitest';
import { ContentContractError } from '../../content/contract-validation.ts';
import { deepFrozen } from '../../content/logic/logic-content.test-support.ts';
import { CoreInputError } from '../errors.ts';
import { CONTENT_INPUT_FIELDS, createWorld, initialWorldState } from './create-world.ts';
import { asCreateInput, mapGeometryContent, originalImportIdentity, reversedKeys, worldInput, type WorldInputParts } from './create-world.test-support.ts';
import { thrownBy } from './world.test-support.ts';

// The map geometry input and the map's static rule data (P3-09 AC-02; docs/plan/p3/02/spec.md, MW-01). Expectations
// are derived by hand from the synthetic geometry (main map side 400 at (21, 45), x1 611) and the synthetic mission's
// world of 6 sectors (±45000, a world size of 90000).

const CONTENT = 'input.mapGeometry.content';

const create = (parts: WorldInputParts = {}) => initialWorldState(asCreateInput(worldInput(parts)));

type Geometry = ReturnType<typeof mapGeometryContent>;

/** The synthetic geometry after `change`. */
function geometryWith(change: (geometry: Geometry) => void): Geometry {
  const geometry = mapGeometryContent();
  change(geometry);
  return geometry;
}

function expectRejected(parts: WorldInputParts, path: string, reason: string): void {
  const error = thrownBy(() => createWorld(asCreateInput(worldInput(parts))));
  expect(error).toBeInstanceOf(CoreInputError);
  expect(error).toMatchObject({ path });
  expect((error as CoreInputError).reason).toContain(reason);
}

describe('map geometry input (P3-09 AC-02, MW-01)', () => {
  it('is a content input after the AI programs, which replay takes too', () => {
    expect(CONTENT_INPUT_FIELDS).toEqual([
      'mission', 'craftTypes', 'wingmanRoster', 'craftInfo', 'debrisParameters', 'projectileVisuals', 'explosions', 'explosionAnimations', 'models',
      'aiPrograms', 'mapGeometry', 'identity',
    ]);
  });

  it.each([
    ['missing', (input: Record<string, unknown>) => void (input.mapGeometry = undefined), 'input.mapGeometry'],
    ['not an object', (input: Record<string, unknown>) => void (input.mapGeometry = 'data/hud/map-geometry'), 'input.mapGeometry'],
    ['an Asset with an extra field', (input: Record<string, unknown>) => void Object.assign(input.mapGeometry as object, { role: 'map-geometry' }), 'input.mapGeometry'],
    ['a model Asset ID', (input: Record<string, unknown>) => void ((input.mapGeometry as { id: string }).id = 'model/map-geometry'), 'input.mapGeometry.id'],
  ])('rejects map geometry %s with a CoreInputError', (_, change, path) => {
    const input = worldInput() as unknown as Record<string, unknown>;
    change(input);
    const error = thrownBy(() => createWorld(asCreateInput(input)));
    expect(error).toBeInstanceOf(CoreInputError);
    expect(error).toMatchObject({ path });
  });

  it('keeps the content reader\'s ContentContractError for a malformed ID or content, without the imported value', () => {
    const malformed = worldInput();
    (malformed.mapGeometry as { id: string }).id = 'data/HUD/map';
    expect(thrownBy(() => createWorld(asCreateInput(malformed)))).toMatchObject({ name: 'ContentContractError', path: 'input.mapGeometry.id' });
    for (const [change, path] of [
      [(geometry: Geometry) => void (geometry.rectangle.y1 = geometry.rectangle.y0), `${CONTENT}.rectangle.y1`],
      [(geometry: Geometry) => void (geometry.informationLineHeight = 9), `${CONTENT}.informationLineHeight`],
      [(geometry: Geometry) => void Object.assign(geometry, { zoom: 1 }), CONTENT],
    ] as const) {
      const error = thrownBy(() => createWorld(asCreateInput(worldInput({ mapGeometry: geometryWith(change) }))));
      expect(error).toBeInstanceOf(ContentContractError);
      expect(error).toMatchObject({ path });
    }
  });

  it('takes any data Asset ID for synthetic content and only data/hud/map-geometry for original-import content', () => {
    const other = worldInput();
    (other.mapGeometry as { id: string }).id = 'data/other-map';
    expect(initialWorldState(asCreateInput(other)).ruleData.inputs.mapGeometry.id).toBe('data/other-map');
    const imported = worldInput({ identity: originalImportIdentity() });
    expect(initialWorldState(asCreateInput(imported)).ruleData.inputs.mapGeometry.id).toBe('data/hud/map-geometry');
    (imported.mapGeometry as { id: string }).id = 'data/other-map';
    const error = thrownBy(() => createWorld(asCreateInput(imported)));
    expect(error).toMatchObject({ name: 'CoreInputError', path: 'input.mapGeometry.id' });
  });

  it('keeps the content as read, frozen and detached: later changes to the input do not reach the world', () => {
    const input = worldInput();
    const state = initialWorldState(asCreateInput(input));
    expect(state.ruleData.inputs.mapGeometry.content).toEqual(mapGeometryContent());
    expect(deepFrozen(state.ruleData)).toBe(true);
    const content = input.mapGeometry.content as Geometry;
    content.rectangle.x0 = 0;
    content.informationLineHeight = 1;
    expect(state.ruleData.inputs.mapGeometry.content).toEqual(mapGeometryContent());
    expect(state.ruleData.map.side).toBe(400);
  });
});

describe('map rule data (P3-09 AC-02, MW-01)', () => {
  it('derives the rectangles, the start pixel, the world, the scales and the information capacity', () => {
    expect(create().ruleData.map).toEqual({
      side: 400,
      main: { x: 21, y: 45, width: 400, height: 400 },
      // The strip right of the main map is 611 − 421 = 190 wide, without the record's last column.
      information: { x: 421, y: 45, width: 190, height: 200 },
      zoom: { x: 421, y: 245, width: 190, height: 200 },
      // h = 399 >> 1 = 199, from the screen origin.
      startPixel: { column: 178, row: 154 },
      world: { minX: -45000, minY: -45000, maxX: 45000, maxY: 45000 },
      pixelsPerUnit: { x: Math.fround(1 / 225), y: Math.fround(1 / 225) },
      unitsPerPixel: { x: 225, y: 225 },
      zoomExtent: { x: 15000, y: 30000 },
      zoomPixelsPerUnit: { x: Math.fround(19 / 1500), y: Math.fround(1 / 150) },
      informationLineHeight: 8,
      informationCapacity: 25,
    });
  });

  it('starts the player\'s map cursor at the start pixel, with no destination, saved page 0 and no Warp', () => {
    const { player, objectSets, mapIcons } = create();
    expect({ map: player.map, savedLeftPage: player.savedLeftPage, warp: player.warp }).toEqual({
      map: { cursor: { column: 178, row: 154 }, destination: null }, savedLeftPage: 0, warp: null,
    });
    expect({ objectSets, mapIcons }).toEqual({ objectSets: { friendly: [], hostile: [] }, mapIcons: [] });
  });

  it('takes the units per pixel as the reciprocal of the unrounded ratio, not of its f32', () => {
    // s = 45: 45 ÷ 90000 = 1/2000 is no f32, and the f32's reciprocal is not 2000 (0x49e74, wppX = F(D(1 ÷ a))).
    const { map } = create({ mapGeometry: geometryWith((geometry) => void (geometry.rectangle = { x0: 0, y0: 0, x1: 46, y1: 44 })) }).ruleData;
    expect(map.unitsPerPixel).toEqual({ x: 2000, y: 2000 });
    expect(Math.fround(1 / Math.fround(1 / 2000))).not.toBe(2000);
    expect(map.pixelsPerUnit.x).toBe(Math.fround(1 / 2000));
    // A strip of 1 and windows of 22 rows: 2 lines of 8, signed division.
    expect([map.information, map.zoom, map.informationCapacity]).toEqual([
      { x: 45, y: 0, width: 1, height: 22 }, { x: 45, y: 22, width: 1, height: 22 }, 2,
    ]);
    expect(map.startPixel).toEqual({ column: 22, row: 22 });
  });

  describe('the redraw interval: every tick\'s frame end must run the map step', () => {
    it.each([
      [0, 2], [1, 2], [0, 4], [3, 4],
    ])('accepts %s at %s clock units per tick', (redrawInterval, clockUnitsPerTick) => {
      expect(create({ mapGeometry: { ...mapGeometryContent(), redrawInterval }, run: { clockUnitsPerTick } }).config.clockUnitsPerTick).toBe(clockUnitsPerTick);
    });

    it.each([
      [2, 2], [3, 2], [4, 4], [0xffff_ffff, 2],
    ])('rejects %s at %s clock units per tick', (redrawInterval, clockUnitsPerTick) => {
      expectRejected({ mapGeometry: { ...mapGeometryContent(), redrawInterval }, run: { clockUnitsPerTick } }, `${CONTENT}.redrawInterval`, 'frame end');
    });
  });

  describe('the cursor start, which must lie in the main map', () => {
    it('accepts the start on the main map\'s left and top edges', () => {
      // s = 100, h = 49: x0 = y0 = 49 puts it on the first column and row.
      const { map } = create({ mapGeometry: geometryWith((geometry) => void (geometry.rectangle = { x0: 49, y0: 49, x1: 200, y1: 148 })) }).ruleData;
      expect(map.startPixel).toEqual({ column: 0, row: 0 });
    });

    it.each([
      ['left', { x0: 50, y0: 49, x1: 200, y1: 148 }],
      ['above', { x0: 49, y0: 50, x1: 200, y1: 149 }],
    ])('rejects a start %s the main map', (_, rectangle) => {
      expectRejected({ mapGeometry: geometryWith((geometry) => void (geometry.rectangle = rectangle)) }, `${CONTENT}.rectangle`, 'start point');
    });

    it('checks the redraw interval first', () => {
      const both = geometryWith((geometry) => Object.assign(geometry, { redrawInterval: 2, rectangle: { x0: 50, y0: 49, x1: 200, y1: 148 } }));
      expectRejected({ mapGeometry: both }, `${CONTENT}.redrawInterval`, 'frame end');
    });
  });
});

describe('map geometry in setupHash (P3-09 AC-02, MW-01)', () => {
  const hashOf = (parts: WorldInputParts = {}) => create(parts).config.setupHash;

  it('changes with the ID and every field of the content', () => {
    const hash = hashOf();
    const changes: ((geometry: Geometry) => void)[] = [
      (geometry) => void (geometry.rectangle.x0 = 20),
      (geometry) => void (geometry.rectangle.y0 = 44),
      (geometry) => void (geometry.rectangle.x1 = 610),
      (geometry) => void (geometry.rectangle.y1 = 443),
      (geometry) => void (geometry.redrawInterval = 1),
      (geometry) => void (geometry.informationLineHeight = 7),
    ];
    const hashes = changes.map((change) => hashOf({ mapGeometry: geometryWith(change) }));
    for (const changed of hashes) expect(changed).not.toBe(hash);
    expect(new Set(hashes).size).toBe(changes.length);
    const renamed = worldInput();
    (renamed.mapGeometry as { id: string }).id = 'data/other-map';
    expect(initialWorldState(asCreateInput(renamed)).config.setupHash).not.toBe(hash);
  });

  it('does not depend on the key order of the content', () => {
    expect(hashOf({ mapGeometry: reversedKeys(mapGeometryContent()) })).toBe(hashOf());
  });
});
