// Transition and completion injection for Node tests of the Runtime, Session and mission owner (P3-10 AC-13, P3-11
// AC-11). The synthetic mission cannot dock, and few of its runs end, so test files that mock Core's creation entries
// wrap the real world with `wrapWorld`: chosen steps get `transition` events appended, as Core emits them after
// `docked`, `departed` or `player-rescued`, or a `mission-completed` event after them, or throw instead of running. A
// file mocks the entries with:
//
//   vi.mock('../../core/world/create-world.ts', async (importOriginal) => {
//     const { wrapWorld } = await import('<path>/transition-injection.test-support.ts');
//     const original = await importOriginal<typeof CreateWorldModule>();
//     return { ...original, createWorld: (input: CreateWorldInput) => wrapWorld(original.createWorld(input)) };
//   });
//
// and calls `injection.reset()` after each test. The production Runtime has no injection point.
import { CoreInputError } from '../../core/errors.ts';
import type { EndingGap, ResultProjection } from '../../core/projections/projection.ts';

export type InjectedGap = 'G-02/3' | 'G-02/4' | 'G-02/5' | 'G-02/6';

/** The final result an injected completion gives the projection, but its readiness and completion tick. */
export type InjectedResult = Omit<Extract<ResultProjection, { readonly outcome: 'success' | 'failure' }>, 'readiness' | 'completedTick'>;

/** A plausible final result with `endingGaps`: a failure for G-02/7, a success otherwise. */
export function injectedResult(endingGaps: readonly EndingGap[], latchTick = 0): InjectedResult {
  const failure = endingGaps[0]?.gap === 'G-02/7';
  return {
    outcome: failure ? 'failure' : 'success',
    reason: failure ? { type: 'third-loss', loss: 'destroyed' } : { type: 'all-clear' },
    summary: null,
    rescuesUsed: failure ? 2 : 0,
    endingGaps,
    playerKills: 3,
    latchTick,
  };
}

interface Completion {
  readonly step: number;
  readonly result: InjectedResult;
  /** False leaves the projection's result in progress, which breaks Core's contract. */
  readonly projected: boolean;
}

let steps = 0;
let plan = new Map<number, readonly InjectedGap[]>();
let failures = new Map<number, () => unknown>();
let completion: Completion | null = null;

export const injection = {
  /** From now on, counting steps of every wrapped world from 1, step `n` appends one `transition` per listed gap. */
  plan(entries: Readonly<Record<number, readonly InjectedGap[]>>): void {
    steps = 0;
    plan = new Map(Object.entries(entries).map(([step, gaps]) => [Number(step), gaps]));
  },
  /** Step `n` of the current plan throws what `failure` returns instead of running. */
  fail(step: number, failure: () => unknown): void {
    failures.set(step, failure);
  },
  /**
   * Step `n` of the current plan appends `mission-completed` with `result`'s outcome after any transitions; from then on
   * the projection shows `result` (unless `projected` is false) and a step throws Core's `mission-completed` refusal.
   */
  complete(step: number, result: InjectedResult, projected = true): void {
    completion = { step, result, projected };
  },
  /** Steps since the last `plan` or `reset`. */
  get steps(): number {
    return steps;
  },
  reset(): void {
    steps = 0;
    plan = new Map();
    failures = new Map();
    completion = null;
  },
};

/** The world with its `step` and `projection` routed through the injection; every other method is the world's own. */
export function wrapWorld<World extends object>(world: World): World {
  let result: ResultProjection | null = null;
  return new Proxy(world, {
    get(target, key) {
      const value = Reflect.get(target, key, target) as unknown;
      if (typeof value !== 'function') return value;
      if (key === 'projection') {
        return () => {
          const projection = (value as () => { result: ResultProjection }).call(target);
          return result === null ? projection : Object.freeze({ ...projection, result });
        };
      }
      if (key !== 'step') return value.bind(target);
      return (...args: unknown[]) => {
        if (result !== null) throw new CoreInputError('step', 'mission-completed');
        steps += 1;
        const failure = failures.get(steps);
        if (failure) throw failure();
        const events = (value as (...input: unknown[]) => readonly object[]).apply(target, args);
        const gaps = plan.get(steps) ?? [];
        const done = completion?.step === steps ? completion : null;
        if (gaps.length === 0 && done === null) return events;
        const { tick } = (target as unknown as { projection(): { clock: { tick: number } } }).projection().clock;
        const added: object[] = gaps.map((gap) => Object.freeze({ type: 'transition', tick, gap }));
        if (done !== null) {
          added.push(Object.freeze({ type: 'mission-completed', tick, outcome: done.result.outcome }));
          if (done.projected) result = deepFreeze({ readiness: 'ready', ...structuredClone(done.result), completedTick: tick });
        }
        return Object.freeze([...events, ...added]);
      };
    },
  });
}

function deepFreeze<Value>(value: Value): Value {
  if (typeof value === 'object' && value !== null) for (const field of Object.values(value)) deepFreeze(field);
  return Object.freeze(value);
}
