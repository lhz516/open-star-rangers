import type { ResourceGroup } from '../../content/asset-contract.ts';
import { validatePackage, type CompletenessDiagnostic, type GroupInput, type PackageCompletenessResult } from '../../content/completeness.ts';
import { CLASSIC_P2_SLICE } from '../../content/slice-definition.ts';
import type { ResourceCacheFailure } from '../../platform/storage/resource-cache-contract.ts';
import type { ImportGroupSummary, ImportJobOwner } from '../import/import-job-owner.ts';

// The app-level resource holder (P2-11 S-03, S-12): at most one resource package, owned by one app shell instance.

export type PackageOrigin = 'import' | 'cache';

/** A complete group the holder owns; its payload views belong to the holder and are never transferred or changed. */
export interface HeldGroup extends GroupInput {
  readonly group: ResourceGroup;
}

/** The held package: its complete groups in slice definition order and the whole-package judgement over them. */
export interface HeldPackage {
  /** Increases with every replacement; results begun for an older generation are stale. */
  readonly generation: number;
  readonly origin: PackageOrigin;
  readonly groups: readonly HeldGroup[];
  readonly completeness: PackageCompletenessResult;
}

/** One slice group as the package shows it; only complete groups are held. */
export type GroupState =
  | { readonly group: ResourceGroup; readonly status: 'complete'; readonly assets: number }
  | { readonly group: ResourceGroup; readonly status: 'incomplete'; readonly diagnostics: readonly CompletenessDiagnostic[] }
  | { readonly group: ResourceGroup; readonly status: 'missing' };

/** Whether this package is stored in the browser; derived from cache results only, never from the job's end. */
export type PackageCacheState =
  | { readonly status: 'not-saved'; readonly failure: ResourceCacheFailure | null }
  | { readonly status: 'saving' }
  | { readonly status: 'saved' };

export type MissionLoadState = { readonly status: 'not-attempted' };

/** Frozen plain data without payloads. */
export interface PackageSummary {
  readonly generation: number;
  readonly origin: PackageOrigin;
  /** Every slice group in definition order. */
  readonly groups: readonly GroupState[];
  readonly completeness: PackageCompletenessResult;
  readonly cache: PackageCacheState;
  readonly mission: MissionLoadState;
}

/** The same object between two changes. */
export interface ResourceHolderSnapshot {
  readonly package: PackageSummary | null;
}

export interface ResourceHolder {
  /**
   * Takes the complete groups of a finished job, judges the whole package and replaces the held one, even when it is
   * partial. False, with nothing held, for a job that did not finish, groups already taken, or after dispose.
   */
  acceptImport(job: Pick<ImportJobOwner, 'getSnapshot' | 'takeGroups'>): boolean;
  /** The held package with its payloads, for the app's own consumers; null when none is held and after dispose. */
  current(): HeldPackage | null;
  /**
   * Called synchronously with the outgoing package before it is replaced, so its consumers release what references it
   * first; returns the unsubscribe function.
   */
  beforeReplace(listener: (outgoing: HeldPackage) => void): () => void;
  /** Notified synchronously after each change; returns the unsubscribe function. */
  subscribe(listener: () => void): () => void;
  getSnapshot(): ResourceHolderSnapshot;
  /** Drops the package and every listener without notifying them; later results are ignored. Repeatable. */
  dispose(): void;
}

export interface ResourceHolderOptions {
  /** Receives what a listener throws; neither other listeners nor the holder see it. */
  readonly reportError: (error: unknown) => void;
}

const EMPTY: ResourceHolderSnapshot = Object.freeze({ package: null });
const NOT_SAVED: PackageCacheState = Object.freeze({ status: 'not-saved', failure: null });
const NOT_ATTEMPTED: MissionLoadState = Object.freeze({ status: 'not-attempted' });

const definitionIndex = (group: ResourceGroup): number => CLASSIC_P2_SLICE.groups.indexOf(group);

/** Each slice group's state from the job's group summaries; a group the job never sent is missing. */
function importGroupStates(summaries: readonly ImportGroupSummary[]): readonly GroupState[] {
  return Object.freeze(CLASSIC_P2_SLICE.groups.map((group): GroupState => {
    const summary = summaries.find(entry => entry.group === group);
    if (!summary) return Object.freeze({ group, status: 'missing' });
    return summary.status === 'group-complete'
      ? Object.freeze({ group, status: 'complete', assets: summary.assets! })
      : Object.freeze({ group, status: 'incomplete', diagnostics: summary.diagnostics });
  }));
}

interface Held {
  readonly package: HeldPackage;
  readonly groups: readonly GroupState[];
  cache: PackageCacheState;
  mission: MissionLoadState;
}

class Holder implements ResourceHolder {
  readonly #reportError: (error: unknown) => void;
  readonly #listeners = new Set<{ readonly listener: () => void }>();
  readonly #replaceListeners = new Set<{ readonly listener: (outgoing: HeldPackage) => void }>();
  #held: Held | null = null;
  #generation = 0;
  #snapshot = EMPTY;
  #disposed = false;

  constructor({ reportError }: ResourceHolderOptions) {
    this.#reportError = reportError;
  }

  acceptImport(job: Pick<ImportJobOwner, 'getSnapshot' | 'takeGroups'>): boolean {
    if (this.#disposed) return false;
    const snapshot = job.getSnapshot();
    if (snapshot.status !== 'finished') return false;
    const taken = job.takeGroups();
    if (taken === null) return false;
    // The handed-over groups are already frozen, and their payloads are the holder's from now on.
    const groups: readonly HeldGroup[] = Object.freeze([...taken].sort((left, right) => definitionIndex(left.group) - definitionIndex(right.group)));
    return this.#replace('import', groups, importGroupStates(snapshot.groups), NOT_SAVED);
  }

  current(): HeldPackage | null {
    return this.#held?.package ?? null;
  }

  beforeReplace(listener: (outgoing: HeldPackage) => void): () => void {
    return this.#add(this.#replaceListeners, listener);
  }

  subscribe(listener: () => void): () => void {
    return this.#add(this.#listeners, listener);
  }

  getSnapshot(): ResourceHolderSnapshot {
    return this.#snapshot;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#held = null;
    this.#snapshot = EMPTY;
    this.#listeners.clear();
    this.#replaceListeners.clear();
  }

  #add<Listener>(listeners: Set<{ readonly listener: Listener }>, listener: Listener): () => void {
    if (this.#disposed) return () => undefined;
    const entry = { listener };
    listeners.add(entry);
    return () => { listeners.delete(entry); };
  }

  /**
   * Lets the outgoing package's consumers release it, then holds the new package under the next generation; false when
   * a release listener disposed the holder.
   */
  #replace(origin: PackageOrigin, groups: readonly HeldGroup[], states: readonly GroupState[], cache: PackageCacheState): boolean {
    const outgoing = this.#held?.package;
    if (outgoing) this.#notify(this.#replaceListeners, listener => listener(outgoing));
    if (this.#disposed) return false;
    this.#generation += 1;
    const completeness = validatePackage(CLASSIC_P2_SLICE, groups);
    const held = Object.freeze({ generation: this.#generation, origin, groups, completeness });
    this.#held = { package: held, groups: states, cache, mission: NOT_ATTEMPTED };
    this.#publish();
    return true;
  }

  #publish(): void {
    const held = this.#held;
    this.#snapshot = held === null ? EMPTY : Object.freeze({
      package: Object.freeze({
        generation: held.package.generation,
        origin: held.package.origin,
        groups: held.groups,
        completeness: held.package.completeness,
        cache: held.cache,
        mission: held.mission,
      }),
    });
    this.#notify(this.#listeners, listener => listener());
  }

  /** A listener removed during the notification, including by dispose, is skipped. */
  #notify<Listener>(listeners: Set<{ readonly listener: Listener }>, call: (listener: Listener) => void): void {
    for (const entry of [...listeners]) {
      if (!listeners.has(entry)) continue;
      try {
        call(entry.listener);
      } catch (error) {
        this.#report(error);
      }
    }
  }

  #report(error: unknown): void {
    try {
      this.#reportError(error);
    } catch {
      // A failing outlet must not break the holder or the other listeners either.
    }
  }
}

/** Creates the holder of one app shell instance; nothing is shared across instances. */
export function createResourceHolder(options: ResourceHolderOptions): ResourceHolder {
  return new Holder(options);
}
