import { describe, expect, it } from 'vitest';
import { readCraftInfo } from '../../content/rule-data/craft-info.ts';
import { craft, gun, missile, mount, syntheticCraftInfo } from '../../content/rule-data/rule-data.test-support.ts';
import type { DomainEvent, HitEvent, Vec3 } from '../contracts/domain-events.ts';
import { readTickInput } from '../contracts/tick-input.ts';
import type { RngState } from '../determinism/rng.ts';
import { buildWeaponBlock, type CraftEntity } from '../rules/combat-init.ts';
import { randValues, rngStateAfter } from '../rules/rand.test-support.ts';
import { allocatorAiState, blankCraftCombat, ZERO_VECTOR, type AiMode, type Entity, type EntityInit } from '../world/entity-table.ts';
import type { WorldRuleData } from '../world/rule-data.ts';
import { entityInit, expectFault, stateText, testState, TEST_RULE_INPUTS, tickInput } from '../world/world.test-support.ts';
import type { WorldState } from '../world/world-state.ts';
import { applyContactDamage } from './damage.ts';
import { engageParked } from './parked-engagement.ts';
import { registerTick, type TickContext } from './pipeline.ts';

// docs/plan/p3/02/spec.md, CR-06 and CR-09; docs/original/formats/executable.md, E1–E6. Through the entry P3-06's parked
// update calls (its wiring is P3-07/22's). Every expectation is worked out by hand from the synthetic records below;
// rules/parked-engagement.test.ts covers the arithmetic and the draws' mappings.
//
// Records: gun 0 (cooldown +0x14 8, damage +0x1C 5, range 100) and gun 1 (32, 3, range 50); missile 0 (+0x5C 40, range
// 200) and missile 1 (+0x5C 70, range 80). Every craft record has collection radius +0x0C 300, shape radius 4 and the
// mounts gun 0, gun 1, missile 0 (2 rounds), missile 1 (1 round), in no list. The TABL 4003 scale is 0.75.
//
// At elapsed 640 and divisor 1, gun 0 fires 640 × 8 ÷ 64 = 80 shots (400) and gun 1 640 × 32 ÷ 64 = 320 shots (960):
// 1360 in all while d < 50, × 0.75 = 1020.

const CLOCK = 6400;
const ELAPSED = 640;
const SCALE = 0.75;
const GUNS_ONLY = 1360;
const at = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

function content() {
  const info = syntheticCraftInfo();
  info.hitDamageScale = SCALE;
  info.guns = [gun({ at14: 8, at1C: 5 }), gun({ at14: 32, at1C: 3 })];
  info.missiles = [missile({ body: 0, at5C: 40 }), missile({ body: 1, at5C: 70 })];
  const mounts = [mount({ weapon: 0 }), mount({ weapon: 1 }), mount({ at10: 1, weapon: 0, at0C: 2 }), mount({ at10: 1, weapon: 1, at0C: 1 })];
  info.craft = info.craft.map(() => craft({ at0C: 300, mounts }));
  return readCraftInfo(info);
}

interface Scene {
  readonly state: WorldState;
  readonly context: TickContext;
}

function scene(): Scene {
  const base = testState();
  const info = content();
  const template = base.ruleData.craft[0];
  if (template == null) throw new Error('no craft rule data');
  const ruleData = {
    ...base.ruleData,
    guns: [{ range: 100, rangeSquared: 10_000 }, { range: 50, rangeSquared: 2500 }],
    missiles: [{ range: 200, rangeSquared: 40_000, fuseRadiusSquared: 1 }, { range: 80, rangeSquared: 6400, fuseRadiusSquared: 1 }],
    craft: Array.from({ length: 20 }, () => ({ ...template, shape: { ...template.shape, radius: 4 } })),
  } as WorldRuleData;
  const state: WorldState = { ...base, craftInfo: { ...base.craftInfo, content: info }, ruleData };
  state.clock = CLOCK;
  return { state, context: registerTick(state, readTickInput(tickInput())) };
}

interface CraftOptions {
  readonly activity?: 'parked' | 'active';
  readonly shield?: number;
  readonly hull?: number;
  /** Self +0xE0: a missile is chosen only when it is at least 0. */
  readonly aiValueB?: number;
  readonly mode?: AiMode;
}

/** A craft of `kindBit` at `position`, parked unless asked otherwise, armed with its record's mounts, next energy clock 99. */
function craftAt(state: WorldState, kindBit: number, position: Vec3, options: CraftOptions = {}): CraftEntity {
  const { activity = 'parked', shield = 5000, hull = 1000, aiValueB = TEST_RULE_INPUTS.aiValueB, mode = 5 } = options;
  const init: Partial<EntityInit> = {
    activity,
    position,
    ruleInputs: { ...TEST_RULE_INPUTS, aiValueB },
    ai: { ...allocatorAiState(), mode },
    combat: { ...blankCraftCombat(), shield, hull, nextEnergyClock: 99, weapons: buildWeaponBlock(state.craftInfo.content.craft[kindBit]) },
  };
  const entity = state.entities.allocate(entityInit(kindBit, activity === 'parked' ? { ...init, movement: null } : init)) as CraftEntity;
  entity.state = 'active';
  return entity;
}

/** A parked shooter of `kindBit` at the origin in AI mode 0 aiming at `target`. */
function shooterAt(state: WorldState, kindBit: number, target: Entity | null, options: CraftOptions = {}): CraftEntity {
  const shooter = craftAt(state, kindBit, at(0, 0, 0), { mode: 0, ...options });
  shooter.ai.target = target?.id ?? null;
  return shooter;
}

/** Sets the world RNG to the first state from 0 whose next `count` rand values `accept` takes. */
function drawNext(state: WorldState, count: number, accept: (values: readonly number[]) => boolean): RngState {
  for (let candidate = 0; ; candidate++) {
    if (accept(randValues(candidate, count))) {
      state.rngState = candidate;
      return candidate;
    }
  }
}

const hits = (context: TickContext): HitEvent[] => context.events.filter((event): event is HitEvent => event.type === 'hit');
const shooterOf = (entity: Entity) => ({ type: 'shooter', entityId: entity.id, kindBit: entity.kindBit }) as const;
const ammunition = (entity: CraftEntity): number[] => entity.combat.weapons.mounts.map((state) => state.ammunition);

describe('the single-target engagement 0x30150 (E3, AC-11)', () => {
  it('fires the volley at the AI target, scaled, as a parked hit through 0x2a694, and sets both energy clocks', () => {
    const { state, context } = scene();
    const victim = craftAt(state, 2, at(30, 0, 0));
    const self = shooterAt(state, 7, victim);
    const ai = { ...self.ai };
    const rng = state.rngState;
    engageParked(context, self, ELAPSED);
    // d = (30 − 4) × 0.75 = 19.5; 1360 × 0.75 = 1020; kind 2 (0x4, in 0x87c) × 0.5 = 510, all taken by the shield.
    expect(context.events).toEqual([{
      type: 'hit', tick: 1, victimEntityId: victim.id, victimKindBit: 2, victimPosition: at(30, 0, 0), cause: 'parked', sourceEntityId: null,
      attacker: shooterOf(self), damage: 510, gated: false, shield: { before: 5000, after: 4490 }, hull: { before: 1000, after: 1000 },
      shieldWasEmpty: false, impact: null, projectile: null,
    } satisfies DomainEvent]);
    expect([self.combat.nextEnergyClock, victim.combat.nextEnergyClock]).toEqual([CLOCK, CLOCK]);
    // No class roll for kind 0x80, no missile with +0xE0 < 0, nothing drawn by a shield that takes it all.
    expect(state.rngState).toBe(rng);
    // No hit feedback, records or statistics, and the AI state is read only.
    expect([victim.combat.hitFeedbackClock, victim.combat.lastAttacker, self.combat.lastVictim]).toEqual([null, null, null]);
    expect(state.player.shots).toEqual({ projectilesFired: 0, projectileHits: 0, missilesFired: 0, missileHits: 0 });
    expect(self.ai).toEqual(ai);
    expect(ammunition(self)).toEqual([0, 0, 2, 1]);
  });

  it('still engages for an entity its parked travel has just put in pending removal (E1)', () => {
    const { state, context } = scene();
    const victim = craftAt(state, 2, at(30, 0, 0));
    const self = shooterAt(state, 7, victim);
    self.state = 'pending-removal';
    engageParked(context, self, ELAPSED);
    expect(hits(context).map(({ damage }) => damage)).toEqual([510]);
  });

  it('reads the AI target (+0x90) in mode 0, the object target (+0x8C) in modes 2 and 4, and nothing in mode 5', () => {
    for (const [mode, expected] of [[0, 'target'], [2, 'object-target'], [4, 'object-target'], [5, null]] as const) {
      const { state, context } = scene();
      const target = craftAt(state, 2, at(30, 0, 0));
      const objectTarget = craftAt(state, 3, at(0, 30, 0));
      const self = shooterAt(state, 7, target, { mode });
      self.ai.objectTarget = objectTarget.id;
      engageParked(context, self, ELAPSED);
      const victim = expected === 'target' ? target : expected === 'object-target' ? objectTarget : null;
      expect([mode, hits(context).map(({ victimEntityId }) => victimEntityId)]).toEqual([mode, victim === null ? [] : [victim.id]]);
      expect([mode, self.combat.nextEnergyClock]).toEqual([mode, victim === null ? 99 : CLOCK]);
    }
  });

  it('takes the target from a valid formation leader, but the distance and side from the self', () => {
    const { state, context } = scene();
    const victim = craftAt(state, 3, at(30, 0, 0));
    const decoy = craftAt(state, 4, at(0, 30, 0));
    // The leader (kind 2, the victim's side) is far away; the self is kind 0x80 at the origin.
    const leader = craftAt(state, 2, at(10_000, 0, 0), { mode: 0 });
    leader.ai.target = victim.id;
    const self = shooterAt(state, 7, decoy);
    self.formation = { leader: leader.id, offset: ZERO_VECTOR };
    engageParked(context, self, ELAPSED);
    // d = 19.5 from the self; kind 3 (in 0x87c) × 0.5 = 510.
    expect(hits(context).map(({ victimEntityId, damage }) => [victimEntityId, damage])).toEqual([[victim.id, 510]]);
    expect([self.combat.nextEnergyClock, victim.combat.nextEnergyClock, leader.combat.nextEnergyClock, decoy.combat.nextEnergyClock]).toEqual([CLOCK, CLOCK, 99, 99]);
  });

  it('ends without any change when the formation leader no longer resolves', () => {
    const { state, context } = scene();
    const victim = craftAt(state, 2, at(30, 0, 0));
    const leader = craftAt(state, 7, at(10, 0, 0), { mode: 0 });
    leader.ai.target = victim.id;
    const self = shooterAt(state, 7, victim);
    self.formation = { leader: leader.id, offset: ZERO_VECTOR };
    state.entities.remove(leader);
    const before = stateText(state);
    engageParked(context, self, ELAPSED);
    expect([stateText(state), context.events]).toEqual([before, []]);
  });

  it('changes nothing when a gate fails: no target, a removed one, hull at 0 or below, in Warp, or the same side', () => {
    const cases: [string, (state: WorldState) => Entity | null][] = [
      ['none', () => null],
      ['removed', (state) => {
        const target = craftAt(state, 2, at(30, 0, 0));
        state.entities.remove(target);
        return target;
      }],
      ['hull 0', (state) => craftAt(state, 2, at(30, 0, 0), { hull: 0 })],
      ['hull −1', (state) => craftAt(state, 2, at(30, 0, 0), { hull: -1 })],
      ['in Warp', (state) => {
        const target = craftAt(state, 2, at(30, 0, 0));
        target.inWarp = true;
        return target;
      }],
      ['same side', (state) => craftAt(state, 8, at(30, 0, 0))],
    ];
    for (const [name, targetOf] of cases) {
      const { state, context } = scene();
      const self = shooterAt(state, 7, targetOf(state), { aiValueB: 0 });
      const before = stateText(state);
      engageParked(context, self, ELAPSED);
      expect([name, stateText(state), context.events]).toEqual([name, before, []]);
    }
  });

  it('rolls for a rolling class before the leader and the gates: a failing gate leaves only that draw', () => {
    for (const [name, prepare] of [
      ['no target', () => {}],
      ['lost leader', (state: WorldState, self: CraftEntity) => {
        const leader = craftAt(state, 7, at(10, 0, 0), { mode: 0 });
        self.formation = { leader: leader.id, offset: ZERO_VECTOR };
        state.entities.remove(leader);
      }],
    ] as const) {
      const { state, context } = scene();
      // Kind 0x8000 rolls; 95 of rand % 100 engages.
      const self = shooterAt(state, 15, null, { aiValueB: 0 });
      prepare(state, self);
      const rng = drawNext(state, 1, ([roll]) => roll % 100 === 95);
      const before = stateText(state);
      engageParked(context, self, ELAPSED);
      expect([name, context.events, state.rngState]).toEqual([name, [], rngStateAfter(rng, 1)]);
      state.rngState = rng;
      expect([name, stateText(state)]).toEqual([name, before]);
    }
  });

  it('does not test the target\'s activity or state: an active or new target is engaged', () => {
    const { state, context } = scene();
    const active = craftAt(state, 2, at(30, 0, 0), { activity: 'active' });
    const fresh = craftAt(state, 3, at(0, 30, 0));
    fresh.state = 'new';
    engageParked(context, shooterAt(state, 7, active), ELAPSED);
    engageParked(context, shooterAt(state, 7, fresh), ELAPSED);
    expect(hits(context).map(({ victimEntityId, damage }) => [victimEntityId, damage])).toEqual([[active.id, 510], [fresh.id, 510]]);
    expect([active.destroyed, active.combat.hitFeedbackClock]).toEqual([false, null]);
  });

  it('deals nothing to a destroyed target with hull left, but spends the missile and sets both energy clocks', () => {
    const { state, context } = scene();
    const victim = craftAt(state, 2, at(30, 0, 0));
    victim.destroyed = true;
    const self = shooterAt(state, 7, victim, { aiValueB: 0 });
    const rng = drawNext(state, 1, ([choice]) => choice % 2 === 0);
    engageParked(context, self, ELAPSED);
    expect(context.events).toEqual([]);
    expect([victim.combat.shield, self.combat.nextEnergyClock, victim.combat.nextEnergyClock, ammunition(self)]).toEqual([5000, CLOCK, CLOCK, [0, 0, 1, 1]]);
    expect(state.rngState).toBe(rngStateAfter(rng, 1));
  });

  it('deals nothing and emits nothing when no weapon reaches, but still sets both energy clocks', () => {
    const { state, context } = scene();
    // d = (1000 − 4) × 0.75 = 747: beyond every range.
    const victim = craftAt(state, 2, at(1000, 0, 0));
    const self = shooterAt(state, 7, victim, { aiValueB: 0 });
    const rng = state.rngState;
    engageParked(context, self, ELAPSED);
    expect([context.events, self.combat.nextEnergyClock, victim.combat.nextEnergyClock, ammunition(self), state.rngState]).toEqual([[], CLOCK, CLOCK, [0, 0, 2, 1], rng]);
  });

  it('chooses a missile by rand % c, spends it, and against the wingman adds it only below 20 of rand % 100', () => {
    const cases = [
      // Mount 3 (missile 1, 70) and counted: (1360 + 70) × 0.75 = 1072, kind 1 × 0.9 = 964.
      { kindBit: 1, accept: ([choice, roll]: readonly number[]) => choice % 2 === 1 && roll % 100 < 20, draws: 2, damage: 964, rounds: [2, 0] },
      // Mount 2 (missile 0) spent but not counted: 1020 × 0.9 = 918.
      { kindBit: 1, accept: ([choice, roll]: readonly number[]) => choice % 2 === 0 && roll % 100 >= 20, draws: 2, damage: 918, rounds: [1, 1] },
      // Against kind 2 no second draw: (1360 + 70) × 0.75 = 1072, × 0.5 = 536.
      { kindBit: 2, accept: ([choice]: readonly number[]) => choice % 2 === 1, draws: 1, damage: 536, rounds: [2, 0] },
    ];
    for (const { kindBit, accept, draws, damage, rounds } of cases) {
      const { state, context } = scene();
      const victim = craftAt(state, kindBit, at(30, 0, 0));
      const self = shooterAt(state, 7, victim, { aiValueB: 0 });
      const rng = drawNext(state, draws, accept);
      engageParked(context, self, ELAPSED);
      expect([kindBit, hits(context).map((hit) => hit.damage), ammunition(self).slice(2), state.rngState]).toEqual([kindBit, [damage], rounds, rngStateAfter(rng, draws)]);
    }
  });

  it('rolls for the self\'s class first, then the missile, then the damage entry\'s draws; a parked victim it destroys is removed without exploding', () => {
    const { state, context } = scene();
    const victim = craftAt(state, 7, at(30, 0, 0), { shield: 0, hull: 100 });
    // Kind 0x8000 declines below 95 of rand % 100.
    const self = shooterAt(state, 15, victim, { aiValueB: 0 });
    const rng = drawNext(state, 3, ([roll, choice, field]) => roll % 100 >= 95 && choice % 2 === 1 && field % 9 === 4);
    engageParked(context, self, ELAPSED);
    // (1360 + 70) × 0.75 = 1072 to kind 0x80 (no factor); the hull goes below 0, so the damage roll succeeds without a
    // draw and the field is rand % 9 = 4.
    expect(state.rngState).toBe(rngStateAfter(rng, 3));
    expect(victim.combat.subsystems[4]).toBe(1);
    expect(context.events).toEqual([
      {
        type: 'hit', tick: 1, victimEntityId: victim.id, victimKindBit: 7, victimPosition: at(30, 0, 0), cause: 'parked', sourceEntityId: null,
        attacker: shooterOf(self), damage: 1072, gated: false, shield: { before: 0, after: 0 }, hull: { before: 100, after: -972 },
        shieldWasEmpty: true, impact: null, projectile: null,
      },
      {
        type: 'object-destroyed', tick: 1, entityId: victim.id, kindBit: 7, source: null, position: at(30, 0, 0), activity: 'parked',
        attacker: shooterOf(self), eventClass: 1, outcome: 'removed',
      },
    ] satisfies DomainEvent[]);
    expect([victim.destroyed, victim.state, state.entities.get(victim.id)]).toEqual([true, 'pending-removal', victim]);
    expect(state.player.kills[7]).toBe(0);
    expect([self.combat.nextEnergyClock, victim.combat.nextEnergyClock]).toEqual([CLOCK, CLOCK]);
  });

  it('stops after a declining class roll, with only that draw', () => {
    const { state, context } = scene();
    const victim = craftAt(state, 7, at(30, 0, 0));
    const self = shooterAt(state, 15, victim, { aiValueB: 0 });
    const rng = drawNext(state, 1, ([roll]) => roll % 100 === 94);
    const before = stateText(state);
    engageParked(context, self, ELAPSED);
    expect([context.events, state.rngState]).toEqual([[], rngStateAfter(rng, 1)]);
    state.rngState = rng;
    expect(stateText(state)).toBe(before);
  });

  it('wraps the gun sum in i32 at the longest elapsed time', () => {
    const { state, context } = scene();
    const victim = craftAt(state, 2, at(30, 0, 0));
    const self = shooterAt(state, 7, victim);
    const elapsed = 2 ** 32 - 1;
    // Gun 0: floor(elapsed × 8 ÷ 64) shots of 5; gun 1: floor(elapsed × 32 ÷ 64) shots of 3; the sum taken mod 2^32.
    const sum = BigInt.asIntN(32, (BigInt(elapsed) * 8n / 64n) * 5n + (BigInt(elapsed) * 32n / 64n) * 3n);
    expect(sum).toBe(536_870_904n);
    // × 0.75 and × 0.5 are exact floors here.
    const damage = Number((sum * 3n / 4n) / 2n);
    expect(damage).toBe(201_326_589);
    engageParked(context, self, elapsed);
    expect(hits(context).map((hit) => hit.damage)).toEqual([damage]);
  });

  it('applies the TABL 4003 scale on this path only', () => {
    const { state, context } = scene();
    const victim = craftAt(state, 7, at(30, 0, 0));
    // Kind 0x4000 engages without a roll.
    engageParked(context, shooterAt(state, 14, victim), ELAPSED);
    applyContactDamage(context, victim, GUNS_ONLY, 'collision');
    // Kind 0x80 has no kind factor: 1360 × 0.75 = 1020 here, 1360 unscaled by a collision.
    expect(hits(context).map(({ cause, damage }) => [cause, damage])).toEqual([['parked', 1020], ['collision', GUNS_ONLY]]);
  });
});

describe('the multi-target engagement 0x2ffec (E2, AC-11)', () => {
  it('collects the other side strictly inside f32(R²), whatever its activity, state, destruction or Warp, and engages each with divisor n', () => {
    const { state, context } = scene();
    const self = craftAt(state, 7, at(0, 0, 0), { mode: 1 });
    // Allocation order within each kind; the walk goes by kind bit: 1, 2, 3, 4, then 7, 8 and 14.
    const near = craftAt(state, 2, at(100, 0, 0));
    const edge = craftAt(state, 2, at(300, 0, 0));
    const active = craftAt(state, 1, at(0, 0, -20), { activity: 'active' });
    const sameSide = craftAt(state, 8, at(10, 0, 0));
    const destroyed = craftAt(state, 14, at(0, 100, 0), { hull: -5 });
    destroyed.destroyed = true;
    const warping = craftAt(state, 3, at(0, 50, 0));
    warping.inWarp = true;
    const fresh = craftAt(state, 4, at(0, 0, 10));
    fresh.state = 'new';
    engageParked(context, self, ELAPSED);
    // n = 5 (active, near, warping, fresh, destroyed): gun 0 80 ÷ 5 = 16 shots (80), gun 1 320 ÷ 5 = 64 shots (192).
    // active: d = 12, (80 + 192) × 0.75 = 204, × 0.9 = 183; near: d = 72, gun 0 only, 80 × 0.75 = 60, × 0.5 = 30;
    // fresh: d = 4.5, 204 × 0.5 = 102; the warping and destroyed ones fail the gates.
    expect(hits(context).map(({ victimEntityId, damage }) => [victimEntityId, damage])).toEqual([[active.id, 183], [near.id, 30], [fresh.id, 102]]);
    expect(self.ai.objectTarget).toBe(destroyed.id);
    const clocks = [self, near, edge, active, sameSide, destroyed, warping, fresh].map((entity) => entity.combat.nextEnergyClock);
    expect(clocks).toEqual([CLOCK, CLOCK, 99, CLOCK, 99, 99, 99, CLOCK]);
  });

  it('writes the object target before each engagement, so a self of kind 0x800 that collects itself ends on itself', () => {
    const { state, context } = scene();
    const self = craftAt(state, 11, at(0, 0, 0), { mode: 1 });
    const enemy = craftAt(state, 7, at(10, 0, 0));
    craftAt(state, 2, at(20, 0, 0));
    // Kind 0x800 declines below 90: both rolls decline, so only the writes remain.
    const rng = drawNext(state, 2, (values) => values.every((value) => value % 100 < 90));
    engageParked(context, self, ELAPSED);
    // Collected in walk order: the enemy (kind bit 7), then the self (kind bit 11); the kind-2 craft is its own side.
    expect([self.ai.objectTarget, state.rngState, context.events, enemy.combat.nextEnergyClock]).toEqual([self.id, rngStateAfter(rng, 2), [], 99]);
  });

  it('leaves the object target and everything else unchanged without a candidate', () => {
    const { state, context } = scene();
    const self = craftAt(state, 7, at(0, 0, 0), { mode: 1 });
    const kept = craftAt(state, 2, at(5000, 0, 0));
    self.ai.objectTarget = kept.id;
    craftAt(state, 8, at(10, 0, 0));
    const before = stateText(state);
    engageParked(context, self, ELAPSED);
    expect([stateText(state), context.events, self.ai.objectTarget]).toEqual([before, [], kept.id]);
  });

  it('with a formation leader engages the leader\'s target n times', () => {
    const { state, context } = scene();
    const target = craftAt(state, 2, at(30, 0, 0));
    const second = craftAt(state, 2, at(50, 0, 0));
    const third = craftAt(state, 2, at(60, 0, 0));
    const leader = craftAt(state, 7, at(5000, 0, 0), { mode: 0 });
    leader.ai.target = target.id;
    const self = craftAt(state, 7, at(0, 0, 0), { mode: 1 });
    self.formation = { leader: leader.id, offset: ZERO_VECTOR };
    engageParked(context, self, ELAPSED);
    // n = 3: gun 0 80 ÷ 3 = 26 shots (130), gun 1 320 ÷ 3 = 106 shots (318); 448 × 0.75 = 336, × 0.5 = 168 each time.
    expect(hits(context).map(({ victimEntityId, damage }) => [victimEntityId, damage])).toEqual([[target.id, 168], [target.id, 168], [target.id, 168]]);
    expect([self.ai.objectTarget, second.combat.nextEnergyClock, third.combat.nextEnergyClock, target.combat.shield]).toEqual([third.id, 99, 99, 5000 - 3 * 168]);
  });

  it('interleaves each candidate\'s draws with its damage entry\'s, in collection order', () => {
    const { state, context } = scene();
    const self = craftAt(state, 15, at(0, 0, 0), { mode: 1, aiValueB: 0 });
    const first = craftAt(state, 7, at(30, 0, 0), { shield: 0, hull: 100 });
    const second = craftAt(state, 8, at(0, 40, 0), { shield: 0, hull: 100 });
    // Per candidate: the class roll (≥ 95 engages), the missile choice, the damage entry's field (rand % 9; a hull below
    // 0 needs no damage draw). The first takes mount 3, so the second has only mount 2 (c = 1, still one draw).
    const rng = drawNext(state, 6, ([roll1, choice1, field1, roll2, , field2]) =>
      roll1 % 100 >= 95 && choice1 % 2 === 1 && field1 % 9 === 2 && roll2 % 100 >= 95 && field2 % 9 === 6);
    engageParked(context, self, ELAPSED);
    // Divisor 2: gun 0 40 shots (200), gun 1 160 shots (480). First: (680 + 70) × 0.75 = 562; second: (680 + 40) × 0.75 = 540.
    expect(hits(context).map(({ victimEntityId, damage }) => [victimEntityId, damage])).toEqual([[first.id, 562], [second.id, 540]]);
    expect(context.events.map(({ type }) => type)).toEqual(['hit', 'object-destroyed', 'hit', 'object-destroyed']);
    expect([first.combat.subsystems[2], second.combat.subsystems[6], ammunition(self).slice(2)]).toEqual([1, 1, [1, 0]]);
    expect(state.rngState).toBe(rngStateAfter(rng, 6));
    expect([first.state, second.state, self.ai.objectTarget]).toEqual(['pending-removal', 'pending-removal', second.id]);
  });
});

describe('the entry (E1, E5, CR-09)', () => {
  it('faults on an elapsed time of 2^32 or more, changing nothing, and accepts 2^32 − 1', () => {
    const { state, context } = scene();
    const victim = craftAt(state, 2, at(30, 0, 0));
    const self = shooterAt(state, 7, victim);
    const before = stateText(state);
    expectFault(() => engageParked(context, self, 2 ** 32), 'budget-exhausted', 'parked-engagement.elapsed');
    expectFault(() => engageParked(context, self, -1), 'invariant-violated', 'parked-engagement.elapsed');
    expectFault(() => engageParked(context, self, 0.5), 'invariant-violated', 'parked-engagement.elapsed');
    expect([stateText(state), context.events]).toEqual([before, []]);
    engageParked(context, self, 2 ** 32 - 1);
    expect(hits(context)).toHaveLength(1);
  });

  it('faults for an entity or a target that is not a craft', () => {
    const { state, context } = scene();
    const projectile = state.entities.allocate(entityInit(21));
    expectFault(() => engageParked(context, projectile, ELAPSED), 'invariant-violated', 'parked-engagement.self');
    const self = shooterAt(state, 7, projectile);
    expectFault(() => engageParked(context, self, ELAPSED), 'invariant-violated', 'parked-engagement.target');
  });
});
