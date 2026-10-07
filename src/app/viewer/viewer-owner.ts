/**
 * The resource viewer's owner and the viewer slot of one app instance (P2-11 S-07, S-08, S-12, technical decision 1).
 * The owner holds the renderer and the audition of the held package, lists the package's items, shows the selected
 * one and keeps the 3D view. Before the holder replaces the package it releases what references the outgoing content: the shown item's GPU
 * resources and the audio, whose context must be confirmed closed before the next package's audio exists. Any failed
 * release latches the slot, so no viewer is created again until the page reloads; import and the demo are unaffected.
 */
import type { AssetId } from '../../content/asset-id.ts';
import { attemptAll } from '../../render/scene/cleanup.ts';
import { createViewerRenderer, type ViewerRenderer, type ViewerRendererOptions } from '../../render/viewer/viewer-renderer.ts';
import { applyViewAction, INITIAL_VIEW, type ViewerView, type ViewerViewAction } from '../../render/viewer/viewer-view.ts';
import { RollbackError } from '../session/rollback-error.ts';
import type { ResourceHolder } from '../resources/resource-holder.ts';
import { createViewerAudio, type AudioCloseOutcome, type ViewerAudio, type ViewerAudioOptions } from './viewer-audio.ts';
import {
  resolveEntry, viewerCatalog, type PackagePayloads, type ResolvedEntry, type ViewerEntry, type ViewerItemFailure, type ViewerVariant,
} from './viewer-items.ts';

export interface ViewerOwnerSnapshot {
  /** The generation of the package shown; null without one. */
  readonly generation: number | null;
  /** The models, effects and 2D items of the package's complete groups. */
  readonly entries: readonly ViewerEntry[];
  /** The selected item, or null. */
  readonly selected: AssetId | null;
  /** The selected variant: a model's part list or an effect's view; 0 otherwise. */
  readonly variant: number;
  /** The selected item's variants; empty for 2D items, failed items and without a selection. */
  readonly variants: readonly ViewerVariant[];
  /** The 3D view, kept across items and packages. */
  readonly view: ViewerView;
  /** Items that could not be read or expanded, by Asset ID. */
  readonly failures: Readonly<Record<string, ViewerItemFailure>>;
  /** The package's audition; null until the previous audio context is confirmed closed, and without a package. */
  readonly audio: ViewerAudio | null;
}

export interface ViewerOwner {
  readonly renderer: ViewerRenderer;
  /** Frozen, and the same object until the next change. */
  getSnapshot(): ViewerOwnerSnapshot;
  subscribe(listener: () => void): () => void;
  /**
   * Shows a variant of a listed item (a model's part list or an effect's view, 0 for 2D items), or nothing for null. An
   * item that cannot be read or expanded is only marked failed; an unknown item or variant changes nothing.
   */
  select(id: AssetId | null, variant?: number): void;
  /** Changes the 3D view; the renderer draws once when the picture changes. Throws a RangeError for an invalid action. */
  changeView(action: ViewerViewAction): void;
}

export interface ViewerOwnerOptions {
  readonly holder: ResourceHolder;
  /** The renderer's surface, or why none could be created. */
  readonly render: ViewerRendererOptions;
  readonly audio: Omit<ViewerAudioOptions, 'reportError'>;
  readonly reportError: (error: unknown) => void;
}

/** What one release left: its synchronous failures, and when every audio context it closed is confirmed closed. */
interface Release {
  readonly failures: readonly unknown[];
  /** True once confirmed; false when a close failed, which the owner has already latched. */
  readonly closed: Promise<boolean>;
}

const NO_FAILURES = Object.freeze({}) as Readonly<Record<string, ViewerItemFailure>>;
const EMPTY = Object.freeze([]) as readonly never[];

class Owner implements ViewerOwner {
  readonly renderer: ViewerRenderer;
  readonly #holder: ResourceHolder;
  readonly #audioOptions: ViewerAudioOptions;
  readonly #reportError: (error: unknown) => void;
  /** Reports a release that failed after the owner was created, such as a replaced package's audio close. */
  readonly #latch: (cause: unknown) => void;
  readonly #listeners = new Set<{ readonly listener: () => void }>();
  readonly #cleanups: (() => void)[] = [];
  #payloads: PackagePayloads = new Map();
  /** The selected entry, read and expanded once for all its variants. */
  #resolved: { readonly id: AssetId; readonly entry: ResolvedEntry } | null = null;
  #snapshot: ViewerOwnerSnapshot;
  /** Settles once the previous audio context closed: true when it may be followed by a new one. */
  #audioReady: Promise<boolean>;
  #audio: ViewerAudio | null = null;
  #disposed = false;

  /**
   * Throws a RollbackError when the renderer or the holder subscriptions could not be undone after a failed creation.
   * A surface that cannot be connected but is released cleanly leaves the viewer without a picture, still listing items.
   */
  constructor({ holder, render, audio, reportError }: ViewerOwnerOptions, audioReady: Promise<boolean>, latch: (cause: unknown) => void) {
    this.#holder = holder;
    this.#audioOptions = { ...audio, reportError };
    this.#reportError = reportError;
    this.#latch = latch;
    this.#audioReady = audioReady;
    let renderer: ViewerRenderer;
    try {
      renderer = createViewerRenderer(render);
    } catch (error) {
      if (error instanceof RollbackError) throw error;
      renderer = createViewerRenderer({ unavailable: error, reportError });
    }
    this.renderer = renderer;
    this.#snapshot = Object.freeze({
      generation: null, entries: EMPTY, selected: null, variant: 0, variants: EMPTY, view: INITIAL_VIEW, failures: NO_FAILURES, audio: null,
    });
    try {
      this.#cleanups.push(holder.beforeReplace(() => this.#releaseContent()));
      this.#cleanups.push(holder.subscribe(() => this.#follow()));
      this.#follow();
    } catch (cause) {
      const { failures } = this.dispose();
      if (failures.length > 0) throw new RollbackError(cause, failures, 'Viewer creation and cleanup failed');
      throw cause;
    }
  }

  getSnapshot(): ViewerOwnerSnapshot {
    return this.#snapshot;
  }

  subscribe(listener: () => void): () => void {
    if (this.#disposed) return () => undefined;
    const entry = { listener };
    this.#listeners.add(entry);
    return () => { this.#listeners.delete(entry); };
  }

  select(id: AssetId | null, variant = 0): void {
    const { selected, variant: current, entries, failures } = this.#snapshot;
    if (this.#disposed || (id === selected && (id === null || variant === current))) return;
    const entry = id === null ? null : entries.find(candidate => candidate.id === id);
    if (entry === undefined) return;
    if (entry === null) {
      this.#resolved = null;
      this.renderer.show(null);
      return this.#set({ selected: null, variant: 0, variants: EMPTY });
    }
    let resolved = this.#resolved?.id === entry.id ? this.#resolved.entry : null;
    if (resolved === null) {
      const resolution = resolveEntry(entry, this.#payloads);
      if (resolution.status === 'failed') {
        this.#resolved = null;
        this.renderer.show(null);
        return this.#set({ selected: entry.id, variant, variants: EMPTY, failures: Object.freeze({ ...failures, [entry.id]: resolution.failure }) });
      }
      resolved = resolution.entry;
    }
    const item = resolved.item(variant);
    if (item === null) return;
    this.#resolved = { id: entry.id, entry: resolved };
    this.renderer.show(item);
    this.#set({ selected: entry.id, variant, variants: resolved.variants });
  }

  changeView(action: ViewerViewAction): void {
    if (this.#disposed) return;
    const view = applyViewAction(this.#snapshot.view, action);
    if (view === this.#snapshot.view) return;
    this.renderer.setView(view);
    this.#set({ view });
  }

  /**
   * Stops following the holder, then releases the renderer and the audio, attempting every step. The release is closed
   * only once this audio and every earlier one are confirmed closed.
   */
  dispose(): Release {
    this.#disposed = true;
    this.#listeners.clear();
    this.#payloads = new Map();
    this.#resolved = null;
    const failures = attemptAll([...this.#cleanups.splice(0), () => { this.renderer.dispose(); }]);
    return { failures, closed: this.#afterClose(this.#releaseAudio()) };
  }

  /** Before the holder replaces the package: nothing shown, no pending audition, the audio released. */
  #releaseContent(): void {
    try {
      this.renderer.releaseItem();
    } catch (error) {
      this.#latch(error);
    }
    this.#audioReady = this.#afterClose(this.#releaseAudio());
    this.#payloads = new Map();
    this.#resolved = null;
    this.#set({ generation: null, entries: EMPTY, selected: null, variant: 0, variants: EMPTY, failures: NO_FAILURES, audio: null });
  }

  /**
   * Settles once `closing` and every earlier close settled: true when all were confirmed, false when any failed. A
   * failure latches the slot. Without a close, the earlier barrier stands.
   */
  #afterClose(closing: Promise<AudioCloseOutcome> | null): Promise<boolean> {
    if (closing === null) return this.#audioReady;
    return Promise.all([this.#audioReady, closing]).then(([earlier, outcome]) => {
      if (outcome.status !== 'close-failed') return earlier;
      this.#latch(outcome.cause);
      return false;
    });
  }

  /** Releases the audio, if any; null when there was none to close. */
  #releaseAudio(): Promise<AudioCloseOutcome> | null {
    const audio = this.#audio;
    this.#audio = null;
    if (!audio) return null;
    audio.cancelPending();
    return audio.dispose();
  }

  /** Lists a newly held package, and creates its audio once the previous audio context closed. */
  #follow(): void {
    if (this.#disposed) return;
    const held = this.#holder.current();
    if (!held || held.generation === this.#snapshot.generation) return;
    const { entries, payloads } = viewerCatalog(held.groups);
    this.#payloads = payloads;
    this.#set({ generation: held.generation, entries, selected: null, variant: 0, variants: EMPTY, failures: NO_FAILURES, audio: null });
    const audioGroup = held.groups.find(({ group }) => group === 'audio') ?? null;
    const generation = held.generation;
    void this.#audioReady.then(ready => {
      if (!ready || this.#disposed || this.#snapshot.generation !== generation || this.#audio) return;
      try {
        this.#audio = createViewerAudio(this.#audioOptions, audioGroup);
      } catch (error) {
        this.#reportError(error);
        return;
      }
      this.#set({ audio: this.#audio });
    });
  }

  #set(change: Partial<ViewerOwnerSnapshot>): void {
    this.#snapshot = Object.freeze({ ...this.#snapshot, ...change });
    for (const entry of [...this.#listeners]) {
      if (!this.#listeners.has(entry)) continue;
      this.#attempt(entry.listener);
    }
  }

  #attempt(run: () => void): void {
    try {
      run();
    } catch (error) {
      try {
        this.#reportError(error);
      } catch {
        // A failing outlet must not break the owner or the other listeners either.
      }
    }
  }
}

export interface ViewerLifecycleOptions {
  /** Receives the first release failure, once; the slot is latched from then on. */
  readonly onCleanupFailure: (cause: unknown) => void;
  readonly reportError: (error: unknown) => void;
}

export interface ViewerLifecycle {
  /**
   * Creates the viewer owner unless a release failed; its audio waits until the previous viewer's audio context is
   * confirmed closed. Closes a still-open owner first.
   */
  open(options: ViewerOwnerOptions): ViewerOwner | null;
  /** Releases the open owner, if any; a failed release latches. */
  close(): void;
  /** The latched release failure, or null. */
  cleanupFailure(): { readonly cause: unknown } | null;
}

class Lifecycle implements ViewerLifecycle {
  readonly #options: ViewerLifecycleOptions;
  #failure: { readonly cause: unknown } | null = null;
  #owner: Owner | null = null;
  /** The latest audio close: true once confirmed, false when it failed. */
  #closed: Promise<boolean> = Promise.resolve(true);

  constructor(options: ViewerLifecycleOptions) {
    this.#options = options;
  }

  /** Throws what a failed creation throws, after latching a RollbackError, whose cleanup failed. */
  open(options: ViewerOwnerOptions): ViewerOwner | null {
    this.close();
    if (this.#failure) return null;
    try {
      this.#owner = new Owner(options, this.#closed, cause => this.#latch(cause));
    } catch (error) {
      if (error instanceof RollbackError) this.#latch(error);
      throw error;
    }
    return this.#owner;
  }

  close(): void {
    const owner = this.#owner;
    if (!owner) return;
    this.#owner = null;
    const { failures, closed } = owner.dispose();
    if (failures.length > 0) this.#latch(failures.length === 1 ? failures[0] : new AggregateError(failures, 'Viewer release failed'));
    this.#closed = closed;
  }

  cleanupFailure(): { readonly cause: unknown } | null {
    return this.#failure;
  }

  #latch(cause: unknown): void {
    if (this.#failure) return;
    this.#failure = Object.freeze({ cause });
    try {
      this.#options.onCleanupFailure(cause);
    } catch (error) {
      try {
        this.#options.reportError(error);
      } catch {
        // The outlet itself failed and there is no other; the latch above does not depend on it.
      }
    }
  }
}

/** The viewer slot of one app instance. */
export function createViewerLifecycle(options: ViewerLifecycleOptions): ViewerLifecycle {
  return new Lifecycle(options);
}
