import type { SndFormatRules } from '../formats/snd.ts';
import { readSoundTable, type SoundTableRow } from './audio-conversion.ts';

// The production sound table and SND interpretations. Both stay empty until research and the developer's listening
// comparison settle them (P2-08 subtasks 09 to 11), so the production audio group is incomplete until then.

/** The sound Assets with their roles and `MAIN/SR.NOB` SND mappings: none yet. */
export const PRODUCTION_SOUND_TABLE: readonly SoundTableRow[] = readSoundTable([], 'PRODUCTION_SOUND_TABLE');

/** The SND interpretations research confirmed: none yet, so every `flags` value and every 16-bit entry is rejected. */
export const PRODUCTION_SND_RULES: SndFormatRules = Object.freeze({ flags: Object.freeze([]), s16le: false });
