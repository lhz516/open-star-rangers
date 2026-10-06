import type { AssetId } from '../../content/asset-id.ts';
import type { SndFormatRules } from '../formats/snd.ts';
import { archiveLocator } from '../source-mapping.ts';
import { AUDIO_SOURCE_ARCHIVE, readSoundTable, type SoundRole, type SoundTableRow } from './audio-conversion.ts';

// The production sound table and SND interpretations, from the P2-08 research and the developer's listening comparison
// (docs/original/formats/audio.md). The table is the only binding between SND entries and sound Asset IDs; P2-06 looks
// model-to-sample edges up here. Variant ordinals and model-clip numbers were assigned once and are frozen: they are
// never derived from entry IDs or slots, and a change of source entry keeps the ID.

const ROLES = 'docs/original/formats/audio.md#slice-sample-set-and-role-correspondences-p2-08';
const LISTENING = 'docs/original/formats/audio.md#listening-comparison-p2-0810';
const MODL = 'docs/original/formats/mesh.md#2-modl-structure-confirmed-on-all-19-entries';

/** One whole `MAIN/SR.NOB` SND entry as a confirmed declared mapping. */
function row(role: SoundRole, id: string, entry: number, evidence: readonly string[], unknowns: readonly string[] = []) {
  return {
    role,
    mapping: {
      asset: { id, kind: 'sound' },
      parts: [{ alternatives: [{ discPath: AUDIO_SOURCE_ARCHIVE, entry: { id: entry, type: 'SND' }, subresource: null }] }],
      confidence: 'confirmed',
      unknowns,
      evidence,
      resolution: 'declared',
    },
  };
}

const core = (role: SoundRole, id: string, entry: number) => row(role, id, entry, [LISTENING, ROLES]);
// Model-referenced samples of slots 0 and 3, whose meanings stay open (U-027); the ID does not express a slot.
const clip = (id: string, entry: number) => row('model-sound', id, entry, [ROLES, MODL], ['U-027']);

/** The slice's sound Assets, in ascending Asset ID order. */
export const PRODUCTION_SOUND_TABLE: readonly SoundTableRow[] = readSoundTable([
  // The longer blast after a destruction; which of the four plays varies between occurrences.
  core('explosion-sound', 'sound/explosion/blast-v1', 10_213),
  core('explosion-sound', 'sound/explosion/blast-v2', 10_215),
  core('explosion-sound', 'sound/explosion/blast-v3', 10_217),
  core('explosion-sound', 'sound/explosion/blast-v4', 10_219),
  // MODL slot 4 of every other slice model with sounds.
  core('explosion-sound', 'sound/explosion/other', 10_177),
  core('explosion-sound', 'sound/explosion/player', 10_175),
  core('fire-sound', 'sound/fire/base', 10_155),
  // The guns of the slice's two enemy types.
  core('fire-sound', 'sound/fire/enemy-v1', 10_179),
  core('fire-sound', 'sound/fire/enemy-v2', 10_037),
  core('fire-sound', 'sound/fire/player', 10_669),
  core('missile-sound', 'sound/missile', 10_647),
  clip('sound/model-clip/01', 10_679),
  clip('sound/model-clip/02', 11_023),
  clip('sound/model-clip/03', 10_319),
  clip('sound/model-clip/04', 11_071),
  clip('sound/model-clip/05', 10_665),
  clip('sound/model-clip/06', 10_035),
  // The Warp start plays this entry, a byte-identical twin of the missile's that only this Asset maps.
  core('warp-sound', 'sound/warp', 10_401),
], 'PRODUCTION_SOUND_TABLE');

/**
 * The SND interpretations research confirmed for the slice: mono samples, 8-bit unsigned or 16-bit signed little-endian,
 * and the two `flags` values the slice uses as Miles loop counts. Any other value, such as 8, is rejected.
 */
export const PRODUCTION_SND_RULES: SndFormatRules = Object.freeze({
  flags: Object.freeze([
    Object.freeze({ value: 0, channels: 1, loop: 'whole' }),
    Object.freeze({ value: 1, channels: 1, loop: 'none' }),
  ]),
  s16le: true,
});

/** SND entry → sound Asset ID: how model-to-sample edges name samples, so no other module names a sound ID. */
export const PRODUCTION_SOUND_REFERENCES: ReadonlyMap<number, AssetId> = new Map(PRODUCTION_SOUND_TABLE.map(({ mapping }) =>
  [archiveLocator(mapping.parts[0].alternatives[0]).entry.id, mapping.asset.id]));
