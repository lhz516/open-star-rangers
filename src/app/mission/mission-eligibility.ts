/**
 * Start eligibility (docs/plan/p3/04/spec.md, 开始资格): whether the main menu may offer the mission, or why not. It reads
 * only the holder's whole-package judgement and mission load diagnostics, and the mission slot's cleanup latch: a
 * restorable cache entry, a finished import job or a saved package never stands in for them, and a complete package
 * that is not saved, or failed to save, is still eligible. Eligibility admits the start page only; world creation checks
 * the rest when the start is confirmed.
 */
import type { CompletenessDiagnostic } from '../../content/completeness.ts';
import type { MissionFailure } from '../resources/mission-diagnostics.ts';
import type { GroupState, ResourceHolderSnapshot } from '../resources/resource-holder.ts';

export type MissionEligibility =
  /** `generation` is the held package's, which the mission owner binds. */
  | { readonly status: 'eligible'; readonly generation: number }
  /** A mission owner's cleanup failed earlier; no owner is created again until the page reloads. */
  | { readonly status: 'cleanup-failed'; readonly cause: unknown }
  | { readonly status: 'no-package' }
  /**
   * `groups` lists the slice groups that are incomplete or missing, in definition order, and `diagnostics` the
   * whole-package judgement's, which also covers complete groups that miss a cross-group dependency.
   */
  | { readonly status: 'package-incomplete'; readonly groups: readonly GroupState[]; readonly diagnostics: readonly CompletenessDiagnostic[] }
  | { readonly status: 'mission-not-attempted' }
  | { readonly status: 'mission-failed'; readonly failure: MissionFailure };

/** The first reason that applies, in the order above, or `eligible`. Results are frozen. */
export function missionEligibility(snapshot: ResourceHolderSnapshot, cleanupFailure: { readonly cause: unknown } | null): MissionEligibility {
  if (cleanupFailure) return Object.freeze({ status: 'cleanup-failed', cause: cleanupFailure.cause });
  const held = snapshot.package;
  if (!held) return Object.freeze({ status: 'no-package' });
  if (held.completeness.status !== 'complete') {
    const groups = Object.freeze(held.groups.filter(({ status }) => status !== 'complete'));
    return Object.freeze({ status: 'package-incomplete', groups, diagnostics: held.completeness.diagnostics });
  }
  switch (held.mission.status) {
    case 'not-attempted': return Object.freeze({ status: 'mission-not-attempted' });
    case 'failed': return Object.freeze({ status: 'mission-failed', failure: held.mission.failure });
    case 'loaded': return Object.freeze({ status: 'eligible', generation: held.generation });
  }
}
