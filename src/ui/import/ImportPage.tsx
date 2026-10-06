/**
 * The import page (P2-11 S-02): select the CloneCD files of your own disc, start, follow and cancel the job, and read
 * the verified result. The job runs in a Worker owned by this page; the resource package and its commit belong to the
 * app's resource holder, so leaving the page never interrupts a commit. Nothing here uploads anything.
 */
import { useEffect, useRef, useState } from 'react';
import type { ImportJobHandle } from '../../app/import/use-import-job.ts';
import type { ResourceHolderSnapshot } from '../../app/resources/resource-holder.ts';
import { unsavedCache } from '../../app/resources/resource-status.ts';
import type { CapacityCheck, CapacityCheckResult } from '../../platform/storage/resource-cache-contract.ts';
import { IMPORT_FILE_LIMITS } from '../../workers/import-protocol.ts';
import { useFocusOnMount } from '../pages/use-focus-on-mount.ts';
import { cacheFailureCopy, jobFailureCopy, missionFailureCopy, startFailureCopy } from './failure-copy.ts';
import { FailureNotice } from './FailureNotice.tsx';
import { formatDuration, formatMebibytes, STAGE_TEXT } from './resource-copy.ts';
import { ResourceStatusList } from './ResourceStatusList.tsx';

export interface ImportPageProps {
  readonly job: ImportJobHandle;
  /** The resource holder's snapshot; null until the holder exists, and no job starts until then. */
  readonly resources: ResourceHolderSnapshot | null;
  /** The advisory space check before a job; null when it cannot be made. */
  readonly checkSpace: () => Promise<CapacityCheckResult | null>;
  readonly onSave: () => void;
  readonly onReturn: () => void;
}

/** A space check with an estimate; the page keeps only an insufficient one. */
type Estimate = Exclude<CapacityCheck, { readonly status: 'unknown' }>;

const GROUP_TEXT = Object.freeze({ complete: 'complete', incomplete: 'incomplete', missing: 'missing' });

export function ImportPage({ job, resources, checkSpace, onSave, onReturn }: ImportPageProps) {
  const heading = useFocusOnMount<HTMLHeadingElement>();
  const [files, setFiles] = useState<readonly File[]>([]);
  /** The space check before a start: running, or its insufficient estimate awaiting the player's choice. */
  const [decision, setDecision] = useState<'idle' | 'checking' | Estimate>('idle');
  const [refused, setRefused] = useState(false);
  /**
   * The latest start request. A space check that resolves after another request, a job start, a new file selection or
   * unmount is ignored, so a job only ever starts with the files on display.
   */
  const request = useRef(0);
  useEffect(() => () => { request.current += 1; }, []);
  const { snapshot, durationMs } = job;
  const active = snapshot?.status === 'starting' || snapshot?.status === 'running';
  const deciding = decision !== 'idle';
  const space = typeof decision === 'object' ? decision : null;
  const begin = (): void => {
    request.current += 1;
    setDecision('idle');
    setRefused(job.start(files).status === 'invalid-files');
  };
  const onStart = async (): Promise<void> => {
    const current = ++request.current;
    setDecision('checking');
    setRefused(false);
    let check: CapacityCheckResult | null = null;
    try {
      check = await checkSpace();
    } catch {
      // The check is advisory; a failing estimate never blocks the import.
    }
    if (request.current !== current) return;
    if (check?.status === 'insufficient') setDecision(check);
    else begin();
  };
  // Only the package this page's latest job produced is its result; a package held before stays on the menu.
  const held = resources?.package ?? null;
  const imported = held !== null && held.generation === job.resultGeneration ? held : null;
  const unsaved = unsavedCache(imported);
  return (
    <section aria-labelledby="import-heading">
      <h2 id="import-heading" ref={heading} tabIndex={-1}>Import original game data</h2>
      <p>
        Select the CloneCD files of your own Star Rangers disc: a <code>.ccd</code> file and the <code>.img</code> file with the
        same name, optionally with their <code>.sub</code> and <code>.cue</code> files, at most {IMPORT_FILE_LIMITS.maxFiles} files.
      </p>
      <p data-testid="import-privacy">
        The files are read and converted only in this browser and are never uploaded. A complete result is saved in this
        browser&apos;s storage.
      </p>
      <p>
        <label htmlFor="import-files">Disc files </label>
        <input
          id="import-files"
          type="file"
          accept=".ccd,.img,.sub,.cue"
          multiple
          disabled={active || deciding}
          onChange={event => {
            request.current += 1;
            setFiles([...event.currentTarget.files ?? []]);
          }}
        />
      </p>
      <p>
        <button type="button" disabled={resources === null || active || deciding} onClick={() => { void onStart(); }}>Start import</button>
        {' '}
        <button type="button" disabled={!active} onClick={() => { job.owner?.cancel(); }}>Cancel import</button>
      </p>
      {space && (
        <div role="alert" data-testid="space-warning" className="failure-notice">
          <p>
            Browser storage may not have room for the result: about {formatMebibytes(space.requiredBytes)} may be needed and
            {' '}{formatMebibytes(space.availableBytes)} is available. You can still import; saving may then fail.
          </p>
          <p>
            <button type="button" onClick={begin}>Import anyway</button>
            {' '}
            <button type="button" onClick={() => { setDecision('idle'); }}>Do not import</button>
          </p>
        </div>
      )}
      {refused && <FailureNotice testId="start-failure" copy={startFailureCopy('invalid-files')} />}
      {active && (
        <p role="status" data-testid="import-progress" data-stage={snapshot.status === 'running' ? snapshot.stage ?? '' : ''}
          data-read-bytes={snapshot.status === 'running' ? snapshot.readBytes : 0}>
          {snapshot.status === 'running' && snapshot.stage !== null ? STAGE_TEXT[snapshot.stage] : 'Starting'}
          {' · read '}{formatMebibytes(snapshot.status === 'running' ? snapshot.readBytes : 0)}
          {snapshot.status === 'running' && snapshot.identity !== null && ` · identified ${snapshot.identity.versionId}`}
        </p>
      )}
      {snapshot?.status === 'finished' && (
        <p data-testid="import-result" data-result="finished">
          Import finished{durationMs !== null && ` in ${formatDuration(durationMs)}`}: identified {snapshot.identity.versionId}.
        </p>
      )}
      {snapshot?.status === 'cancelled' && (
        <p data-testid="import-result" data-result="cancelled">
          Import cancelled{durationMs !== null && ` after ${formatDuration(durationMs)}`}. No partial result was kept.
        </p>
      )}
      {snapshot?.status === 'failed' && (
        <div data-testid="import-result" data-result="failed">
          <FailureNotice testId="import-failure" copy={jobFailureCopy(snapshot.error)} durationMs={durationMs} />
        </div>
      )}
      {resources && <ResourceStatusList resources={{ ...resources, package: imported }} job={snapshot} testId="import-statuses" />}
      {imported && (
        <ul data-testid="import-groups" className="import-groups">
          {imported.groups.map(state => (
            <li key={state.group} data-group={state.group} data-status={state.status}>
              {`${state.group}: ${GROUP_TEXT[state.status]}`}
              {state.status === 'complete' && ` (${state.assets} Assets)`}
              {state.status === 'incomplete' && ` (${state.diagnostics.map(({ code }) => code).join(', ')})`}
            </li>
          ))}
        </ul>
      )}
      {imported?.completeness.status === 'incomplete' && (
        <p data-testid="import-partial">This is not a usable resource package, so it is not saved in this browser.</p>
      )}
      {unsaved?.status === 'not-saved' && unsaved.failure !== null && (
        <FailureNotice testId="save-failure" copy={cacheFailureCopy(unsaved.failure)} durationMs={unsaved.durationMs} />
      )}
      {unsaved !== null && (
        <p><button type="button" disabled={unsaved.status === 'saving'} onClick={onSave}>Save again</button></p>
      )}
      {imported?.mission.status === 'failed' && <FailureNotice testId="mission-failure" copy={missionFailureCopy(imported.mission.failure)} />}
      <p>
        <button type="button" onClick={onReturn}>Return to menu</button>
      </p>
    </section>
  );
}
