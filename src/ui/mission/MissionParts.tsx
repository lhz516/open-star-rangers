/** Parts the mission pages share: slice-gap notes, the honest build status and the alert for a failed action. */
import { useId } from 'react';
import type { MissionOwnerSnapshot } from '../../app/mission/mission-owner.ts';
import { describeStructure, MISSION_SKELETON } from './mission-copy.ts';
import { SLICE_GAPS, type SliceGapId } from './slice-gaps-copy.ts';

/** A slice gap's text, labelled with its G ID; any ID, so copy the caller holds works too. */
export function GapText({ id, title, text }: { readonly id: string; readonly title: string; readonly text: string }) {
  return <><strong>{title} ({id}).</strong> {text}</>;
}

/** One slice gap, labelled with its G ID. */
export function GapNote({ id }: { readonly id: SliceGapId }) {
  return (
    <p className="slice-gap" data-gap={id}>
      <GapText id={id} {...SLICE_GAPS[id]} />
    </p>
  );
}

/** The gaps a page leaves readable after the placeholder that showed them has ended. */
export function GapNotes({ ids }: { readonly ids: readonly SliceGapId[] }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} data-testid="slice-gaps">
      <h3 id={headingId}>Missing from this build</h3>
      {ids.map(id => <GapNote key={id} id={id} />)}
    </section>
  );
}

export function SkeletonNote() {
  return <p data-testid="mission-skeleton">{MISSION_SKELETON}</p>;
}

const OPERATION: Readonly<Record<NonNullable<MissionOwnerSnapshot['actionError']>['operation'], string>> = Object.freeze({
  pause: 'Pausing', resume: 'Resuming', 'open-menu': 'Opening the mission menu', continue: 'Continuing', restart: 'Restarting',
  'complete-departure': 'Ending the departure',
});

/** The owner's last failed action, if any, without any message text. */
export function ActionErrorAlert({ error }: { readonly error: MissionOwnerSnapshot['actionError'] }) {
  if (!error) return null;
  return (
    <div role="alert" className="failure-alert" data-testid="mission-action-error" data-operation={error.operation}>
      <p>{OPERATION[error.operation]} failed.</p>
      <pre>{describeStructure(error.cause)}</pre>
    </div>
  );
}
