import { describe, expect, it } from 'vitest';
import { scriptItem } from '../../content/rule-data/rule-data.test-support.ts';
import { CoreFaultError } from '../../core/errors.ts';
import { snapshotHash, type GameSnapshot } from '../../core/replay/snapshot.ts';
import { CONTENT_INPUT_FIELDS, createWorld, type CreateWorldInput } from '../../core/world/create-world.ts';
import { aiProgramsContent } from '../../core/world/create-world.test-support.ts';
import { tickInput } from '../../core/world/world.test-support.ts';
import { GameRuntimeError } from '../runtime/runtime-errors.ts';
import { TICK_MS } from '../runtime/game-runtime.test-support.ts';
import type { GameRunSpec, GameSessionFrame } from './game-session.ts';
import { current, runSpec, sessionSetup, started } from './game-session.test-support.ts';
import type { ControlledHost } from './session-host.test-support.ts';

// P3-08 AC-17's Session part (docs/plan/p3/08/spec.md, 与其他任务的接口: 暂停与运行生命周期): the real Session, Runtime
// and Core on a ControlledHost, with the synthetic slice-shaped world and its wingman, whose hostiles run the
// interpreter, bases their handler, the far groups the parked handler and the wingman its own (code-generated content,
// never original data). Each Session state is compared with a plain Core world given the same ticks of neutral input:
// equal snapshot hashes mean equal AI controllers, deadlines, triggers, parse cache and RNG. Native page hiding and
// the browser loop are P3-08/24's.

const WINGMAN_RUN = { run: { wingman: 0 } } as const;

/** The hash of a plain Core world of `spec` after `ticks` neutral ticks. */
function referenceHashes(spec: GameRunSpec, ticks: number): string[] {
  const input = Object.fromEntries([...CONTENT_INPUT_FIELDS, 'run'].map((field) => [field, spec[field as keyof GameRunSpec]]));
  const world = createWorld(input as unknown as CreateWorldInput);
  const hashes = [snapshotHash(world.snapshot())];
  for (let tick = 1; tick <= ticks; tick++) {
    world.step(tickInput());
    hashes.push(snapshotHash(world.snapshot()));
  }
  return hashes;
}

const REFERENCE = referenceHashes(runSpec(WINGMAN_RUN), 80);

/** A host's frame time: anchored at `now` by its first delivery, then one tick a frame (a frame runs at most 5). */
class Frames {
  readonly host: ControlledHost;
  now: number;
  constructor(host: ControlledHost, now = 0) {
    this.host = host;
    this.now = now;
    host.deliver(now);
  }
  ticks(count: number): void {
    for (let tick = 0; tick < count; tick++) this.host.deliver(this.now += TICK_MS);
  }
}

/** The AI part of a snapshot: every program slot, the parse cache and the RNG the AI draws from. */
const aiOf = ({ state }: GameSnapshot) => ({
  programs: state.entities.map(({ id, ai }) => [id, ai.program, ai.objectTarget]),
  parseCache: state.ai.parseCache,
  rng: state.rngState,
});

// Runs of up to 80 ticks of the slice world, several per case: under 1 s per case alone.
describe('the AI under the Session lifecycle (AC-17)', { timeout: 30_000 }, () => {
  it('the run follows the plain world tick by tick, with AI controllers installed and running', () => {
    const { host, run } = started(WINGMAN_RUN);
    const frames = new Frames(host);
    for (let tick = 1; tick <= 40; tick++) {
      frames.ticks(1);
      expect(snapshotHash(run.snapshot()), `tick ${tick}`).toBe(REFERENCE[tick]);
    }
    const handlers = new Set(run.snapshot().state.entities.flatMap(({ ai: { program } }) => (program.type === 'none' || program.controller === null ? [] : [program.controller.handler])));
    expect([...handlers].sort()).toEqual(['base', 'interpreter', 'parked', 'wingman']);
    expect(run.snapshot().state.ai.parseCache.length).toBeGreaterThan(0);
  });

  it.each([
    ['a user pause', (setup: ReturnType<typeof started>) => { setup.session.control({ type: 'pause' }); }],
    ['a hidden page', (setup: ReturnType<typeof started>) => { setup.host.emit({ type: 'visibility', visibility: 'hidden' }); }],
  ])('%s of an hour advances no AI, and resuming makes up nothing', (_name, pause) => {
    const setup = started(WINGMAN_RUN);
    const { session, host, run } = setup;
    const frames: GameSessionFrame[] = [];
    run.onFrame((frame) => { frames.push(frame); });
    const clock = new Frames(host);
    clock.ticks(10);
    host.deliver(clock.now += TICK_MS / 2);
    const before = run.snapshot();
    expect(snapshotHash(before)).toBe(REFERENCE[10]);
    pause(setup);
    expect(session.status().phase).toBe('paused');
    expect(host.pending.size).toBe(0);
    // A stale frame an hour later steps nothing.
    host.callbacks.at(-1)!(clock.now + 3_600_000);
    expect(aiOf(run.snapshot())).toEqual(aiOf(before));
    host.emit({ type: 'visibility', visibility: 'visible' });
    session.control({ type: 'resume' });
    host.deliver(clock.now += 2 * 3_600_000);
    expect(frames.at(-1)?.report?.ticks).toBe(0);
    expect(snapshotHash(run.snapshot())).toBe(REFERENCE[10]);
    clock.ticks(5);
    expect(snapshotHash(run.snapshot())).toBe(REFERENCE[15]);
    expect(setup.errors).toEqual([]);
  });

  it('the open map is no pause: the AI keeps running with the clock', () => {
    const { host, run } = started(WINGMAN_RUN);
    const clock = new Frames(host);
    clock.ticks(5);
    const before = aiOf(run.snapshot());
    run.submitCommand({ type: 'toggle-map' });
    clock.ticks(30);
    expect(run.snapshot().state.player.viewMode).toBe(8);
    expect(run.projection().clock.tick).toBe(35);
    expect(aiOf(run.snapshot())).not.toEqual(before);
  });

  it('clearing the player\'s input touches no Core state, so no AI trigger or deadline', () => {
    const { session, host, run } = started(WINGMAN_RUN);
    const clock = new Frames(host);
    run.setIntent({ axes: { pitch: 0.5, yaw: -1, roll: 0 }, primaryFire: true });
    clock.ticks(20);
    const before = run.snapshot();
    for (const reason of ['focus-loss', 'pointer-lock-exit'] as const) session.control({ type: 'clear-input', reason });
    expect(run.snapshot()).toEqual(before);
    expect(session.status().phase).toBe('running');
  });

  it('exit and a new start leak nothing: the retried run matches a fresh world from tick 0, and so does another spec after it', () => {
    const { session, host } = sessionSetup();
    session.control({ type: 'start', spec: runSpec(WINGMAN_RUN) });
    const clock = new Frames(host);
    clock.ticks(60);
    expect(snapshotHash(current(session).snapshot())).toBe(REFERENCE[60]);
    session.control({ type: 'exit' });

    session.control({ type: 'start', spec: runSpec(WINGMAN_RUN) });
    const retried = current(session);
    expect(snapshotHash(retried.snapshot())).toBe(REFERENCE[0]);
    const again = new Frames(host, 1000);
    again.ticks(30);
    expect(snapshotHash(retried.snapshot())).toBe(REFERENCE[30]);
    session.control({ type: 'exit' });

    const solo = runSpec();
    const soloReference = referenceHashes(solo, 30);
    session.control({ type: 'start', spec: solo });
    new Frames(host, 2000).ticks(30);
    expect(snapshotHash(current(session).snapshot())).toBe(soloReference[30]);
  });

  it('two Sessions running side by side keep their AI apart: each matches its own plain world', () => {
    const a = started(WINGMAN_RUN);
    const b = started(WINGMAN_RUN);
    const clockA = new Frames(a.host);
    const clockB = new Frames(b.host);
    let ticksA = 0;
    let ticksB = 0;
    for (const [aTicks, bTicks] of [[7, 3], [1, 20], [30, 0], [0, 45], [12, 12]]) {
      ticksA += aTicks;
      ticksB += bTicks;
      // Interleaved a frame at a time.
      for (let index = 0; index < Math.max(aTicks, bTicks); index++) {
        if (index < aTicks) clockA.ticks(1);
        if (index < bTicks) clockB.ticks(1);
      }
      expect(snapshotHash(a.run.snapshot()), `A at ${ticksA}`).toBe(REFERENCE[ticksA]);
      expect(snapshotHash(b.run.snapshot()), `B at ${ticksB}`).toBe(REFERENCE[ticksB]);
    }
  });

  it('shows an AI budget fault through the Runtime: no frame of the faulting tick, the run faulted, and a new run starts clean', () => {
    // The hostiles' script (DFPG 0's every-opcode script, entry 2) replaced by an action that branches to itself.
    const spec = runSpec(WINGMAN_RUN);
    const aiPrograms = aiProgramsContent();
    aiPrograms.entries[2] = { kind: 'script', items: [scriptItem(104, '0.5', 0), scriptItem(10000)] } as never;
    const faulting = { ...spec, aiPrograms: { ...spec.aiPrograms, content: aiPrograms } } as GameRunSpec;
    const { session, host, errors } = sessionSetup();
    session.control({ type: 'start', spec: faulting });
    const run = current(session);
    const frames: GameSessionFrame[] = [];
    run.onFrame((frame) => { frames.push(frame); });
    const clock = new Frames(host);
    clock.ticks(1);
    expect(run.projection().clock.tick).toBe(1);
    const framesBefore = frames.length;
    // Tick 2 installs the hostiles' interpreter, whose first update never yields.
    clock.ticks(1);
    expect(frames).toHaveLength(framesBefore);
    expect(session.status().phase).toBe('faulted');
    expect(errors).toHaveLength(1);
    const runtimeError = errors[0].failures?.[0].cause as GameRuntimeError;
    expect(runtimeError).toBeInstanceOf(GameRuntimeError);
    expect(runtimeError).toMatchObject({ kind: 'faulted' });
    expect(runtimeError.cause).toBeInstanceOf(CoreFaultError);
    expect(runtimeError.cause).toMatchObject({ code: 'budget-exhausted', site: 'ai.dispatches-per-run' });
    expect(run.projection().clock.tick).toBe(1);
    expect(host.pending.size).toBe(0);

    session.control({ type: 'exit' });
    session.control({ type: 'start', spec: runSpec(WINGMAN_RUN) });
    new Frames(host, 5000).ticks(10);
    expect(snapshotHash(current(session).snapshot())).toBe(REFERENCE[10]);
  });
});
