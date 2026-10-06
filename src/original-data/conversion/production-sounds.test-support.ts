import { EMPTY_BUDGET_USAGE, type BudgetRecord } from '../../content/budget.ts';
import { SOUND_PAYLOAD_HEADER_BYTES } from '../../content/sound-payload.ts';
import { archiveLocator } from '../source-mapping.ts';
import { syntheticSnd, type SyntheticEntry } from '../synthetic.ts';
import { PRODUCTION_SOUND_TABLE } from './production-sounds.ts';

// Synthetic SND entries at the production sound table's entry IDs, generated in code; never original data. Each uses a
// width the production rules accept and the `flags` value its entry has in the original (audio.md, playback
// interpretation): the three MODL slot-0 entries loop and every other entry plays once.

/** The production entries whose `flags` is 0 (loop until stopped). */
const LOOPING_SOUND_ENTRIES: ReadonlySet<number> = new Set([10_319, 10_679, 11_023]);

const entries = PRODUCTION_SOUND_TABLE.map(({ mapping }, index) => {
  const { id } = archiveLocator(mapping.parts[0].alternatives[0]).entry;
  const bitsPerSample = index % 2 === 0 ? 16 : 8;
  const samples = Array.from({ length: (bitsPerSample / 8) * (3 + (index % 4)) }, (_, at) => (id + at * 37) & 0xff);
  return { id, bitsPerSample, flags: LOOPING_SOUND_ENTRIES.has(id) ? 0 : 1, samples };
});

/** The SND entries the production table maps, with synthetic samples, to add to a synthetic `MAIN/SR.NOB`. */
export function productionSoundEntries(): SyntheticEntry[] {
  return entries.map(({ id, bitsPerSample, flags, samples }) => ({ id, type: 'SND', ...syntheticSnd({ samples, bitsPerSample, flags }) }));
}

/** The audio conversion usage of the production table on `productionSoundEntries()`. */
export const PRODUCTION_SOUND_USAGE: BudgetRecord = Object.freeze({
  ...EMPTY_BUDGET_USAGE,
  assets: entries.length,
  payloadBytes: entries.reduce((total, { samples }) => total + SOUND_PAYLOAD_HEADER_BYTES + samples.length, 0),
  audioSamples: entries.reduce((total, { bitsPerSample, samples }) => total + samples.length / (bitsPerSample / 8), 0),
});
