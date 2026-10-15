import { describe, expect, it } from 'vitest';
import { TICK_MS } from '../runtime/game-runtime.test-support.ts';
import type { GameSessionFrame } from './game-session.ts';
import { departure, started } from './game-session.test-support.ts';

// R-13 control subset (docs/plan/p3/04/spec.md, 对照), Node evidence for subtask 14: under the project's pause
// controls Core runs no tick while paused or held, the first frame after resuming runs 0 ticks without making up the
// pause or the remainder before it, and the mission clock only ever advances with executed ticks (2 units per tick).
// A ControlledHost drives the real Runtime and Core; native page hiding is subtask 11's browser evidence.

type Setup = ReturnType<typeof started>;

/** Each way the project pauses a run, with how it ends: repeated notifications included. */
const PAUSES: Record<string, { readonly pause: (setup: Setup, at: number) => void; readonly resume: (setup: Setup) => void }> = {
  'a user pause': {
    pause: ({ session }) => { session.control({ type: 'pause' }); },
    resume: ({ session }) => { session.control({ type: 'resume' }); },
  },
  'a task-menu pause': {
    pause: ({ session, host }) => {
      session.control({ type: 'pause' });
      session.control({ type: 'pause' });
      host.emit({ type: 'visibility', visibility: 'hidden' });
      host.emit({ type: 'visibility', visibility: 'visible' });
    },
    resume: ({ session }) => { session.control({ type: 'resume' }); },
  },
  'a hidden page': {
    pause: ({ host }) => {
      host.emit({ type: 'visibility', visibility: 'hidden' });
      host.emit({ type: 'visibility', visibility: 'hidden' });
    },
    resume: ({ session, host }) => {
      host.emit({ type: 'visibility', visibility: 'visible' });
      host.emit({ type: 'visibility', visibility: 'visible' });
      session.control({ type: 'resume' });
    },
  },
  'a page found hidden at its frame': {
    pause: ({ host }, at) => { host.visibility = 'hidden'; host.deliver(at); },
    resume: ({ session, host }) => {
      host.emit({ type: 'visibility', visibility: 'visible' });
      session.control({ type: 'resume' });
    },
  },
  'a pagehide': {
    pause: ({ host }) => {
      host.emit({ type: 'pagehide' });
      host.emit({ type: 'pagehide' });
      host.emit({ type: 'visibility', visibility: 'visible' });
    },
    resume: ({ session, host }) => {
      host.emit({ type: 'pageshow', visibility: 'visible' });
      host.emit({ type: 'pageshow', visibility: 'visible' });
      session.control({ type: 'resume' });
    },
  },
};
const LENGTHS_MS = [1, TICK_MS, 10 * TICK_MS + 7, 3_600_000];
const CASES = Object.keys(PAUSES).flatMap((name) => LENGTHS_MS.map((length) => [name, length] as const));

const clockAt = (tick: number) => ({ tick, clock: 2 * tick, clockUnitsPerTick: 2 });

describe('R-13 control subset: ticks and the clock follow only executed ticks', () => {
  it.each(CASES)('%s of %s ms runs no tick, and resuming runs 0 ticks first', (name, lengthMs) => {
    const setup = started();
    const { session, host, run } = setup;
    const frames: GameSessionFrame[] = [];
    run.onFrame((frame) => { frames.push(frame); });
    const clock = () => run.projection().clock;
    host.deliver(0);
    // Half a tick remains when the pause comes; resuming must not make it up either.
    host.deliver(3.5 * TICK_MS);
    expect(clock()).toEqual(clockAt(3));
    const stale = host.callbacks.at(-1)!;
    PAUSES[name].pause(setup, 3.5 * TICK_MS + lengthMs);
    expect(session.status().phase).toBe('paused');
    expect(host.pending.size).toBe(0);
    const projection = run.projection();
    stale(3.5 * TICK_MS + lengthMs);
    expect(run.projection()).toBe(projection);
    expect(clock()).toEqual(clockAt(3));
    PAUSES[name].resume(setup);
    expect(session.status().phase).toBe('running');
    const resumedAt = 3.5 * TICK_MS + 2 * lengthMs;
    host.deliver(resumedAt);
    expect(frames.at(-1)?.report).toEqual({ ticks: 0, capped: false, stop: null, cut: null, transitions: [] });
    expect(clock()).toEqual(clockAt(3));
    host.deliver(resumedAt + 0.75 * TICK_MS);
    expect(clock()).toEqual(clockAt(3));
    host.deliver(resumedAt + 2 * TICK_MS);
    expect(clock()).toEqual(clockAt(5));
    const executed = frames.reduce((sum, frame) => sum + (frame.report?.ticks ?? 0), 0);
    expect(executed).toBe(5);
    expect(setup.errors).toEqual([]);
  });

  it.each(LENGTHS_MS)('the initial departure hold of %s ms keeps tick 0 and the clock at 0', (lengthMs) => {
    const { session, host, run } = started({ initialTransition: departure() });
    expect(run.projection().clock).toEqual(clockAt(0));
    expect(host.pending.size).toBe(0);
    session.control({ type: 'complete-departure', runId: run.runId });
    host.deliver(lengthMs);
    expect(run.projection().clock).toEqual(clockAt(0));
    host.deliver(lengthMs + TICK_MS);
    expect(run.projection().clock).toEqual(clockAt(1));
  });

  it('without a pause control, the display context never stops the clock', () => {
    const { session, host, run } = started();
    host.deliver(0);
    let now = 0;
    for (const command of [{ type: 'toggle-map' }, { type: 'communications', operation: 'open' }, { type: 'toggle-map' }, { type: 'communications', operation: 'close' }] as const) {
      run.submitCommand(command);
      now += 3 * TICK_MS;
      host.deliver(now);
    }
    expect(session.status().phase).toBe('running');
    expect(run.projection().clock).toEqual(clockAt(12));
  });
});
