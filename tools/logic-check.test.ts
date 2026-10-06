import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { syntheticFileDisc, type SyntheticFileContent } from '../src/original-data/disc/disc.test-support.ts';
import { defaultScenarioSpec, MARKER, syntheticScenario } from '../src/original-data/formats/formats.test-support.ts';
import { catalogFor } from '../src/original-data/source/source.test-support.ts';
import { sliceCoveredFiles } from '../src/workers/synthetic-import.test-support.ts';
import { main, runLogicCheck } from './logic-check.ts';

const DIRECTORY_MARKER = 'PRIVATE-MARKER-logic-check';
const directory = mkdtempSync(join(tmpdir(), `osr-logic-check-${DIRECTORY_MARKER}-`));
afterAll(() => rmSync(directory, { recursive: true, force: true }));
afterEach(() => { vi.restoreAllMocks(); });

/** Writes a disc of `files` plus unread padding as a CloneCD file set and returns its paths and whitelist. */
async function writeDisc(name: string, files: Record<string, SyntheticFileContent>) {
  const disc = syntheticFileDisc({ ...files, 'PAD/PAD.DAT': { byteLength: 1 << 20, read: (_, length) => new Uint8Array(length) } });
  const paths = [join(directory, `${name}-${MARKER}.ccd`), join(directory, `${name}-${MARKER}.img`)];
  writeFileSync(paths[0], await disc.descriptor.read(0, disc.descriptor.byteLength));
  writeFileSync(paths[1], await disc.image.read(0, disc.image.byteLength));
  return { paths, catalog: catalogFor(files) };
}

/** Values seeded into the mission: a position, a spawn rectangle corner and a rule input, which no output may hold. */
const SEEDED = ['98765.25', '-86420', '-13579'];

/** The slice files with the seeded values in the selected mission, changed further by `change`. */
function seededFiles(change: (spec: ReturnType<typeof defaultScenarioSpec>) => void = () => {}) {
  const spec = defaultScenarioSpec();
  spec.records[2].position = [98_765.25, 0, 0];
  spec.regions![0][0] = -86_420;
  spec.records[0].signed![0x70] = -13_579;
  change(spec);
  return sliceCoveredFiles(syntheticScenario(spec));
}

/** The report as printed, checked to hold no name, seeded value, host path or file-name marker. */
function printed(report: unknown): string {
  const text = JSON.stringify(report);
  for (const hidden of [MARKER, DIRECTORY_MARKER, directory, ...SEEDED]) expect(text).not.toContain(hidden);
  return text;
}

const stageReads = ({ reads }: { readonly reads: Readonly<Record<string, number>> }) =>
  reads['identify-source'] + reads['convert-graphics'] + reads['convert-logic'] + reads['convert-audio'];

describe('logic check', () => {
  it('converts, validates, decodes and loads the logic group, reporting counts, limits, reads and hashes only', async () => {
    const { paths, catalog } = await writeDisc('slice', seededFiles());
    const report = await runLogicCheck(paths, { catalog });
    printed(report);
    expect(Object.keys(report)).toEqual(['format', 'version', 'passed', 'error', 'identity', 'group', 'counts', 'limits', 'reads']);
    expect(report).toMatchObject({ format: 'osr-logic-check', version: 1, passed: true, error: null });
    expect(report.identity).toEqual({ versionId: 'synthetic-test', fingerprint: expect.stringMatching(/^source:sha256:[0-9a-f]{64}$/) });
    expect(Object.keys(report.group!)).toEqual(['status', 'manifestIdentity', 'payloads']);
    expect(report.group).toMatchObject({ status: 'group-complete', manifestIdentity: expect.stringMatching(/^manifest:sha256:[0-9a-f]{64}$/) });
    expect(report.group!.payloads.every(payload => Object.keys(payload).join() === 'id,role,bytes,fingerprint')).toBe(true);
    expect(report.group!.payloads.map(({ id, role, bytes, fingerprint }) => [id, role, bytes > 0, /^sha256:[0-9a-f]{64}$/.test(fingerprint)])).toEqual([
      ['data/craft-types', 'craft-types', true, true],
      ['data/wingman-roster', 'wingman-roster', true, true],
      ['mission/first-campaign', 'mission', true, true],
    ]);
    expect(report.counts).toEqual({
      declarations: 9, namePool: 3, spawnRegions: 3, groups: 3, memberPositions: 6, layoutElements: 6,
      placementRegions: 5, placementAnchors: 1, memberOf: 3, aiTargets: 1, wingmanOptions: 2,
      craftTypes: 6, playerCraftTypes: 1, friendlyCraftTypes: 3, enemyCraftTypes: 2,
    });
    expect(report.limits.map(({ name }) => name)).toEqual([
      'declarations', 'objects', 'namePool', 'spawnRegions', 'groups', 'groupMembers', 'layoutElements', 'nameCandidates', 'nameLength',
      'wingmanOptions', 'payloadBytes',
    ]);
    expect(report.limits.every(item => Object.keys(item).join() === 'name,observed,limit' && item.observed <= item.limit)).toBe(true);
    expect(report.limits.find(({ name }) => name === 'nameLength')).toEqual({ name: 'nameLength', observed: `${MARKER}-pool-a`.length, limit: 63 });
    expect(Object.keys(report.reads)).toEqual(['identify-source', 'convert-graphics', 'convert-logic', 'convert-audio', 'total']);
    expect([report.reads['identify-source'], report.reads['convert-graphics'], report.reads['convert-logic'], report.reads['convert-audio']]
      .every(bytes => bytes > 0)).toBe(true);
    expect(stageReads(report)).toBe(report.reads.total);
  });

  it('reports the first failure by code and structural location, without a partial group', async () => {
    const { paths, catalog } = await writeDisc('unequal', seededFiles(spec => { spec.sectors = [6, 7]; }));
    const report = await runLogicCheck(paths, { catalog });
    printed(report);
    expect(report).toMatchObject({
      passed: false, error: { code: 'unsupported-payload', location: 'archive:/MAIN/SCENARIO.NOB#3019/header/height' }, group: null, counts: null, limits: [],
    });
    expect(report.identity).not.toBeNull();
    // The reads before the failure stay reported.
    expect(report.reads['convert-logic']).toBeGreaterThan(0);
    expect(stageReads(report)).toBe(report.reads.total);
  });

  it('identifies with the production whitelist by default, which rejects a synthetic disc', async () => {
    const { paths } = await writeDisc('production', seededFiles());
    const report = await runLogicCheck(paths);
    printed(report);
    expect(report).toMatchObject({ passed: false, error: { code: 'unsupported-version' }, identity: null });
  });

  it('reports an unreadable input by its argument index', async () => {
    const report = await runLogicCheck([join(directory, `missing-${MARKER}.ccd`)]);
    printed(report);
    expect(report.error).toEqual({ code: 'read-failed', location: 'input[0]' });
  });
});

describe('logic check CLI', () => {
  it('prints one JSON report and exits 0 when the check passes', async () => {
    const { paths, catalog } = await writeDisc('cli', seededFiles());
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(await main(paths, { catalog })).toBe(0);
    expect(log).toHaveBeenCalledTimes(1);
    expect(JSON.parse(printed(JSON.parse(log.mock.calls[0][0] as string)))).toMatchObject({ format: 'osr-logic-check', passed: true });
  });

  it('exits 2 with a usage report for no paths or an option', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await main([])).toBe(2);
    expect(await main(['--help'])).toBe(2);
    expect(log.mock.calls.map(([text]) => JSON.parse(text as string).error)).toEqual([{ code: 'usage', location: 'argv' }, { code: 'usage', location: 'argv' }]);
  });
});
