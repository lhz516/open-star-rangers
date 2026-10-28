/**
 * The G-03 project copy of incoming messages (docs/plan/p3/13/spec.md, 缺省与标注 and D-01 定稿 DC-07): the app injects
 * it (P3-13/25 defines the text in the UI's slice-gaps copy); the cockpit never imports UI modules. A summary is the
 * full project text of the message line and the base page; a label is page 5's short note in the 96 × 96 frame area.
 * Neither is an original line. A message no summary covers shows the explicit uncovered copy, never silence.
 *
 * Checks: a summary is 1–58 bytes, a label 1–2 lines of 1–16 bytes; both only 0x20–0x7E without 0x7B, and every byte
 * in the character map of the font that draws it (fonts/0 for summaries, fonts/1 after upper-casing for labels).
 */
import type { FontPayload } from '../../../content/graphics/font-payload.ts';
import { glyphsFor } from '../../../content/graphics/glyph-lookup.ts';
import type { MessageIdentity } from '../../../core/world/world-state.ts';
import { COCKPIT_LIMITS, PresentationError } from '../presentation/cockpit-limits.ts';

export interface IncomingCopy {
  /** The message's full project summary, or null when no summary covers it. */
  summary(message: MessageIdentity): string | null;
  /** The message's page-5 label lines, or null when no label covers it. */
  label(message: MessageIdentity): readonly string[] | null;
  /** The explicit feedback shown instead of a missing summary. */
  readonly uncoveredSummary: string;
  /** The explicit feedback shown instead of a missing label. */
  readonly uncoveredLabel: readonly string[];
}

/** Page 5's label (DC-07): at most 2 lines of 16 bytes in fonts/1 (advance 6) inside the 96-pixel frame area. */
export const PAGE_LABEL_LIMITS = Object.freeze({ lines: 2, lineBytes: 16 });

/** A summary or label as shown, and whether the copy covered the message. */
export interface ResolvedCopy<Text> {
  readonly text: Text;
  readonly covered: boolean;
}

const LEFT_BRACE = 0x7b;

function checkBytes(text: unknown, maxBytes: number, path: string): asserts text is string {
  if (typeof text !== 'string' || text.length < 1 || text.length > maxBytes) {
    throw new PresentationError('invalid-input', path, `must be a byte string of 1 to ${maxBytes} bytes`);
  }
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (code < 0x20 || code > 0x7e || code === LEFT_BRACE) throw new PresentationError('invalid-input', `${path}[${index}]`, 'must be 0x20–0x7E without 0x7B');
  }
}

const codesOf = (text: string, upperCase: boolean): number[] =>
  Array.from(text, (character) => {
    const code = character.charCodeAt(0);
    return upperCase && code >= 0x61 && code <= 0x7a ? code - 0x20 : code;
  });

/** A summary's bytes and its fonts/0 glyphs (`unmapped-character` otherwise). */
export function checkSummaryText(text: unknown, font: FontPayload, path: string): string {
  checkBytes(text, COCKPIT_LIMITS.summaryBytes, path);
  glyphsFor(font, codesOf(text, false), path);
  return text;
}

/** A label's lines and their fonts/1 glyphs after upper-casing. */
export function checkLabelLines(lines: unknown, font: FontPayload, path: string): readonly string[] {
  if (!Array.isArray(lines) || lines.length < 1 || lines.length > PAGE_LABEL_LIMITS.lines) {
    throw new PresentationError('invalid-input', path, `must be 1 to ${PAGE_LABEL_LIMITS.lines} lines`);
  }
  return Object.freeze(lines.map((line: unknown, index) => {
    checkBytes(line, PAGE_LABEL_LIMITS.lineBytes, `${path}[${index}]`);
    glyphsFor(font, codesOf(line, true), `${path}[${index}]`);
    return line;
  }));
}

/** The summary the message line and the base page show for `message`: the copy's, or the uncovered feedback. */
export function resolveSummary(copy: IncomingCopy, message: MessageIdentity, font: FontPayload, path: string): ResolvedCopy<string> {
  const summary = copy.summary(message);
  if (summary === null) return Object.freeze({ text: checkSummaryText(copy.uncoveredSummary, font, `${path}.uncoveredSummary`), covered: false });
  return Object.freeze({ text: checkSummaryText(summary, font, `${path}.summary`), covered: true });
}

/** The label page 5 shows for `message`: the copy's, or the uncovered feedback. */
export function resolveLabel(copy: IncomingCopy, message: MessageIdentity, font: FontPayload, path: string): ResolvedCopy<readonly string[]> {
  const label = copy.label(message);
  if (label === null) return Object.freeze({ text: checkLabelLines(copy.uncoveredLabel, font, `${path}.uncoveredLabel`), covered: false });
  return Object.freeze({ text: checkLabelLines(label, font, `${path}.label`), covered: true });
}
