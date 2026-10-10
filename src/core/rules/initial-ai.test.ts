import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../contracts/domain-events.ts';
import type { MissionSetup } from '../mission/load-mission.ts';
import { EntityTable, type Entity } from '../world/entity-table.ts';
import type { RuntimeRecord, SpawnState } from '../world/spawn-state.ts';
import { entityInit, expectFault } from '../world/world.test-support.ts';
import { expectedWorld, float32OfRational } from './derivation.test-support.ts';
import { aiCandidates, initialAiState, RANDOM_TARGET_DISTANCE_SQUARED, type AiCandidates } from './initial-ai.ts';
import { scriptedRand } from './rand.test-support.ts';

// docs/original/formats/executable.md, instantiation step 10 and initial flight state (P3-06/05): `0x68050`. Kind bits
// used: 0 the player (side mask 0x6c87f, peers 0x6c07f), 1 the wingman (same side), 7 and 8 (side mask 0x93f80, peers
// 0x93f80), 13 (0x2000, never a random choice).

const FRAME = { sectors: 6 };
const ORIGIN: Vec3 = { x: 0, y: 0, z: 0 };
const ZERO = { x: 0, y: 0, z: 0 };

const at = (x: number, y = 0, z = 0): Vec3 => ({ x, y, z });
const mask = (...kindBits: number[]): number => kindBits.reduce((value, bit) => value | (1 << bit), 0) >>> 0;
const search = (kindBits: number[], declaration: number | null = null): AiCandidates => ({ mask: mask(...kindBits), declaration });

/** A table holding entities of [kind bit, position, source declaration] in allocation order; the first is returned too. */
function tableOf(...entities: [number, Vec3, number?][]): { readonly table: EntityTable; readonly all: Entity[] } {
  const table = new EntityTable();
  const all = entities.map(([kindBit, position, declaration]) =>
    table.allocate(entityInit(kindBit, { position, source: declaration === undefined ? null : { collection: 'mission', index: declaration, group: null } })));
  return { table, all };
}

describe('0x68050, fixed kinds and the world goal (P3-06 S-07, AC-07)', () => {
  it.each([[13, 5], [14, 5], [15, 1], [16, 1], [17, 1], [18, 1]])('gives kind bit %i only mode %i, without a search or a draw', (kindBit, mode) => {
    const { table, all } = tableOf([kindBit, ORIGIN], [0, at(10)]);
    const rand = scriptedRand([]);
    expect(initialAiState(table, all[0], search([0]), FRAME, rand)).toEqual({ mode, target: null, goal: ZERO, targetOffset: ZERO, objectTarget: null });
  });

  it('draws a whole-world goal point, x then y, in mode 4 when the record names no candidates', () => {
    const { table, all } = tableOf([0, ORIGIN], [7, at(10)]);
    const rand = scriptedRand([0, 32767]);
    expect(initialAiState(table, all[0], search([]), FRAME, rand)).toEqual({
      mode: 4, target: null, goal: { x: expectedWorld(6, 0), y: expectedWorld(6, 32767), z: 0 }, targetOffset: ZERO, objectTarget: null,
    });
    expect(rand.used).toBe(2);
  });

  it('draws the goal too when no entity is a candidate', () => {
    const { table, all } = tableOf([0, ORIGIN], [7, at(10)]);
    const rand = scriptedRand([5, 6]);
    expect(initialAiState(table, all[0], search([8]), FRAME, rand)).toMatchObject({ mode: 4, target: null, goal: { x: expectedWorld(6, 5), y: expectedWorld(6, 6), z: 0 } });
    expect(rand.used).toBe(2);
  });
});

describe('0x68050, the nearest candidate (P3-06 S-07, AC-07)', () => {
  it('targets the nearest of the same side in mode 2 without a draw, however far', () => {
    const { table, all } = tableOf([0, ORIGIN], [1, at(900_000)], [1, at(800_000)]);
    const rand = scriptedRand([]);
    expect(initialAiState(table, all[0], search([1]), FRAME, rand)).toEqual({ mode: 2, target: all[2].id, goal: ZERO, targetOffset: ZERO, objectTarget: null });
  });

  it('targets the nearest of the other side in mode 0 within three sectors, the distance included', () => {
    expect(RANDOM_TARGET_DISTANCE_SQUARED).toBe(float32OfRational(45_000n ** 2n, 1n, 'nearest'));
    expect(RANDOM_TARGET_DISTANCE_SQUARED).toBe(2_024_999_936);
    // 45000 apart scores f32(2,025,000,000), the limit itself, which is not farther.
    const { table, all } = tableOf([0, ORIGIN], [7, at(45_000)], [8, at(0, 60_000)]);
    expect(initialAiState(table, all[0], search([7, 8]), FRAME, scriptedRand([]))).toMatchObject({ mode: 0, target: all[1].id });
    // The other side's mask from a subject outside 0x6c87f: the player is of the other side for kind bit 7.
    const subject = tableOf([7, ORIGIN], [0, at(30)]);
    expect(initialAiState(subject.table, subject.all[0], search([0]), FRAME, scriptedRand([]))).toMatchObject({ mode: 0, target: subject.all[1].id });
  });

  it('counts the subject itself when its kind is in the mask', () => {
    const { table, all } = tableOf([7, at(5)], [7, at(6)]);
    expect(initialAiState(table, all[0], search([7]), FRAME, scriptedRand([]))).toMatchObject({ mode: 2, target: all[0].id });
  });

  it('keeps the earlier candidate in walk order on an equal f32 score', () => {
    // 4097² = 16,785,409 and 4096² + 64² + 64² = 16,785,408 both store as the f32 16,785,408: the nearer by the exact
    // distance loses to the earlier one in walk order (kind bit 7 before 8, then allocation order).
    const later = tableOf([0, ORIGIN], [8, at(4096, 64, 64)], [7, at(4097)]);
    expect(initialAiState(later.table, later.all[0], search([7, 8]), FRAME, scriptedRand([]))).toMatchObject({ target: later.all[2].id });
    const earlier = tableOf([0, ORIGIN], [7, at(4096, 64, 64)], [8, at(4097)]);
    expect(initialAiState(earlier.table, earlier.all[0], search([7, 8]), FRAME, scriptedRand([]))).toMatchObject({ target: earlier.all[1].id });
  });

  it('takes only the entities of the named declaration when there is one', () => {
    const { table, all } = tableOf([0, ORIGIN], [7, at(10), 3], [7, at(20), 4], [8, at(5), 4]);
    expect(initialAiState(table, all[0], search([7], 4), FRAME, scriptedRand([]))).toMatchObject({ target: all[2].id });
    // A wingman's source never matches a mission declaration.
    const wingman = new EntityTable();
    const player = wingman.allocate(entityInit(0, { position: ORIGIN }));
    wingman.allocate(entityInit(7, { position: at(10), source: { collection: 'wingman', index: 4, group: null } }));
    const rand = scriptedRand([1, 2]);
    expect(initialAiState(wingman, player, search([7], 4), FRAME, rand)).toMatchObject({ mode: 4, target: null });
    expect(rand.used).toBe(2);
  });

  it('faults on a squared distance beyond f32, as the original\'s overflow exception does', () => {
    const { table, all } = tableOf([0, ORIGIN], [7, at(3e38)]);
    expectFault(() => initialAiState(table, all[0], search([7]), FRAME, scriptedRand([])), 'invariant-violated', 'initial-ai.distance');
  });
});

describe('0x68050, a random candidate (P3-06 S-07, AC-07)', () => {
  // The nearest is of the other side and beyond three sectors: one draw picks candidate rand % n in walk order.
  const far = () => tableOf([0, ORIGIN], [7, at(50_000)], [8, at(60_000)], [7, at(70_000)], [1, at(80_000)], [13, at(90_000)]);

  it.each([
    // Walk order: kind bit 1, 7 (two), 8, 13; [rand, picked index in `all`, mode].
    [0, 4, 2], [5, 4, 2], [1, 1, 0], [2, 3, 0], [3, 2, 0],
  ])('draws %i and takes the matching candidate, with the mode of its side', (draw, picked, mode) => {
    const { table, all } = far();
    const rand = scriptedRand([draw]);
    expect(initialAiState(table, all[0], search([1, 7, 8, 13]), FRAME, rand)).toEqual({ mode, target: all[picked].id, goal: ZERO, targetOffset: ZERO, objectTarget: null });
    expect(rand.used).toBe(1);
  });

  it('falls back to the nearest when the draw picks kind 0x2000 or 0x4000', () => {
    const { table, all } = far();
    const rand = scriptedRand([4]);
    expect(initialAiState(table, all[0], search([1, 7, 8, 13]), FRAME, rand)).toMatchObject({ mode: 0, target: all[1].id });
    expect(rand.used).toBe(1);
  });

  it('draws just past the limit: the next f32 beyond 45000 scores above it', () => {
    const next = 45_000 + 2 ** -8;
    const { table, all } = tableOf([0, ORIGIN], [7, at(next)], [8, at(0, 50_000)]);
    const rand = scriptedRand([1]);
    expect(initialAiState(table, all[0], search([7, 8]), FRAME, rand)).toMatchObject({ mode: 0, target: all[2].id });
    expect(rand.used).toBe(1);
  });

  it('counts only the candidates of the named declaration for the draw', () => {
    const { table, all } = tableOf([0, ORIGIN], [7, at(50_000), 2], [7, at(60_000), 3], [7, at(70_000), 2]);
    expect(initialAiState(table, all[0], search([7], 2), FRAME, scriptedRand([3]))).toMatchObject({ target: all[3].id });
  });
});

describe('0x68018, the candidates a record names (P3-06 S-07)', () => {
  const record = (aiTarget: number | null, aiTargetCraftTypes: number[], spawnCount = 0) => ({ aiTarget, aiTargetCraftTypes, spawnCount }) as unknown as RuntimeRecord;
  const spawn = (...counts: number[]) => ({ records: counts.map((count) => record(null, [], count)) }) as unknown as SpawnState;
  const setup = (...kinds: (number | null)[]) => ({ declarations: kinds.map((craftType) => ({ craftType })) }) as unknown as MissionSetup;

  it('takes the AI target record\'s kind and objects once it has spawned, its kinds (+0x5C) before, and nothing for kind 0', () => {
    expect(aiCandidates(record(1, [0, 31]), spawn(0, 1), setup(0, 7))).toEqual({ mask: 0x80, declaration: 1 });
    expect(aiCandidates(record(1, [0, 31]), spawn(0, 0), setup(0, 7))).toEqual({ mask: 0x8000_0001, declaration: null });
    expect(aiCandidates(record(1, [3]), spawn(0, 2), setup(0, null))).toEqual({ mask: 0, declaration: 1 });
    expect(aiCandidates(record(null, []), spawn(), setup())).toEqual({ mask: 0, declaration: null });
  });
});
