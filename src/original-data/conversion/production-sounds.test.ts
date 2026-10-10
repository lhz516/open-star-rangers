import { describe, expect, it } from 'vitest';
import { readSoundPayload } from '../../content/sound-payload.ts';
import { convertSnd } from '../formats/snd.ts';
import { archiveLocator, readSourceMappingTable } from '../source-mapping.ts';
import { syntheticSnd } from '../synthetic.test-support.ts';
import { AUDIO_BUDGET_LIMITS, convertAudioGroup } from './audio-conversion.ts';
import { countedVerifiedSource, expectSourceError } from './conversion.test-support.ts';
import { productionGraphicsFiles } from './production-graphics.test-support.ts';
import { PRODUCTION_SND_RULES, PRODUCTION_SOUND_TABLE } from './production-sounds.ts';
import { PRODUCTION_SOUND_USAGE, productionSoundEntries } from './production-sounds.test-support.ts';

const AT = 'sources.mappings[0].parts[0].alternatives[0]';
const block = (bitsPerSample: number, flags: number) => {
  const { data, relocations } = syntheticSnd({ samples: [1, 2, 3, 4], bitsPerSample, flags });
  return { bytes: data, relocations };
};
const locatorOf = ({ mapping }: (typeof PRODUCTION_SOUND_TABLE)[number]) =>
  mapping.parts.flatMap(({ alternatives }) => alternatives.map(archiveLocator).map(({ discPath, entry, subresource }) => `${discPath}#${entry.type}:${entry.id}/${subresource ?? ''}`));

/** The P2-08 rows: every row but the P3-03 event and HUD sounds, which production-flight-sounds.test.ts checks. */
const P2_08_ROWS = PRODUCTION_SOUND_TABLE.filter(({ role }) => role !== 'event-sound' && role !== 'hud-sound');

describe('production sound table', () => {
  it('maps every variant of the four core roles and the other model clips, each to one whole SND entry', () => {
    expect(P2_08_ROWS.map(row => [row.role, row.mapping.asset.id, ...locatorOf(row)])).toEqual([
      ['explosion-sound', 'sound/explosion/blast-v1', 'MAIN/SR.NOB#SND:10213/'],
      ['explosion-sound', 'sound/explosion/blast-v2', 'MAIN/SR.NOB#SND:10215/'],
      ['explosion-sound', 'sound/explosion/blast-v3', 'MAIN/SR.NOB#SND:10217/'],
      ['explosion-sound', 'sound/explosion/blast-v4', 'MAIN/SR.NOB#SND:10219/'],
      ['explosion-sound', 'sound/explosion/other', 'MAIN/SR.NOB#SND:10177/'],
      ['explosion-sound', 'sound/explosion/player', 'MAIN/SR.NOB#SND:10175/'],
      ['fire-sound', 'sound/fire/base', 'MAIN/SR.NOB#SND:10155/'],
      ['fire-sound', 'sound/fire/enemy-v1', 'MAIN/SR.NOB#SND:10179/'],
      ['fire-sound', 'sound/fire/enemy-v2', 'MAIN/SR.NOB#SND:10037/'],
      ['fire-sound', 'sound/fire/player', 'MAIN/SR.NOB#SND:10669/'],
      ['missile-sound', 'sound/missile', 'MAIN/SR.NOB#SND:10647/'],
      ['model-sound', 'sound/model-clip/01', 'MAIN/SR.NOB#SND:10679/'],
      ['model-sound', 'sound/model-clip/02', 'MAIN/SR.NOB#SND:11023/'],
      ['model-sound', 'sound/model-clip/03', 'MAIN/SR.NOB#SND:10319/'],
      ['model-sound', 'sound/model-clip/04', 'MAIN/SR.NOB#SND:11071/'],
      ['model-sound', 'sound/model-clip/05', 'MAIN/SR.NOB#SND:10665/'],
      ['model-sound', 'sound/model-clip/06', 'MAIN/SR.NOB#SND:10035/'],
      ['warp-sound', 'sound/warp', 'MAIN/SR.NOB#SND:10401/'],
    ]);
    expect(Object.isFrozen(PRODUCTION_SOUND_TABLE)).toBe(true);
  });

  it('declares every row confirmed from docs/original, with U-027 on the clips whose slot meaning is open', () => {
    for (const { role, mapping } of P2_08_ROWS) {
      const { asset, confidence, unknowns, evidence, resolution } = mapping;
      expect([confidence, resolution]).toEqual(['confirmed', 'declared']);
      // Core roles rest on the listening comparison and the role research; clips on the role research and the MODL slots.
      expect({ unknowns, evidence }).toEqual(role === 'model-sound'
        ? { unknowns: ['U-027'], evidence: [ROLE_EVIDENCE, MODL_EVIDENCE] }
        : { unknowns: [], evidence: [LISTENING_EVIDENCE, ROLE_EVIDENCE] });
      // No entry number, slot or file name in an ID.
      expect(asset.id).not.toMatch(/\d{4}/);
    }
    // The mapping projection is a valid P2-01 table on its own.
    expect(readSourceMappingTable({ sourceFingerprint: null, mappings: PRODUCTION_SOUND_TABLE.map(({ mapping }) => mapping) }).mappings)
      .toHaveLength(PRODUCTION_SOUND_TABLE.length);
  });

  it('converts within the audio limits on a disc holding synthetic samples at the mapped entries', async () => {
    const { source, reads } = await countedVerifiedSource(productionGraphicsFiles({}, productionSoundEntries()));
    const draft = await convertAudioGroup(source, PRODUCTION_SOUND_TABLE, PRODUCTION_SND_RULES);
    expect(draft.assets.map(({ id, role }) => [id, role])).toEqual(PRODUCTION_SOUND_TABLE.map(({ role, mapping }) => [mapping.asset.id, role]));
    expect(draft.sources.states.every(({ state }) => state === 'verified')).toBe(true);
    expect(draft.usage).toEqual(PRODUCTION_SOUND_USAGE);
    expect(PRODUCTION_SOUND_USAGE.assets).toBeLessThanOrEqual(AUDIO_BUDGET_LIMITS.assets);
    // Of the P2-08 sounds only the three slot-0 engine clips loop; every other one, slot-3 clips included, plays once.
    // The two P3-03 loop sounds loop by their made-up flags.
    expect(draft.payloads.filter(({ bytes }) => readSoundPayload(bytes).loop === 'whole').map(({ id }) => id))
      .toEqual(['sound/hud/instrument-9-loop', 'sound/hud/overlay-loop', 'sound/model-clip/01', 'sound/model-clip/02', 'sound/model-clip/03']);
    // Mapping verification and conversion share one read of each entry.
    expect([...reads.values()].every(count => count === 1)).toBe(true);
    expect(reads.size).toBe(PRODUCTION_SOUND_TABLE.length);
  });
});

describe('production SND rules', () => {
  it('accept the slice flags 0 and 1 as mono loop counts, and 16-bit samples as signed little-endian', () => {
    expect(PRODUCTION_SND_RULES).toEqual({
      flags: [{ value: 0, channels: 1, loop: 'whole' }, { value: 1, channels: 1, loop: 'none' }],
      s16le: true,
    });
    expect(Object.isFrozen(PRODUCTION_SND_RULES) && Object.isFrozen(PRODUCTION_SND_RULES.flags)).toBe(true);
    expect(readSoundPayload(convertSnd(block(16, 0), PRODUCTION_SND_RULES, AT).payload)).toMatchObject({ encoding: 's16le', channels: 1, loop: 'whole' });
    expect(readSoundPayload(convertSnd(block(8, 1), PRODUCTION_SND_RULES, AT).payload)).toMatchObject({ encoding: 'u8', channels: 1, loop: 'none' });
  });

  it.each([2, 8])('reject the unstudied flags value %i rather than guessing its meaning', flags => {
    expectSourceError(() => convertSnd(block(8, flags), PRODUCTION_SND_RULES, AT), 'unsupported-payload', `${AT}.flags`);
  });
});

const LISTENING_EVIDENCE = 'docs/original/formats/audio.md#listening-comparison-p2-0810';
const ROLE_EVIDENCE = 'docs/original/formats/audio.md#slice-sample-set-and-role-correspondences-p2-08';
const MODL_EVIDENCE = 'docs/original/formats/mesh.md#2-modl-structure-confirmed-on-all-19-entries';
