/**
 * The rules version of formal Core (docs/plan/p3/02/spec.md, 快照、哈希与 replay, 版本). Code holds it; a snapshot or a
 * replay record only states the version it was made with, and only records of this version replay. It must be
 * incremented by every change that can change a result from the same configuration, content and tick inputs: the
 * pipeline's stages or their order, numeric semantics, the RNG draws or their order, how an action is interpreted,
 * the events a rule emits, or the state a rule keeps. A change to the shape of a snapshot or replay record increments
 * that format's own version instead; a change that alters both increments both.
 */
export const RULES_VERSION = 8;
