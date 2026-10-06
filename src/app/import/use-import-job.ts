/**
 * Holds the import page's job owner (P2-11 S-02, S-12). The effect creates it with the app's Worker port factory and
 * disposes it on unmount, a StrictMode re-run or a Fast Refresh, which terminates a running Worker. A job that finishes
 * hands its groups to the resource holder at once, from the owner's own notification, so leaving the page right after
 * never drops them; while no holder can take them (between holders), the hand-off waits for the next holder. The commit
 * that follows belongs to the holder. Each job is timed on the page clock.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { AppPorts } from '../ports.ts';
import type { ResourceHolder } from '../resources/resource-holder.ts';
import { createImportJobOwner, type ImportJobOwner, type ImportJobSnapshot, type ImportStartResult } from './import-job-owner.ts';

export interface ImportJobHandle {
  /** Null before the effect runs and between owners. */
  readonly owner: ImportJobOwner | null;
  readonly snapshot: ImportJobSnapshot | null;
  /** Page-clock time from the start of the latest ended job to its end; null while none has ended since the last start. */
  readonly durationMs: number | null;
  /** The holder generation of the package this page's latest job produced; null before it was handed over. */
  readonly resultGeneration: number | null;
  start(files: readonly File[]): ImportStartResult;
}

const DISPOSED: ImportStartResult = Object.freeze({ status: 'disposed' });
const ENDED = new Set<ImportJobSnapshot['status']>(['finished', 'failed', 'cancelled']);

export function useImportJob({ createImportPort, reportError }: Pick<AppPorts, 'createImportPort' | 'reportError'>, holder: ResourceHolder | null): ImportJobHandle {
  const [owner, setOwner] = useState<ImportJobOwner | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [result, setResult] = useState<{ readonly holder: ResourceHolder; readonly generation: number } | null>(null);
  const holderRef = useRef(holder);
  holderRef.current = holder;
  /** When the current job started; its job ID stays null until `start` returns, since a start can end the job at once. */
  const started = useRef<{ jobId: number | null; at: number } | null>(null);
  /** A finished job's owner whose groups no holder has taken yet. */
  const pending = useRef<ImportJobOwner | null>(null);
  /** Hands the finished groups to the current holder, or keeps them waiting for one. */
  const handOff = useCallback((finished: ImportJobOwner): void => {
    const current = holderRef.current;
    if (current?.acceptImport(finished)) {
      pending.current = null;
      setResult({ holder: current, generation: current.current()!.generation });
    } else {
      pending.current = finished;
    }
  }, []);
  useEffect(() => {
    const created = createImportJobOwner({ createPort: createImportPort, reportError });
    created.subscribe(() => {
      const snapshot = created.getSnapshot();
      const job = started.current;
      if (!job || !ENDED.has(snapshot.status) || (job.jobId !== null && 'jobId' in snapshot && snapshot.jobId !== job.jobId)) return;
      started.current = null;
      setDurationMs(performance.now() - job.at);
      if (snapshot.status === 'finished') handOff(created);
    });
    setOwner(created);
    return () => {
      setOwner(null);
      started.current = null;
      pending.current = null;
      created.dispose();
    };
  }, [createImportPort, reportError, handOff]);
  useEffect(() => {
    if (holder && pending.current) handOff(pending.current);
  }, [holder, handOff]);
  const subscribe = useCallback((listener: () => void) => owner?.subscribe(listener) ?? (() => undefined), [owner]);
  const snapshot = useSyncExternalStore(subscribe, () => owner?.getSnapshot() ?? null);
  const start = useCallback((files: readonly File[]): ImportStartResult => {
    if (!owner) return DISPOSED;
    started.current = { jobId: null, at: performance.now() };
    const outcome = owner.start(files);
    if (outcome.status !== 'started') {
      started.current = null;
      return outcome;
    }
    // A new job drops whatever the previous one left untaken.
    pending.current = null;
    setResult(null);
    if (started.current) {
      started.current = { ...started.current, jobId: outcome.jobId };
      setDurationMs(null);
    }
    return outcome;
  }, [owner]);
  return { owner, snapshot, durationMs, resultGeneration: result?.holder === holder ? result.generation : null, start };
}
