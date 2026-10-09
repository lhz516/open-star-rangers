/**
 * The formal Core world (docs/plan/p3/02/spec.md, 数据模型与契约; 行为与边界). step() is the only way to advance it;
 * projection() and renderState() read it at any time. Every output is deeply frozen and detached from the world, so
 * later ticks never change it. createWorld (create-world.ts) creates it from logic content; snapshots are subtask 08's.
 *
 * Fault latch: when Core itself fails in a step or a read (a broken invariant, or a budget running out while a tick
 * executes), the world keeps the CoreFaultError and publishes nothing from that call; every later step(), projection()
 * and renderState() throws that same error. P3-04 stops the run.
 */
import type { DomainEvent } from '../contracts/domain-events.ts';
import { readTickInput, type TickInput } from '../contracts/tick-input.ts';
import { CoreFaultError, CoreInputError } from '../errors.ts';
import { projectWorld, type Projection } from '../projections/projection.ts';
import { renderWorld, type RenderState } from '../projections/render-state.ts';
import { registerTick, runTick, type TickContext } from '../systems/pipeline.ts';
import type { WorldState } from './world-state.ts';

export interface World {
  /**
   * Advances exactly one tick, by `clockUnitsPerTick` clock units, and returns its domain events in emission order.
   * Throws CoreInputError, leaving the world unchanged, when the input breaks its contract or the tick, the clock or
   * the entity IDs a tick may allocate would pass the safe integer range. Throws CoreFaultError when Core fails.
   */
  step(tickInput: TickInput): readonly DomainEvent[];
  projection(): Projection;
  renderState(): RenderState;
}

class CoreWorld implements World {
  readonly #state: WorldState;
  #fault: CoreFaultError | null = null;

  constructor(state: WorldState) {
    this.#state = state;
  }

  step(tickInput: TickInput): readonly DomainEvent[] {
    this.#throwIfFaulted();
    // Errors of the caller's own input, read before anything else, never latch.
    const input = readTickInput(tickInput);
    let context: TickContext;
    try {
      context = registerTick(this.#state, input);
    } catch (error) {
      // Nothing has changed yet, so a rejected step leaves the world as it was; any other failure is Core's.
      if (error instanceof CoreInputError) throw error;
      throw this.#latch(error, 'world.step');
    }
    return this.#guard('world.step', () => runTick(context));
  }

  projection(): Projection {
    this.#throwIfFaulted();
    return this.#guard('world.projection', () => projectWorld(this.#state));
  }

  renderState(): RenderState {
    this.#throwIfFaulted();
    return this.#guard('world.renderState', () => renderWorld(this.#state));
  }

  #throwIfFaulted(): void {
    if (this.#fault) throw this.#fault;
  }

  /** Runs `work`; anything it throws is a Core failure that latches the world. */
  #guard<Result>(site: string, work: () => Result): Result {
    try {
      return work();
    } catch (error) {
      throw this.#latch(error, site);
    }
  }

  /** Latches `error` as the world's fault; an error other than a CoreFaultError becomes a broken invariant at `site`. */
  #latch(error: unknown, site: string): CoreFaultError {
    let fault: CoreFaultError;
    if (error instanceof CoreFaultError) {
      fault = error;
    } else {
      fault = new CoreFaultError('invariant-violated', site);
      fault.cause = error;
    }
    this.#fault = fault;
    return fault;
  }
}

/**
 * Internal construction of a world around `state`, for world creation (create-world.ts) and Core tests; not a public
 * entry, and it accepts no handler. The world takes the state over without copying it: world creation keeps no
 * reference, and only Core tests do, to stand in for rule tasks that do not exist yet.
 */
export function constructWorld(state: WorldState): World {
  return new CoreWorld(state);
}
