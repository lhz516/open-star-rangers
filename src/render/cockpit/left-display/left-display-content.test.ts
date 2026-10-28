import { describe, expect, it } from 'vitest';
import { ContentContractError } from '../../../content/contract-validation.ts';
import type { ImagePayload } from '../../../content/graphics/image-payload.ts';
import { readHudText } from '../../../content/hud/hud-text-payload.ts';
import { syntheticHudText } from '../../../content/hud/hud-text.test-support.ts';
import type { StatusMessagesPayload } from '../../../content/hud/status-messages-payload.ts';
import { prepareLeftDisplayContent, type LeftDisplayContent } from './left-display-content.ts';
import { leftDisplayContent, statusMessages } from './left-display.test-support.ts';

// DC-08 (DIAG formats ≤ 79 bytes with their largest arguments, the shipped conversions), Q-12 (glyph coverage) and the
// image bindings, all before the run starts.

function failure(content: LeftDisplayContent): ContentContractError {
  try {
    prepareLeftDisplayContent(content);
  } catch (error) {
    if (error instanceof ContentContractError) return error;
    throw error;
  }
  throw new Error('expected a ContentContractError');
}

const withMessages = (patch: Partial<StatusMessagesPayload>): LeftDisplayContent => leftDisplayContent({ statusMessages: statusMessages(patch) });
const formats = (index: number, format: string): readonly string[] => Object.assign([...statusMessages().statusFormats], { [index]: format });

describe('left display content', () => {
  it('accepts the synthetic content and gives fonts/0 its cell width and fonts/1 advance 6 with upper case', () => {
    const assets = prepareLeftDisplayContent(leftDisplayContent());
    expect([assets.regular.advance, assets.regular.upperCase, assets.small.advance, assets.small.upperCase]).toEqual([8, false, 6, true]);
    const { entries } = readHudText(syntheticHudText('e'));
    expect(assets.energyLabels).toEqual([entries.leftEnergyBar1Label, entries.leftEnergyBar2Label, entries.leftEnergyBar3Label]);
  });

  it('requires the shipped conversions of each DIAG format', () => {
    const cases: [Partial<StatusMessagesPayload>, string][] = [
      [{ statusFormats: formats(0, 'S%d') }, 'statusFormats[0]'],
      [{ statusFormats: formats(1, 'H%s%%') }, 'statusFormats[1]'],
      [{ statusFormats: formats(2, 'R%s%s') }, 'statusFormats[2]'],
      [{ statusFormats: formats(3, 'E%.0f') }, 'statusFormats[3]'],
      [{ statusFormats: formats(3, 'E%x') }, 'statusFormats[3]'],
      [{ subsystemFormat: '%s' }, 'subsystemFormat'],
    ];
    for (const [patch, path] of cases) {
      const error = failure(withMessages(patch));
      expect(error.code, path).toBe('invalid-status-messages-payload');
      expect(error.path).toContain(path);
    }
  });

  it('bounds each format’s result with its largest arguments at 79 bytes (80-byte buffer)', () => {
    // '%d' at most 11 bytes: 68 literal bytes fit, 69 do not.
    expect(() => prepareLeftDisplayContent(withMessages({ statusFormats: formats(3, `${'e'.repeat(68)}%d`) }))).not.toThrow();
    expect(failure(withMessages({ statusFormats: formats(3, `${'e'.repeat(69)}%d`) })).path).toContain('statusFormats[3]');
    // Format 2's widest argument is itself (the rating overflow), even with short ratings: 38 + 40 fit, 39 + 41 do not.
    expect(() => prepareLeftDisplayContent(withMessages({ statusFormats: formats(2, `${'r'.repeat(38)}%s`) }))).not.toThrow();
    expect(failure(withMessages({ statusFormats: formats(2, `${'r'.repeat(39)}%s`) })).path).toContain('statusFormats[2]');
    // The lower line with the longest name and state word: 70 + 1 + 8 fit, 70 + 1 + 9 do not.
    const names = Object.assign([...statusMessages().subsystemNames], { 7: 'n'.repeat(70) });
    expect(() => prepareLeftDisplayContent(withMessages({ subsystemNames: names, stateWords: ['ok', 'hit', 'deadxxxx'] }))).not.toThrow();
    expect(failure(withMessages({ subsystemNames: names, stateWords: ['ok', 'hit', 'deadxxxxx'] })).path).toContain('subsystemFormat');
  });

  it('requires a glyph for every byte the lines and labels can draw, line breaks excepted', () => {
    expect(failure(withMessages({ startupMessages: ['ok', 'b\x80'] }))).toMatchObject({ code: 'unmapped-character', path: expect.stringContaining('glyphs') });
    expect(failure(withMessages({ stateWords: ['ok', 'hit', 'd\x81'] })).code).toBe('unmapped-character');
    const hudText = readHudText({ entries: { ...syntheticHudText('e').entries, leftEnergyBar2Label: 'e\x82' } });
    expect(failure(leftDisplayContent({ hudText }))).toMatchObject({ code: 'unmapped-character', path: expect.stringContaining('energyLabels[1]') });
  });

  it('requires 3 backgrounds, 9 overlays and 4 level records, all direct', () => {
    const content = leftDisplayContent();
    const indirect = { ...content.levelImages[2], display: { nearest: 'palette/flight/models' } } as unknown as ImagePayload;
    const cases: Partial<LeftDisplayContent>[] = [
      { statusBackgrounds: content.statusBackgrounds.slice(0, 2) },
      { statusOverlays: content.statusOverlays.slice(0, 8) },
      { levelImages: [...content.levelImages, content.levelImages[0]] },
      { levelImages: Object.assign([...content.levelImages], { 2: indirect }) },
      { pageBackground: indirect },
    ];
    for (const patch of cases) expect(failure(leftDisplayContent(patch)).code).toBe('binding-mismatch');
  });
});
