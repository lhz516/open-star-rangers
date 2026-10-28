/**
 * The left display's communications pages 2–5 in HI (docs/original/formats/comm.md §4; executable.md RQ8 and D15;
 * docs/plan/p3/13/spec.md, 左显示屏 and D-01 定稿 DC-07). The left display's type-6 dispatcher calls these with its
 * record when the player's page is 2–5; the page, its refresh and the SNIP gate stay the dispatcher's, and nothing
 * here writes Core state. Only the HI path exists: the LO panel layout, fonts/2 and the text-only branch are not part
 * of the slice.
 *
 * - **Pages 2–4 (`0x4da28`):** BITM 10467 opaque at (x0, y0 + 1) over 97 columns, row y0 in index 0, the title
 *   `leftCommPanelTitle` in fonts/1, colour 0x13, at (x0 + 6, y0 + 4); then the menu's options in order from
 *   y0 + 15 with a pitch of 9 while y ≤ y1 − 7, each the key byte followed by its text (categories and commands from
 *   their data byte 2, objects as `leftCommListSeparator` plus the name snapshot, the exit from its table's data),
 *   cut to trunc((x1 − x0) / 6) characters. Colours: the last option 0x0C, an active object 0x10, a threatened object
 *   0x0A shown as 0x0F while bit 5 of the clock is 0, others 0x0F. The options are Core's
 *   `communications.player.menu` as built (key, tone, table and source references); the menu is never rebuilt.
 * - **Page 5 (`0x4dc50`):** the original draws the message's 96 × 96 frame image at (x0, y0 + 1), with no text. The
 *   project's G-03 placeholder fills that area with index 0 and centres the injected short label in it; the full
 *   summary only goes to the message line and the base page. Row y0 in index 0 follows.
 *
 * Both copy the record's rectangle when the slot is not always redrawn.
 */
import type { AssetId } from '../../../content/asset-id.ts';
import type { FontPayload } from '../../../content/graphics/font-payload.ts';
import type { HudTextEntries } from '../../../content/hud/hud-text-payload.ts';
import type { InstrumentRecord } from '../../../content/hud/instruments-payload.ts';
import type { CommMenus } from '../../../content/rule-data/comm-menus.ts';
import type { CommunicationsMenuView, CommunicationsOption } from '../../../core/projections/projection.ts';
import type { NameReference } from '../../../core/world/entity-table.ts';
import { checkLabelLines, resolveLabel, type IncomingCopy } from '../messages/message-copy.ts';
import type { CockpitDrawContext } from '../presentation/cockpit-contract.ts';
import { PresentationError } from '../presentation/cockpit-limits.ts';
import { drawText, hudFont, type HudFont } from '../raster/glyph-text.ts';
import { blit, drawLine, fillRect, type IndexedSource } from '../raster/indexed-surface.ts';

export interface CommunicationPagesInput {
  /** fonts/1 (`font/hud/8x8-2`), drawn with advance 6 and upper-casing in HI. */
  readonly font: FontPayload;
  /** BITM 10467, `image/hud/display-page/background`. */
  readonly background: IndexedSource;
  readonly hudText: Pick<HudTextEntries, 'leftCommPanelTitle' | 'leftCommListSeparator'>;
  /** `data/comm-menus` and its Asset ID, which the projection's menu reference names. */
  readonly commMenus: { readonly id: AssetId; readonly content: CommMenus };
  /** The byte string of an object's name snapshot (the app resolves it from the mission setup). */
  readonly names: (name: NameReference) => string;
  /** The app's G-03 copy. */
  readonly copy: IncomingCopy;
}

export interface CommunicationPages {
  /** Pages 2–4 from the tick's shown menu; false, with nothing drawn, without one. */
  drawMenuPage(context: CockpitDrawContext, record: InstrumentRecord): boolean;
  /** Page 5's G-03 placeholder while page 5 shows a playing message; false, with nothing drawn, otherwise. */
  drawIncomingPage(context: CockpitDrawContext, record: InstrumentRecord): boolean;
}

const PATH = 'communications';
/** fonts/1's advance in HI (`0x49694`). */
const PANEL_ADVANCE = 6;
/** HI parameter block +0x48 and +0x44: the title's and rows' x, and the title's y, from the rectangle's corner. */
const TEXT_X = 6;
const TITLE_Y = 4;
const TITLE_COLOUR = 0x13;
const ORDINARY_COLOUR = 0x0f;
const LAST_COLOUR = 0x0c;
const ACTIVE_COLOUR = 0x10;
const THREAT_COLOUR = 0x0a;
/** The threat colour shows as ordinary while this clock bit is 0 (period 0x40). */
const THREAT_BLINK_BIT = 0x20;
const BLANK = 0;
/** Every CMOV frame image is 96 × 96 (comm RQ8): page 5's whole area below row y0. */
const FRAME_SIZE = 96;
/** The label's colour and line pitch (project choices for the G-03 placeholder). */
const LABEL_COLOUR = 0x0f;

/** The texts of each menu table; an object list has only its exit's. */
const TABLE_ITEMS: Readonly<Record<CommunicationsMenuView['menu']['table'], (menus: CommMenus) => readonly { readonly text: string }[]>> = Object.freeze({
  categories: (menus) => menus.categories,
  objects: (menus) => [{ text: menus.objectListLastEntry }],
  gated: (menus) => menus.gatedTargetCommands,
  other: (menus) => menus.otherTargetCommands,
  kind2: (menus) => menus.kind2TargetCommands,
});

function invariant(path: string, reason: string): never {
  throw new PresentationError('invariant-violated', `${PATH}.${path}`, reason);
}

class Pages implements CommunicationPages {
  readonly #font: HudFont;
  readonly #background: IndexedSource;
  readonly #title: string;
  readonly #separator: string;
  readonly #menus: CommunicationPagesInput['commMenus'];
  readonly #names: CommunicationPagesInput['names'];
  readonly #copy: IncomingCopy;

  constructor({ font, background, hudText, commMenus, names, copy }: CommunicationPagesInput) {
    this.#font = hudFont(font, PANEL_ADVANCE, true);
    this.#background = background;
    this.#title = hudText.leftCommPanelTitle;
    this.#separator = hudText.leftCommListSeparator;
    this.#menus = commMenus;
    this.#names = names;
    this.#copy = copy;
    checkLabelLines(copy.uncoveredLabel, font, `${PATH}.copy.uncoveredLabel`);
  }

  drawMenuPage(context: CockpitDrawContext, { rectangle }: InstrumentRecord): boolean {
    const menu = context.projection.communications.player?.menu ?? null;
    if (menu === null) return false;
    if (menu.menu.asset !== this.#menus.id) invariant('menu.asset', `names ${menu.menu.asset}, not the run's ${this.#menus.id}`);
    const { back, clock } = context;
    const { x0, y0, x1, y1 } = rectangle;
    this.#drawBackground(context, x0, y0, x1);
    const font = this.#font;
    const { height } = font.payload;
    let y = y0 + TITLE_Y;
    drawText(back, font, this.#title, x0 + TEXT_X, y, TITLE_COLOUR, `${PATH}.title`);
    y += height + 3;
    const characters = Math.trunc((x1 - x0) / PANEL_ADVANCE);
    const last = menu.options.length - 1;
    for (const [index, option] of menu.options.entries()) {
      if (y > y1 - height + 1) break;
      const text = this.#rowText(menu, option, index).slice(0, characters);
      drawText(back, font, text, x0 + TEXT_X, y, this.#colour(option, index === last, clock), `${PATH}.options[${index}]`);
      y += height + 1;
    }
    this.#publish(context, rectangle);
    return true;
  }

  drawIncomingPage(context: CockpitDrawContext, { rectangle }: InstrumentRecord): boolean {
    const incoming = context.projection.communications.player?.incoming ?? null;
    if (incoming === null || !incoming.shown) return false;
    const { back } = context;
    const { x0, y0, x1 } = rectangle;
    const top = y0 + 1;
    fillRect(back, x0, top, x0 + FRAME_SIZE - 1, top + FRAME_SIZE - 1, BLANK);
    const lines = resolveLabel(this.#copy, incoming.message, this.#font.payload, `${PATH}.copy`).text;
    const pitch = this.#font.payload.height + 1;
    let y = top + Math.trunc((FRAME_SIZE - (lines.length * pitch - 1)) / 2);
    for (const [index, line] of lines.entries()) {
      const x = x0 + Math.trunc((FRAME_SIZE - line.length * PANEL_ADVANCE) / 2);
      drawText(back, this.#font, line, x, y, LABEL_COLOUR, `${PATH}.label[${index}]`);
      y += pitch;
    }
    drawLine(back, x0, y0, x1, y0, BLANK);
    this.#publish(context, rectangle);
    return true;
  }

  /** BITM 10467 with the original's inclusive source column x1 = w (97 columns), then row y0 in index 0. */
  #drawBackground({ back }: CockpitDrawContext, x0: number, y0: number, x1: number): void {
    const image = this.#background;
    const { width, height } = image;
    // Column w of row r reads the next row's first pixel; the last row's would read past the image, which is not
    // reproduced (the frame covers that column).
    if (height > 1) blit(back, image, x0, y0 + 1, 'opaque', { x0: 0, y0: 0, x1: width, y1: height - 2 });
    blit(back, image, x0, y0 + height, 'opaque', { x0: 0, y0: height - 1, x1: width - 1, y1: height - 1 });
    drawLine(back, x0, y0, x1, y0, BLANK);
  }

  /** The key byte and the option's text as the builders copy it. */
  #rowText(menu: CommunicationsMenuView, { key, value }: CommunicationsOption, index: number): string {
    const keyByte = String.fromCharCode(key);
    if (value.type === 'object') return keyByte + this.#separator + this.#names(value.name);
    const { table } = menu.menu;
    const items = TABLE_ITEMS[table](this.#menus.content);
    // An exit is its table's last item; a category or a command names its source item.
    const source = value.type === 'exit' ? items.length - 1 : value.type === 'category' || value.type === 'command' ? value.source : -1;
    const item = items[source] ?? invariant(`menu.options[${index}]`, `has no ${table} item ${source}`);
    return keyByte + item.text.slice(2);
  }

  #colour({ value }: CommunicationsOption, last: boolean, clock: number): number {
    if (last) return LAST_COLOUR;
    if (value.type !== 'object' || value.tone === 'other') return ORDINARY_COLOUR;
    if (value.tone === 'active') return ACTIVE_COLOUR;
    return (clock & THREAT_BLINK_BIT) === 0 ? ORDINARY_COLOUR : THREAT_COLOUR;
  }

  #publish(context: CockpitDrawContext, rectangle: InstrumentRecord['rectangle']): void {
    if (!(context.layout.slot?.alwaysRedraw ?? false)) context.publish(rectangle);
  }
}

/** The communications pages of one run, for the left display's dispatcher. */
export function createCommunicationPages(input: CommunicationPagesInput): CommunicationPages {
  return new Pages(input);
}
