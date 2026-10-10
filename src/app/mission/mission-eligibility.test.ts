import { describe, expect, it } from 'vitest';
import { cacheFailure } from '../../platform/storage/resource-cache-contract.ts';
import { committed, entryFor, flush, listed, testHolder } from '../resources/resource-holder.test-support.ts';
import type { ResourceHolderSnapshot } from '../resources/resource-holder.ts';
import { missionEligibility } from './mission-eligibility.ts';
import { MISSION_SCENARIOS, missionHolder } from './mission.test-support.ts';

// P3-04 AC-08 (Node): start eligibility from the holder of each mission scenario's package (docs/plan/p3/04/spec.md,
// 开始资格). Only the whole-package judgement, the mission diagnostics and the slot's latch count.

describe('mission start eligibility', () => {
  it('is eligible for the startable package, whether its commit is pending, failed or done', async () => {
    const { holder, cache } = await missionHolder('mission-startable');
    const generation = holder.getSnapshot().package!.generation;
    expect(holder.getSnapshot().package!.cache.status).toBe('saving');
    expect(missionEligibility(holder.getSnapshot(), null)).toEqual({ status: 'eligible', generation });

    cache.commits[0]!.result.resolve(cacheFailure('quota-exceeded', 'commit'));
    await flush();
    expect(holder.getSnapshot().package!.cache).toMatchObject({ status: 'not-saved', failure: { code: 'quota-exceeded' } });
    expect(missionEligibility(holder.getSnapshot(), null)).toEqual({ status: 'eligible', generation });

    expect(holder.save()).toBe(true);
    cache.commits[1]!.result.resolve(committed(holder.current()!.groups));
    await flush();
    expect(holder.getSnapshot().package!.cache.status).toBe('saved');
    expect(missionEligibility(holder.getSnapshot(), null)).toEqual({ status: 'eligible', generation });
  });

  it('refuses without a package, even with a restorable cache entry listed', async () => {
    const { holder, cache } = testHolder();
    expect(missionEligibility(holder.getSnapshot(), null)).toEqual({ status: 'no-package' });
    const { holder: full } = await missionHolder('mission-startable');
    const identity = full.current()!.completeness;
    if (identity.status !== 'complete') throw new Error('expected a complete package');
    cache.lists[0]!.resolve(listed(entryFor(identity.identity)));
    await flush();
    expect(holder.getSnapshot().catalog.status).toBe('listed');
    expect(missionEligibility(holder.getSnapshot(), null)).toEqual({ status: 'no-package' });
  });

  it('refuses a partial package with its incomplete groups and the package diagnostics, although the mission loads', async () => {
    const { holder } = await missionHolder('mission-partial');
    const expected = MISSION_SCENARIOS['mission-partial'];
    const snapshot = holder.getSnapshot();
    expect(snapshot.package!.mission.status).toBe('loaded');
    const eligibility = missionEligibility(snapshot, null);
    expect(eligibility.status).toBe('package-incomplete');
    if (eligibility.status !== 'package-incomplete') return;
    expect(eligibility.groups.map(({ group, status }) => ({ group, status }))).toEqual([{ group: expected.group, status: 'incomplete' }]);
    const [group] = eligibility.groups;
    expect(group?.status === 'incomplete' && group.diagnostics.map(({ code, path }) => ({ code, path }))).toEqual([expected.groupDiagnostic]);
    expect(eligibility.diagnostics.map(({ code, path }) => ({ code, path }))).toEqual([expected.packageDiagnostic]);
    expect(Object.isFrozen(eligibility)).toBe(true);
  });

  it('refuses a package whose mission failed to load, with its kind, path and reason', async () => {
    const { holder } = await missionHolder('mission-load-failed');
    expect(missionEligibility(holder.getSnapshot(), null)).toEqual({ status: 'mission-failed', failure: MISSION_SCENARIOS['mission-load-failed'].failure });
  });

  it('admits the package whose world creation fails: only confirming the start page tries createWorld', async () => {
    const { holder } = await missionHolder('mission-create-rejected');
    expect(missionEligibility(holder.getSnapshot(), null).status).toBe('eligible');
  });

  it('refuses a complete package whose mission was not attempted', async () => {
    const { holder } = await missionHolder('mission-startable');
    const snapshot = holder.getSnapshot();
    const notAttempted: ResourceHolderSnapshot = { ...snapshot, package: { ...snapshot.package!, mission: { status: 'not-attempted' } } };
    expect(missionEligibility(notAttempted, null)).toEqual({ status: 'mission-not-attempted' });
  });

  it('refuses everything once a cleanup failure latched, before any other reason', async () => {
    const cause = new Error('cleanup');
    const { holder } = await missionHolder('mission-startable');
    expect(missionEligibility(holder.getSnapshot(), { cause })).toEqual({ status: 'cleanup-failed', cause });
    expect(missionEligibility(testHolder().holder.getSnapshot(), { cause })).toEqual({ status: 'cleanup-failed', cause });
  });
});
