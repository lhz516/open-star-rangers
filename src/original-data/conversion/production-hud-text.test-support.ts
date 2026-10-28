import { EMPTY_BUDGET_USAGE, type BudgetRecord } from '../../content/budget.ts';
import { encodeHudTextPayload, HUD_TEXT_FORMATS, HUD_TEXT_KEYS, readHudText, type HudText, type HudTextKey } from '../../content/hud/hud-text-payload.ts';
import { syntheticLeExecutable } from '../synthetic.test-support.ts';
import type { RegionWrite } from './production-graphics.test-support.ts';
import { hudTextGraphic, PRODUCTION_HUD_TEXT_REGIONS, type HudTextRegionTable } from './production-hud-text.ts';

// Code-generated HUD texts that fill the production regions exactly; never original text. A text is filler bytes,
// lower- and upper-case letters as a function of the key's schema position, followed by the key's listed conversions,
// so every text fits its key's format, each region's bytes differ from the others' and, as in the shipped texts, every
// byte lies in both HUD fonts' character maps (hud §4.1).

/** A made-up text of exactly `bytes` bytes for `key`: filler, then the key's conversions, if any. */
export function syntheticRegionText(key: HudTextKey, bytes: number): string {
  const conversions = (HUD_TEXT_FORMATS[key] ?? []).join('');
  if (conversions.length > bytes) throw new Error('the region is shorter than the key\'s conversions');
  const seed = HUD_TEXT_KEYS.indexOf(key);
  const filler = Array.from({ length: bytes - conversions.length }, (_, index) =>
    String.fromCharCode((seed + index) % 2 === 0 ? 0x61 + ((seed * 13 + index * 7) % 26) : 0x41 + ((seed * 5 + index) % 26)));
  return filler.join('') + conversions;
}

/** The synthetic HUD text of the production regions: each text one byte shorter than its region, which ends in its NUL. */
export const SYNTHETIC_HUD_TEXT: HudText = readHudText({
  entries: Object.fromEntries(HUD_TEXT_KEYS.map(key => [key, syntheticRegionText(key, PRODUCTION_HUD_TEXT_REGIONS[key].length - 1)])),
});

/** The bytes of each production HUD text region: its synthetic text and the NUL. */
export const PRODUCTION_HUD_TEXT_REGION_WRITES: readonly RegionWrite[] = Object.freeze(HUD_TEXT_KEYS.map(key => {
  const { object, offset } = PRODUCTION_HUD_TEXT_REGIONS[key];
  return Object.freeze({ object, offset, bytes: Uint8Array.from(`${SYNTHETIC_HUD_TEXT.entries[key]}\0`, character => character.charCodeAt(0)) });
}));

/** The graphics conversion usage of `data/hud/text` on the production regions: one Asset and its payload. */
export const HUD_TEXT_USAGE: BudgetRecord = Object.freeze({ ...EMPTY_BUDGET_USAGE, assets: 1, payloadBytes: encodeHudTextPayload(SYNTHETIC_HUD_TEXT).length });

/**
 * A small synthetic executable whose object 1 holds `texts` one after another, each with its NUL, in reverse schema key
 * order, and the HUD text's declaration and mapping for those regions as plain data. Its mapping is confirmed without
 * unknowns, like the other mappings of the synthetic cockpit disc.
 */
export function syntheticHudTextSource(texts: HudText = SYNTHETIC_HUD_TEXT): {
  readonly executable: Uint8Array;
  readonly declaration: Record<string, unknown>;
  readonly mapping: Record<string, unknown>;
} {
  const regions = {} as Record<HudTextKey, HudTextRegionTable[HudTextKey]>;
  const object: number[] = [];
  for (const key of [...HUD_TEXT_KEYS].reverse()) {
    const bytes = Array.from(`${texts.entries[key]}\0`, character => character.charCodeAt(0));
    regions[key] = Object.freeze({ object: 1, offset: object.length, length: bytes.length });
    object.push(...bytes);
  }
  const { declaration, mapping } = hudTextGraphic(regions);
  return { executable: syntheticLeExecutable({ objects: [{ bytes: Uint8Array.from(object) }] }), declaration, mapping: { ...mapping, unknowns: [] } };
}
