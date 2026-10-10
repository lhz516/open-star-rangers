import { describe, expect, it } from 'vitest';
import { compareText } from '../../content/contract-validation.ts';
import { readSoundPayload } from '../../content/sound-payload.ts';
import { archiveLocator, readSourceMappingTable } from '../source-mapping.ts';
import { buildImfat, syntheticSnd, type SyntheticEntry } from '../synthetic.test-support.ts';
import { convertAudioGroup, readSoundTable, type SoundTableRow } from './audio-conversion.ts';
import { countedVerifiedSource } from './conversion.test-support.ts';
import { PRODUCTION_FLIGHT_SOUND_TABLE } from './production-flight-sounds.ts';
import { PRODUCTION_SND_RULES, PRODUCTION_SOUND_TABLE } from './production-sounds.ts';
import { productionSoundEntries } from './production-sounds.test-support.ts';

const BY_ID_EVIDENCE = 'docs/original/formats/audio.md#sounds-played-by-id-and-hud-sounds-p3-0110';

const entryOf = ({ mapping }: SoundTableRow) => archiveLocator(mapping.parts[0].alternatives[0]).entry.id;
const locatorOf = ({ mapping }: SoundTableRow) =>
  mapping.parts.flatMap(({ alternatives }) => alternatives.map(archiveLocator).map(({ discPath, entry, subresource }) => `${discPath}#${entry.type}:${entry.id}/${subresource ?? ''}`));

/**
 * Code-generated SND blocks at the flight table's entries: widths and lengths vary by row, and `flags` alternates
 * between the production loop (0) and play-once (1) values independently of the role, so a payload's loop can only
 * come from its block.
 */
const flightEntries = (): SyntheticEntry[] => PRODUCTION_FLIGHT_SOUND_TABLE.map((row, index) => {
  const id = entryOf(row);
  const bitsPerSample = index % 2 === 0 ? 8 : 16;
  const samples = Array.from({ length: (bitsPerSample / 8) * (2 + (index % 3)) }, (_, at) => (index * 29 + at * 11) & 0xff);
  return { id, type: 'SND', ...syntheticSnd({ samples, bitsPerSample, flags: index % 3 === 0 ? 0 : 1 }) };
});
const flagsOf = ({ data }: SyntheticEntry) => new DataView(data.buffer, data.byteOffset).getUint32(16, true);

const disc = (entries: SyntheticEntry[]) => ({ 'MAIN/SR.NOB': buildImfat(10_000, [...entries].sort((left, right) => left.id - right.id)) });
const FLIGHT_IDS = new Set(PRODUCTION_FLIGHT_SOUND_TABLE.map(({ mapping }) => mapping.asset.id));
/** The production table without the flight rows: the 18 P2-08 sounds as they were before P3-03. */
const P2_08_TABLE = PRODUCTION_SOUND_TABLE.filter(({ mapping }) => !FLIGHT_IDS.has(mapping.asset.id));

describe('production flight sound table', () => {
  it('maps the eight sounds played by ID and the three HUD sounds, each to one whole SND entry', () => {
    expect(PRODUCTION_FLIGHT_SOUND_TABLE.map(row => [row.role, row.mapping.asset.id, ...locatorOf(row)])).toEqual([
      ['event-sound', 'sound/event/base-execute-key', 'MAIN/SR.NOB#SND:10169/'],
      ['event-sound', 'sound/event/base-select-key', 'MAIN/SR.NOB#SND:10167/'],
      ['event-sound', 'sound/event/key-command', 'MAIN/SR.NOB#SND:10485/'],
      ['event-sound', 'sound/event/map-destination', 'MAIN/SR.NOB#SND:10463/'],
      ['event-sound', 'sound/event/target-select', 'MAIN/SR.NOB#SND:11087/'],
      ['event-sound', 'sound/event/transponder-created', 'MAIN/SR.NOB#SND:10055/'],
      ['event-sound', 'sound/event/warp-arrival', 'MAIN/SR.NOB#SND:10181/'],
      ['event-sound', 'sound/event/weapon-select', 'MAIN/SR.NOB#SND:11381/'],
      ['hud-sound', 'sound/hud/instrument-9-loop', 'MAIN/SR.NOB#SND:10409/'],
      ['hud-sound', 'sound/hud/overlay-loop', 'MAIN/SR.NOB#SND:10455/'],
      ['hud-sound', 'sound/hud/overlay-pulse', 'MAIN/SR.NOB#SND:10457/'],
    ]);
    expect(Object.isFrozen(PRODUCTION_FLIGHT_SOUND_TABLE) && PRODUCTION_FLIGHT_SOUND_TABLE.every(Object.isFrozen)).toBe(true);
  });

  it('declares the event sounds confirmed, 10055 with its reachability open, and the HUD sounds likely, under U-004', () => {
    expect(PRODUCTION_FLIGHT_SOUND_TABLE.map(({ mapping: { asset, confidence, unknowns } }) => [asset.id, confidence, unknowns])).toEqual([
      ['sound/event/base-execute-key', 'confirmed', []],
      ['sound/event/base-select-key', 'confirmed', []],
      ['sound/event/key-command', 'confirmed', []],
      ['sound/event/map-destination', 'confirmed', []],
      ['sound/event/target-select', 'confirmed', []],
      ['sound/event/transponder-created', 'confirmed', ['U-004']],
      ['sound/event/warp-arrival', 'confirmed', []],
      ['sound/event/weapon-select', 'confirmed', []],
      ['sound/hud/instrument-9-loop', 'likely', ['U-004']],
      ['sound/hud/overlay-loop', 'likely', ['U-004']],
      ['sound/hud/overlay-pulse', 'likely', ['U-004']],
    ]);
    for (const { mapping } of PRODUCTION_FLIGHT_SOUND_TABLE) {
      expect([mapping.evidence, mapping.resolution]).toEqual([[BY_ID_EVIDENCE], 'declared']);
      // No entry number or file name in an ID.
      expect(mapping.asset.id).not.toMatch(/\d{4}/);
    }
    // The mapping projection is a valid P2-01 table on its own.
    expect(readSourceMappingTable({ sourceFingerprint: null, mappings: PRODUCTION_FLIGHT_SOUND_TABLE.map(({ mapping }) => mapping) }).mappings)
      .toHaveLength(PRODUCTION_FLIGHT_SOUND_TABLE.length);
  });

  it('joins the production sound table as one table in Asset ID order, sharing no SND entry with the P2-08 sounds', () => {
    expect(P2_08_TABLE).toHaveLength(18);
    expect(PRODUCTION_SOUND_TABLE).toHaveLength(29);
    expect(PRODUCTION_SOUND_TABLE.filter(({ mapping }) => FLIGHT_IDS.has(mapping.asset.id))).toEqual(PRODUCTION_FLIGHT_SOUND_TABLE);
    const ids = PRODUCTION_SOUND_TABLE.map(({ mapping }) => mapping.asset.id);
    expect(ids).toEqual([...ids].sort(compareText));
    expect(new Set(PRODUCTION_SOUND_TABLE.map(entryOf)).size).toBe(PRODUCTION_SOUND_TABLE.length);
    expect(readSoundTable(PRODUCTION_SOUND_TABLE, 'merged')).toEqual(PRODUCTION_SOUND_TABLE);
  });

  it('converts code-generated SND blocks into 11 sound Assets with their roles, looping only by the P2-08 flags rule', async () => {
    const entries = flightEntries();
    const { source, reads } = await countedVerifiedSource(disc(entries));
    const draft = await convertAudioGroup(source, PRODUCTION_FLIGHT_SOUND_TABLE, PRODUCTION_SND_RULES);
    expect(draft.assets.map(({ id, kind, role, group, dependencies }) => [id, kind, role, group, dependencies]))
      .toEqual(PRODUCTION_FLIGHT_SOUND_TABLE.map(({ role, mapping }) => [mapping.asset.id, 'sound', role, 'audio', []]));
    expect(draft.sources).toEqual({
      sourceFingerprint: source.identity.fingerprint,
      states: PRODUCTION_FLIGHT_SOUND_TABLE.map(({ mapping: { asset, unknowns } }) => ({ id: asset.id, state: 'verified', unknowns })),
    });
    // Each payload carries its own synthetic block's samples and loop, whatever the role or name says.
    draft.payloads.forEach(({ id, bytes }, index) => {
      const entry = entries[index];
      const { loop, encoding } = readSoundPayload(bytes);
      expect([id, loop, encoding]).toEqual([draft.assets[index].id, flagsOf(entry) === 0 ? 'whole' : 'none', index % 2 === 0 ? 'u8' : 's16le']);
    });
    expect([...reads.keys()].sort()).toEqual(entries.map(({ id }) => id).sort());
  });

  it('leaves the 18 P2-08 sound Assets unchanged in ID, role and payload bytes when the merged table converts', async () => {
    const { source } = await countedVerifiedSource(disc(productionSoundEntries()));
    const [alone, together] = await Promise.all([P2_08_TABLE, PRODUCTION_SOUND_TABLE].map(table => convertAudioGroup(source, table, PRODUCTION_SND_RULES)));
    expect(together.assets).toHaveLength(29);
    const existing = new Set(alone.assets.map(({ id }) => id));
    expect(together.assets.filter(({ id }) => existing.has(id))).toEqual(alone.assets);
    expect(together.payloads.filter(({ id }) => existing.has(id))).toEqual(alone.payloads);
    expect(together.assets.filter(({ id }) => !existing.has(id)).map(({ id, role }) => [id, role]))
      .toEqual(PRODUCTION_FLIGHT_SOUND_TABLE.map(({ role, mapping }) => [mapping.asset.id, role]));
  });
});
