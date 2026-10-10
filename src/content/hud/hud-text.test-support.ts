import { HUD_TEXT_FORMATS, HUD_TEXT_KEYS, type HudTextKey } from './hud-text-payload.ts';

// Code-generated synthetic HUD text; it never holds original text. A text is `prefix` and the key's schema position, and a
// format string appends its listed conversions, so every text fits its key's format and different prefixes give
// different texts.

/** The synthetic text of `key`: within the text byte limit for a `prefix` of up to 16 bytes. */
export function syntheticHudTextEntry(key: HudTextKey, prefix = 'syn'): string {
  return [`${prefix}${HUD_TEXT_KEYS.indexOf(key)}`, ...HUD_TEXT_FORMATS[key] ?? []].join(' ');
}

/** Fresh mutable synthetic HUD text content with every key in schema order. */
export function syntheticHudText(prefix = 'syn'): { entries: Record<HudTextKey, string> } {
  const entries = {} as Record<HudTextKey, string>;
  for (const key of HUD_TEXT_KEYS) entries[key] = syntheticHudTextEntry(key, prefix);
  return { entries };
}
