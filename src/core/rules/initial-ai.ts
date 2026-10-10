/**
 * The initial AI state `0x68050` (docs/original/formats/executable.md, instantiation step 10 and initial flight state,
 * P3-06/05; docs/plan/p3/06/spec.md, 实例化扩展 step 3, moved from P3-08 by checkpoint A). Instantiation runs it on the
 * new entity, which is already in its kind's list; the AI programs that change the state afterwards belong to P3-08.
 *
 * Kinds 0x2000 and 0x4000 only get mode 5, kinds 0x8000–0x40000 only mode 1. Every other kind, the player included,
 * searches the candidates its source record names (`0x68018`) for the nearest entity, whatever its state or activity
 * and including itself; a nearest of the other side farther than three sectors gives way to a random candidate (one
 * draw). A target sets mode 2 (same side) or 0 (other side). Without one the goal is a whole-world default point (two
 * draws) in mode 4: the content contract rejects the record path +0x4C, the original's only other goal route. One call
 * therefore draws 0–2 times here, depending on the record and the entities present.
 */
import type { Vec3 } from '../contracts/domain-events.ts';
import { CoreFaultError } from '../errors.ts';
import type { MissionSetup } from '../mission/load-mission.ts';
import { allocatorAiState, type AiMode, type AiState, type Entity, type EntityTable } from '../world/entity-table.ts';
import type { RuntimeRecord, SpawnState } from '../world/spawn-state.ts';
import { RUNTIME_SCALE, type WorldFrame } from './coordinates.ts';
import type { RandSource } from './original-random.ts';
import { worldDefaultPoint } from './placement.ts';

/** The candidates `0x68018` takes from the subject's source record. */
export interface AiCandidates {
  /** A uint32 kind mask; 0 skips the search. */
  readonly mask: number;
  /** When not null, only entities instantiated from this mission declaration are candidates. */
  readonly declaration: number | null;
}

/**
 * `0x68018` for a subject instantiated from `record`: while the record's AI target record (+0x58) has instantiated an
 * object as a section-1 record, the entities of that record's kind instantiated from it; otherwise every entity of the
 * record's AI target kinds (+0x5C). An empty mask (a kind-0 target record or no kinds) skips the search.
 */
export function aiCandidates(record: RuntimeRecord, { records }: SpawnState, { declarations }: MissionSetup): AiCandidates {
  const { aiTarget } = record;
  if (aiTarget !== null && records[aiTarget].spawnCount > 0) {
    const { craftType } = declarations[aiTarget];
    return { mask: craftType === null ? 0 : 2 ** craftType, declaration: aiTarget };
  }
  return { mask: record.aiTargetCraftTypes.reduce((mask, kindBit) => (mask | (1 << kindBit)) >>> 0, 0), declaration: null };
}

/** The kinds that get only a mode, by kind bit. */
const FIXED_MODES: ReadonlyMap<number, AiMode> = new Map([[13, 5], [14, 5], [15, 1], [16, 1], [17, 1], [18, 1]]);

/** Subjects of these kinds count candidates with a bit of FIRST_SIDE_PEERS as their side, the others SECOND_SIDE_PEERS. */
const FIRST_SIDE = 0x6c87f;
const FIRST_SIDE_PEERS = 0x6c07f;
const SECOND_SIDE_PEERS = 0x93f80;
/** A randomly chosen candidate of these kinds (0x2000, 0x4000) gives way to the nearest. */
const NEVER_RANDOM = 0x6000;

/**
 * The f32 squared distance beyond which a nearest candidate of the other side gives way to a random one:
 * f32(f32(runtime scale × 3)²). The square 2,025,000,000 lies halfway between two f32 values and rounds to the even
 * one, 2,024,999,936.
 */
export const RANDOM_TARGET_DISTANCE_SQUARED = Math.fround(Math.fround(RUNTIME_SCALE * 3) ** 2);

/** The kind value of a kind bit, for a bitwise test against a mask below 2^31. */
const kindOf = (kindBit: number): number => 2 ** kindBit;

function isSameSide(subjectKindBit: number, candidateKindBit: number): boolean {
  const peers = (kindOf(subjectKindBit) & FIRST_SIDE) !== 0 ? FIRST_SIDE_PEERS : SECOND_SIDE_PEERS;
  return (kindOf(candidateKindBit) & peers) !== 0;
}

/**
 * The search's f32 squared distance: f32(dy·f32(dy) + dz·f32(dz) + dx·f32(dx)), each difference (candidate − subject),
 * product and sum in double precision, in that order. An f32 overflow is a fault, as the original's unmasked overflow
 * exception is.
 */
function squaredDistance(subject: Vec3, candidate: Vec3): number {
  const dx = candidate.x - subject.x;
  const dy = candidate.y - subject.y;
  const dz = candidate.z - subject.z;
  const score = Math.fround(dy * Math.fround(dy) + dz * Math.fround(dz) + dx * Math.fround(dx));
  if (!Number.isFinite(score)) throw new CoreFaultError('invariant-violated', 'initial-ai.distance');
  return score;
}

/**
 * `0x68050` for `subject`, drawing from `rand` as the module comment says; see there. Like the original it walks the
 * candidates twice: once for the count n and the first candidate in walk order with the smallest score, and only for a
 * random choice once more, to the (rand % n)-th.
 */
export function initialAiState(entities: EntityTable, subject: Entity, { mask, declaration }: AiCandidates, frame: WorldFrame, rand: RandSource): AiState {
  const ai = allocatorAiState();
  const fixedMode = FIXED_MODES.get(subject.kindBit);
  if (fixedMode !== undefined) return { ...ai, mode: fixedMode };
  if (mask !== 0) {
    const isCandidate = ({ source }: Entity): boolean => declaration === null || (source?.collection === 'mission' && source.index === declaration);
    let count = 0;
    let nearest: Entity | null = null;
    let best = 0;
    for (const candidate of entities.walk(mask)) {
      if (!isCandidate(candidate)) continue;
      count++;
      const score = squaredDistance(subject.position, candidate.position);
      if (nearest === null || score < best) [nearest, best] = [candidate, score];
    }
    let choice = nearest;
    if (nearest !== null && !isSameSide(subject.kindBit, nearest.kindBit) && best > RANDOM_TARGET_DISTANCE_SQUARED) {
      let skip = rand.next() % count;
      let picked = nearest;
      for (const candidate of entities.walk(mask)) {
        if (!isCandidate(candidate) || skip-- > 0) continue;
        picked = candidate;
        break;
      }
      choice = (kindOf(picked.kindBit) & NEVER_RANDOM) !== 0 ? nearest : picked;
    }
    if (choice !== null) {
      ai.target = choice.id;
      ai.mode = isSameSide(subject.kindBit, choice.kindBit) ? 2 : 0;
    }
  }
  if (ai.target === null) {
    ai.goal = worldDefaultPoint(frame, rand);
    ai.mode = 4;
  }
  return ai;
}
