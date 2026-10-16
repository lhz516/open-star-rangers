import { describe, expect, it } from 'vitest';
import { isWingmanCommandReply } from '../contracts/domain-events.ts';
import type { Request } from '../systems/pipeline.ts';
import { initialWorldState } from '../world/create-world.ts';
import { asCreateInput, declaration, missionFrame, craftInfoContent, worldInput } from '../world/create-world.test-support.ts';
import { ALL_KINDS, type Entity, type Matrix3, type SteeredMovementBlock } from '../world/entity-table.ts';
import { constructWorld } from '../world/world.ts';
import { thrownBy, tickInput } from '../world/world.test-support.ts';
import type { WorldState } from '../world/world-state.ts';
import { consumeActiveCommand, consumeParkedCommand, statusLine, type CommandConsumption } from './ai-commands.ts';
import type { ParkedCall } from './ai-parked.ts';
import { installedController } from './ai-selection.ts';
import { installWingman, type WingmanCall, type WingmanController } from './ai-wingman.ts';
import type { CraftEntity } from './combat-init.ts';
import { scriptedRand } from './rand.test-support.ts';

// P3-08/20 (docs/plan/p3/08/spec.md, 僚机命令, S-10, AC-08; docs/plan/p3/02/spec.md, CR-18, CR-22; docs/original/formats/
// executable.md, WB2–WB4). Every expectation is read from the WB3 and WB4 tables with the synthetic world below, not
// from the module. These are the consumers alone; systems/ai-commands.test.ts runs them from the delivery.
//
// The world: the player at the origin, two kind-7 hostiles ahead of it (kind 7 is in the engage mask `0x93780` and not in
// `0x206c07f`), one base (kind 17, in `0x206c07f` and `0x68000`) and the wingman (kind 1, built-in record 3) in its
// formation point. The wingman's hull capacity +0x9C is 200, so a percentage is half the hull. The friendly-fire
// threshold AICO +0x28 is the synthetic 4. Nothing draws: every call has an empty scripted RNG.

const IDENTITY = Object.freeze([1, 0, 0, 0, 1, 0, 0, 0, 1]) as unknown as Matrix3;
const THRESHOLD = 4;
const DESTINATION = Object.freeze({ x: 0, y: 0, z: 400 });

interface Harness {
  readonly state: WorldState;
  readonly wingman: CraftEntity;
  readonly player: Entity;
  readonly hostiles: readonly [Entity, Entity];
  readonly base: Entity;
  /** The reply lines asked for, with whether the slot was still set when asked (the reply comes before the clearing). */
  readonly replies: [number, boolean][];
  readonly reply: (line: number) => void;
  /** Delivers `code` as P3-10's request handling does, at tick `issuedTick`. */
  deliver(code: number, issuedTick?: number): void;
  activeCall(): WingmanCall;
  parkedCall(): ParkedCall;
  install(): WingmanController;
}

function harness(): Harness {
  const mission = missionFrame();
  mission.declarations = [
    declaration(0, { craftType: 0, position: { x: 100, y: 200, z: 0 } }),
    declaration(1, { craftType: 7, position: { x: 100, y: 200, z: 600 } }),
    declaration(2, { craftType: 7, position: { x: 100, y: 200, z: 900 } }),
    declaration(3, { craftType: 17, position: { x: 100, y: 1200, z: 60 } }),
  ];
  const craftInfo = craftInfoContent();
  craftInfo.craft[1].at9C = 200;
  const state = initialWorldState(asCreateInput(worldInput({ mission, craftInfo, run: { wingman: 0 } })));
  constructWorld(state).step(tickInput());
  const entities = [...state.entities.walk(ALL_KINDS)];
  const of = (kindBit: number) => entities.filter((entity) => entity.kindBit === kindBit);
  const [player] = of(0);
  const [wingman] = of(1) as CraftEntity[];
  const [first, second] = of(7);
  const [base] = of(17);
  for (const entity of [player, wingman, first, second, base]) {
    entity.state = 'active';
    entity.orientation = IDENTITY;
    if (entity.movement !== null) (entity.movement as SteeredMovementBlock).speed = 0;
  }
  player.position = { x: 0, y: 0, z: 0 };
  wingman.position = { x: 125, y: 3, z: 25 };
  first.position = { x: 125, y: 3, z: 600 };
  second.position = { x: 125, y: 3, z: 900 };
  base.position = { x: 500, y: 0, z: 0 };
  const replies: [number, boolean][] = [];
  const reply = (line: number) => void replies.push([line, wingman.ai.pendingCommand !== null]);
  const activeCall = (): WingmanCall => ({ world: state, subject: wingman, rand: scriptedRand([]), post: (_: Request) => {}, depart: () => false });
  const parkedCall = (): ParkedCall => ({ world: state, subject: wingman, rand: scriptedRand([]), depart: () => false, dropTransponder: () => {} });
  const install = () => installWingman(activeCall(), installedController(state.ruleData.inputs.aiPrograms.content.builtInPrograms[3], state.craftInfo.content.craft[1]));
  const deliver = (code: number, issuedTick = state.tick) => void (wingman.ai.pendingCommand = { code, issuedTick });
  return { state, wingman, player, hostiles: [first, second], base, replies, reply, deliver, activeCall, parkedCall, install };
}

/** Every consumption's outcome and line must be one the event contract accepts on its path. */
function checked(consumption: CommandConsumption | null): CommandConsumption | null {
  if (consumption !== null) expect(isWingmanCommandReply(consumption.path, consumption.code, consumption.outcome, consumption.replyLine)).toBe(true);
  return consumption;
}

describe('the active consumer 0x614a8 (WB3; CR-18, CR-22)', () => {
  /** An installed wingman (formation, b 2) with `code` delivered at tick 7. */
  function delivered(code: number) {
    const h = harness();
    const controller = h.install();
    h.deliver(code, 7);
    const consume = () => checked(consumeActiveCommand(h.activeCall(), controller, h.reply));
    return { ...h, controller, consume };
  }

  it('keeps a blocked command: without a player, or above the friendly-fire threshold, with no reply and no fact', () => {
    const h = delivered(3);
    h.state.player.entityId = null;
    expect(h.consume()).toBeNull();
    h.state.player.entityId = h.player.id;
    h.state.ai.friendlyFire.accumulated = THRESHOLD + 1;
    expect(h.consume()).toBeNull();
    expect(h.wingman.ai.pendingCommand).toEqual({ code: 3, issuedTick: 7 });
    expect(h.replies).toEqual([]);
    // Equality does not block: the waiting command then runs.
    h.state.ai.friendlyFire.accumulated = THRESHOLD;
    expect(h.consume()).toEqual({ code: 3, issuedTick: 7, path: 'active', outcome: 'applied', replyLine: 0xe });
    expect(h.wingman.ai.pendingCommand).toBeNull();
    expect(h.replies).toEqual([[0xe, true]]);
  });

  it('returns null with no command pending', () => {
    const h = delivered(1);
    h.wingman.ai.pendingCommand = null;
    expect(h.consume()).toBeNull();
    expect(h.replies).toEqual([]);
  });

  it('code 1 attacks the player\'s target, clearing "do not attack" when it was that target; reply 0x10', () => {
    const h = delivered(1);
    const [target] = h.hostiles;
    h.state.player.target = target.id;
    h.controller.wingman.doNotAttack = target.id;
    expect(h.consume()).toMatchObject({ outcome: 'applied', replyLine: 0x10 });
    expect(h.controller.wingman).toMatchObject({ behaviour: 0, attackTarget: target.id, doNotAttack: null });
    expect(h.wingman.ai).toMatchObject({ mode: 0, target: target.id, pendingCommand: null });
    expect(h.replies).toEqual([[0x10, true]]);
  });

  it('code 1 refuses with reply 0 a target that is missing, gone or of kinds 0x206c07f, b unchanged', () => {
    for (const setUp of [
      (h: Harness) => void (h.state.player.target = null),
      (h: Harness) => void (h.state.player.target = 9999),
      (h: Harness) => void (h.state.player.target = h.base.id),
      (h: Harness) => void (h.state.player.target = h.wingman.id),
    ]) {
      const h = delivered(1);
      setUp(h);
      expect(h.consume()).toMatchObject({ outcome: 'refused', replyLine: 0 });
      expect(h.controller.wingman).toMatchObject({ behaviour: 2, attackTarget: null });
      expect(h.wingman.ai.pendingCommand).toBeNull();
    }
  });

  it('code 2 marks the player\'s target "do not attack" (no kind check) with b kept, reply 3; refuses 0 without one or for the wingman', () => {
    const h = delivered(2);
    h.state.player.target = h.base.id;
    expect(h.consume()).toMatchObject({ outcome: 'applied', replyLine: 3 });
    expect(h.controller.wingman).toMatchObject({ behaviour: 2, doNotAttack: h.base.id });
    for (const target of [null, h.wingman.id]) {
      const refused = delivered(2);
      refused.state.player.target = target === null ? null : refused.wingman.id;
      expect(refused.consume()).toMatchObject({ outcome: 'refused', replyLine: 0 });
      expect(refused.controller.wingman.doNotAttack).toBeNull();
    }
  });

  it('code 3 re-forms (b 2), reply 0xE, from any behaviour', () => {
    const h = delivered(3);
    h.controller.wingman.behaviour = 5;
    expect(h.consume()).toMatchObject({ outcome: 'applied', replyLine: 0xe });
    expect(h.controller.wingman.behaviour).toBe(2);
    expect(h.wingman.ai).toMatchObject({ mode: 2, target: h.player.id });
  });

  it('code 4 engages (b 1) with "do not attack" cleared, reply 0x14; without a hostile it has fallen back to the formation, reply 0', () => {
    const h = delivered(4);
    h.controller.wingman.doNotAttack = h.hostiles[1].id;
    expect(h.consume()).toMatchObject({ outcome: 'applied', replyLine: 0x14 });
    expect(h.controller.wingman).toMatchObject({ behaviour: 1, doNotAttack: null });
    const none = delivered(4);
    for (const hostile of none.hostiles) none.state.entities.remove(hostile);
    expect(none.consume()).toMatchObject({ outcome: 'fallback', replyLine: 0 });
    expect(none.controller.wingman.behaviour).toBe(2);
  });

  it('code 5 returns to the first base (b 3), reply 0x12; without a base it falls back, reply 0', () => {
    const h = delivered(5);
    expect(h.consume()).toMatchObject({ outcome: 'applied', replyLine: 0x12 });
    expect(h.controller.wingman.behaviour).toBe(3);
    expect(h.wingman.ai).toMatchObject({ mode: 2, target: h.base.id });
    const none = delivered(5);
    none.state.entities.remove(none.base);
    expect(none.consume()).toMatchObject({ outcome: 'fallback', replyLine: 0 });
    expect(none.controller.wingman.behaviour).toBe(2);
  });

  it('code 6 goes to the player\'s destination (b 4), reply 0x12; without one it falls back, reply 0x15', () => {
    const h = delivered(6);
    h.state.player.map.destination = DESTINATION;
    expect(h.consume()).toMatchObject({ outcome: 'applied', replyLine: 0x12 });
    expect(h.controller.wingman.behaviour).toBe(4);
    expect(h.wingman.ai).toMatchObject({ mode: 2, target: null, goal: DESTINATION });
    const none = delivered(6);
    expect(none.consume()).toMatchObject({ outcome: 'fallback', replyLine: 0x15 });
    expect(none.controller.wingman.behaviour).toBe(2);
  });

  it('code 7 replies the status by trunc(hull × 100 ÷ +0x9C): below 50 0xD, below 80 0xC, else 0xB; nothing changes', () => {
    for (const [hull, line] of [[99, 0xd], [100, 0xc], [159, 0xc], [160, 0xb], [200, 0xb], [-1, 0xd]] as const) {
      const h = delivered(7);
      h.controller.wingman.behaviour = 5;
      h.wingman.combat.hull = hull;
      expect(h.consume(), `${hull}`).toEqual({ code: 7, issuedTick: 7, path: 'active', outcome: 'status', replyLine: line });
      expect(h.controller.wingman.behaviour).toBe(5);
    }
  });

  it('codes from 8 do nothing but reply 3 and clear', () => {
    for (const code of [8, 9, 0xffff_ffff]) {
      const h = delivered(code);
      const before = structuredClone(h.controller.wingman);
      expect(h.consume()).toEqual({ code, issuedTick: 7, path: 'active', outcome: 'unknown-code', replyLine: 3 });
      expect(h.controller.wingman).toEqual(before);
      expect(h.wingman.ai.pendingCommand).toBeNull();
      expect(h.replies).toEqual([[3, true]]);
    }
  });
});

describe('the parked consumer 0x61f20 (WB4, revision ⑤; CR-18, CR-22)', () => {
  /** The wingman, parked in mode 4 with no AI target, with `code` delivered at tick 7. */
  function delivered(code: number) {
    const h = harness();
    h.wingman.activity = 'parked';
    Object.assign(h.wingman.ai, { mode: 4, target: null });
    h.deliver(code, 7);
    const consume = () => {
      const consumed = consumeParkedCommand(h.parkedCall(), h.reply);
      checked(consumed?.consumption ?? null);
      return consumed;
    };
    return { ...h, consume };
  }
  const consumed = (code: number, outcome: string, replyLine: number | null, changed: boolean) =>
    ({ consumption: { code, issuedTick: 7, path: 'parked', outcome, replyLine }, changed });

  it('keeps the command only above the friendly-fire threshold; the player is not needed to consume', () => {
    const h = delivered(7);
    h.state.ai.friendlyFire.accumulated = THRESHOLD + 1;
    expect(h.consume()).toBeNull();
    expect(h.wingman.ai.pendingCommand).toEqual({ code: 7, issuedTick: 7 });
    h.state.ai.friendlyFire.accumulated = THRESHOLD;
    h.state.player.entityId = null;
    h.wingman.combat.hull = 99;
    expect(h.consume()).toEqual(consumed(7, 'status', 0xd, false));
    expect(h.wingman.ai.pendingCommand).toBeNull();
    expect(h.replies).toEqual([[0xd, true]]);
    h.wingman.ai.pendingCommand = null;
    expect(h.consume()).toBeNull();
  });

  it('code 1 takes the player\'s target as the AI target in mode 0 with no kind check, reply 0x10; without the player or PT it refuses, reply 0', () => {
    const h = delivered(1);
    h.state.player.target = h.base.id;
    expect(h.consume()).toEqual(consumed(1, 'applied', 0x10, true));
    expect(h.wingman.ai).toMatchObject({ mode: 0, target: h.base.id });
    for (const setUp of [(r: Harness) => void (r.state.player.target = null), (r: Harness) => {
      r.state.player.target = r.hostiles[0].id;
      r.state.player.entityId = null;
    }]) {
      const refused = delivered(1);
      setUp(refused);
      expect(refused.consume()).toEqual(consumed(1, 'refused', 0, false));
      expect(refused.wingman.ai).toMatchObject({ mode: 4, target: null });
    }
  });

  it('code 2 only acknowledges, reply 3, without a state change; refuses 0 without the player\'s target', () => {
    const h = delivered(2);
    h.state.player.target = h.hostiles[0].id;
    expect(h.consume()).toEqual(consumed(2, 'acknowledged', 3, false));
    expect(h.wingman.ai).toMatchObject({ mode: 4, target: null });
    expect(delivered(2).consume()).toEqual(consumed(2, 'refused', 0, false));
  });

  it('codes 3 and 4 alike take the player in mode 2, reply 0xE; without a player they clear silently', () => {
    for (const code of [3, 4]) {
      const h = delivered(code);
      expect(h.consume()).toEqual(consumed(code, 'applied', 0xe, true));
      expect(h.wingman.ai).toMatchObject({ mode: 2, target: h.player.id });
      const silent = delivered(code);
      silent.state.player.entityId = null;
      expect(silent.consume()).toEqual(consumed(code, 'refused', null, false));
      expect(silent.replies).toEqual([]);
      expect(silent.wingman.ai.pendingCommand).toBeNull();
    }
  });

  it('code 5 takes the first base in walk order in mode 2, reply 0x12; without one it refuses, reply 0', () => {
    const h = delivered(5);
    h.base.activity = 'parked';
    expect(h.consume()).toEqual(consumed(5, 'applied', 0x12, true));
    expect(h.wingman.ai).toMatchObject({ mode: 2, target: h.base.id });
    const none = delivered(5);
    none.state.entities.remove(none.base);
    expect(none.consume()).toEqual(consumed(5, 'refused', 0, false));
  });

  it('code 6 with a player and a destination: mode 2, no target, the destination as the goal, reply 0x12; otherwise 0x15', () => {
    const h = delivered(6);
    h.state.player.map.destination = DESTINATION;
    h.wingman.ai.target = h.hostiles[0].id;
    expect(h.consume()).toEqual(consumed(6, 'applied', 0x12, true));
    expect(h.wingman.ai).toMatchObject({ mode: 2, target: null, goal: DESTINATION });
    expect(delivered(6).consume()).toEqual(consumed(6, 'refused', 0x15, false));
    const noPlayer = delivered(6);
    noPlayer.state.player.map.destination = DESTINATION;
    noPlayer.state.player.entityId = null;
    expect(noPlayer.consume()).toEqual(consumed(6, 'refused', 0x15, false));
  });

  it('codes from 8 reply 3 without a state change', () => {
    for (const code of [8, 0xffff_ffff]) expect(delivered(code).consume()).toEqual(consumed(code, 'unknown-code', 3, false));
  });
});

describe('the status line', () => {
  it('faults for a subject without a craft record capacity, which world creation rules out for the wingman', () => {
    const { state, wingman } = harness();
    const { content } = state.craftInfo;
    const craft = content.craft.map((record, kindBit) => (kindBit === 1 ? { ...record, at9C: 0 } : record));
    const world = { ...state, craftInfo: { ...state.craftInfo, content: { ...content, craft } } } as WorldState;
    expect(thrownBy(() => statusLine(world, wingman))).toMatchObject({ site: 'ai-commands.capacity' });
  });
});
