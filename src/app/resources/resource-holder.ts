import type { ResourceGroup } from '../../content/asset-contract.ts';
import type { BudgetRecord } from '../../content/budget.ts';
import { validatePackage, type CompletenessDiagnostic, type GroupInput, type PackageCompletenessResult } from '../../content/completeness.ts';
import { CLASSIC_P2_SLICE } from '../../content/slice-definition.ts';
import {
  cacheFailure, cacheKeyOf, sameCacheKey, type CacheEntry, type CapacityCheckResult, type CommitResult, type ListResult,
  type ResourceCacheFailure, type ResourceCacheKey, type RestoredGroup, type RestoreResult,
} from '../../platform/storage/resource-cache-contract.ts';
import type { ExpectedPackageProfile } from '../../workers/production-package.ts';
import type { ImportGroupSummary, ImportJobOwner } from '../import/import-job-owner.ts';

// The app-level resource holder (P2-11 S-03, S-04, S-12): at most one resource package, owned by one app shell
// instance, with the cache orchestration around it.

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
  /**
   * `failure` is null before any commit; `durationMs` is the page-clock time of the failed commit, null when no commit
   * failed, as when a later listing no longer shows the saved package.
   */
  | { readonly status: 'not-saved'; readonly failure: ResourceCacheFailure | null; readonly durationMs: number | null }
  | { readonly status: 'saving' }
  /** `durationMs` is the page-clock time of the commit or restore that established it, for display only. */
  | { readonly status: 'saved'; readonly via: 'commit' | 'restore'; readonly durationMs: number };

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

/** The latest cache listing, metadata only. */
export type CacheCatalogState =
  | { readonly status: 'checking' }
  | { readonly status: 'unavailable'; readonly failure: ResourceCacheFailure }
  /** `restorable` is the one entry the expected package profile accepts, not yet verified; null when there is none. */
  | { readonly status: 'listed'; readonly restorable: CacheEntry | null };

export type RestoreState =
  | { readonly status: 'idle' }
  | { readonly status: 'restoring' }
  | { readonly status: 'failed'; readonly failure: ResourceCacheFailure; readonly durationMs: number };

/** The same object between two changes. */
export interface ResourceHolderSnapshot {
  readonly package: PackageSummary | null;
  readonly catalog: CacheCatalogState;
  readonly restore: RestoreState;
}

/** The P2-10 cache operations the holder uses; the browser `ResourceCache` satisfies it. */
export interface ResourceCachePort {
  checkCapacity(requiredBytes: number): Promise<CapacityCheckResult>;
  commit(inputs: readonly GroupInput[], limits: BudgetRecord, options: { readonly signal: AbortSignal }): Promise<CommitResult>;
  list(): Promise<ListResult>;
  restore(key: ResourceCacheKey, limits: BudgetRecord): Promise<RestoreResult>;
}

export interface ResourceHolder {
  /**
   * Takes the complete groups of a finished job, judges the whole package and replaces the held one, even when it is
   * partial; a complete package is then committed with the package budget. False, with nothing held, for a job that did
   * not finish, groups already taken, or after dispose.
   */
  acceptImport(job: Pick<ImportJobOwner, 'getSnapshot' | 'takeGroups'>): boolean;
  /** Lists the cache metadata again, as on each return to the menu; only the latest listing is applied. */
  relist(): void;
  /** Advisory space check before an import: the package budget's payload bytes against the storage estimate. */
  checkSpace(): Promise<CapacityCheckResult>;
  /**
   * Commits the held complete package again after a failed commit or once a listing no longer shows it, whatever its
   * origin; false otherwise, such as while saving.
   */
  save(): boolean;
  /**
   * Restores the listed entry the expected profile accepts while no package is held; false while restoring, without
   * such an entry, with a held package or after dispose.
   */
  restore(): boolean;
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
  /** Aborts a commit, drops the package and every listener without notifying them; later results are ignored. Repeatable. */
  dispose(): void;
}

export interface ResourceHolderOptions {
  readonly cache: ResourceCachePort;
  /** Which cached entries may be restored, and the package budget of commits and restores. */
  readonly profile: ExpectedPackageProfile;
  /** The page clock in milliseconds, for displayed durations only. */
  readonly now: () => number;
  /** Receives what a listener throws and unexpected cache rejections; neither other listeners nor the holder see it. */
  readonly reportError: (error: unknown) => void;
}

const NOT_SAVED: PackageCacheState = Object.freeze({ status: 'not-saved', failure: null, durationMs: null });
const SAVING: PackageCacheState = Object.freeze({ status: 'saving' });
const NOT_ATTEMPTED: MissionLoadState = Object.freeze({ status: 'not-attempted' });
const CHECKING: CacheCatalogState = Object.freeze({ status: 'checking' });
const IDLE: RestoreState = Object.freeze({ status: 'idle' });
const RESTORING: RestoreState = Object.freeze({ status: 'restoring' });

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

/** The cache key of the expected original import: its source fingerprint and converter version. */
const expectedKey = ({ sourceFingerprint, converterVersion }: ExpectedPackageProfile): ResourceCacheKey =>
  ({ originType: 'original-import', originToken: sourceFingerprint, converterVersion });

/** The listed entry that may be restored: compatible metadata under the expected key; any other entry is left alone. */
export function restorableEntry(entries: readonly CacheEntry[], profile: ExpectedPackageProfile): CacheEntry | null {
  const expected = expectedKey(profile);
  return entries.find(({ key, status }) => status === 'compatible' && key !== null && sameCacheKey(key, expected)) ?? null;
}

interface Held {
  readonly package: HeldPackage;
  readonly groups: readonly GroupState[];
  cache: PackageCacheState;
  mission: MissionLoadState;
}

interface Replacement {
  readonly origin: PackageOrigin;
  readonly groups: readonly HeldGroup[];
  readonly completeness: PackageCompletenessResult;
  readonly states: readonly GroupState[];
  readonly cache: PackageCacheState;
}

class Holder implements ResourceHolder {
  readonly #cache: ResourceCachePort;
  readonly #profile: ExpectedPackageProfile;
  readonly #now: () => number;
  readonly #reportError: (error: unknown) => void;
  readonly #listeners = new Set<{ readonly listener: () => void }>();
  readonly #replaceListeners = new Set<{ readonly listener: (outgoing: HeldPackage) => void }>();
  #held: Held | null = null;
  #generation = 0;
  #catalog = CHECKING;
  #restore = IDLE;
  /** Identifies the latest listing; an earlier one's result is dropped. */
  #listing = 0;
  /** Changes with the held package and its cache state, so a listing begun before such a change cannot override it. */
  #cacheEpoch = 0;
  /** Aborts the held package's running commit; null when none runs. */
  #commit: AbortController | null = null;
  #snapshot: ResourceHolderSnapshot;
  #disposed = false;

  constructor({ cache, profile, now, reportError }: ResourceHolderOptions) {
    this.#cache = cache;
    this.#profile = profile;
    this.#now = now;
    this.#reportError = reportError;
    this.#snapshot = this.#build();
    this.relist();
  }

  acceptImport(job: Pick<ImportJobOwner, 'getSnapshot' | 'takeGroups'>): boolean {
    if (this.#disposed) return false;
    const snapshot = job.getSnapshot();
    if (snapshot.status !== 'finished') return false;
    const taken = job.takeGroups();
    if (taken === null) return false;
    // The handed-over groups are already frozen, and their payloads are the holder's from now on.
    const groups: readonly HeldGroup[] = Object.freeze([...taken].sort((left, right) => definitionIndex(left.group) - definitionIndex(right.group)));
    const completeness = validatePackage(CLASSIC_P2_SLICE, groups);
    const complete = completeness.status === 'complete';
    const states = importGroupStates(snapshot.groups);
    if (!this.#replace({ origin: 'import', groups, completeness, states, cache: complete ? SAVING : NOT_SAVED })) return false;
    if (complete) this.#startCommit();
    return true;
  }

  relist(): void {
    if (this.#disposed) return;
    const listing = ++this.#listing;
    const generation = this.#generation;
    const epoch = this.#cacheEpoch;
    if (this.#catalog !== CHECKING) {
      this.#catalog = CHECKING;
      this.#publish();
    }
    this.#settle(() => this.#cache.list(), 'read-failed', 'list', result => this.#listed(listing, generation, epoch, result));
  }

  checkSpace(): Promise<CapacityCheckResult> {
    return this.#cache.checkCapacity(this.#profile.limits.payloadBytes);
  }

  save(): boolean {
    const held = this.#held;
    if (this.#disposed || held?.package.completeness.status !== 'complete' || held.cache.status !== 'not-saved') return false;
    this.#setCache(held, SAVING);
    this.#publish();
    this.#startCommit();
    return true;
  }

  restore(): boolean {
    const catalog = this.#catalog;
    if (this.#disposed || this.#held !== null || this.#restore === RESTORING || catalog.status !== 'listed' || catalog.restorable === null) return false;
    const generation = this.#generation;
    const started = this.#now();
    this.#restore = RESTORING;
    this.#publish();
    this.#settle(() => this.#cache.restore(catalog.restorable!.key!, this.#profile.limits), 'read-failed', 'restore',
      result => this.#restored(generation, started, result));
    return true;
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
    this.#commit?.abort();
    this.#commit = null;
    this.#held = null;
    this.#snapshot = this.#build();
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
   * Runs a cache operation and hands its result to `apply`; an unexpected rejection is reported and handed over as the
   * `code` failure at `location`. The holder decides afterwards whether the result is still current.
   */
  #settle<Result>(run: () => Promise<Result>, code: 'read-failed' | 'write-failed', location: string, apply: (result: Result | ResourceCacheFailure) => void): void {
    let operation: Promise<Result>;
    try {
      operation = run();
    } catch (error) {
      operation = Promise.reject(error);
    }
    operation.then(apply, (error: unknown) => {
      this.#report(error);
      apply(cacheFailure(code, location));
    });
  }

  #listed(listing: number, generation: number, epoch: number, result: ListResult): void {
    if (this.#disposed || listing !== this.#listing) return;
    // A listing begun for an earlier package is dropped, and the current package is listed afresh.
    if (generation !== this.#generation) return this.relist();
    if (result.status === 'failed') {
      this.#catalog = Object.freeze({ status: 'unavailable', failure: result });
    } else {
      this.#catalog = Object.freeze({ status: 'listed', restorable: restorableEntry(result.entries, this.#profile) });
      const held = this.#held;
      // A saved package whose key is gone was cleared from the browser; it stays usable in memory.
      if (held?.cache.status === 'saved' && held.package.completeness.status === 'complete' && epoch === this.#cacheEpoch) {
        const key = cacheKeyOf(held.package.completeness.identity);
        if (!result.entries.some(entry => entry.key !== null && sameCacheKey(entry.key, key))) {
          this.#setCache(held, Object.freeze({ status: 'not-saved', failure: cacheFailure('not-found', 'key'), durationMs: null }));
        }
      }
    }
    this.#publish();
  }

  /** Commits the held complete package with the package budget; only its own result, while still held, applies. */
  #startCommit(): void {
    const { groups } = this.#held!.package;
    const controller = new AbortController();
    this.#commit = controller;
    const started = this.#now();
    this.#settle(() => this.#cache.commit(groups, this.#profile.limits, { signal: controller.signal }), 'write-failed', 'commit', result => {
      // Replacement and dispose clear the commit, so a stale result never changes the package that is now held.
      if (this.#disposed || this.#commit !== controller) return;
      this.#commit = null;
      const durationMs = this.#now() - started;
      this.#setCache(this.#held!, result.status === 'committed'
        ? Object.freeze({ status: 'saved', via: 'commit', durationMs })
        : Object.freeze({ status: 'not-saved', failure: result, durationMs }));
      this.#publish();
    });
  }

  #restored(generation: number, started: number, result: RestoreResult): void {
    // A package replaced the held one meanwhile, which ended the restore: the late result is never held.
    if (this.#disposed || generation !== this.#generation) return;
    const durationMs = this.#now() - started;
    const fail = (failure: ResourceCacheFailure): void => {
      this.#restore = Object.freeze({ status: 'failed', failure, durationMs });
      this.#publish();
    };
    if (result.status === 'failed') return fail(result);
    if (!sameCacheKey(cacheKeyOf(result.identity), expectedKey(this.#profile))) return fail(cacheFailure('cache-incompatible', 'identity'));
    const groups: readonly HeldGroup[] = Object.freeze(result.groups.map(({ manifest, payloads, sources }) => Object.freeze({ group: manifest.group, manifest, payloads, sources })));
    const completeness = validatePackage(CLASSIC_P2_SLICE, groups);
    if (completeness.status !== 'complete') return fail(cacheFailure('cache-corrupt', 'groups', { diagnostics: completeness.diagnostics }));
    const cache: PackageCacheState = Object.freeze({ status: 'saved', via: 'restore', durationMs });
    this.#replace({ origin: 'cache', groups, completeness, states: completeStates(result.groups), cache });
  }

  #setCache(held: Held, state: PackageCacheState): void {
    held.cache = state;
    this.#cacheEpoch += 1;
  }

  /**
   * Lets the outgoing package's consumers release it, aborts its commit, ends any restore, then holds the new package
   * under the next generation; false when a release listener disposed the holder.
   */
  #replace({ origin, groups, completeness, states, cache }: Replacement): boolean {
    const outgoing = this.#held?.package;
    if (outgoing) this.#notify(this.#replaceListeners, listener => listener(outgoing));
    if (this.#disposed) return false;
    this.#commit?.abort();
    this.#commit = null;
    this.#restore = IDLE;
    this.#generation += 1;
    this.#cacheEpoch += 1;
    const held = Object.freeze({ generation: this.#generation, origin, groups, completeness });
    this.#held = { package: held, groups: states, cache, mission: NOT_ATTEMPTED };
    this.#publish();
    return true;
  }

  #build(): ResourceHolderSnapshot {
    const held = this.#held;
    return Object.freeze({
      package: held === null ? null : Object.freeze({
        generation: held.package.generation,
        origin: held.package.origin,
        groups: held.groups,
        completeness: held.package.completeness,
        cache: held.cache,
        mission: held.mission,
      }),
      catalog: this.#catalog,
      restore: this.#restore,
    });
  }

  #publish(): void {
    this.#snapshot = this.#build();
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

/** Every slice group of a restored package, complete with its manifest's Asset count. */
const completeStates = (groups: readonly RestoredGroup[]): readonly GroupState[] =>
  Object.freeze(groups.map(({ manifest }) => Object.freeze({ group: manifest.group, status: 'complete' as const, assets: manifest.assets.length })));

/** Creates the holder of one app shell instance and lists the cache; nothing is shared across instances. */
export function createResourceHolder(options: ResourceHolderOptions): ResourceHolder {
  return new Holder(options);
}
