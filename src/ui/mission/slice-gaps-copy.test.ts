import { describe, expect, it } from 'vitest';
import type { CharMapRange } from '../../original-data/conversion/graphics-declarations.ts';
import { PRODUCTION_GRAPHICS_DECLARATIONS } from '../../original-data/conversion/production-graphics.ts';
import type { MessageIdentity } from '../../core/world/world-state.ts';
import { checkLabelLines, checkSummaryText } from '../../render/cockpit/messages/message-copy.ts';
import { syntheticFont } from '../../render/cockpit/messages/messages.test-support.ts';
import { cockpitCopy } from '../../app/composition/cockpit-copy.ts';
import { drawText, hudFont } from '../../render/cockpit/raster/glyph-text.ts';
import { createIndexedSurface } from '../../render/cockpit/raster/indexed-surface.ts';
import { MAP_COST_UNAVAILABLE, MESSAGE_SUMMARIES, messageLabel, messageSummary, messageSummaryKind } from './slice-gaps-copy.ts';

/** A synthetic font with the character map production declares for `id` (hud §1.1), never original glyphs. */
function productionMapFont(id: string) {
  const declaration = PRODUCTION_GRAPHICS_DECLARATIONS.find(({ asset }) => asset.id === id);
  const ranges = (declaration as { readonly charMap?: readonly CharMapRange[] } | undefined)?.charMap;
  if (!ranges) throw new Error(`no font declaration ${id}`);
  return syntheticFont(ranges.flatMap(({ firstCode, count }) => Array.from({ length: count }, (_, offset) => firstCode + offset)));
}

const REGULAR = productionMapFont('font/hud/8x8-1');
const SMALL = productionMapFont('font/hud/8x8-2');

/** Every 20985 index the slice's Core can queue: the line types of `0x38d54` with their draws, and the name offsets. */
const REACHABLE_WINGMAN = [
  ...[0, 1, 2], ...[3, 4], ...[5, 6, 7], ...[8, 9], 0xa, 0xb, 0xc, 0xd, ...[0xe, 0xf], ...[0x10, 0x11], 0x12, 0x13, 0x14, 0x15,
  ...Array.from({ length: 19 }, (_, offset) => 0x16 + offset), ...Array.from({ length: 20 }, (_, offset) => 0x29 + offset),
];

describe('the G-03 project copy (DC-07)', () => {
  it('keeps every summary within 58 bytes of fonts/0 and every label within 2 × 16 bytes of fonts/1, the uncovered copy included', () => {
    const { text, label, uncovered } = MESSAGE_SUMMARIES;
    for (const [kind, summary] of Object.entries(text)) expect(checkSummaryText(summary, REGULAR, kind)).toBe(summary);
    for (const [kind, lines] of Object.entries(label)) expect(checkLabelLines(lines, SMALL, kind)).toEqual(lines);
    expect(checkSummaryText(uncovered.summary, REGULAR, 'uncovered')).toBe(uncovered.summary);
    expect(checkLabelLines(uncovered.label, SMALL, 'uncovered')).toEqual(uncovered.label);
    // The fonts reject what the checks must catch: a `{` outside fonts/0's map, and 59 bytes.
    expect(() => checkSummaryText(`${text['docking-reply']}{`, REGULAR, 'x')).toThrow();
    expect(() => checkSummaryText('x'.repeat(59), REGULAR, 'x')).toThrow();
  });

  it('gives each kind its own summary and label, each label marked as G-03 project text', () => {
    const texts = Object.values(MESSAGE_SUMMARIES.text);
    expect(new Set(texts).size).toBe(texts.length);
    const subjects = Object.values(MESSAGE_SUMMARIES.label).map(([subject]) => subject);
    expect(new Set(subjects).size).toBe(subjects.length);
    expect(Object.keys(MESSAGE_SUMMARIES.label)).toEqual(Object.keys(MESSAGE_SUMMARIES.text));
    for (const lines of [...Object.values(MESSAGE_SUMMARIES.label), MESSAGE_SUMMARIES.uncovered.label]) {
      expect(lines).toHaveLength(2);
      expect(lines[1]).toBe('G-03 PROJECT');
    }
    expect(MESSAGE_SUMMARIES.uncovered.summary).toMatch(/No project summary.*\(G-03\)/);
  });

  it('covers every 20985 index the slice can queue, the kill report for 5–7 included, and nothing past them', () => {
    const face = (index: number): MessageIdentity => ({ table: 20985, face: 2, index });
    for (const index of REACHABLE_WINGMAN) expect(messageSummaryKind(face(index)), `20985 ${index}`).not.toBeNull();
    expect([5, 6, 7].map(index => messageSummaryKind(face(index)))).toEqual(['wingman-kill', 'wingman-kill', 'wingman-kill']);
    expect(messageSummaryKind(face(0x3d))).toBeNull();
    expect(messageSummaryKind(face(-1))).toBeNull();
    expect(messageSummary(face(0x3d))).toBeNull();
    expect(messageLabel(face(0x3d))).toBeNull();
  });

  it('is what the cockpit copy injects, so the start checks see every text', () => {
    const copy = cockpitCopy();
    const message: MessageIdentity = { table: 20011, face: 0, index: 0 };
    expect(copy.incoming.summary(message)).toBe(MESSAGE_SUMMARIES.text['docking-reply']);
    expect(copy.incoming.label(message)).toBe(MESSAGE_SUMMARIES.label['docking-reply']);
    expect(copy.incoming.summary({ table: 20985, face: 0, index: 0x3d })).toBeNull();
    expect(copy.incoming.uncoveredSummary).toBe(MESSAGE_SUMMARIES.uncovered.summary);
    expect(copy.incoming.uncoveredLabel).toBe(MESSAGE_SUMMARIES.uncovered.label);
    expect(copy.summaries).toEqual(Object.values(MESSAGE_SUMMARIES.text));
    expect(copy.labels).toEqual(Object.values(MESSAGE_SUMMARIES.label));
    expect(copy.costUnavailable).toBe(MAP_COST_UNAVAILABLE);
  });

  it('keeps the map\'s cost marker to 1–5 printable bytes that fonts/1 draws', () => {
    expect(MAP_COST_UNAVAILABLE).toMatch(/^[\x20-\x7e]{1,5}$/);
    expect(() => drawText(createIndexedSurface(1, 1), hudFont(SMALL, 6, true), MAP_COST_UNAVAILABLE, 0, 0, 0, 'cost')).not.toThrow();
  });
});
