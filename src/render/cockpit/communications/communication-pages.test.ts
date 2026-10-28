import { describe, expect, it } from 'vitest';
import { readAssetId } from '../../../content/asset-id.ts';
import type { CommMenus } from '../../../content/rule-data/comm-menus.ts';
import type { CommunicationsMenuView, CommunicationsOption } from '../../../core/projections/projection.ts';
import type { NameReference } from '../../../core/world/entity-table.ts';
import { message, pixelsIn, readGlyphs, syntheticCopy, syntheticFont } from '../messages/messages.test-support.ts';
import { cockpitContent, isolatedDrawContext, WARP_VIEW } from '../presentation/cockpit.test-support.ts';
import type { IndexedSurface } from '../raster/indexed-surface.ts';
import { createCommunicationPages, type CommunicationPagesInput } from './communication-pages.ts';

// comm §4 (HI panel) and RQ8 with synthetic content: the left-display record is (58, 340)–(153, 439), a 96-wide HI
// rectangle: 15 characters a row, rows from y0 + 15 = 355 with pitch 9 while y ≤ y1 − 7 = 432, so 9 rows.

const FONT = syntheticFont();
const RECT = { x0: 58, y0: 340, x1: 153, y1: 439 };
const CONTENT = cockpitContent((content) => {
  content.slots[0].instruments.find(({ type }) => type === 6)!.rectangle = { ...RECT };
});
const RECORD = CONTENT.slots[0].instruments.find(({ type }) => type === 6)!;
const MENUS_ID = readAssetId('data/comm-menus');
const MENUS: CommMenus = Object.freeze({
  gatedTargetCommands: [{ text: '\x00dDock here please', command: 9 }, { text: '\x00xExit', command: 0 }],
  otherTargetCommands: [{ text: '\x00sStatus report', command: 3 }, { text: '\x00xLeave', command: 0 }],
  categories: [{ text: '\x00aFriendly bases nearby', kindMask: 0x8000 }, { text: '\x00bFriendly craft', kindMask: 2 }, { text: '\x00xClose', kindMask: 0 }],
  objectListLastEntry: '\x00xBack',
  kind2TargetCommands: [{ text: '\x00fFollow me', command: 1 }, { text: '\x00xDone', command: 0 }],
});
/**
 * A 96 × 100 background whose pixel (x, y) is 0x40 + (x + 3y) mod 0xBF, so a column read from the next row shows and
 * no pixel has a text colour.
 */
const BACKGROUND = Object.freeze({
  width: 96, height: 100, indices: Uint8Array.from({ length: 96 * 100 }, (_, pixel) => 0x40 + ((pixel % 96) + 3 * Math.floor(pixel / 96)) % 0xbf),
});
const HUD_TEXT = Object.freeze({ leftCommPanelTitle: 'Comms', leftCommListSeparator: '-' });
const names = (name: NameReference): string => (name.type === 'pool' ? `Name${name.index}` : '');

function pages(overrides: Partial<CommunicationPagesInput> = {}) {
  return createCommunicationPages({
    font: FONT, background: BACKGROUND, hudText: HUD_TEXT, commMenus: { id: MENUS_ID, content: MENUS }, names, copy: syntheticCopy(), ...overrides,
  });
}

const option = (position: number, key: number, value: CommunicationsOption['value']): CommunicationsOption => ({ position, key, value });
const object = (index: number, tone: 'active' | 'threatened' | 'other') =>
  ({ type: 'object', entityId: 10 + index, kindBit: 1, name: { type: 'pool', index }, tone }) as const;

function menu(table: CommunicationsMenuView['menu']['table'], options: readonly CommunicationsOption[], asset = MENUS_ID): CommunicationsMenuView {
  return { menu: { asset, table }, level: table === 'categories' ? 2 : table === 'objects' ? 3 : 4, partnerEntityId: null, options };
}

function drawMenu(view: CommunicationsMenuView | null, tick = 1, extra: { readonly fullRedraw?: boolean } = {}) {
  const draw = isolatedDrawContext(tick, { content: CONTENT, patch: { communications: { player: { menu: view } } } as never, ...extra });
  const drawn = pages().drawMenuPage(draw.context, RECORD);
  return { ...draw, drawn };
}

/** Text drawn in fonts/1 (advance 6) at row y from x0 + 6. */
const row = (surface: IndexedSurface, y: number, count: number, colour: number): string => readGlyphs(surface, RECT.x0 + 6, y, count, 6, colour);

describe('communications menu pages 2–4 (HI)', () => {
  const categories = menu('categories', [
    option(1, 0x31, { type: 'category', source: 0, kindMask: 0x8000 }),
    option(2, 0x32, { type: 'category', source: 1, kindMask: 2 }),
    option(3, 0x78, { type: 'exit' }),
  ]);

  it('draws the background over 97 columns, row y0 in 0, the title at (x0 + 6, y0 + 4) in 0x13 and the rows from y0 + 15', () => {
    const { surfaces: { back }, published, drawn } = drawMenu(categories);
    expect(drawn).toBe(true);
    // Background at (x0, y0 + 1); column 96 of row r is pixel 0 of row r + 1.
    expect(back.indices[(RECT.y0 + 1) * 640 + RECT.x0 + 1]).toBe(BACKGROUND.indices[1]);
    expect(back.indices[(RECT.y0 + 1 + 50) * 640 + RECT.x0 + 96]).toBe(BACKGROUND.indices[51 * 96]);
    expect(back.indices[(RECT.y0 + 100) * 640 + RECT.x0 + 96]).toBe(0);
    expect(pixelsIn(back, RECT.x0, RECT.y0, RECT.x1, RECT.y0)).toEqual([]);
    expect(row(back, RECT.y0 + 4, 5, 0x13)).toBe('COMMS');
    // Key byte, then the text from data byte 2, upper-cased by fonts/1; the exit (last) in 0x0C.
    // '1Friendly bases nearby' is cut to 15 characters.
    expect(row(back, 355, 16, 0x0f)).toBe('1FRIENDLY BASES?');
    expect(row(back, 364, 15, 0x0f)).toBe('2FRIENDLY CRAFT');
    expect(row(back, 373, 6, 0x0c)).toBe('XCLOSE');
    expect(published).toEqual([RECT]);
  });

  it('cuts each row to trunc((x1 − x0) / 6) characters and draws only rows with y ≤ y1 − 7', () => {
    const many = menu('objects', [...Array.from({ length: 10 }, (_, index) => option(index + 1, 0x31 + index, object(1000 + index, 'other'))), option(11, 0x78, { type: 'exit' })]);
    const { surfaces: { back } } = drawMenu(many);
    expect(row(back, 355, 10, 0x0f)).toBe('1-NAME1000');
    expect(row(back, 355 + 8 * 9, 10, 0x0f)).toBe('9-NAME1008');
    // The tenth row would start at 436 > 432: neither it nor the exit is drawn, the background stays.
    expect(back.indices[436 * 640 + RECT.x0 + 6]).toBe(BACKGROUND.indices[95 * 96 + 6]);
    expect(row(back, 436, 1, 0x0c)).toBe('?');
  });

  it('colours the last entry 0x0C, active objects 0x10, threatened ones 0x0A blinking to 0x0F on clock bit 5, others 0x0F', () => {
    const objects = menu('objects', [option(1, 0x31, object(1, 'active')), option(2, 0x32, object(2, 'threatened')), option(3, 0x33, object(3, 'other')), option(4, 0x78, { type: 'exit' })]);
    // Tick 16: clock 32, bit 5 set → 0x0A; tick 8: clock 16, bit 5 clear → 0x0F.
    const lit = drawMenu(objects, 16).surfaces.back;
    expect(row(lit, 355, 7, 0x10)).toBe('1-NAME1');
    expect(row(lit, 364, 7, 0x0a)).toBe('2-NAME2');
    expect(row(lit, 373, 7, 0x0f)).toBe('3-NAME3');
    expect(row(lit, 382, 5, 0x0c)).toBe('XBACK');
    const dark = drawMenu(objects, 8).surfaces.back;
    expect(row(dark, 364, 7, 0x0f)).toBe('2-NAME2');
    expect(row(dark, 364, 7, 0x0a)).toBe('???????');
  });

  it('reads command tables by the menu reference, the exit from its table\'s last item', () => {
    for (const [table, first, exit] of [['gated', '1DOCK HERE PLEA', 'XEXIT'], ['other', '1STATUS REPORT', 'XLEAVE'], ['kind2', '1FOLLOW ME', 'XDONE']] as const) {
      const commands = menu(table, [option(1, 0x31, { type: 'command', source: 0, code: 9 }), option(2, 0x78, { type: 'exit' })]);
      const { surfaces: { back } } = drawMenu(commands);
      expect(row(back, 355, first.length, 0x0f)).toBe(first);
      expect(row(back, 364, exit.length, 0x0c)).toBe(exit);
    }
  });

  it('copies nothing on an always-redrawn slot and draws nothing without a shown menu', () => {
    const draw = isolatedDrawContext(1, { content: CONTENT, patch: { communications: { player: { menu: categories } } } as never });
    expect(pages().drawMenuPage({ ...draw.context, layout: { ...draw.context.layout, slot: { ...draw.context.layout.slot!, alwaysRedraw: true } } }, RECORD)).toBe(true);
    expect(draw.published).toEqual([]);
    const none = drawMenu(null);
    expect(none.drawn).toBe(false);
    expect(pixelsIn(none.surfaces.back, 0, 0, 639, 479)).toEqual([]);
    expect(none.published).toEqual([]);
  });

  it('rejects a menu of another Asset and an option without its source item', () => {
    expect(() => drawMenu(menu('categories', categories.options, readAssetId('data/other-menus')))).toThrow(expect.objectContaining({ kind: 'invariant-violated' }));
    expect(() => drawMenu(menu('categories', [option(1, 0x31, { type: 'category', source: 9, kindMask: 2 })]))).toThrow(expect.objectContaining({ kind: 'invariant-violated' }));
  });
});

describe('communications page 5 (G-03 placeholder)', () => {
  const incoming = (identity = message(20011, 7), shown = true) => ({ message: identity, speaker: null, frame: 0, frameCount: 1, shown });

  function drawIncoming(view: ReturnType<typeof incoming> | null, options: { readonly viewMode?: number } = {}) {
    const draw = isolatedDrawContext(1, { content: CONTENT, patch: { communications: { player: { incoming: view } } } as never, ...options });
    // A non-zero page underneath shows what the placeholder clears.
    draw.context.back.indices.fill(0x33, 0, 640 * 480);
    const drawn = pages().drawIncomingPage(draw.context, RECORD);
    return { ...draw, drawn };
  }

  it('fills the 96 × 96 frame area, centres the label lines in it and leaves the summary to the message line', () => {
    const { surfaces: { back }, published, drawn } = drawIncoming(incoming());
    expect(drawn).toBe(true);
    // Two lines, pitch 9, 17 rows: top = 341 + trunc((96 − 17) / 2) = 380. 'Label' is 5 × 6 wide → x0 + 33.
    expect(readGlyphs(back, RECT.x0 + 33, 380, 5, 6, 0x0f)).toBe('LABEL');
    expect(readGlyphs(back, RECT.x0 + 42, 389, 2, 6, 0x0f)).toBe('N7');
    const left = pixelsIn(back, RECT.x0, RECT.y0, RECT.x0 + 95, RECT.y0 + 96).filter((pixel) => !pixel.endsWith('=15'));
    expect(left).toEqual([]);
    // Outside the frame area the page beneath stays; row y0 is 0 across the rectangle.
    expect(back.indices[(RECT.y0 + 97) * 640 + RECT.x0]).toBe(0x33);
    expect(back.indices[RECT.y0 * 640 + RECT.x1]).toBe(0);
    expect(published).toEqual([RECT]);
    // Only the label's two rows of glyphs are drawn: no line of the summary 'Summary 7'.
    const rows = new Set(pixelsIn(back, 0, 0, 639, 479).filter((pixel) => pixel.endsWith('=15')).map((pixel) => Number(pixel.split(/[,=]/)[1])));
    expect([...rows].every((y) => (y >= 380 && y <= 382) || (y >= 389 && y <= 391))).toBe(true);
  });

  it('labels a message no copy covers with the explicit uncovered label', () => {
    const { surfaces: { back } } = drawIncoming(incoming(message(20985, 3)));
    // One line 'No summary' (10 × 6 = 60): x0 + 18, top 341 + trunc((96 − 8) / 2) = 385.
    expect(readGlyphs(back, RECT.x0 + 18, 385, 10, 6, 0x0f)).toBe('NO SUMMARY');
  });

  it('draws nothing without a playing message or while page 5 does not show it', () => {
    for (const view of [null, incoming(message(20011, 7), false)]) {
      const { drawn, published, surfaces: { back } } = drawIncoming(view, { viewMode: WARP_VIEW });
      expect(drawn).toBe(false);
      expect(published).toEqual([]);
      expect(back.indices.every((index) => index === 0x33)).toBe(true);
    }
  });

  it('rejects labels of more than 2 lines, 16 bytes, 0x7B or outside fonts/1\'s map', () => {
    for (const uncoveredLabel of [['a', 'b', 'c'], ['x'.repeat(17)], ['{'], []]) {
      expect(() => pages({ copy: syntheticCopy({ uncoveredLabel }) })).toThrow(expect.objectContaining({ kind: 'invalid-input' }));
    }
    expect(() => pages({ copy: syntheticCopy({ uncoveredLabel: ['x'.repeat(16), 'y'] }) })).not.toThrow();
    // fonts/1 upper-cases first: 'n' needs only 'N' in the map.
    expect(() => pages({ font: syntheticFont([0x20, 0x4e, 0x4f]), copy: syntheticCopy({ uncoveredLabel: ['no n'] }) })).not.toThrow();
    expect(() => pages({ font: syntheticFont([0x20, 0x4e]), copy: syntheticCopy({ uncoveredLabel: ['no'] }) })).toThrow(expect.objectContaining({ code: 'unmapped-character' }));
  });
});
