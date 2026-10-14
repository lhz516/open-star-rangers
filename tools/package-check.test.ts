import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import type { AssetReference } from '../src/content/asset-contract.ts';
import { BUDGET_DIMENSIONS } from '../src/content/budget.ts';
import type { GroupInput } from '../src/content/completeness.ts';
import type { GroupManifest } from '../src/content/manifest.ts';
import { HUD_TEXT_FORMATS, HUD_TEXT_KEYS } from '../src/content/hud/hud-text-payload.ts';
import { encodeMapGeometryPayload } from '../src/content/hud/map-geometry-payload.ts';
import type { PayloadRecord } from '../src/content/payload.ts';
import { sha256Fingerprint } from '../src/content/sha256.ts';
import { MARKER as RULE_DATA_MARKER } from '../src/content/rule-data/rule-data.test-support.ts';
import { PRODUCTION_LISTS } from '../src/original-data/conversion/flight-data.test-support.ts';
import {
  SYNTHETIC_HIT_SHIMMER, SYNTHETIC_TARGET_DISPLAY, SYNTHETIC_VIEW_LABEL,
} from '../src/original-data/conversion/production-flight-graphics.test-support.ts';
import { instrumentRecord } from '../src/original-data/conversion/conversion.test-support.ts';
import {
  PRODUCTION_COCKPIT_INSTRUMENTS, productionCockpitBlock, SYNTHETIC_MAP_GEOMETRY,
} from '../src/original-data/conversion/production-graphics.test-support.ts';
import { productionSliceEntries } from '../src/original-data/conversion/production-models.test-support.ts';
import { SYNTHETIC_HUD_TEXT } from '../src/original-data/conversion/production-hud-text.test-support.ts';
import { productionRuleData } from '../src/original-data/conversion/production-rule-data.test-support.ts';
import { openDiscImage } from '../src/original-data/disc/disc-image.ts';
import { syntheticFileDisc, type SyntheticFileContent } from '../src/original-data/disc/disc.test-support.ts';
import { MARKER } from '../src/original-data/formats/formats.test-support.ts';
import { identifySource } from '../src/original-data/source/identify-source.ts';
import { buildImfat } from '../src/original-data/synthetic.test-support.ts';
import { BlobByteSource } from '../src/platform/files/blob-byte-source.ts';
import { catalogFor } from '../src/original-data/source/source.test-support.ts';
import type { ImportJob } from '../src/workers/import-host.ts';
import { createImportJob } from '../src/workers/import-job.ts';
import { IMPORT_STAGES } from '../src/workers/import-protocol.ts';
import { PRODUCTION_PACKAGE } from '../src/workers/production-package.ts';
import { sliceCoveredFiles } from '../src/workers/synthetic-import.test-support.ts';
import { main, runPackageCheck, type PackageCheckReport } from './package-check.ts';

const DIRECTORY_MARKER = 'PRIVATE-MARKER-package-check';
const directory = mkdtempSync(join(tmpdir(), `osr-package-check-${DIRECTORY_MARKER}-`));
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

/** The longest synthetic HUD text: a text the report must never hold. */
const HUD_TEXT = Object.values(SYNTHETIC_HUD_TEXT.entries).reduce((longest, text) => (text.length > longest.length ? text : longest));

/** The report as printed, checked to hold no text, host path or file-name marker. */
function printed(report: unknown): string {
  const text = JSON.stringify(report);
  for (const hidden of [MARKER, RULE_DATA_MARKER, DIRECTORY_MARKER, directory, HUD_TEXT, SYNTHETIC_VIEW_LABEL]) expect(text).not.toContain(hidden);
  return text;
}

const stageReads = ({ reads }: Pick<PackageCheckReport, 'reads'>) => IMPORT_STAGES.reduce((total, stage) => total + reads[stage], 0);
/** The slice disc and the disc whose shared mesh is corrupt, each written once for the tests that only read them. */
let slice: ReturnType<typeof writeDisc> | undefined;
let corrupt: ReturnType<typeof writeDisc> | undefined;
const sliceDisc = () => (slice ??= writeDisc('slice', sliceCoveredFiles()));
const corruptDisc = () => (corrupt ??= writeDisc('corrupt', sliceCoveredFiles({ corruptMesh: true })));
const HASH = /^sha256:[0-9a-f]{64}$/;
const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);

describe('package check', () => {
  it('converts, validates and decodes the whole package, reporting counts, limits, reads and hashes only', async () => {
    const { paths, catalog } = await sliceDisc();
    const report = await runPackageCheck(paths, { catalog });
    printed(report);
    expect(Object.keys(report)).toEqual(['format', 'version', 'passed', 'error', 'identity', 'package', 'roles', 'limits', 'reads']);
    expect(report).toMatchObject({ format: 'osr-package-check', version: 1, passed: true, error: null });
    expect(report.identity).toEqual({ versionId: 'synthetic-test', fingerprint: expect.stringMatching(/^source:sha256:[0-9a-f]{64}$/) });
    expect(report.package).toMatchObject({
      status: 'complete', sliceDefinitionVersion: 5, converterVersion: PRODUCTION_PACKAGE.converterVersion, manifestIdentity: expect.stringMatching(/^manifest:sha256:[0-9a-f]{64}$/),
    });
    expect(report.package!.groups.map(({ group, assets }) => [group, assets])).toEqual([['logic', 9], ['models', 266], ['cockpit-hud-map', 105], ['audio', 29]]);
    expect(report.package!.groups.every(({ digest, payloadBytes }) => HASH.test(digest) && payloadBytes > 0)).toBe(true);

    const roles = new Map(report.roles.map(role => [role.role, role]));
    expect(report.roles.map(({ role, group, assets }) => [role, group, assets])).toEqual([
      ['mission', 'logic', 1], ['craft-info', 'logic', 1], ['debris-parameters', 'logic', 1], ['ai-programs', 'logic', 1], ['comm-menus', 'logic', 1],
      ['base-repair-items', 'logic', 1], ['flight-messages', 'logic', 1],
      ['scene-settings', 'models', 1], ['explosion-table', 'models', 1], ['explosion-animation', 'models', 17], ['explosion-frame', 'models', 186],
      ['nebula-backgrounds', 'models', 1], ['nebula-background', 'models', 15], ['hit-shimmer', 'models', 1],
      ['target-display', 'cockpit-hud-map', 1], ['view-labels', 'cockpit-hud-map', 1], ['hud-text', 'cockpit-hud-map', 1],
      ['map-geometry', 'cockpit-hud-map', 1], ['event-sound', 'audio', 8], ['hud-sound', 'audio', 3],
    ]);
    expect(report.roles.every(({ digest, payloadBytes }) => HASH.test(digest) && payloadBytes > 0)).toBe(true);
    expect(new Set(report.roles.map(({ digest }) => digest)).size).toBe(report.roles.length);

    // Counts from the synthetic sources, never their values.
    const messages = [`${MARKER}-won`, `${MARKER}-held `, `${MARKER}-lost`, `${MARKER}-ended`].map(message => message.length);
    expect(roles.get('mission')!.counts).toEqual({
      declarations: 9, eventTriggerReferences: 3, eventTriggers: 2, eventRanges: 4, eventMessages: 4, eventMessageBytes: sum(messages),
    });
    const contents = productionRuleData().contents;
    const craft = contents['craft-info'];
    expect(roles.get('craft-info')!.counts).toMatchObject({
      guns: craft.guns.length, missiles: craft.missiles.length, craft: 20, missileBodies: craft.missileBodies.length,
      mounts: sum(craft.craft.map(({ mounts }) => mounts.length)), boxes: sum(craft.craft.map(({ collision }) => collision.boxes.length)),
    });
    expect(roles.get('debris-parameters')!.counts).toEqual({
      craftTypes: 20, records: contents['debris-parameters'].byCraftType.flat().length,
      boxes: sum(contents['debris-parameters'].byCraftType.flat().map(({ collision }) => collision.boxes.length)),
    });
    const ai = contents['ai-programs'];
    expect(roles.get('ai-programs')!.counts).toMatchObject({
      programs: ai.programs.length, builtInPrograms: 10, entries: 25, parameterEntries: 3, scriptEntries: 22, globalElements: ai.globals.elements.length,
    });
    expect(roles.get('comm-menus')!.counts).toMatchObject({ menus: 5 });
    expect(roles.get('base-repair-items')!.counts).toEqual({ selectors: 11 });
    expect(roles.get('flight-messages')!.counts).toEqual({ texts: 7, textBytes: sum(Object.values(contents['flight-messages']).map(text => text.length)) });
    expect(roles.get('scene-settings')!.counts).toEqual({ screenFlashes: 3 });
    expect(roles.get('explosion-table')!.counts).toEqual({ lists: 3, entries: PRODUCTION_LISTS.flat().length });
    expect(roles.get('explosion-animation')!.counts).toEqual({ frames: roles.get('explosion-frame')!.assets });
    expect(roles.get('nebula-backgrounds')!.counts).toEqual({ images: roles.get('nebula-background')!.assets });
    const shimmer = SYNTHETIC_HIT_SHIMMER.width * SYNTHETIC_HIT_SHIMMER.height;
    expect(roles.get('hit-shimmer')!.counts).toEqual({ pixels: shimmer, opaquePixels: shimmer });
    const display = SYNTHETIC_TARGET_DISPLAY.width * SYNTHETIC_TARGET_DISPLAY.height;
    expect(roles.get('target-display')!.counts).toEqual({ pixels: display, opaquePixels: display, paletteEntries: SYNTHETIC_TARGET_DISPLAY.bgr.length / 3 });
    expect(roles.get('view-labels')!.counts).toEqual({ labels: 1, textBytes: SYNTHETIC_VIEW_LABEL.length });
    expect(roles.get('hud-text')!.counts).toEqual({
      texts: HUD_TEXT_KEYS.length, formatted: HUD_TEXT_KEYS.filter(key => HUD_TEXT_FORMATS[key] !== null).length,
      textBytes: sum(Object.values(SYNTHETIC_HUD_TEXT.entries).map(text => text.length)),
    });
    // The map geometry equals the independent read of its CCKD record and font.
    expect(roles.get('map-geometry')!.counts).toEqual({ sourceMatches: 1 });
    // The production SND rules turn the warp arrival's flags into a repeated sound.
    expect(roles.get('event-sound')!.counts).toMatchObject({ none: 7, whole: 0, repeat: 1 });
    expect(roles.get('hud-sound')!.counts).toMatchObject({ none: 1, whole: 2, repeat: 0 });

    expect(report.limits.every(item => Object.keys(item).join() === 'name,observed,limit' && item.observed <= item.limit)).toBe(true);
    expect(report.limits.filter(({ name }) => name.startsWith('package.')).map(({ name, limit }) => [name, limit])).toEqual(
      BUDGET_DIMENSIONS.filter(dimension => dimension !== 'sourceReadBytes').map(dimension => [`package.${dimension}`, PRODUCTION_PACKAGE.limits[dimension]]),
    );
    const groups = report.package!.groups;
    expect(report.limits.find(({ name }) => name === 'package.assets')!.observed).toBe(sum(groups.map(({ assets }) => assets)));
    expect(report.limits.find(({ name }) => name === 'package.payloadBytes')!.observed).toBe(sum(groups.map(({ payloadBytes }) => payloadBytes)));
    expect(report.limits.find(({ name }) => name === 'explosion-table.listItems')).toEqual({ name: 'explosion-table.listItems', observed: 7, limit: 16 });
    expect(Object.keys(report.reads)).toEqual([...IMPORT_STAGES, 'total']);
    expect(IMPORT_STAGES.every(stage => report.reads[stage] > 0)).toBe(true);
    expect(stageReads(report)).toBe(report.reads.total);
  });

  it('reports the first failure by code and structural location, without a partial package', async () => {
    const { paths, catalog } = await corruptDisc();
    const report = await runPackageCheck(paths, { catalog });
    printed(report);
    expect(report).toMatchObject({ passed: false, error: { code: 'invalid-payload', location: 'models[model/base-1].parts[0][1].mesh' }, package: null, roles: [], limits: [] });
    expect(report.identity).not.toBeNull();
    // The reads before the failure stay reported.
    expect(report.reads['convert-models']).toBeGreaterThan(0);
    expect(stageReads(report)).toBe(report.reads.total);
  });

  /**
   * The production job on `catalog`, with the dependencies of Asset `id` replaced in the group the job sends: the payload,
   * the manifest identity and the dependency graph stay valid, so only the payload's binding can show the change.
   */
  const rebinding = (catalog: unknown, id: string, dependencies: readonly AssetReference[]): ImportJob => (files, report) =>
    createImportJob(async inputs => identifySource(await openDiscImage(inputs), catalog))(files, {
      ...report,
      group: (name, input: GroupInput) => {
        const manifest = input.manifest as GroupManifest;
        const assets = manifest.assets.map(asset => (asset.id === id ? { ...asset, dependencies } : asset));
        report.group(name, { ...input, manifest: { ...manifest, assets } });
      },
    });

  it('checks that each image, palette and sound descriptor binds exactly what its payload references', async () => {
    const { paths, catalog } = await sliceDisc();
    const rebound: readonly [string, readonly AssetReference[]][] = [
      ['image/explosion/01/01', []],
      ['sound/event/warp-arrival', [{ id: 'sound/hud/overlay-pulse', kind: 'sound' } as AssetReference]],
      ['palette/hud/target-display/background', [{ id: 'palette/flight/cockpit-hud-map', kind: 'palette' } as AssetReference]],
    ];
    const reports = await Promise.all(rebound.map(([id, dependencies]) => runPackageCheck(paths, { job: rebinding(catalog, id, dependencies) })));
    reports.forEach((report, index) => {
      printed(report);
      expect(report).toMatchObject({ passed: false, error: { code: 'binding-mismatch', location: `assets.${rebound[index][0]}.dependencies` } });
      expect(report.package).toMatchObject({ status: 'complete' });
    });
  });

  it('compares the map geometry with the independent read of its source and reports a difference without values', async () => {
    const { paths, catalog } = await sliceDisc();
    // The production job with the map geometry's x0 moved by one pixel in a consistently described payload.
    const moved = encodeMapGeometryPayload({ ...SYNTHETIC_MAP_GEOMETRY, rectangle: { ...SYNTHETIC_MAP_GEOMETRY.rectangle, x0: SYNTHETIC_MAP_GEOMETRY.rectangle.x0 + 1 } });
    const job: ImportJob = (files, report) => createImportJob(async inputs => identifySource(await openDiscImage(inputs), catalog))(files, {
      ...report,
      group: (name, input: GroupInput) => {
        const manifest = input.manifest as GroupManifest;
        const assets = manifest.assets.map(asset => (asset.role === 'map-geometry'
          ? { ...asset, payloadIdentity: { ...asset.payloadIdentity, byteLength: moved.length, fingerprint: sha256Fingerprint(moved) } } : asset));
        const payloads = (input.payloads as PayloadRecord[]).map(payload => (payload.id === 'data/hud/map-geometry' ? { ...payload, bytes: moved } : payload));
        report.group(name, { ...input, manifest: { ...manifest, assets }, payloads });
      },
    });
    const report = await runPackageCheck(paths, { job });
    printed(report);
    expect(report).toMatchObject({ passed: false, error: { code: 'source-mismatch', location: 'roles.map-geometry' }, package: { status: 'complete' } });
  });

  it('stops at an independent source whose map slot holds more instrument records than the cap, before reading them', async () => {
    const good = await sliceDisc();
    // The tool reads a disc whose layout-6 slot lists the good map record and 32 others, which would match without the
    // cap; the job converts the good disc.
    const [front, empty, map] = PRODUCTION_COCKPIT_INSTRUMENTS;
    const others = Array.from({ length: 32 }, () => instrumentRecord(8, [1, 1, 9, 9]));
    const crowded = productionCockpitBlock(undefined, undefined, [front, empty, { layout: 6, records: [map.records[0], ...others] }]);
    const files = sliceCoveredFiles();
    const bad = await writeDisc('crowded', {
      ...files, 'MAIN/SR.NOB': buildImfat(10_000, productionSliceEntries().map(entry => (entry.id === 10_103 ? { ...entry, data: crowded } : entry))),
    });
    const goodFiles = good.paths.map(path => ({ name: basename(path), blob: new Blob([readFileSync(path)]) }));
    const job: ImportJob = (_files, report) => createImportJob(async () => identifySource(
      await openDiscImage(goodFiles.map(({ name, blob }) => ({ name, source: new BlobByteSource(blob) }))), good.catalog,
    ))(goodFiles, report);
    const report = await runPackageCheck(bad.paths, { job });
    printed(report);
    expect(report).toMatchObject({ passed: false, error: { code: 'source-unreadable', location: 'roles.map-geometry' }, package: { status: 'complete' } });
  });

  it('identifies with the production whitelist by default, which rejects a synthetic disc', async () => {
    const { paths } = await sliceDisc();
    const report = await runPackageCheck(paths);
    printed(report);
    expect(report).toMatchObject({ passed: false, error: { code: 'unsupported-version' }, identity: null, package: null });
  });

  it('reports an unreadable input by its argument index', async () => {
    const report = await runPackageCheck([join(directory, `missing-${MARKER}.ccd`)]);
    printed(report);
    expect(report.error).toEqual({ code: 'read-failed', location: 'input[0]' });
  });
});

describe('package check CLI', () => {
  it('prints one JSON report and exits 0 when the check passes', async () => {
    const { paths, catalog } = await sliceDisc();
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(await main(paths, { catalog })).toBe(0);
    expect(log).toHaveBeenCalledTimes(1);
    expect(JSON.parse(printed(JSON.parse(log.mock.calls[0][0] as string)))).toMatchObject({ format: 'osr-package-check', passed: true });
  });

  it('prints one JSON report and exits 1 when the check fails', async () => {
    const { paths, catalog } = await corruptDisc();
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(await main(paths, { catalog })).toBe(1);
    expect(JSON.parse(printed(JSON.parse(log.mock.calls[0][0] as string)))).toMatchObject({ format: 'osr-package-check', passed: false });
  });

  it('exits 2 with a usage report for no paths or an option', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await main([])).toBe(2);
    expect(await main(['--help'])).toBe(2);
    expect(log.mock.calls.map(([text]) => JSON.parse(text as string).error)).toEqual([{ code: 'usage', location: 'argv' }, { code: 'usage', location: 'argv' }]);
  });
});
