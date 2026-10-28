import type { CharMapEntry, FontPayload } from '../../../content/graphics/font-payload.ts';
import type { FlightMessages } from '../../../content/rule-data/flight-messages.ts';
import type { MessageIdentity } from '../../../core/world/world-state.ts';
import type { IndexedSurface } from '../raster/indexed-surface.ts';
import type { IncomingCopy } from './message-copy.ts';

// Code-generated synthetic fonts, texts and G-03 copy for the message line and communications page tests; never
// original data. Every glyph of the synthetic fonts carries its own code so a test can read text back from pixels.

const GLYPH_ROWS = 8;

/**
 * A font of 128 glyphs mapping each code of `codes` to the glyph of the same number. Glyph c has markers at columns 0
 * and 7 of row 0, the low six bits of c in columns 0–5 of row 1 and bit 6 of c in column 0 of row 2; with an advance
 * of 6 the column-7 marker overlaps only row 0 of the next cell.
 */
export function syntheticFont(codes: Iterable<number> = range(0x20, 0x7e), height = 8): FontPayload {
  const glyphs = new Uint8Array(128 * GLYPH_ROWS);
  for (let code = 0; code < 128; code++) {
    glyphs[code * GLYPH_ROWS] = 0b1000_0001;
    glyphs[code * GLYPH_ROWS + 1] = (code & 0x3f) << 2;
    glyphs[code * GLYPH_ROWS + 2] = (code >> 6) << 7;
  }
  const charMap: CharMapEntry[] = [...new Set(codes)].sort((a, b) => a - b).map((code) => Object.freeze({ code, glyph: code }));
  return Object.freeze({ kind: 'font', cellWidth: 8, height, glyphRows: GLYPH_ROWS, glyphs, charMap: Object.freeze(charMap) });
}

export function range(first: number, last: number): number[] {
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}

/** Reads `count` glyphs of the synthetic font drawn in `colour` from (x, y) with `advance`; '?' where none is. */
export function readGlyphs(surface: IndexedSurface, x: number, y: number, count: number, advance: number, colour: number): string {
  const at = (px: number, py: number): boolean => px >= 0 && px < surface.width && py >= 0 && py < surface.height && surface.indices[py * surface.width + px] === colour;
  let text = '';
  for (let index = 0; index < count; index++) {
    const left = x + index * advance;
    if (!at(left, y)) {
      text += '?';
      continue;
    }
    let code = at(left, y + 2) ? 0x40 : 0;
    for (let bit = 0; bit < 6; bit++) if (at(left + bit, y + 1)) code |= 0x20 >> bit;
    text += String.fromCharCode(code);
  }
  return text;
}

/** The x of every glyph origin in row y for glyphs 8 columns apart: each glyph's row 0 has markers at x and x + 7. */
export function glyphOrigins(surface: IndexedSurface, y: number, colour: number, x0 = 0, x1 = surface.width - 1): number[] {
  const origins: number[] = [];
  for (let x = x0; x <= x1; x++) {
    if (surface.indices[y * surface.width + x] !== colour) continue;
    origins.push(x);
    x += 7;
  }
  return origins;
}

/** The colours of the pixels in a rectangle, as `x,y=colour` for every non-zero index. */
export function pixelsIn(surface: IndexedSurface, x0: number, y0: number, x1: number, y1: number): string[] {
  const out: string[] = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const index = surface.indices[y * surface.width + x];
      if (index !== 0) out.push(`${x},${y}=${index}`);
    }
  }
  return out;
}

export const FLIGHT_MESSAGES: FlightMessages = Object.freeze({
  missionComplete: 'Mission done',
  beacon: 'Beacon on',
  speedAssistOn: 'Assist on',
  speedAssistOff: 'Assist off',
  joystickSensitivity0: 'Stick 0',
  joystickSensitivity1: 'Stick 1',
  joystickSensitivity2: 'Stick 2',
});

export const message = (table: 20011 | 20019 | 20985, index: number, face = 0): MessageIdentity => Object.freeze({ table, face, index });

/** Copy that covers table 20011 only: summary `Summary <index>`, label [`LABEL`, `<index>`]. */
export function syntheticCopy(overrides: Partial<IncomingCopy> = {}): IncomingCopy {
  return Object.freeze({
    summary: (identity: MessageIdentity) => (identity.table === 20011 ? `Summary ${identity.index}` : null),
    label: (identity: MessageIdentity) => (identity.table === 20011 ? Object.freeze(['Label', `n${identity.index}`]) : null),
    uncoveredSummary: 'Not covered',
    uncoveredLabel: Object.freeze(['No summary']),
    ...overrides,
  });
}
