import { describe, expect, it, vi } from 'vitest';
import type { ResourceGroup } from '../../content/asset-contract.ts';
import { CLASSIC_P2_SLICE } from '../../content/slice-definition.ts';
import { diagnosticCodes, syntheticGroup, SYNTHETIC_ASSETS } from '../../content/synthetic-content.test-support.ts';
import type { ImportJobSnapshot } from '../import/import-job-owner.ts';
import type { PackageSummary, ResourceHolderSnapshot } from './resource-holder.ts';
import {
  allGroups, fakeJob, finishedJob, imported, incompleteSummary, SYNTHETIC_FINGERPRINT as FINGERPRINT, testHolder,
} from './resource-holder.test-support.ts';
import { resourceStatuses } from './resource-status.ts';

const IDENTITY = Object.freeze({ versionId: 'synthetic-disc', sourceFingerprint: FINGERPRINT });
const EMPTY: ResourceHolderSnapshot = { package: null, catalog: { status: 'checking' }, restore: { status: 'idle' } };

describe('resource holder state ladder', () => {
  const others = (group: ResourceGroup) => CLASSIC_P2_SLICE.groups.filter(other => other !== group).map(other => imported(other));
  // A models group of another converter version: complete on its own, but not of the same package.
  const otherVersion = () => {
    const input = syntheticGroup('models', SYNTHETIC_ASSETS.models, { origin: { type: 'original-import', sourceFingerprint: FINGERPRINT }, converterVersion: 'other.1' });
    input.sources = { sourceFingerprint: FINGERPRINT, states: SYNTHETIC_ASSETS.models.map(({ id }) => ({ id, state: 'verified', unknowns: [] })) };
    return CLASSIC_P2_SLICE.groups.map(group => (group === 'models' ? imported(group, input) : imported(group)));
  };

  it.each([
    {
      name: 'four complete groups forming a complete package',
      job: () => finishedJob(allGroups()),
      statuses: ['source-identified', 'complete-viewable', 'memory-only', 'saving'],
      groups: ['complete', 'complete', 'complete', 'complete'],
      diagnostics: [],
      cache: { status: 'saving' },
    },
    {
      name: 'a finished job without a group',
      job: () => finishedJob(others('audio')),
      statuses: ['source-identified', 'partial-conversion'],
      groups: ['complete', 'complete', 'complete', 'missing'],
      diagnostics: ['group-missing@groups.audio'],
      cache: { status: 'not-saved', failure: null, durationMs: null },
    },
    {
      name: 'a finished job with an incomplete group',
      job: () => finishedJob(others('cockpit-hud-map'), [incompleteSummary('cockpit-hud-map')]),
      statuses: ['source-identified', 'partial-conversion'],
      groups: ['complete', 'complete', 'incomplete', 'complete'],
      diagnostics: ['group-missing@groups.cockpit-hud-map'],
      cache: { status: 'not-saved', failure: null, durationMs: null },
    },
    {
      name: 'four complete groups whose package is incomplete',
      job: () => finishedJob(otherVersion()),
      statuses: ['source-identified', 'partial-conversion'],
      groups: ['complete', 'complete', 'complete', 'complete'],
      diagnostics: ['package-identity-mismatch@groups[1].manifest.identity'],
      cache: { status: 'not-saved', failure: null, durationMs: null },
    },
  ])('derives the ladder for $name', ({ job: makeJob, statuses, groups, diagnostics, cache }) => {
    const { holder: resources } = testHolder();
    const job = makeJob();
    expect(resources.acceptImport(job)).toBe(true);
    const snapshot = resources.getSnapshot();
    expect(resourceStatuses(snapshot, job.getSnapshot())).toEqual(statuses);
    expect(snapshot.package!.groups.map(({ group, status }) => [group, status])).toEqual(CLASSIC_P2_SLICE.groups.map((group, index) => [group, groups[index]]));
    expect(diagnosticCodes(snapshot.package!.completeness)).toEqual(diagnostics);
    expect(snapshot.package).toMatchObject({ generation: 1, origin: 'import', cache, mission: { status: 'not-attempted' } });
  });

  it('keeps the diagnostics of an incomplete group', () => {
    const { holder: resources } = testHolder();
    resources.acceptImport(finishedJob(others('audio'), [incompleteSummary('audio')]));
    expect(resources.getSnapshot().package!.groups[3]).toEqual({ group: 'audio', status: 'incomplete', diagnostics: incompleteSummary('audio').diagnostics });
  });

  it('establishes nothing beyond the source identity from a finished job alone', () => {
    const job = finishedJob(allGroups());
    expect(resourceStatuses(testHolder().holder.getSnapshot(), job.getSnapshot())).toEqual(['source-identified']);
  });

  it('identifies the source only while a job runs or after it finished with an identity', () => {
    const running = (identity: typeof IDENTITY | null): ImportJobSnapshot =>
      ({ status: 'running', jobId: 1, stage: 'identify-source', readBytes: 0, identity, groups: [] });
    const empty = EMPTY;
    expect(resourceStatuses(empty, running(IDENTITY))).toEqual(['source-identified']);
    expect(resourceStatuses(empty, running(null))).toEqual([]);
    expect(resourceStatuses(empty, { status: 'failed', jobId: 1, stage: 'convert-logic', error: { layer: 'import', code: 'worker-failed', location: 'worker', reason: 'r', limit: null } })).toEqual([]);
    expect(resourceStatuses(empty, { status: 'cancelled', jobId: 1, stage: 'convert-logic' })).toEqual([]);
    expect(resourceStatuses(empty)).toEqual([]);
  });

  it('shows a complete package as saved only when its cache state is saved, and otherwise as memory only', () => {
    const { holder: resources } = testHolder();
    resources.acceptImport(finishedJob(allGroups()));
    const summary = resources.getSnapshot().package!;
    const withCache = (cache: PackageSummary['cache']): ResourceHolderSnapshot => ({ ...EMPTY, package: { ...summary, cache } });
    expect(resourceStatuses(withCache({ status: 'saved', via: 'commit', durationMs: 0 }))).toEqual(['complete-viewable', 'saved']);
    expect(resourceStatuses(withCache({ status: 'saved', via: 'restore', durationMs: 0 }))).toEqual(['complete-viewable', 'saved']);
    expect(resourceStatuses(withCache({ status: 'saving' }))).toEqual(['complete-viewable', 'memory-only', 'saving']);
    expect(resourceStatuses(withCache({ status: 'not-saved', failure: null, durationMs: null }))).toEqual(['complete-viewable', 'memory-only']);
  });
});

describe('resource holder ownership', () => {
  it('holds nothing at first', () => {
    const { holder: resources } = testHolder();
    expect(resources.getSnapshot()).toEqual(EMPTY);
    expect(resources.current()).toBeNull();
    expect(resourceStatuses(resources.getSnapshot())).toEqual([]);
  });

  it('replaces the package with neither a failed or cancelled job nor groups already taken', () => {
    const { holder: resources } = testHolder();
    resources.acceptImport(finishedJob(allGroups()));
    const before = resources.getSnapshot();
    const listener = vi.fn();
    resources.subscribe(listener);
    const failed = fakeJob({ status: 'failed', jobId: 2, stage: 'convert-graphics', error: { layer: 'source', code: 'unsupported-version', location: 'source', reason: 'r', limit: null } });
    const cancelled = fakeJob({ status: 'cancelled', jobId: 3, stage: null });
    const taken = finishedJob(allGroups());
    taken.takeGroups();
    for (const job of [failed, cancelled, taken]) expect(resources.acceptImport(job)).toBe(false);
    expect(failed.takeGroups).not.toHaveBeenCalled();
    expect(cancelled.takeGroups).not.toHaveBeenCalled();
    expect(resources.getSnapshot()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });

  it('replaces the package with each finished job, partial or complete, under the next generation, releasing the outgoing one first', () => {
    const { holder: resources } = testHolder();
    const events: string[] = [];
    resources.beforeReplace(outgoing => {
      // The outgoing package is still the held one while its consumers release it.
      expect(resources.current()).toBe(outgoing);
      events.push(`release ${outgoing.generation}`);
    });
    resources.subscribe(() => events.push(`changed ${resources.getSnapshot().package!.generation}`));
    resources.acceptImport(finishedJob(allGroups()));
    const first = resources.current()!;
    resources.acceptImport(finishedJob(allGroups().slice(1)));
    expect(resources.current()!.completeness.status).toBe('incomplete');
    resources.acceptImport(finishedJob(allGroups()));
    expect(events).toEqual(['changed 1', 'release 1', 'changed 2', 'release 2', 'changed 3']);
    expect(resources.current()).not.toBe(first);
    expect(resources.current()!.generation).toBe(3);
  });

  it('holds only the complete groups, in slice definition order, without copying, changing or detaching a payload', () => {
    const { holder: resources } = testHolder();
    const groups = allGroups().reverse();
    const expected = groups.map(({ payloads }) => (payloads as { bytes: Uint8Array }[]).map(({ bytes }) => [...bytes]));
    resources.acceptImport(finishedJob(groups));
    const held = resources.current()!;
    expect(held.groups.map(({ group }) => group)).toEqual(CLASSIC_P2_SLICE.groups);
    groups.forEach(({ group, payloads }, index) => {
      const own = held.groups.find(entry => entry.group === group)!;
      expect(own.payloads).toBe(payloads);
      // A detached buffer would leave an empty view.
      (own.payloads as { bytes: Uint8Array }[]).forEach(({ bytes }, payload) => expect([...bytes]).toEqual(expected[index][payload]));
    });
    expect(Object.isFrozen(held)).toBe(true);
    expect(Object.isFrozen(held.groups)).toBe(true);
    expect(held.groups.every(group => Object.isFrozen(group))).toBe(true);
  });

  it('returns the same frozen snapshot until a change', () => {
    const { holder: resources } = testHolder();
    resources.acceptImport(finishedJob(allGroups()));
    const snapshot = resources.getSnapshot();
    expect(resources.getSnapshot()).toBe(snapshot);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.package)).toBe(true);
    expect(Object.isFrozen(snapshot.package!.groups)).toBe(true);
    expect(JSON.stringify(snapshot)).not.toContain('bytes');
  });

  it('reports what a listener throws and still notifies the others', () => {
    const { holder: resources, reportError } = testHolder();
    const failure = new Error('listener');
    const second = vi.fn();
    resources.beforeReplace(() => { throw failure; });
    resources.subscribe(() => { throw failure; });
    resources.subscribe(second);
    resources.acceptImport(finishedJob(allGroups()));
    resources.acceptImport(finishedJob(allGroups()));
    expect(second).toHaveBeenCalledTimes(2);
    expect(reportError.mock.calls).toEqual([[failure], [failure], [failure]]);
    expect(resources.current()!.generation).toBe(2);
  });

  it('completes the replacement and notifies every listener when the error outlet throws too', () => {
    const { holder: resources } = testHolder({ reportError: () => { throw new Error('outlet'); } });
    const release = vi.fn();
    const changed = vi.fn();
    resources.acceptImport(finishedJob(allGroups()));
    resources.beforeReplace(() => { throw new Error('release'); });
    resources.beforeReplace(release);
    resources.subscribe(() => { throw new Error('listener'); });
    resources.subscribe(changed);
    expect(resources.acceptImport(finishedJob(allGroups()))).toBe(true);
    expect(release).toHaveBeenCalledTimes(1);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(resources.current()!.generation).toBe(2);
  });

  it('drops the package on dispose and ignores later results without notifying anyone', () => {
    const { holder: resources } = testHolder();
    resources.acceptImport(finishedJob(allGroups()));
    const listener = vi.fn();
    const release = vi.fn();
    resources.subscribe(listener);
    resources.beforeReplace(release);
    resources.dispose();
    resources.dispose();
    const late = finishedJob(allGroups());
    expect(resources.acceptImport(late)).toBe(false);
    expect(late.takeGroups).not.toHaveBeenCalled();
    expect(resources.current()).toBeNull();
    expect(resources.getSnapshot().package).toBeNull();
    expect(listener).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
    expect(resources.subscribe(listener)).toBeTypeOf('function');
  });

  it('holds nothing new when a release listener disposes the holder', () => {
    const { holder: resources } = testHolder();
    resources.acceptImport(finishedJob(allGroups()));
    resources.beforeReplace(() => resources.dispose());
    expect(resources.acceptImport(finishedJob(allGroups()))).toBe(false);
    expect(resources.current()).toBeNull();
  });
});
