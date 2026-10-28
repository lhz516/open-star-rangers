/**
 * The content the left display's status and energy pages draw (docs/plan/p3/13/spec.md, 左显示屏 and D-01 定稿
 * DC-08; docs/original/formats/hud.md §4.4 and DIAG 10489), checked before the run starts.
 *
 * - **Images:** MFDD list 0 (three status backgrounds) and list 1 (nine status overlays, one per field 0–8), BITM 10467
 *   (the page background) and the four TABL 10479 records (one per allocation level); all `direct`.
 * - **Texts:** DIAG `data/hud/status-display/messages`, the three energy bar labels of `data/hud/text`, fonts/0
 *   (`font/hud/8x8-1`, advance = its cell width) and fonts/1 (`font/hud/8x8-2`, advance 6, upper case; `0x49694`).
 * - **DIAG check (DC-08):** the original formats into an 80-byte stack buffer, so every format must produce at most 79
 *   bytes with its largest arguments (an i32 `%d` has 11 bytes; format 2's `%s` is a rating text or, when the subsystem
 *   sum exceeds every maximum, format 2 itself; the lower line's two `%s` are a subsystem name and a state word), and
 *   each format holds the conversions of the shipped data: formats 0 and 1 one `%d` and one `%%`, format 2 one `%s`,
 *   format 3 one `%d`, the lower line's format two `%s`.
 * - **Glyphs (Q-12):** every byte these texts can draw must be in its font's character map (fonts/1 after its
 *   upper-casing); a line break is a line break, not a glyph.
 */
import { fail } from '../../../content/contract-validation.ts';
import type { FontPayload } from '../../../content/graphics/font-payload.ts';
import { glyphsFor } from '../../../content/graphics/glyph-lookup.ts';
import type { ImagePayload } from '../../../content/graphics/image-payload.ts';
import type { HudText } from '../../../content/hud/hud-text-payload.ts';
import type { StatusMessagesPayload } from '../../../content/hud/status-messages-payload.ts';
import { COCKPIT_LIMITS } from '../presentation/cockpit-limits.ts';
import { hudFont, type HudFont } from '../raster/glyph-text.ts';
import { formatText, textFormatConversions, TextFormatError, type TextFormatArgument } from '../raster/text-format.ts';

export interface LeftDisplayContent {
  /** `image/hud/status-display/background-0`–`2`, MFDD list 0. */
  readonly statusBackgrounds: readonly ImagePayload[];
  /** `image/hud/status-display/overlay-0`–`8`, MFDD list 1: field i's overlay. */
  readonly statusOverlays: readonly ImagePayload[];
  /** `data/hud/status-display/messages`, DIAG 10489. */
  readonly statusMessages: StatusMessagesPayload;
  /** `image/hud/display-page/background`, BITM 10467. */
  readonly pageBackground: ImagePayload;
  /** `image/hud/gauge-bar-1/0`–`3`, TABL 10479: the record of each allocation level. */
  readonly levelImages: readonly ImagePayload[];
  /** `data/hud/text`, for the energy page's bar labels. */
  readonly hudText: HudText;
  /** fonts/0 `font/hud/8x8-1` and fonts/1 `font/hud/8x8-2`. */
  readonly fonts: { readonly regular: FontPayload; readonly small: FontPayload };
}

/** The checked content with the fonts' drawing properties. */
export interface LeftDisplayAssets {
  readonly statusBackgrounds: readonly ImagePayload[];
  readonly statusOverlays: readonly ImagePayload[];
  readonly statusMessages: StatusMessagesPayload;
  readonly pageBackground: ImagePayload;
  readonly levelImages: readonly ImagePayload[];
  /** The energy page's labels: middle (`0x171e60`), left (`0x171e64`) and right (`0x171e68`) bar. */
  readonly energyLabels: readonly [string, string, string];
  /** fonts/0, the energy labels. */
  readonly regular: HudFont;
  /** fonts/1, the DIAG lines. */
  readonly small: HudFont;
}

/** Fields with a status overlay (hud §4.4). */
export const STATUS_OVERLAY_FIELDS = 9;
const STATUS_BACKGROUNDS = 3;
const LEVELS = 4;
const SMALL_ADVANCE = 6;
/** The widest `%d`, `-2147483648`. */
const WIDEST_INTEGER = -0x8000_0000;
const LINE_BREAK = 0x0a;
const DIGITS = '-0123456789';

const CONVERSIONS: readonly (readonly string[])[] = [['%%', '%d'], ['%%', '%d'], ['%s'], ['%d']];
const SUBSYSTEM_CONVERSIONS: readonly string[] = ['%s', '%s'];

function checkImages(images: readonly ImagePayload[], count: number, path: string): readonly ImagePayload[] {
  if (!Array.isArray(images) || images.length !== count) fail('binding-mismatch', path, `must be a list of ${count} images`);
  images.forEach((image, index) => checkImage(image, `${path}[${index}]`));
  return Object.freeze([...images]);
}

function checkImage(image: ImagePayload, path: string): ImagePayload {
  if (image?.kind !== 'image' || image.display !== 'direct') fail('binding-mismatch', path, 'must be a direct image');
  return image;
}

const longest = (texts: readonly string[]): string => texts.reduce((best, text) => (text.length > best.length ? text : best), '');

/** A format of the DIAG payload must hold `expected` (in any order) and fit 79 bytes with `args`. */
function checkFormat(format: string, expected: readonly string[], args: readonly TextFormatArgument[], path: string): void {
  try {
    const found = [...textFormatConversions(format, path)].sort();
    if (found.join() !== [...expected].sort().join()) fail('invalid-status-messages-payload', path, `must hold exactly the conversions ${expected.join(' ')}`);
    formatText(format, args, COCKPIT_LIMITS.diagBytes, path);
  } catch (error) {
    if (error instanceof TextFormatError) fail('invalid-status-messages-payload', error.path, error.message);
    throw error;
  }
}

/** Checks that `font` has a glyph for every byte of `texts`, line breaks excepted. */
function checkGlyphs(font: HudFont, texts: readonly string[], path: string): void {
  texts.forEach((text, index) => {
    const codes: number[] = [];
    for (let at = 0; at < text.length; at++) {
      const code = text.charCodeAt(at);
      if (code === LINE_BREAK) continue;
      codes.push(font.upperCase && code >= 0x61 && code <= 0x7a ? code - 0x20 : code);
    }
    glyphsFor(font.payload, codes, `${path}[${index}]`);
  });
}

/** The bytes a format itself contributes: its literal bytes and a `%` for each `%%`. */
const literalBytes = (format: string): string => format.replace(/%([%ds])/g, (_, conversion: string) => (conversion === '%' ? '%' : ''));

/** Checks the left display's content (a `ContentContractError` before the run starts) and prepares its fonts. */
export function prepareLeftDisplayContent(content: LeftDisplayContent, path = 'leftDisplay'): LeftDisplayAssets {
  const { statusMessages: messages, hudText, fonts } = content;
  const statusBackgrounds = checkImages(content.statusBackgrounds, STATUS_BACKGROUNDS, `${path}.statusBackgrounds`);
  const statusOverlays = checkImages(content.statusOverlays, STATUS_OVERLAY_FIELDS, `${path}.statusOverlays`);
  const levelImages = checkImages(content.levelImages, LEVELS, `${path}.levelImages`);
  const pageBackground = checkImage(content.pageBackground, `${path}.pageBackground`);
  const regular = hudFont(fonts.regular, fonts.regular.cellWidth, false);
  const small = hudFont(fonts.small, SMALL_ADVANCE, true);

  const at = `${path}.statusMessages`;
  const { statusFormats, ratings, subsystemNames, stateWords, subsystemFormat, startupMessages } = messages;
  const ratingArgument = longest([...ratings.map(({ text }) => text), statusFormats[2]]);
  statusFormats.forEach((format, index) => {
    checkFormat(format, CONVERSIONS[index], index === 2 ? [ratingArgument] : [WIDEST_INTEGER], `${at}.statusFormats[${index}]`);
  });
  checkFormat(subsystemFormat, SUBSYSTEM_CONVERSIONS, [longest(subsystemNames), longest(stateWords)], `${at}.subsystemFormat`);
  checkGlyphs(small, [
    ...statusFormats.map(literalBytes), statusFormats[2], ...ratings.map(({ text }) => text), ...subsystemNames, ...stateWords,
    literalBytes(subsystemFormat), ...startupMessages, DIGITS,
  ], `${at}.glyphs`);

  const { leftEnergyBar1Label, leftEnergyBar2Label, leftEnergyBar3Label } = hudText.entries;
  const energyLabels = Object.freeze([leftEnergyBar1Label, leftEnergyBar2Label, leftEnergyBar3Label] as const);
  checkGlyphs(regular, energyLabels, `${path}.energyLabels`);
  return Object.freeze({ statusBackgrounds, statusOverlays, statusMessages: messages, pageBackground, levelImages, energyLabels, regular, small });
}
