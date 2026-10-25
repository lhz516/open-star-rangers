/**
 * The formal Core world (docs/plan/p3/02/spec.md, 数据模型与契约; 行为与边界). step() is the only way to advance it;
 * projection(), renderState() and snapshot() read it at any time. Every output is deeply frozen and detached from the
 * world, so later ticks never change it. createWorld (create-world.ts) creates it from logic content.
 *
 * Fault latch: when Core itself fails in a step or a read (a broken invariant, or a budget running out while a tick
 * executes), the world keeps the CoreFaultError and publishes nothing from that call; every later step(),
 * projection(), renderState() and snapshot() throws that same error. P3-04 stops the run.
 *
 * Completion: once the teardown completes (`flow.completedTick`, mission-teardown.ts), the run has ended. Every later
 * step() throws a CoreInputError (path `step`, reason `mission-completed`) before it reads its input, changing nothing
 * and latching nothing; the reads go on (docs/plan/p3/02/spec.md, ME-12).
 */
import type { DomainEvent } from '../contracts/domain-events.ts';
import { readTickInput, type TickInput } from '../contracts/tick-input.ts';
import { CoreFaultError, CoreInputError } from '../errors.ts';
import { projectWorld, type Projection } from '../projections/projection.ts';
import { renderWorld, type RenderState } from '../projections/render-state.ts';
import { takeSnapshot, type GameSnapshot } from '../replay/snapshot.ts';
import { registerTick, runTick, type TickContext } from '../systems/pipeline.ts';
import type { WorldState } from './world-state.ts';

export interface World {
  /**
   * Advances exactly one tick, by `clockUnitsPerTick` clock units, and returns its domain events in emission order.
   * Throws CoreInputError, leaving the world unchanged, when the run has completed, when the input breaks its contract
   * or when the tick, the clock or the entity IDs a tick may allocate would pass the safe integer range. Throws
   * CoreFaultError when Core fails, or has failed before.
   */
  step(tickInput: TickInput): readonly DomainEvent[];
  projection(): Projection;
  renderState(): RenderState;
  /** The world's complete authoritative state (replay/snapshot.ts); a diagnostic, not a save. */
  snapshot(): GameSnapshot;
}

class CoreWorld implements World {
  readonly #state: WorldState;
  #fault: CoreFaultError | null = null;

  constructor(state: WorldState) {
    this.#state = state;
  }

  step(tickInput: TickInput): readonly DomainEvent[] {
    this.#throwIfFaulted();
    // A step after the completion is the caller's error and never latches (ME-12).
    if (this.#state.flow.completedTick !== null) throw new CoreInputError('step', 'mission-completed');
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

  snapshot(): GameSnapshot {
    this.#throwIfFaulted();
    return this.#guard('world.snapshot', () => takeSnapshot(this.#state));
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
