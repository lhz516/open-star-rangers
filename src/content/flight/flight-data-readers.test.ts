import { describe, expect, it } from 'vitest';
import { expectContractError } from '../graphics/graphics.test-support.ts';
import { deepFrozen } from '../logic/logic-content.test-support.ts';
import { FLIGHT_DATA_LIMITS, FLIGHT_DATA_ROLES } from './flight-data-content.ts';
import {
  syntheticExplosionAnimation, syntheticExplosionTable, syntheticNebulaBackgrounds, syntheticSceneSettings,
} from './flight-data.test-support.ts';
import {
  readExplosionAnimation, readExplosionTable, readFlightDataContent, readNebulaBackgrounds, readSceneSettings,
} from './flight-data-readers.ts';

type Scene = ReturnType<typeof syntheticSceneSettings>;
type Table = ReturnType<typeof syntheticExplosionTable>;
type Animation = ReturnType<typeof syntheticExplosionAnimation>;
type Nebulae = ReturnType<typeof syntheticNebulaBackgrounds>;

const CODE = 'invalid-flight-data-payload';
const images = (count: number, prefix = 'image/synthetic-frame') =>
  Array.from({ length: count }, (_, index) => ({ id: `${prefix}/${index + 1}`, kind: 'image' }));
const entries = (count: number) => Array.from({ length: count }, (_, index) =>
  ({ sound: { id: 'sound/synthetic/boom-a', kind: 'sound' }, animation: { id: `data/synthetic-animation/${index + 1}`, kind: 'data' } }));

describe('scene settings reader', () => {
  it('keeps every value as given in a deeply frozen copy isolated from its input', () => {
    const input = syntheticSceneSettings();
    const read = readSceneSettings(input);
    expect(read).toEqual(input);
    expect(deepFrozen(read)).toBe(true);
    expect(Object.keys(read)).toEqual(['lightType3Colour', 'lightType0Colour', 'deviceByte', 'deviceValues', 'screenFlashes']);
    input.lightType3Colour[0] = 2;
    input.screenFlashes[1].level = 5;
    expect(read.lightType3Colour[0]).toBe(Math.fround(0.3));
    expect(read.screenFlashes[1].level).toBe(0x7fff_ffff);
  });

  it('turns -0 into 0', () => {
    const input = syntheticSceneSettings();
    input.deviceValues.base = -0;
    input.screenFlashes[0].level = -0;
    const read = readSceneSettings(input);
    expect(Object.is(read.deviceValues.base, 0)).toBe(true);
    expect(Object.is(read.screenFlashes[0].level, 0)).toBe(true);
  });

  it.each([
    ['a missing field', (s: Scene) => { Reflect.deleteProperty(s, 'deviceByte'); }, 'sceneSettings.deviceByte'],
    ['an unknown field', (s: Scene) => { Object.assign(s, { unread: 0 }); }, 'sceneSettings'],
    ['an unknown device value', (s: Scene) => { Object.assign(s.deviceValues, { extra: 1 }); }, 'sceneSettings.deviceValues'],
    ['an unknown flash field', (s: Scene) => { Object.assign(s.screenFlashes[2], { extra: 1 }); }, 'sceneSettings.screenFlashes[2]'],
    ['two colour components', (s: Scene) => { s.lightType3Colour.pop(); }, 'sceneSettings.lightType3Colour'],
    ['four colour components', (s: Scene) => { s.lightType0Colour.push(1); }, 'sceneSettings.lightType0Colour'],
    ['two screen flashes', (s: Scene) => { s.screenFlashes.pop(); }, 'sceneSettings.screenFlashes'],
    ['four screen flashes', (s: Scene) => { s.screenFlashes.push(s.screenFlashes[0]); }, 'sceneSettings.screenFlashes'],
    ['a colour that is no array', (s: Scene) => { Object.assign(s, { lightType3Colour: { 0: 1, 1: 2, 2: 3 } }); }, 'sceneSettings.lightType3Colour'],
    ['a string number', (s: Scene) => { Object.assign(s.deviceValues, { base: '1' }); }, 'sceneSettings.deviceValues.base'],
    ['a value an f32 cannot hold', (s: Scene) => { s.lightType0Colour[1] = 0.1; }, 'sceneSettings.lightType0Colour[1]'],
    ['a value beyond the f32 range', (s: Scene) => { s.deviceValues.kinds1c7c = 3.5e38; }, 'sceneSettings.deviceValues.kinds1c7c'],
    ['NaN', (s: Scene) => { s.screenFlashes[0].duration = Number.NaN; }, 'sceneSettings.screenFlashes[0].duration'],
    ['infinity', (s: Scene) => { s.deviceValues.kindsF8000 = -Infinity; }, 'sceneSettings.deviceValues.kindsF8000'],
    ['a device byte of 256', (s: Scene) => { s.deviceByte = 256; }, 'sceneSettings.deviceByte'],
    ['a negative device byte', (s: Scene) => { s.deviceByte = -1; }, 'sceneSettings.deviceByte'],
    ['a fractional device byte', (s: Scene) => { s.deviceByte = 1.5; }, 'sceneSettings.deviceByte'],
    ['a mask of 2^32', (s: Scene) => { s.screenFlashes[0].randomMask = 2 ** 32; }, 'sceneSettings.screenFlashes[0].randomMask'],
    ['a negative mask', (s: Scene) => { s.screenFlashes[1].randomMask = -1; }, 'sceneSettings.screenFlashes[1].randomMask'],
    ['a negative interval', (s: Scene) => { s.screenFlashes[2].drawIntervalTicks = -1; }, 'sceneSettings.screenFlashes[2].drawIntervalTicks'],
    ['a level below i32', (s: Scene) => { s.screenFlashes[0].level = -0x8000_0001; }, 'sceneSettings.screenFlashes[0].level'],
    ['a level above i32', (s: Scene) => { s.screenFlashes[1].level = 0x8000_0000; }, 'sceneSettings.screenFlashes[1].level'],
    ['a null flash', (s: Scene) => { Object.assign(s.screenFlashes, { 1: null }); }, 'sceneSettings.screenFlashes[1]'],
  ])('rejects %s', (_, change, path) => {
    const input = syntheticSceneSettings();
    change(input);
    expectContractError(() => readSceneSettings(input), CODE, path);
  });

  it('accepts the bounds of every integer type', () => {
    const input = syntheticSceneSettings();
    input.deviceByte = 0;
    input.screenFlashes[0] = { randomMask: 0, duration: 0, drawIntervalTicks: 0xffff_ffff, level: -0x8000_0000 };
    expect(readSceneSettings(input).screenFlashes[0].drawIntervalTicks).toBe(0xffff_ffff);
    input.deviceByte = 255;
    expect(readSceneSettings(input).deviceByte).toBe(255);
  });
});

describe('explosion table reader', () => {
  it('keeps the three lists in order, repeats included, in a deeply frozen copy', () => {
    const input = syntheticExplosionTable();
    const read = readExplosionTable(input);
    expect(read).toEqual(input);
    expect(deepFrozen(read)).toBe(true);
    input.lists[0][0].sound.id = 'sound/changed';
    expect(read.lists[0][0].sound.id).toBe('sound/synthetic/boom-b');
  });

  it('accepts empty lists and exactly the item limit per list', () => {
    const limit = FLIGHT_DATA_LIMITS.explosionListItems;
    expect(readExplosionTable({ lists: [[], [], []] }).lists).toEqual([[], [], []]);
    expect(readExplosionTable({ lists: [entries(limit), entries(limit), entries(limit)] }).lists[2]).toHaveLength(limit);
  });

  it('rejects a list one item over the limit before reading its items', () => {
    const over = [...entries(FLIGHT_DATA_LIMITS.explosionListItems), null];
    expectContractError(() => readExplosionTable({ lists: [[], over, []] }), CODE, 'explosionTable.lists[1]');
  });

  it.each([
    ['two lists', (t: Table) => { t.lists.pop(); }, 'explosionTable.lists'],
    ['four lists', (t: Table) => { t.lists.push([]); }, 'explosionTable.lists'],
    ['a list that is no array', (t: Table) => { Object.assign(t.lists, { 2: {} }); }, 'explosionTable.lists[2]'],
    ['a missing animation', (t: Table) => { Reflect.deleteProperty(t.lists[0][1], 'animation'); }, 'explosionTable.lists[0][1].animation'],
    ['an unknown entry field', (t: Table) => { Object.assign(t.lists[1][0], { variant: 2 }); }, 'explosionTable.lists[1][0]'],
    ['an unknown field', (t: Table) => { Object.assign(t, { extra: [] }); }, 'explosionTable'],
    ['a sound reference of another kind', (t: Table) => { t.lists[0][0].sound = { id: 'data/synthetic-sound', kind: 'data' }; }, 'explosionTable.lists[0][0].sound.kind'],
    ['an animation reference of another kind', (t: Table) => { t.lists[0][0].animation = { id: 'image/synthetic-frame/01', kind: 'image' }; }, 'explosionTable.lists[0][0].animation.kind'],
    ['a reference whose kind is not its ID kind', (t: Table) => { t.lists[2][0].sound.kind = 'data'; }, 'explosionTable.lists[2][0].sound.kind'],
    ['an invalid Asset ID', (t: Table) => { t.lists[1][1].sound.id = 'sound/Not Valid'; }, 'explosionTable.lists[1][1].sound.id'],
    ['an ID string instead of a reference', (t: Table) => { Object.assign(t.lists[0][2], { animation: 'data/synthetic-animation/02' }); }, 'explosionTable.lists[0][2].animation'],
    ['an unknown reference field', (t: Table) => { Object.assign(t.lists[0][0].sound, { role: 'explosion-sound' }); }, 'explosionTable.lists[0][0].sound'],
  ])('rejects %s', (_, change, path) => {
    const input = syntheticExplosionTable();
    change(input);
    expectContractError(() => readExplosionTable(input), CODE, path);
  });
});

describe('explosion animation reader', () => {
  it('keeps the frames in order in a deeply frozen copy', () => {
    const input = syntheticExplosionAnimation();
    const read = readExplosionAnimation(input);
    expect(read).toEqual(input);
    expect(deepFrozen(read)).toBe(true);
  });

  it('accepts one frame and exactly the frame limit, and rejects no frame and one over the limit', () => {
    const limit = FLIGHT_DATA_LIMITS.animationFrames;
    expect(readExplosionAnimation({ frames: images(1) }).frames).toHaveLength(1);
    expect(readExplosionAnimation({ frames: images(limit) }).frames).toHaveLength(limit);
    expectContractError(() => readExplosionAnimation({ frames: [] }), CODE, 'explosionAnimation.frames');
    expectContractError(() => readExplosionAnimation({ frames: [...images(limit), null] }), CODE, 'explosionAnimation.frames');
  });

  it.each([
    ['a frame of another kind', (a: Animation) => { a.frames[1] = { id: 'palette/synthetic', kind: 'palette' }; }, 'explosionAnimation.frames[1].kind'],
    ['a sparse frame list', (a: Animation) => { a.frames.length = 4; }, 'explosionAnimation.frames'],
    ['an unknown field', (a: Animation) => { Object.assign(a, { duration: 14 }); }, 'explosionAnimation'],
    ['a missing frame list', (a: Animation) => { Reflect.deleteProperty(a, 'frames'); }, 'explosionAnimation.frames'],
  ])('rejects %s', (_, change, path) => {
    const input = syntheticExplosionAnimation();
    change(input);
    expectContractError(() => readExplosionAnimation(input), CODE, path);
  });
});

describe('nebula backgrounds reader', () => {
  it('keeps the images in NEBC order, repeats included, in a deeply frozen copy', () => {
    const input = syntheticNebulaBackgrounds();
    const read = readNebulaBackgrounds(input);
    expect(read).toEqual(input);
    expect(deepFrozen(read)).toBe(true);
  });

  it('accepts exactly the image limit and rejects one over it', () => {
    const limit = FLIGHT_DATA_LIMITS.nebulaImages;
    expect(readNebulaBackgrounds({ images: images(limit, 'image/nebula') }).images).toHaveLength(limit);
    expectContractError(() => readNebulaBackgrounds({ images: images(limit + 1, 'image/nebula') }), CODE, 'nebulaBackgrounds.images');
  });

  it.each([
    ['an image of another kind', (n: Nebulae) => { n.images[0] = { id: 'data/synthetic', kind: 'data' }; }, 'nebulaBackgrounds.images[0].kind'],
    ['an image array with an extra field', (n: Nebulae) => { Object.assign(n.images, { start: 3 }); }, 'nebulaBackgrounds.images'],
    ['an unknown field', (n: Nebulae) => { Object.assign(n, { directions: 6 }); }, 'nebulaBackgrounds'],
    ['a class instance', (n: Nebulae) => { n.images[2] = new (class { id = 'image/a'; kind = 'image'; })(); }, 'nebulaBackgrounds.images[2]'],
  ])('rejects %s', (_, change, path) => {
    const input = syntheticNebulaBackgrounds();
    change(input);
    expectContractError(() => readNebulaBackgrounds(input), CODE, path);
  });
});

describe('flight data content dispatch', () => {
  it('reads each role with its reader and rejects other roles', () => {
    const content = {
      'scene-settings': syntheticSceneSettings, 'explosion-table': syntheticExplosionTable,
      'explosion-animation': syntheticExplosionAnimation, 'nebula-backgrounds': syntheticNebulaBackgrounds,
    };
    for (const role of FLIGHT_DATA_ROLES) {
      const read = readFlightDataContent(role, content[role]());
      expect(read.role).toBe(role);
      expect(read.content).toEqual(content[role]());
      expect(Object.isFrozen(read)).toBe(true);
    }
    expectContractError(() => readFlightDataContent('view-labels' as never, {}), CODE, 'role');
  });
});
