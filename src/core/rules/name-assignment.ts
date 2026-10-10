/**
 * Name assignment at instantiation, `0x67d44` (docs/original/formats/executable.md#names-p3-0203; Q-05). The record
 * chooses, in this order:
 * 1. kinds in 0x6001 (bits 0, 13, 14): the craft type name;
 * 2. a record with candidates: the first candidate, in list order, whose text no entity of the check mask holds (mask
 *    0x68000 for kinds in 0x78000, otherwise 0x87c), every entity still in its kind list counting whatever its state;
 *    when all are held, a random candidate (rand % count, a duplicate) if the name pool is not empty, otherwise none;
 * 3. no candidates: the craft type name for kinds in 0x93780; none for kinds in 0x78000; the craft type name when the
 *    pool is empty; otherwise the pool, from rand % pool count the first name whose use counter is 0, cycling
 *    forward, its counter then incremented. When none is 0, every counter is reset and the starting name taken.
 *
 * Holding compares texts, as the original's `strcmp` does, so a candidate is also held by an equal pool name or
 * another record's equal candidate, and becomes free once its holder leaves the table; pool counters never decrease on
 * removal. The craft type name's text is CINF data that the logic Assets do not hold (P3-03 imports it): Core gives
 * only the structural reference. No entity a check mask covers can hold one, since world creation rejects the kinds
 * of 0x87c and kinds in 0x68000 never take a craft type name.
 */
import type { MissionSetup } from '../mission/load-mission.ts';
import { CoreFaultError } from '../errors.ts';
import type { DeclarationReference, EntityTable, NameReference } from '../world/entity-table.ts';
import type { RandSource } from './original-random.ts';

const CRAFT_TYPE_NAMED = 0x6001;
const NAMED_BY_TYPE = 0x93780;
const UNNAMED_WITHOUT_CANDIDATES = 0x78000;
const BASE_CHECK_MASK = 0x68000;
const DEFAULT_CHECK_MASK = 0x87c;

const inMask = (mask: number, kindBit: number): boolean => ((mask >>> kindBit) & 1) === 1;

/** The record an entity is being named from. */
export interface NamedRecord {
  readonly declaration: DeclarationReference;
  readonly kindBit: number;
}

const NONE: NameReference = Object.freeze({ type: 'none' });

function candidatesOf(setup: MissionSetup, { collection, index }: DeclarationReference): readonly string[] {
  return (collection === 'mission' ? setup.declarations : setup.wingmanOptions)[index].nameCandidates;
}

/** The text a name reference stands for; an unnamed entity's is empty, as the allocator leaves it. */
function nameText(setup: MissionSetup, name: NameReference): string {
  switch (name.type) {
    case 'none':
      return '';
    case 'candidate':
      return candidatesOf(setup, name.declaration)[name.candidate];
    case 'pool':
      return setup.namePool[name.index];
    case 'craft-type':
      throw new CoreFaultError('invariant-violated', 'names.craft-type-text');
  }
}

function heldTexts(setup: MissionSetup, entities: EntityTable, mask: number): Set<string> {
  const held = new Set<string>();
  for (const entity of entities.walk(mask)) held.add(nameText(setup, entity.name));
  return held;
}

function candidateName(declaration: DeclarationReference, candidate: number): NameReference {
  return Object.freeze({ type: 'candidate', declaration: Object.freeze({ ...declaration }), candidate });
}

function poolName(uses: number[], rand: RandSource): NameReference {
  const start = rand.next() % uses.length;
  for (let step = 0; step < uses.length; step++) {
    const index = (start + step) % uses.length;
    if (uses[index] === 0) {
      uses[index] = 1;
      return Object.freeze({ type: 'pool', index });
    }
  }
  uses.fill(0);
  uses[start] = 1;
  return Object.freeze({ type: 'pool', index: start });
}

/**
 * The name of an entity about to be instantiated from `record`, given the entities in the table now. Updates the pool
 * counters `poolUses` and draws from `rand` only in the random-candidate and pool branches, once each.
 */
export function assignName(setup: MissionSetup, entities: EntityTable, poolUses: number[], record: NamedRecord, rand: RandSource): NameReference {
  const { declaration, kindBit } = record;
  const craftType: NameReference = Object.freeze({ type: 'craft-type', kindBit });
  if (inMask(CRAFT_TYPE_NAMED, kindBit)) return craftType;
  const candidates = candidatesOf(setup, declaration);
  if (candidates.length > 0) {
    const held = heldTexts(setup, entities, inMask(UNNAMED_WITHOUT_CANDIDATES, kindBit) ? BASE_CHECK_MASK : DEFAULT_CHECK_MASK);
    const free = candidates.findIndex((text) => !held.has(text));
    if (free !== -1) return candidateName(declaration, free);
    return setup.namePool.length > 0 ? candidateName(declaration, rand.next() % candidates.length) : NONE;
  }
  if (inMask(NAMED_BY_TYPE, kindBit)) return craftType;
  if (inMask(UNNAMED_WITHOUT_CANDIDATES, kindBit)) return NONE;
  if (setup.namePool.length === 0) return craftType;
  return poolName(poolUses, rand);
}
