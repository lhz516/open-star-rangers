/**
 * The craft info input of world creation (docs/plan/p3/06/spec.md, D-01; docs/plan/p3/02/spec.md, P3-06 的契约修订):
 * `{ id, content }`, the `data/craft-info` Asset of the package the logic Assets came from, which the caller decoded
 * with the same package's `decodeRuleDataPayload`. Core reads the content again with `readCraftInfo` into frozen data
 * isolated from the input and keeps it, with its ID, as the world's read-only rule content; setupHash binds both.
 *
 * Errors: missing or extra fields are CoreInputError (readExactRecord); a malformed Asset ID or content keeps the
 * content readers' ContentContractError; a wrong kind, a production ID mismatch and every semantic failure are
 * CoreInputError at a structural path with a fixed reason, never an imported value.
 */
import { readAssetId, type AssetId } from '../../content/asset-id.ts';
import type { ContentIdentity } from '../../content/content-identity.ts';
import { readCraftInfo, type CraftInfo, type CraftRecord } from '../../content/rule-data/craft-info.ts';
import { CLOCK_UNITS_PER_SECOND } from '../contracts/time.ts';
import { readExactRecord } from '../contracts/validation.ts';
import { CoreInputError } from '../errors.ts';
import type { MissionSetup } from '../mission/load-mission.ts';
import { ALLOCATION_LEVELS, ENERGY_SCALE } from '../rules/flight-state.ts';
import { toInt32 } from '../rules/record-defaults.ts';
import { PLAYER_KIND_BIT, postsRequests, WINGMAN_KIND_BIT } from '../rules/spawn-schedule.ts';
import { MISSION_PATH, ROSTER_PATH } from './setup-check.ts';
import type { SpawnState } from './spawn-state.ts';

/** The world's read-only rule content: the craft info as read, with its Asset ID. */
export interface WorldCraftInfo {
  readonly id: AssetId;
  readonly content: CraftInfo;
}

/** The craft info Asset of the slice (P3-03); `original-import` content uses no other. */
export const PRODUCTION_CRAFT_INFO = 'data/craft-info';

const PATH = 'input.craftInfo';
const CONTENT_PATH = `${PATH}.content`;

const isInt32 = (value: number): boolean => toInt32(value) === value;

/** Reads the craft info input of content of `identity` into the world's frozen copy; see the module comment. */
export function readCraftInfoInput(value: unknown, identity: ContentIdentity): WorldCraftInfo {
  const input = readExactRecord(value, PATH, ['id', 'content']);
  const id = readAssetId(input.id, `${PATH}.id`);
  if (!id.startsWith('data/')) throw new CoreInputError(`${PATH}.id`, 'must be a data Asset ID');
  if (identity.origin.type === 'original-import' && id !== PRODUCTION_CRAFT_INFO) {
    throw new CoreInputError(`${PATH}.id`, 'must be the production craft info Asset for original-import content');
  }
  return Object.freeze({ id, content: readCraftInfo(input.content, CONTENT_PATH) });
}

/**
 * Every kind the run can instantiate, with the path of the first declaration that names it, in firing order: those of
 * the queue entries that post requests (postsRequests). A record entry instantiates its record's kind, a group entry its
 * members' and the wingman entry kind bit 1.
 */
function instantiableKinds(setup: MissionSetup, spawn: SpawnState): Map<number, string> {
  const kinds = new Map<number, string>();
  const add = (kindBit: number | null, path: string): void => {
    if (kindBit !== null && !kinds.has(kindBit)) kinds.set(kindBit, path);
  };
  const declarationPath = (index: number): string => `${MISSION_PATH}.declarations[${index}].craftType`;
  for (const entry of spawn.queue) {
    if (!postsRequests(spawn, setup, entry)) continue;
    const { source, index } = entry;
    if (source === 'record') add(setup.declarations[index].craftType, declarationPath(index));
    else if (source === 'wingman') add(WINGMAN_KIND_BIT, `${ROSTER_PATH}.options[${index}].craftType`);
    else for (const member of setup.groups[index].members) add(setup.declarations[member].craftType, declarationPath(member));
  }
  return kinds;
}

/**
 * The record fields P3-06 reads for every instantiable kind. Its f32 fields are finite already (readCraftInfo), and a
 * zero takes the original's branch (docs/original/formats/executable.md, P3-06), except +0x0C: the parked travel takes
 * its truncation as the modulus of a random length, and any instantiable craft can be the target.
 */
function checkRecord(record: CraftRecord, path: string): void {
  if (Math.trunc(record.at0C) <= 0) throw new CoreInputError(`${path}.at0C`, 'must be at least 1 once truncated, as the parked travel takes it as a modulus');
  // The parked Warp converts +0xA8 and +0xA8 + +0xA4 seconds to clock units by a shift, in i32.
  if (!isInt32(record.atA8 * CLOCK_UNITS_PER_SECOND)) throw new CoreInputError(`${path}.atA8`, 'overflows i32 in clock units');
  if (!isInt32((record.atA8 + record.atA4) * CLOCK_UNITS_PER_SECOND)) throw new CoreInputError(`${path}.atA4`, 'overflows i32 in clock units together with atA8');
}

/**
 * The player's energy branch of the maximum speed (`0x3060c`, `0x30e0c`) at every pair of allocation levels P3-07 can
 * reach: the threshold chop(+0xB8) × +0x88 ÷ 1000, the energy +0x58 − (+0x64[l1] + +0x78[l2]) and the energy × 1000
 * divided by +0x88 are i32 arithmetic and must not overflow. The quotient then fits, and its f32 conversion and the
 * damage factors keep the maximum finite.
 */
function checkPlayerEnergy(record: CraftRecord, path: string): void {
  if (record.at88 === 0) throw new CoreInputError(`${path}.at88`, 'must not be 0, as it divides the energy-limited maximum speed');
  const chopped = Math.trunc(record.atB8);
  if (!isInt32(chopped) || !isInt32(chopped * record.at88)) throw new CoreInputError(path, 'makes the energy threshold overflow i32');
  for (const shield of ALLOCATION_LEVELS) {
    for (const gun of ALLOCATION_LEVELS) {
      const allocated = record.at64[shield] + record.at78[gun];
      // The scaled energy fits only if the energy itself does.
      if (!isInt32(allocated) || !isInt32((record.at58 - allocated) * ENERGY_SCALE)) {
        throw new CoreInputError(path, 'makes the energy arithmetic overflow i32 at some allocation levels');
      }
    }
  }
}

/** The exclusive bound of the player's +0xA4: the Warp interval's `SHL 6` stays in i32 below it. */
const WARP_INTERVAL_LIMIT = 2 ** 25;

/**
 * The player craft's Warp fields (docs/plan/p3/02/spec.md, MW-01 check 4; docs/original/formats/executable.md, Warp
 * cost and Warp start): only the record kind bit 0 is bound to, the only one the original's Warp paths reach. The cost
 * walks at least one pair (with none the original reads the word before the array); +0xA8 divides the progress through
 * the transit length and +0xB8 the progress itself; +0xA4 × 64 stays in i32 (a negative value's u32 wrap is not
 * reproduced). f × +0xA8 ≤ 1, a Warp that completes in its start tick, is the original's branch and is kept; the cost's
 * `IMUL` wraps in i32 and is not rejected.
 */
export function checkPlayerWarp(info: CraftInfo): void {
  const path = `${CONTENT_PATH}.craft[${PLAYER_KIND_BIT}]`;
  const record = info.craft[PLAYER_KIND_BIT];
  if (record.pairs.length === 0) throw new CoreInputError(`${path}.pairs`, 'must have a pair for the player, as the Warp cost walks them');
  if (!(record.atA8 > 0)) throw new CoreInputError(`${path}.atA8`, 'must be positive for the player, as the Warp progress divides by the transit length');
  if (!(record.atB8 > 0)) throw new CoreInputError(`${path}.atB8`, 'must be positive for the player, as the Warp progress divides by it');
  if (record.atA4 < 0 || record.atA4 >= WARP_INTERVAL_LIMIT) {
    throw new CoreInputError(`${path}.atA4`, 'must be from 0 to below 2^25 for the player, so that the Warp interval stays in i32 clock units');
  }
}

/**
 * The semantic checks of the craft info for `setup` and the spawn state built from it (docs/plan/p3/06/spec.md, D-01):
 * every instantiable kind has a craft record (the content has one per kind bit 0–19), and its record and the player's
 * energy branch keep P3-06's rules defined. They reject only data that would make a rule fail.
 */
export function checkCraftInfo(info: CraftInfo, setup: MissionSetup, spawn: SpawnState): void {
  const kinds = instantiableKinds(setup, spawn);
  for (const [kindBit, path] of kinds) {
    if (kindBit >= info.craft.length) throw new CoreInputError(path, 'is a kind without a craft record in the craft info');
  }
  for (const kindBit of [...kinds.keys()].sort((left, right) => left - right)) checkRecord(info.craft[kindBit], `${CONTENT_PATH}.craft[${kindBit}]`);
  checkPlayerEnergy(info.craft[PLAYER_KIND_BIT], `${CONTENT_PATH}.craft[${PLAYER_KIND_BIT}]`);
}
