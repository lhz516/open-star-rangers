// Transition injection for Node tests of the Runtime, Session and mission owner (P3-10 AC-13). The synthetic mission
// cannot dock, so test files that mock Core's creation entries wrap the real world with `wrapWorld`: chosen steps get
// `transition` events appended, as Core emits them after `docked` or `departed`, or throw instead of running. A file
// mocks the entries with:
//
//   vi.mock('../../core/world/create-world.ts', async (importOriginal) => {
//     const { wrapWorld } = await import('<path>/transition-injection.test-support.ts');
//     const original = await importOriginal<typeof CreateWorldModule>();
//     return { ...original, createWorld: (input: CreateWorldInput) => wrapWorld(original.createWorld(input)) };
//   });
//
// and calls `injection.reset()` after each test. The production Runtime has no injection point.

export type InjectedGap = 'G-02/3' | 'G-02/4';

let steps = 0;
let plan = new Map<number, readonly InjectedGap[]>();
let failures = new Map<number, () => unknown>();

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
  /** Steps since the last `plan` or `reset`. */
  get steps(): number {
    return steps;
  },
  reset(): void {
    steps = 0;
    plan = new Map();
    failures = new Map();
  },
};

/** The world with its `step` routed through the injection; every other method is the world's own. */
export function wrapWorld<World extends object>(world: World): World {
  return new Proxy(world, {
    get(target, key) {
      const value = Reflect.get(target, key, target) as unknown;
      if (typeof value !== 'function') return value;
      if (key !== 'step') return value.bind(target);
      return (...args: unknown[]) => {
        steps += 1;
        const failure = failures.get(steps);
        if (failure) throw failure();
        const events = (value as (...input: unknown[]) => readonly object[]).apply(target, args);
        const gaps = plan.get(steps) ?? [];
        if (gaps.length === 0) return events;
        const { tick } = (target as unknown as { projection(): { clock: { tick: number } } }).projection().clock;
        return Object.freeze([...events, ...gaps.map((gap) => Object.freeze({ type: 'transition', tick, gap }))]);
      };
    },
  });
}
