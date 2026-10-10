import type { SourceConfidence } from '../source-mapping.ts';
import { AUDIO_SOURCE_ARCHIVE, readSoundTable, type SoundRole, type SoundTableRow } from './audio-conversion.ts';

// The P3-03 S-13 sounds outside the models and EXPL (docs/original/formats/audio.md): the samples the game plays by
// entry ID and the HUD's own sounds. Names follow the confirmed poster or use; the IDs are frozen like the P2-08 table's
// and never derived from entry IDs. Whether a sample loops stays the P2-08 `flags` rule; when it plays belongs to P3-14.
// `PRODUCTION_SOUND_TABLE` merges these rows with the P2-08 sounds.

const BY_ID = 'docs/original/formats/audio.md#sounds-played-by-id-and-hud-sounds-p3-0110';

/** One whole `MAIN/SR.NOB` SND entry as a declared mapping. */
function row(role: SoundRole, id: string, entry: number, confidence: SourceConfidence, unknowns: readonly string[] = []) {
  return {
    role,
    mapping: {
      asset: { id, kind: 'sound' },
      parts: [{ alternatives: [{ discPath: AUDIO_SOURCE_ARCHIVE, entry: { id: entry, type: 'SND' }, subresource: null }] }],
      confidence,
      unknowns,
      evidence: [BY_ID],
      resolution: 'declared',
    },
  };
}

// Every play-by-ID poster writes a constant entry ID (Confirmed).
const event = (name: string, entry: number, unknowns: readonly string[] = []) => row('event-sound', `sound/event/${name}`, entry, 'confirmed', unknowns);
// Code paths confirmed; the use each sound signals is Likely or Unconfirmed (U-004).
const hud = (name: string, entry: number) => row('hud-sound', `sound/hud/${name}`, entry, 'likely', ['U-004']);

/** The sounds played by ID and the HUD sounds, in ascending Asset ID order. */
export const PRODUCTION_FLIGHT_SOUND_TABLE: readonly SoundTableRow[] = readSoundTable([
  // Docking sub-command 3: Enter, the selected base action.
  event('base-execute-key', 10_169),
  // Docking sub-commands 1 and 2: the two selection keys of the base interior.
  event('base-select-key', 10_167),
  // Flight keys and communications commands, through dispatcher message type 0x100000.
  event('key-command', 10_485),
  // The map click that sets a Warp destination.
  event('map-destination', 10_463),
  // Dispatcher message type 2, from the target selection helpers.
  event('target-select', 11_087),
  // A transponder-kind object created at run time; whether the slice reaches it is Unconfirmed.
  event('transponder-created', 10_055, ['U-004']),
  // The Warp end.
  event('warp-arrival', 10_181),
  // Dispatcher message type 4, when the gun or missile selection changes.
  event('weapon-select', 11_381),
  // The loop of instrument type 9, the strip above the navigation display.
  hud('instrument-9-loop', 10_409),
  // The overlay's loop for a live target at value 0, and its once-per-due-time pulse for a positive value.
  hud('overlay-loop', 10_455),
  hud('overlay-pulse', 10_457),
], 'PRODUCTION_FLIGHT_SOUND_TABLE');
