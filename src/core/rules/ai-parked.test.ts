import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../contracts/domain-events.ts';
import { initialWorldState } from '../world/create-world.ts';
import { asCreateInput, craftInfoContent, playerOnlyMission, worldInput } from '../world/create-world.test-support.ts';
import type { AiMode, Entity, EntityId, EntityInit } from '../world/entity-table.ts';
import { entityInit } from '../world/world.test-support.ts';
import type { WorldState } from '../world/world-state.ts';
import {
  chooseCandidate, dropTransponderUnlessCovered, installParked, leaveOrder, searchTarget, updateParked, type ParkedCall, type ParkedController,
} from './ai-parked.ts';
import { installedController } from './ai-selection.ts';
import type { CraftEntity } from './combat-init.ts';
import { RandStream } from './original-random.ts';
import { randValues } from './rand.test-support.ts';

// The parked handler `0x62250` (docs/original/formats/executable.md, D1–D6; docs/plan/p3/02/spec.md, CR-23, CR-29).
// Expectations follow those records: the deadlines 0x40, 0x280, 0xC0, 0x3C0 and 0xF00, the final rand % 64, the kind
// table of D1, the search D2, the choice D3 (A2 is F(F(15000 × 3)²) with the f32 constant `0x1724a8` = 3.0), the drop
// D4 and the leave order D6 (1000 beyond the ±45000 edge of the 6 × 6 sector test world). Every craft record's +0x0C is
// 250 unless a test sets another.

const CLOCK = 1000;
/** F(F(15000 × 3)²): beyond it a best candidate gives way to a random pick. */
const THREE_SECTORS_SQUARED = 2_024_999_936;
const EDGE = 45_000 + 1000;

function worldOf(ranges: Readonly<Record<number, number>> = {}): WorldState {
  const info = craftInfoContent();
  for (const [kindBit, range] of Object.entries(ranges)) info.craft[Number(kindBit)].at0C = range;
  const state = initialWorldState(asCreateInput(worldInput({ mission: playerOnlyMission(), craftInfo: info })));
  state.clock = CLOCK;
  return state;
}

/** An f32 position. */
const at = (x: number, y = 0, z = 0): Vec3 => ({ x: Math.fround(x), y: Math.fround(y), z: Math.fround(z) });

/** A parked craft of `kindBit` at `position` with no AI target, then `flags` (the map visibility, Warp, destroyed flag). */
function add(state: WorldState, kindBit: number, position: Vec3, overrides: Partial<EntityInit> = {}, flags: Partial<Pick<Entity, 'mapVisible' | 'inWarp' | 'destroyed'>> = {}): CraftEntity {
  const entity = state.entities.allocate(entityInit(kindBit, { position, activity: 'parked', ...overrides })) as CraftEntity;
  Object.assign(entity.ai, { mode: 0, target: null, objectTarget: null });
  return Object.assign(entity, flags);
}

/** A parked controller for `subject` installed at CLOCK, as `0x5dc0c` and mode 0 leave it. */
const controllerFor = (state: WorldState, subject: CraftEntity): ParkedController =>
  installParked(installedController(state.ruleData.ai.tablePrograms[0], state.craftInfo.content.craft[subject.kindBit]), CLOCK);

interface Harness {
  readonly call: ParkedCall;
  readonly controller: ParkedController;
  /** What the call did, in order: `draw`, `depart`, `drop` and `consume`. */
  readonly log: string[];
  /** The rand values the world's RNG gives next, in draw order. */
  readonly values: (count: number) => number[];
}

function harness(state: WorldState, subject: CraftEntity, overrides: Partial<ParkedCall> = {}): Harness {
  const start = state.rngState;
  const stream = new RandStream(start);
  const log: string[] = [];
  const call: ParkedCall = {
    world: state,
    subject,
    rand: { next: () => (log.push('draw'), stream.next()) },
    depart: () => (log.push('depart'), false),
    dropTransponder: () => void log.push('drop'),
    ...overrides,
  };
  return { call, controller: controllerFor(state, subject), log, values: (count) => randValues(start, count) };
}

const setsOf = (state: WorldState, friendly: readonly EntityId[], hostile: readonly EntityId[]): void =>
  void (state.objectSets = Object.freeze({ friendly: Object.freeze([...friendly]), hostile: Object.freeze([...hostile]) }));

describe('modes 0 and 2 and the end of mode 1 (D1)', () => {
  it('installs with the deadline sample + 0x40 and keeps the rest of the common controller', () => {
    const state = worldOf();
    const common = installedController(state.ruleData.ai.tablePrograms[0], state.craftInfo.content.craft[7]);
    expect(installParked(common, CLOCK)).toEqual({ ...common, handler: 'parked', nextUpdateClock: CLOCK + 0x40 });
  });

  it.each([
    { kindBit: 13, mode: 5, delay: 0x40 },
    { kindBit: 14, mode: 5, delay: 0x40 },
    ...[15, 16, 17, 18].map((kindBit) => ({ kindBit, mode: 1, delay: 0xf00 })),
    // Kind 1 (the player's, kind bit 0) stands in for "any other": no kind with a program reaches it.
    { kindBit: 0, mode: 4, delay: 0x40 },
  ])('kind bit $kindBit takes mode $mode and the deadline sample + $delay + rand % 64, its only draw', ({ kindBit, mode, delay }) => {
    const state = worldOf();
    const subject = add(state, kindBit, at(0));
    const { call, controller, log, values } = harness(state, subject);
    updateParked(call, controller);
    expect(subject.ai.mode).toBe(mode);
    expect(controller.nextUpdateClock).toBe(CLOCK + delay + (values(1)[0] % 64));
    expect(log).toEqual(['draw']);
  });
});

describe('the formation members of kinds 0x80–0x200, 0x400, 0x1000, 0x80000 and 0x800 (D1, D2)', () => {
  it.each([7, 8, 9, 10, 12, 19])('kind bit %i: a follower takes mode 2 from m = 2 and 0 otherwise, without a search', (kindBit) => {
    for (const [m, mode] of [[2, 2], [0, 0], [4, 0], [5, 0]] as const) {
      const state = worldOf();
      const leader = add(state, kindBit, at(0));
      const follower = add(state, kindBit, at(250), { formation: { leader: leader.id, offset: at(250) } });
      follower.ai.mode = m;
      const { call, controller, log } = harness(state, follower);
      updateParked(call, controller);
      expect(follower.ai.mode, `m ${m}`).toBe(mode);
      expect(log).toEqual(['draw']);
    }
  });

  it('a hostile leader whose friendly set holds only the player, the wingman and Xpons takes the shortcut and the leave order', () => {
    const state = worldOf();
    const player = add(state, 0, at(0));
    const wingman = add(state, 1, at(100));
    const xpon = add(state, 14, at(200));
    const leader = add(state, 7, at(3000, -2000, 7));
    // The shortcut precedes the target checks: a valid AI target does not keep it.
    leader.ai.target = player.id;
    setsOf(state, [player.id, wingman.id, xpon.id], [leader.id]);
    const { call, controller, log, values } = harness(state, leader);
    updateParked(call, controller);
    // 0x62714 (mode 5, no +0x90, sample + 0x3C0), then the leave order (mode 4, x dominant, upper edge) and 0x5e6cc.
    expect(leader.ai).toMatchObject({ mode: 4, target: null, goal: { x: EDGE, y: -2000, z: 7 } });
    expect(controller.nextUpdateClock).toBe(CLOCK + 0x3c0 + (values(1)[0] % 64));
    expect(log).toEqual(['depart', 'draw']);
  });

  it('a leader keeps a valid AI target once the set holds another kind, and searches the friendly side without one', () => {
    const state = worldOf();
    const player = add(state, 0, at(0));
    const base = add(state, 17, at(600));
    const leader = add(state, 8, at(100));
    setsOf(state, [player.id, base.id], [leader.id]);
    leader.ai.target = base.id;
    let run = harness(state, leader);
    updateParked(run.call, run.controller);
    expect(leader.ai).toMatchObject({ mode: 0, target: base.id });
    expect(run.controller.nextUpdateClock).toBe(CLOCK + 0x40 + (run.values(1)[0] % 64));
    // Without one, the nearest member of the friendly side (mask 0x6c87f): the player at 100, not the base at 500.
    leader.ai.target = null;
    leader.ai.targetOffset = at(1, 2, 3);
    run = harness(state, leader);
    updateParked(run.call, run.controller);
    expect(leader.ai).toMatchObject({ mode: 0, target: player.id, targetOffset: { x: 0, y: 0, z: 0 } });
    expect(run.controller.nextUpdateClock).toBe(CLOCK + 0x280 + (run.values(1)[0] % 64));
    expect(run.log).toEqual(['draw']);
  });

  it('kinds 0x400, 0x1000 and 0x80000 search with the mask 0x887c, which leaves out the player and bases', () => {
    for (const kindBit of [10, 12, 19]) {
      const state = worldOf();
      const player = add(state, 0, at(10));
      const base = add(state, 17, at(20));
      const friendly = add(state, 2, at(900));
      const leader = add(state, kindBit, at(0));
      setsOf(state, [player.id, base.id, friendly.id], []);
      const { call, controller } = harness(state, leader);
      updateParked(call, controller);
      expect(leader.ai.target, `${kindBit}`).toBe(friendly.id);
    }
  });

  it('kind 0x800 searches the friendly side with p 0 unless m is 4, then leaves in mode 5', () => {
    const state = worldOf();
    const player = add(state, 0, at(10));
    const subject = add(state, 11, at(0));
    setsOf(state, [], []);
    subject.ai.mode = 4;
    let run = harness(state, subject);
    updateParked(run.call, run.controller);
    expect(subject.ai.mode).toBe(4);
    expect(run.log).toEqual(['draw']);
    subject.ai.mode = 0;
    run = harness(state, subject);
    updateParked(run.call, run.controller);
    // An empty set: 0x62714 with p 0 (mode 5), then the leave order.
    expect(subject.ai).toMatchObject({ mode: 4, target: null });
    expect(run.log).toEqual(['depart', 'draw']);
    setsOf(state, [player.id], []);
    subject.ai.mode = 0;
    run = harness(state, subject);
    updateParked(run.call, run.controller);
    expect(subject.ai).toMatchObject({ mode: 0, target: player.id });
  });
});

describe('the target search 0x62578 (D2)', () => {
  it('kinds 4–0x40 search the hostile set with p 4 into the object target, kept while it is valid', () => {
    const state = worldOf();
    const subject = add(state, 2, at(0));
    const near = add(state, 7, at(100));
    const far = add(state, 8, at(200));
    setsOf(state, [], [far.id, near.id]);
    let run = harness(state, subject);
    updateParked(run.call, run.controller);
    expect(subject.ai).toMatchObject({ mode: 4, objectTarget: near.id, target: null });
    expect(run.controller.nextUpdateClock).toBe(CLOCK + 0x280 + (run.values(1)[0] % 64));
    // Kept: the object target (p 4), and the AI target too (p ≠ 2).
    for (const keep of [{ objectTarget: far.id, target: null }, { objectTarget: null, target: far.id }]) {
      Object.assign(subject.ai, keep, { mode: 0 });
      run = harness(state, subject);
      updateParked(run.call, run.controller);
      expect(subject.ai).toMatchObject({ ...keep, mode: 0 });
      expect(run.controller.nextUpdateClock).toBe(CLOCK + 0x40 + (run.values(1)[0] % 64));
    }
  });

  it('an empty set clears the object target with mode 2 (p 2, 4) or the AI target with mode 5 (p 0)', () => {
    const state = worldOf();
    const subject = add(state, 2, at(0));
    const gone = add(state, 8, at(0));
    state.entities.remove(gone);
    for (const [p, mode, field] of [[2, 2, 'objectTarget'], [4, 2, 'objectTarget'], [0, 5, 'target']] as const) {
      Object.assign(subject.ai, { objectTarget: gone.id, target: gone.id, mode: 0 });
      const { call, controller } = harness(state, subject);
      searchTarget(call, controller, [], 0x6c87f, p);
      expect(subject.ai.mode, `p ${p}`).toBe(mode);
      expect(subject.ai[field]).toBeNull();
      expect(controller.nextUpdateClock).toBe(CLOCK + 0x3c0);
    }
  });

  it('without a choice the deadline is sample + 0xC0 for the wingman with p 2, otherwise + 0x3C0', () => {
    const state = worldOf();
    const wingman = add(state, 1, at(0));
    const hostile = add(state, 7, at(100));
    setsOf(state, [], [hostile.id]);
    // The wingman finds only map-visible hostiles.
    for (const [p, delay] of [[2, 0xc0], [0, 0x3c0]] as const) {
      const { call, controller } = harness(state, wingman);
      searchTarget(call, controller, state.objectSets.hostile, 0x93780, p);
      expect(controller.nextUpdateClock, `p ${p}`).toBe(CLOCK + delay);
      expect(wingman.ai).toMatchObject({ target: null, objectTarget: null, mode: 0 });
    }
  });
});

describe('the candidate choice 0x62760 (D3)', () => {
  it('takes the nearest valid member of the mask in set order, the earlier of two equal ones; stale IDs are passed over', () => {
    const state = worldOf();
    const subject = add(state, 7, at(0));
    const first = add(state, 17, at(0, 300));
    const tie = add(state, 17, at(300));
    const other = add(state, 8, at(10));
    const stale = add(state, 17, at(1));
    state.entities.remove(stale);
    const { call, log } = harness(state, subject);
    expect(chooseCandidate(call, [stale.id, other.id, first.id, tie.id], 1 << 17, 0)).toBe(first.id);
    expect(log).toEqual([]);
  });

  it('ranged kinds never take a candidate beyond their own range, nor a hostile an Xpon, nor the wingman kind 0x2000', () => {
    const state = worldOf({ 2: 100, 7: 100, 1: 100 });
    const ranged = add(state, 2, at(0));
    const hostile = add(state, 7, at(0));
    const wingman = add(state, 1, at(0));
    const shown = { mapVisible: true };
    const beyond = (kindBit: number) => add(state, kindBit, at(100.01), {}, shown);
    const pick = (subject: CraftEntity, ids: EntityId[]) => chooseCandidate(harness(state, subject).call, ids, 0xfffff, 0);
    // Excluded beyond the range: nothing, or a member inside it that scores more.
    for (const [subject, kindBit] of [[ranged, 7], [ranged, 13], [hostile, 14], [wingman, 13]] as const) {
      expect(pick(subject, [beyond(kindBit).id]), `${subject.kindBit} ${kindBit}`).toBeNull();
    }
    const inside = add(state, 17, at(-99.99), {}, shown);
    expect(pick(ranged, [beyond(7).id, inside.id])).toBe(inside.id);
    // Not excluded, beyond the range is taken; excluded ones inside it are too.
    for (const [subject, kindBit] of [[hostile, 13], [hostile, 7], [wingman, 14], [wingman, 7]] as const) {
      const member = beyond(kindBit);
      expect(pick(subject, [member.id]), `${subject.kindBit} ${kindBit}`).toBe(member.id);
    }
    const near = add(state, 14, at(99.99), {}, shown);
    expect(pick(hostile, [near.id])).toBe(near.id);
  });

  it('a kind-2 searcher counts only map-visible members; other searchers ignore the flag', () => {
    const state = worldOf();
    const wingman = add(state, 1, at(0));
    const hidden = add(state, 7, at(10));
    const shown = add(state, 7, at(20), {}, { mapVisible: true });
    expect(chooseCandidate(harness(state, wingman).call, [hidden.id, shown.id], 0x93780, 0)).toBe(shown.id);
    expect(chooseCandidate(harness(state, add(state, 2, at(0))).call, [hidden.id, shown.id], 0x93780, 4)).toBe(hidden.id);
  });

  it('with p 2 discards a best beyond the AI target\'s range, which an AI target that does not resolve leaves alone', () => {
    const state = worldOf({ 17: 50 });
    const wingman = add(state, 1, at(0));
    const hostile = add(state, 7, at(60), {}, { mapVisible: true });
    const base = add(state, 17, at(-500));
    wingman.ai.target = base.id;
    expect(chooseCandidate(harness(state, wingman).call, [hostile.id], 0x93780, 2)).toBeNull();
    hostile.position = at(49.99);
    expect(chooseCandidate(harness(state, wingman).call, [hostile.id], 0x93780, 2)).toBe(hostile.id);
    hostile.position = at(60);
    state.entities.remove(base);
    expect(chooseCandidate(harness(state, wingman).call, [hostile.id], 0x93780, 2)).toBe(hostile.id);
  });

  it('beyond three sectors one draw picks the (k + 1)-th member not of kinds 0x2000 or 0x4000, the last when fewer qualify', () => {
    const state = worldOf();
    // Kind 0x800 neither keeps within its range nor passes over Xpons.
    const subject = add(state, 11, at(0));
    const far = 45_001;
    const members = [add(state, 13, at(far)), add(state, 7, at(far + 1)), add(state, 14, at(far + 2)), add(state, 8, at(far + 3)), add(state, 7, at(far + 4))];
    const ids = members.map(({ id }) => id);
    // Five qualify for n; the pickable ones are members 1, 3 and 4.
    const { call, log, values } = harness(state, subject);
    const k = values(1)[0] % 5;
    expect(chooseCandidate(call, ids, 0xfffff, 4)).toBe([members[1], members[3], members[4]][Math.min(k, 2)].id);
    expect(log).toEqual(['draw']);
    // At exactly three sectors the best stays, without a draw.
    expect(Math.fround(45_000 * 45_000)).toBe(THREE_SECTORS_SQUARED);
    const close = add(state, 7, at(45_000));
    const again = harness(state, subject);
    expect(chooseCandidate(again.call, [close.id], 0xfffff, 0)).toBe(close.id);
    expect(again.log).toEqual([]);
    // p 2 never picks at random; none pickable gives none.
    const none = harness(state, subject);
    expect(chooseCandidate(none.call, [members[0].id, members[2].id], 0xfffff, 0)).toBeNull();
    expect(none.log).toEqual(['draw']);
  });

  it('counts a member its range excluded from the nearest, and the random pick may take it: range exclusions do not apply there', () => {
    const state = worldOf({ 2: 50_000 });
    const subject = add(state, 2, at(0));
    const within = add(state, 7, at(46_000));
    const beyond = add(state, 8, at(51_000));
    // The nearest is the member at 46000, past three sectors; k = 1 % n picks the second member only when n is 2.
    const { call } = harness(state, subject, { rand: { next: () => 1 } });
    expect(chooseCandidate(call, [within.id, beyond.id], 0xfffff, 4)).toBe(beyond.id);
    const alone = harness(state, subject, { rand: { next: () => 1 } });
    expect(chooseCandidate(alone.call, [beyond.id], 0xfffff, 4)).toBeNull();
  });

  it('a record naming preferred kinds draws rand % 100 and searches them when it is at most +0xE4 and one exists', () => {
    const state = worldOf();
    const subject = add(state, 7, at(0), { source: { collection: 'mission', index: 0, group: null } });
    const near = add(state, 2, at(10));
    const base = add(state, 17, at(500));
    const [record] = state.spawn.records;
    record.aiTarget = null;
    record.aiTargetCraftTypes = [17];
    const run = (threshold: number, ids: EntityId[]) => {
      subject.ruleInputs = { ...subject.ruleInputs, aiValueC: threshold };
      const { call, log } = harness(state, subject);
      return { chosen: chooseCandidate(call, ids, 0xfffff, 0), log };
    };
    const draw = harness(state, subject).values(1)[0] % 100;
    expect(run(draw, [near.id, base.id])).toEqual({ chosen: base.id, log: ['draw'] });
    expect(run(draw - 1, [near.id, base.id])).toEqual({ chosen: near.id, log: ['draw'] });
    // None of them exists: the caller's mask, the draw still taken.
    state.entities.remove(base);
    expect(run(draw, [near.id])).toEqual({ chosen: near.id, log: ['draw'] });
    // A target record that has instantiated: its kind, only objects from that record.
    record.aiTarget = 0;
    record.spawnCount = 1;
    const declared = add(state, 0, at(400), { source: { collection: 'mission', index: 0, group: null } });
    const undeclared = add(state, 0, at(20));
    expect(run(draw, [near.id, undeclared.id, declared.id])).toEqual({ chosen: declared.id, log: ['draw'] });
    // No record: no draw.
    const sourceless = add(state, 7, at(0));
    const { call, log } = harness(state, sourceless);
    expect(chooseCandidate(call, [near.id], 0xfffff, 0)).toBe(near.id);
    expect(log).toEqual([]);
  });
});

describe('the leave order 0x5e710 (D6)', () => {
  it.each([
    { position: at(3000.75, -2000, 5), goal: at(EDGE, -2000, 5) },
    { position: at(-3000, 2000), goal: at(-EDGE, 2000) },
    // A tie of the chopped magnitudes takes y; the side follows the coordinate's sign, −0 counting as upper.
    { position: at(100, -100.75), goal: at(100, -EDGE) },
    { position: at(0.25, -0.75), goal: at(0.25, -EDGE) },
    { position: at(0, -0), goal: at(0, EDGE) },
    { position: at(-7, 6.75), goal: at(-EDGE, 6.75) },
  ])('from $position.x, $position.y: mode 4, no AI target, the goal 1000 beyond the edge, then 0x5e6cc', ({ position, goal }) => {
    const state = worldOf();
    const subject = add(state, 7, position);
    subject.ai.target = add(state, 0, at(0)).id;
    const { call, log } = harness(state, subject);
    leaveOrder(call);
    expect(subject.ai).toMatchObject({ mode: 4 as AiMode, target: null, goal });
    expect(log).toEqual(['depart']);
  });
});

describe('the wingman\'s Xpon drop 0x62aa0 (D4)', () => {
  it('drops unless an object of kinds 0x6c000 covers the wingman strictly within its own 3-D range; never in Warp', () => {
    const state = worldOf({ 17: 300 });
    const wingman = add(state, 1, at(0));
    const xpon = add(state, 14, at(0, 0, 250));
    const drops = () => {
      const { call, log } = harness(state, wingman);
      dropTransponderUnlessCovered(call);
      return log;
    };
    expect(drops()).toEqual(['drop']);
    xpon.position = at(0, 0, 249.99);
    expect(drops()).toEqual([]);
    xpon.position = at(0, 0, 250);
    // No filter: a destroyed base covers too.
    const base = add(state, 17, at(0, 299.99), {}, { destroyed: true });
    expect(drops()).toEqual([]);
    base.position = at(0, 300);
    expect(drops()).toEqual(['drop']);
    wingman.inWarp = true;
    expect(drops()).toEqual([]);
  });
});

describe('the wingman\'s parked step (D1, CR-29)', () => {
  function wingmanScene() {
    const state = worldOf();
    const wingman = add(state, 1, at(0));
    const hostile = add(state, 7, at(100));
    const unseen = add(state, 8, at(5000));
    setsOf(state, [wingman.id], [unseen.id, hostile.id]);
    return { state, wingman, hostile, unseen };
  }

  it('drops, reveals and then searches the hostile set: its own reveal is what lets it see the hostile', () => {
    const { state, wingman, hostile, unseen } = wingmanScene();
    wingman.ai.mode = 0;
    const { call, controller, log, values } = harness(state, wingman);
    updateParked(call, controller);
    expect(log).toEqual(['drop', 'draw']);
    expect([wingman.mapVisible, hostile.mapVisible, unseen.mapVisible]).toEqual([true, true, false]);
    expect(wingman.ai).toMatchObject({ mode: 0, target: hostile.id });
    expect(controller.nextUpdateClock).toBe(CLOCK + 0x280 + (values(1)[0] % 64));
  });

  it('with m 2 searches with p 2 into the object target', () => {
    const { state, wingman, hostile } = wingmanScene();
    wingman.ai.mode = 2;
    const { call, controller } = harness(state, wingman);
    updateParked(call, controller);
    expect(wingman.ai).toMatchObject({ mode: 2, objectTarget: hostile.id, target: null });
  });

  it('skips the drop, the reveal and the search when a command changed the state and m was not 2 or 5', () => {
    for (const [m, skipped] of [[0, true], [4, true], [2, false], [5, false]] as const) {
      const { state, wingman, hostile } = wingmanScene();
      wingman.ai.mode = m;
      const run = harness(state, wingman, {
        consumeCommand: (call) => {
          run.log.push('consume');
          expect(call.subject).toBe(wingman);
          return true;
        },
      });
      updateParked(run.call, run.controller);
      expect(run.log, `m ${m}`).toEqual(skipped ? ['consume', 'draw'] : ['consume', 'drop', 'draw']);
      expect(hostile.mapVisible).toBe(!skipped);
    }
  });

  it('a consumer that changed nothing (r 0) lets the step run in full', () => {
    const { state, wingman, hostile } = wingmanScene();
    const run = harness(state, wingman, { consumeCommand: () => (run.log.push('consume'), false) });
    updateParked(run.call, run.controller);
    expect(run.log).toEqual(['consume', 'drop', 'draw']);
    expect(wingman.ai.target).toBe(hostile.id);
  });
});
