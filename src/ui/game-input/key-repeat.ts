/**
 * Bounded after-frame repeat of held discrete commands (docs/plan/p3/05/spec.md: 离散命令与重复, 技术决定 3). The first
 * new press enqueues at once, outside this scheduler, and starts it at that moment's `projection.clock.clock` c. The
 * repeat is due at c + 32; it is only observed in running session frames, at most once per held key and frame, and the
 * next is due at the observed clock + 16. A frame without ticks sees no new clock, so it cannot repeat the same due
 * again, and a late frame repeats once without making up the missed repeats. 32 and 16 clock units (1/64 s) are the
 * project's rhythm, not the original's BIOS delay or DOS polling period. No timer, per-tick callback or rAF.
 */

/** Clock units from the first press to the first repeat. */
const REPEAT_DELAY = 32;
/** Clock units from an observed repeat to the next. */
const REPEAT_INTERVAL = 16;
const NONE: readonly string[] = Object.freeze([]);

/** Keyed by `KeyboardEvent.code`. */
export class KeyRepeat {
  /** Next due clock per repeating code, in the order the codes started. */
  readonly #due = new Map<string, number>();

  /** Starts `code`'s repeat from the clock of its first press; a code already repeating keeps its schedule. */
  start(code: string, clock: number): void {
    if (!this.#due.has(code)) this.#due.set(code, clock + REPEAT_DELAY);
  }

  has(code: string): boolean {
    return this.#due.has(code);
  }

  /** Ends `code`'s repeat; only a new press can start it again. */
  cancel(code: string): void {
    this.#due.delete(code);
  }

  clear(): void {
    this.#due.clear();
  }

  /** The codes due at a running frame's `clock`, in start order; each one's next repeat is due at `clock` + 16. */
  due(clock: number): readonly string[] {
    let codes: string[] | null = null;
    for (const [code, due] of this.#due) {
      if (clock < due) continue;
      (codes ??= []).push(code);
      this.#due.set(code, clock + REPEAT_INTERVAL);
    }
    return codes ? Object.freeze(codes) : NONE;
  }
}
