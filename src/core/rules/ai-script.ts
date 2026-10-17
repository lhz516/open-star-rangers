/**
 * AI script load, parse and release (docs/plan/p3/02/spec.md, CR-17, CR-19, CR-24 decision 10;
 * docs/original/formats/ai.md §5.1–§5.3, §12). Every load of a script gets its own execution state (`0x5e940`, reset by
 * `0x5e9d8`), while the parsed arguments live once per world in WorldAiState.parseCache, keyed by the script entry:
 * - a load that takes the script's count from 0 to 1 parses every item up to its 10000 now, in item order and within an
 *   item in token order, drawing for each range (and once more for a range whose sign token allows `-`);
 * - a load that finds the script cached shares its arguments and draws nothing;
 * - the release of the last execution state drops the entry, so the next load parses and draws again.
 * A count per script stands for the original's count per item (ai §5.2's equivalence: world creation rejects every
 * parse failure, and Core's allocations and counts do not fail).
 *
 * The draw-free part of each argument comes from the static parse plans of rule-data.ts (ai-parameters.ts); a script
 * outside the support closure has none, and loading it is a fault. The cache's bounds (CR-25) are asserted: at most the
 * closure's scripts, and at most one execution state per entity plus the one an install runs.
 */
import { CORE_LIMITS } from '../contracts/limits.ts';
import { CoreFaultError } from '../errors.ts';
import type { ExecutionState } from '../world/entity-table.ts';
import type { OptionalFloat, ParsedArgument, ParsedScript, WorldState } from '../world/world-state.ts';
import { degreeSlot, type ArgumentPlan, type FloatTerm, type IntegerTerm } from './ai-parameters.ts';
import { RAND_SCALE, type RandSource } from './original-random.ts';
import { toInt32 } from './record-defaults.ts';

const fault = (site: string): CoreFaultError => new CoreFaultError('invariant-violated', `ai-script.${site}`);

/**
 * An integer term's value (`0x60538`): a fixed value, or `[lo hi sign]` = lo + rand % (hi − lo + 1) in i32 (the signed
 * IDIV of a non-negative rand: a negative divisor gives lo … lo + |d| − 1), negated in i32 after a second draw with
 * (rand & 2) ≠ 0 when the sign token allows it.
 */
export function drawInteger(term: IntegerTerm, rand: RandSource): number {
  if (term.type === 'value') return term.value;
  const divisor = toInt32(term.hi - term.lo + 1);
  if (divisor === 0) throw fault('zero-range');
  const value = toInt32(term.lo + (rand.next() % divisor));
  return term.signed && (rand.next() & 2) !== 0 ? toInt32(-value) : value;
}

/**
 * A float term's value (`0x60688`): a fixed f32, or `[lo hi sign]` = F(D(lo + D(D(r × c) × D(hi − lo)))) with the f64
 * bounds and c = f32 1/32767, its f32 sign bit flipped after a second draw with (rand & 2) ≠ 0 when the sign token
 * allows it (0 can become −0).
 */
export function drawFloat(term: FloatTerm, rand: RandSource): number {
  if (term.type === 'value') return term.value;
  const value = Math.fround(term.lo + rand.next() * RAND_SCALE * (term.hi - term.lo));
  if (!Number.isFinite(value)) throw fault('float');
  return term.signed && (rand.next() & 2) !== 0 ? -value : value;
}

const frozen = <Value extends object>(value: Value): Value => Object.freeze(value);

/** An item's parsed argument from its plan, with its draws; a drawn degree value is scaled after the draw (ai §5.3). */
export function parseArgument(plan: ArgumentPlan, rand: RandSource): ParsedArgument {
  switch (plan.type) {
    case 'none':
      return frozen({ type: 'none' });
    case 'integer':
      return frozen({ type: 'integer', value: drawInteger(plan.term, rand) });
    case 'float': {
      const value = drawFloat(plan.term, rand);
      return frozen({ type: 'float', value: plan.degrees && plan.term.type === 'range' ? degreeSlot(value) : value });
    }
    case 'optional-floats': {
      const values = plan.terms.map((term): OptionalFloat => frozen(term === null ? { present: false, value: 0 } : { present: true, value: drawFloat(term, rand) }));
      return frozen({ type: 'optional-floats', values: frozen(values as [OptionalFloat, OptionalFloat, OptionalFloat, OptionalFloat]) });
    }
    case 'floats':
      return frozen({ type: 'floats', values: frozen(plan.terms.map((term) => drawFloat(term, rand))) });
  }
}

/** The index of `script` in the ascending cache, or the index to insert it at as `~index`. */
function cacheIndex(cache: readonly ParsedScript[], script: number): number {
  let low = 0;
  let high = cache.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (cache[middle].script < script) low = middle + 1;
    else high = middle;
  }
  return low < cache.length && cache[low].script === script ? low : ~low;
}

/** The cached parse of `script`, which a live execution state guarantees. */
export function parsedScript(world: WorldState, script: number): ParsedScript {
  const index = cacheIndex(world.ai.parseCache, script);
  if (index < 0) throw fault('not-loaded');
  return world.ai.parseCache[index];
}

const ZEROS = frozen([0, 0, 0, 0] as const);
const EMPTY_STACK: readonly number[] = frozen([]);
const NO_DEADLINE = frozen({ active: false, until: 0 });

/** `0x5e9d8`: the execution state at its first item, with variables, timers, return stack, wait and hold cleared. */
export function resetExecution(execution: ExecutionState): void {
  Object.assign(execution, { item: 0, variables: ZEROS, timers: ZEROS, returnStack: EMPTY_STACK, wait: NO_DEADLINE, hold: NO_DEADLINE });
}

/**
 * `0x5e940`(script): a new execution state of `script`, at its first item. When the script is not cached, its items are
 * parsed now with their draws and it enters the cache with one use; otherwise it gains a use and nothing is drawn.
 */
export function loadScript(world: WorldState, script: number, rand: RandSource): ExecutionState {
  const cache = world.ai.parseCache;
  const index = cacheIndex(cache, script);
  if (index >= 0) {
    const entry = cache[index];
    // At most one execution state per entity, and the install's (CR-25).
    if (entry.uses > CORE_LIMITS.entities) throw fault('uses');
    entry.uses += 1;
  } else {
    const { ai } = world.ruleData;
    const plans = ai.scripts[script];
    if (plans === null || plans === undefined) throw fault('script');
    if (cache.length >= ai.reachable.scripts.length) throw fault('cache');
    cache.splice(~index, 0, { script, uses: 1, items: frozen(plans.map((plan) => parseArgument(plan, rand))) });
  }
  return { script, item: 0, variables: ZEROS, timers: ZEROS, returnStack: EMPTY_STACK, wait: NO_DEADLINE, hold: NO_DEADLINE };
}

/** `0x5e9a8`(X): the execution state's use ends; the last use drops the script's parse from the cache. */
export function releaseScript(world: WorldState, execution: ExecutionState): void {
  const cache = world.ai.parseCache;
  const index = cacheIndex(cache, execution.script);
  if (index < 0) throw fault('not-loaded');
  const entry = cache[index];
  entry.uses -= 1;
  if (entry.uses === 0) cache.splice(index, 1);
}
