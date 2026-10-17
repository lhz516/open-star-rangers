vi.mock('../../core/world/create-world.ts', async (importOriginal) => {
  const { wrapWorld } = await import('../../app/runtime/transition-injection.test-support.ts');
  const original = await importOriginal<typeof CreateWorldModule>();
  return { ...original, createWorld: (input: CreateWorldInput) => wrapWorld(original.createWorld(input)) };
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MissionOwnerConsumer } from '../../app/mission/mission-owner.ts';
import { openMission, toFlight } from '../../app/mission/mission.test-support.ts';
import { TICK_MS } from '../../app/runtime/game-runtime.test-support.ts';
import { injection } from '../../app/runtime/transition-injection.test-support.ts';
import type { Command } from '../../core/contracts/tick-input.ts';
import type * as CreateWorldModule from '../../core/world/create-world.ts';
import type { CreateWorldInput } from '../../core/world/create-world.ts';
import type { KeyboardSink, KeyboardSource, KeyboardZoneBinding } from '../../platform/input/keyboard-input.ts';
import { createGameCommandFeedback, type GameCommandFeedback } from '../game/game-command-feedback.ts';
import { createGameSessionBridge } from '../game/game-session-bridge.ts';
import { createGameStore, type GameStoreWriter } from '../game/game-store.ts';
import { down, TEST_BINDINGS, up } from './game-input.test-support.ts';
import { createInputConsumer } from './input-consumer.ts';

// P3-10 subtask 22 (Node): the input consumer at a running hold (docs/plan/p3/04/spec.md, 运行中衔接（P3-10 的修订）). The
// frame cut at a transition tick refuses input from its delivery on, so the consumer treats it as not running: no repeat
// is submitted into the barrier, the held keys are cleared, and only a new press acts after the hold. Transitions are
// injected where the world is created (transition-injection.test-support.ts).

afterEach(() => { injection.reset(); });

/** A keyboard source the test drives. */
class FakeKeyboard implements KeyboardSource, KeyboardZoneBinding<string> {
  sink: KeyboardSink | null = null;
  readonly bind = (): void => undefined;
  connect(sink: KeyboardSink): () => void {
    this.sink = sink;
    sink.signal({ type: 'initial', eligible: true });
    return () => { this.sink = null; };
  }
}

async function flying() {
  const keyboard = new FakeKeyboard();
  let ui: { readonly store: GameStoreWriter; readonly feedback: GameCommandFeedback } | null = null;
  const uiConsumer: MissionOwnerConsumer = {
    stage: 'ui',
    connect: ({ ownerId, session }) => {
      const store = createGameStore(ownerId);
      const feedback = createGameCommandFeedback(store);
      const bridge = createGameSessionBridge({ store, clock: () => 0, consumers: [feedback] });
      bridge.bind(session);
      ui = { store, feedback };
      return { release: () => { bridge.unbind(); }, onSessionError: bridge.onError };
    },
  };
  const submitted: { readonly id: number | null; readonly type: Command['type']; readonly clock: number }[] = [];
  const consumer = createInputConsumer<string>({
    keyboard: () => keyboard,
    bindings: TEST_BINDINGS,
    feedback: () => ui && {
      submit: (command: Command) => {
        const id = ui!.feedback.submit(command);
        submitted.push({ id, type: command.type, clock: mission.run()!.projection().clock.clock });
        return id;
      },
    },
  });
  const mission = await openMission('mission-startable', { consumers: [consumer, uiConsumer] });
  toFlight(mission.owner);
  let now = 0;
  mission.host.deliver(now);
  return {
    ...mission, consumer, submitted, store: () => ui!.store,
    press: (code: string) => keyboard.sink!.key(down(code), true),
    lift: (code: string) => keyboard.sink!.key(up(code), true),
    frame() {
      now += TICK_MS;
      mission.host.deliver(now);
    },
  };
}

describe('the input consumer at a running hold', () => {
  it('submits no repeat in the cut frame, clears the held key, and acts again only on a new press after the hold', async () => {
    const f = await flying();
    injection.plan({ 19: ['G-02/3'] });
    for (let frame = 0; frame < 3; frame += 1) f.frame();
    f.press('Equal');
    // The key's first repeat is due at clock 6 + 32 = 38, the clock of step 19: the frame the transition cuts.
    for (let frame = 0; frame < 16; frame += 1) f.frame();
    expect(f.owner.getSnapshot()).toMatchObject({ flow: { position: 'transition' }, session: { phase: 'transition' } });
    expect(f.run()!.projection().clock.clock).toBe(38);
    expect(f.submitted).toEqual([{ id: 1, type: 'speed', clock: 6 }]);
    expect(f.store().reader.getState().actionError).toBeNull();
    expect(f.consumer.status.getState().error).toBeNull();

    f.owner.skip(f.owner.getSnapshot().transitionPlaceholder!.id);
    expect(f.owner.getSnapshot().flow.position).toBe('flight');
    // Still held, but cleared: no repeat follows the hold.
    for (let frame = 0; frame < 40; frame += 1) f.frame();
    expect(f.submitted).toHaveLength(1);
    f.lift('Equal');
    f.press('Equal');
    expect(f.submitted.at(-1)).toMatchObject({ type: 'speed' });
    expect(f.submitted.at(-1)!.id).not.toBeNull();
    expect(f.submitted).toHaveLength(2);
  });
});
