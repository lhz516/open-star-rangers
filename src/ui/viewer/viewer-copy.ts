/**
 * The viewer page's fixed English text (P2-11 S-07, S-09, AC-18): headings per kind, variant labels with the part-list
 * notes, effect colours as numbers and the mission summary. Nothing here comes from original game text; mission names
 * and other strings are never shown, only structure and counts.
 */
import type { MissionLoadState } from '../../app/resources/mission-diagnostics.ts';
import type { ViewerEntryKind, ViewerVariant } from '../../app/viewer/viewer-items.ts';
import type { EffectAppearance } from '../../render/viewer/viewer-presentation.ts';

export const KIND_HEADINGS: Readonly<Record<ViewerEntryKind, string>> = Object.freeze({
  model: 'Models',
  effect: 'Effects',
  image: 'Images',
  palette: 'Palettes',
  layout: 'Layouts',
  font: 'Fonts',
});

/** The order kinds are listed in. */
export const KIND_ORDER: readonly ViewerEntryKind[] = Object.freeze(['model', 'effect', 'image', 'palette', 'layout', 'font']);

const PART_LISTS = Object.freeze({ intact: 'the intact model', fragments: 'hull fragments drawn when a craft is destroyed', unknown: 'purpose unknown' });

const plural = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? '' : 's'}`;

export function variantLabel(variant: ViewerVariant): string {
  if (variant.kind === 'part-list') {
    return `Part list ${variant.list}: ${PART_LISTS[variant.content]} (${variant.confidence}), ${plural(variant.parts, 'part')}`;
  }
  const noun = { record: 'Record', 'missile-type': 'Missile type', 'untextured-shape': 'Untextured shape', 'textured-shape': 'Textured shape' }[variant.label];
  return `${noun} ${variant.index}`;
}

/** The original's interpolation across cylindrical seams remains unconfirmed (AC-18). */
export const SEAM_UNCONFIRMED = 'Seam interpolation unconfirmed: vertex texture coordinates are interpolated linearly.';

/** A number as given, keeping the sign of negative zero. */
const exact = (value: number): string => (Object.is(value, -0) ? '-0' : String(value));

export function appearanceText({ colour, rgb, textured }: EffectAppearance): string {
  if (textured) return `Texture texels shown unchanged; ${colour === null ? 'no source colour' : `source colour ${colour.map(exact).join(', ')}`}`;
  if (colour === null) return `No colour: shown in diagnostic grey ${rgb.join(', ')}, not an original colour`;
  return `Colour ${colour.map(exact).join(', ')}, drawn as ${rgb.join(', ')}`;
}

/** The mission's structure as text lines, then one line per resolved model; null when the mission did not load. */
export function missionLines(mission: MissionLoadState): readonly string[] | null {
  if (mission.status !== 'loaded') return null;
  const { summary: { mission: id, campaign, mapAxes, units, player, counts, sides }, references } = mission;
  const present = references.models.filter(model => model.present).length;
  return Object.freeze([
    `Mission ${id}, campaign group ${campaign.group}, slot ${campaign.slot}`,
    `Map axes: right ${mapAxes.right}, up ${mapAxes.up}; units: ${units.coordinates} coordinates, ${units.layout} layout`,
    `${plural(counts.declarations, 'declaration')} (player is declaration ${player}), ${plural(counts.groups, 'group')}, `
      + `${plural(counts.spawnRegions, 'spawn region')}, ${plural(counts.wingmanOptions, 'wingman option')}, ${plural(counts.namePool, 'pool name')}`,
    `Sides: ${sides.player} player, ${sides.friendly} friendly, ${sides.enemy} enemy, ${sides.none} without a craft type`,
    `Models: ${references.declarationsWithModel} declarations and ${references.wingmanOptionsWithModel} wingman options resolve to `
      + `${plural(references.models.length, 'model')}, ${present} present in the ${references.modelsGroup === 'held' ? 'held' : 'missing'} models group`,
    ...references.models.map(({ id: model, present: held }) => `Model ${model}: ${held ? 'present in' : 'missing from'} the models group`),
  ]);
}
