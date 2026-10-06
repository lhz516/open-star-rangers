import type { MissionDeclaration } from '../../content/logic/logic-content.ts';
import { CLASSIC_P2_SLICE, type SliceCandidate } from '../../content/slice-definition.ts';
import type { ArchiveEntryRead } from '../archive/archive-reader.ts';
import type { DiscPath } from '../disc/disc-path.ts';
import { SourceError } from '../source-error.ts';
import { readObjectRecord, RECORD_BYTES } from './object-record.ts';
import { PayloadBlock } from './payload-block.ts';

// Directed parsing of the SCCT campaign table (docs/original/formats/scenario.md §4): only the candidate slot's SCEN
// entry ID and the wingman records are read; music IDs and group names are not.

/** Structural limits of the SCCT entry (P2-09 spec, 限值与预算). */
export const CAMPAIGN_LIMITS = Object.freeze({ entryBytes: 262_144, groups: 8, slots: 64, wingmen: 16 });

const HEADER_BYTES = 16;
const GROUP_BYTES = 8;
const SLOT_BYTES = 12;

export interface ParsedCampaignTable {
  /** The SCEN entry ID of the candidate slot. */
  readonly scenarioEntryId: number;
  /** The selectable wingman records as roster options. */
  readonly wingmen: readonly MissionDeclaration[];
}

/** Parses the SCCT entry `read` of `archive` for `candidate`; a group or slot outside the table is `subresource-mismatch`. */
export function parseCampaignTable(archive: DiscPath, read: ArchiveEntryRead, candidate: SliceCandidate = CLASSIC_P2_SLICE.candidate): ParsedCampaignTable {
  const block = new PayloadBlock(archive, read, CAMPAIGN_LIMITS.entryBytes);
  const groups = block.array(0x00, GROUP_BYTES, CAMPAIGN_LIMITS.groups, '/groups', HEADER_BYTES);
  const wingmen = block.array(0x08, RECORD_BYTES, CAMPAIGN_LIMITS.wingmen, '/wingmen', HEADER_BYTES);
  // Every group's slot list header is checked; only the candidate slot is read.
  const slotLists = Array.from({ length: groups.count }, (_, index) =>
    block.array(groups.start + index * GROUP_BYTES, SLOT_BYTES, CAMPAIGN_LIMITS.slots, `/groups[${index}]/slots`, HEADER_BYTES));
  const { campaignGroup: group, campaignSlot: slot } = candidate;
  const groupPath = `/groups[${group}]`;
  if (group >= groups.count) throw new SourceError('subresource-mismatch', block.at(groupPath), 'the campaign group is not in the table');
  const slots = slotLists[group];
  const slotPath = `${groupPath}/slots[${slot}]`;
  if (slot >= slots.count) throw new SourceError('subresource-mismatch', block.at(slotPath), 'the campaign slot is not in the group');
  const scenarioEntryId = block.u32(slots.start + slot * SLOT_BYTES, `${slotPath}/scenario`);

  return Object.freeze({
    scenarioEntryId,
    wingmen: Object.freeze(Array.from({ length: wingmen.count }, (_, index): MissionDeclaration => {
      const path = `/wingmen[${index}]`;
      const record = readObjectRecord(block, wingmen.start + index * RECORD_BYTES, path);
      // SCCT has no sections to point into, and the original does not rescale its records.
      for (const [field, value] of Object.entries(record.links)) {
        if (value !== null) block.unsupported(`${path}/${field}`, 'a wingman record references mission structures');
      }
      const { x, y, z } = record.position;
      if (x !== 0 || y !== 0 || z !== 0) block.unsupported(`${path}/position`, 'a wingman record has a position');
      if (record.gridSpacing !== 0) block.unsupported(`${path}/gridSpacing`, 'a wingman record has a grid spacing');
      return Object.freeze({
        index,
        origins: Object.freeze(['wingman-option' as const]),
        craftType: record.craftType,
        nameCandidates: record.nameCandidates,
        position: record.position,
        spawnTime: record.spawnTime,
        gridSpacing: 0,
        placement: Object.freeze({ region: null, anchor: null }),
        memberOf: null,
        aiTarget: null,
        ruleInputs: record.ruleInputs,
        aiTargetCraftTypes: record.aiTargetCraftTypes,
      });
    })),
  });
}
