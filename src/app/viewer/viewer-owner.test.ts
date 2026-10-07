import { describe, expect, it, vi } from 'vitest';
import { readAssetId, type AssetId } from '../../content/asset-id.ts';
import { encodeFontPayload } from '../../content/graphics/font-payload.ts';
import { packMask } from '../../content/graphics/graphics.test-support.ts';
import { encodeImagePayload } from '../../content/graphics/image-payload.ts';
import { encodeLayoutPayload } from '../../content/graphics/layout-payload.ts';
import { encodePalettePayload } from '../../content/graphics/palette-payload.ts';
import { SYNTHETIC_ASSETS, syntheticGroup } from '../../content/synthetic-content.test-support.ts';
import { FakeAudio, FakeLifecycle, sound } from '../../platform/audio/audio-controller.test-support.ts';
import { RecordingSurface } from '../../render/scene/render-surface.test-support.ts';
import { RollbackError } from '../session/rollback-error.ts';
import type { ImportedGroup } from '../import/import-job-owner.ts';
import { allGroups, finishedJob, flush, imported, SYNTHETIC_FINGERPRINT, testHolder } from '../resources/resource-holder.test-support.ts';
import { viewerCatalog } from './viewer-items.ts';
import { createViewerLifecycle, type ViewerOwner } from './viewer-owner.ts';

const id = (value: string): AssetId => readAssetId(value);
const PALETTE = id('palette/synthetic-viewer');

/** A 2×2 image on PALETTE with a transparent corner. */
const image = () => encodeImagePayload({
  width: 2, height: 2, palette: PALETTE, display: 'direct', indices: Uint8Array.of(1, 2, 0, 3), mask: packMask(['11', '01']),
});

/**
 * The synthetic cockpit-hud-map group with real graphics payloads for every Asset, plus PALETTE. `broken` replaces the
 * panel image's bytes with ones the reader rejects.
 */
function cockpitGroup({ broken = false } = {}): ImportedGroup {
  const bytes: Record<string, Uint8Array> = {
    'font/synthetic-hud': encodeFontPayload({ cellWidth: 4, height: 2, glyphRows: 2, glyphs: Uint8Array.of(0x90, 0x60), charMap: [{ code: 65, glyph: 0 }] }),
    'image/synthetic-mfd': image(),
    'image/synthetic-panel': broken ? Uint8Array.of(1, 2, 3) : image(),
    'layout/synthetic-front': encodeLayoutPayload({ frame: { width: 4, height: 3 }, elements: [{ image: id('image/synthetic-panel'), x: 1, y: 1 }] }),
    'layout/synthetic-map': encodeLayoutPayload({ frame: { width: 3, height: 3 }, elements: [{ image: id('image/synthetic-mfd'), x: 0, y: 0 }] }),
    [PALETTE]: encodePalettePayload({ entries: Uint8Array.of(0, 0, 0, 90, 120, 150, 40, 60, 80, 200, 180, 160) }),
  };
  const specs = [...SYNTHETIC_ASSETS['cockpit-hud-map'], { id: PALETTE, role: 'flight-palette' }]
    .sort((left, right) => (left.id < right.id ? -1 : 1))
    .map(spec => ({ ...spec, bytes: bytes[spec.id] }));
  const input = syntheticGroup('cockpit-hud-map', specs, { origin: { type: 'original-import', sourceFingerprint: SYNTHETIC_FINGERPRINT } });
  input.sources = { sourceFingerprint: SYNTHETIC_FINGERPRINT, states: specs.map(({ id: asset }) => ({ id: asset, state: 'verified', unknowns: [] })) };
  return imported('cockpit-hud-map', input);
}

/** The synthetic audio group with real sound payloads. */
function audioGroup(): ImportedGroup {
  const specs = SYNTHETIC_ASSETS.audio.map(spec => ({ ...spec, bytes: sound() }));
  const input = syntheticGroup('audio', specs, { origin: { type: 'original-import', sourceFingerprint: SYNTHETIC_FINGERPRINT } });
  input.sources = { sourceFingerprint: SYNTHETIC_FINGERPRINT, states: specs.map(({ id: asset }) => ({ id: asset, state: 'verified', unknowns: [] })) };
  return imported('audio', input);
}

const packageGroups = (options: { broken?: boolean } = {}): ImportedGroup[] =>
  allGroups().map(group => (group.group === 'cockpit-hud-map' ? cockpitGroup(options) : group.group === 'audio' ? audioGroup() : group));

function setup({ groups = packageGroups(), initialState = 'running' } = {}) {
  const { holder } = testHolder();
  expect(holder.acceptImport(finishedJob(groups))).toBe(true);
  const capability = new FakeAudio();
  capability.initialState = initialState;
  const failures: unknown[] = [];
  const reportError = vi.fn();
  const lifecycle = createViewerLifecycle({ onCleanupFailure: cause => failures.push(cause), reportError });
  const surfaces: RecordingSurface[] = [];
  const open = (): ViewerOwner | null => {
    const surface = new RecordingSurface();
    surfaces.push(surface);
    const owner = lifecycle.open({ holder, render: { surface, reportError }, audio: { capability, lifecycle: new FakeLifecycle() }, reportError });
    // A laid-out surface, so shown items are really drawn and uploaded.
    surface.resize();
    return owner;
  };
  return { holder, capability, lifecycle, failures, reportError, surfaces, open };
}

describe('viewer items', () => {
  it('lists the 2D Assets of every complete group in group and manifest order', () => {
    const groups = packageGroups();
    expect(viewerCatalog(groups).entries.map(({ kind, id: asset, group }) => [kind, asset, group])).toEqual([
      ['image', 'image/synthetic-debris', 'models'],
      ['image', 'image/synthetic-hull', 'models'],
      ['font', 'font/synthetic-hud', 'cockpit-hud-map'],
      ['image', 'image/synthetic-mfd', 'cockpit-hud-map'],
      ['image', 'image/synthetic-panel', 'cockpit-hud-map'],
      ['layout', 'layout/synthetic-front', 'cockpit-hud-map'],
      ['layout', 'layout/synthetic-map', 'cockpit-hud-map'],
      ['palette', PALETTE, 'cockpit-hud-map'],
    ]);
  });
});

describe('viewer owner', () => {
  it('lists the held package, shows each kind of item and marks an unreadable one failed', async () => {
    const { open, surfaces } = setup();
    const owner = open()!;
    await flush();
    expect(owner.getSnapshot()).toMatchObject({ generation: 1, selected: null, failures: {} });
    expect(owner.getSnapshot().audio).not.toBeNull();
    for (const asset of ['image/synthetic-panel', 'layout/synthetic-front', 'font/synthetic-hud', PALETTE]) {
      owner.select(id(asset));
      expect(owner.renderer.diagnostics().item).toMatchObject({ id: asset });
      expect(owner.getSnapshot().selected).toBe(asset);
    }
    // The models group's synthetic images have placeholder bytes, which the reader rejects: only that item fails.
    owner.select(id('image/synthetic-hull'));
    expect(owner.getSnapshot()).toMatchObject({ selected: 'image/synthetic-hull', failures: { 'image/synthetic-hull': { code: 'invalid-graphics-payload' } } });
    expect(owner.renderer.diagnostics().item).toBeNull();
    owner.select(id('image/synthetic-mfd'));
    expect(owner.renderer.diagnostics().item).toMatchObject({ id: 'image/synthetic-mfd' });
    expect(surfaces[0].draws.length).toBeGreaterThan(0);
  });

  it('marks a layout whose image cannot be read failed, at the image', () => {
    const { open } = setup({ groups: packageGroups({ broken: true }) });
    const owner = open()!;
    owner.select(id('layout/synthetic-front'));
    expect(owner.getSnapshot().failures['layout/synthetic-front']).toMatchObject({ code: 'invalid-graphics-payload', path: expect.stringContaining('images[image/synthetic-panel]') });
    owner.select(id('layout/synthetic-map'));
    expect(owner.renderer.diagnostics().item).toMatchObject({ id: 'layout/synthetic-map' });
  });

  it('releases the shown item and the audio before the holder replaces the package, then follows the new one', async () => {
    const { holder, open, capability } = setup();
    const owner = open()!;
    await flush();
    owner.select(id('image/synthetic-panel'));
    expect(owner.renderer.diagnostics().gpu?.textures).toBeGreaterThan(0);
    const audio = owner.getSnapshot().audio!;
    expect(audio.audition(SYNTHETIC_ASSETS.audio[0].id)).toEqual({ status: 'started' });
    capability.context.closing = 'resolve';
    let seen: unknown = undefined;
    holder.beforeReplace(() => {
      // Registered after the owner, so it sees the owner's release.
      seen = { item: owner.renderer.diagnostics().item, textures: owner.renderer.diagnostics().gpu?.textures, voices: audio.getSnapshot().voices, closed: capability.context.count('close') };
    });
    holder.acceptImport(finishedJob(packageGroups()));
    expect(seen).toEqual({ item: null, textures: 0, voices: 0, closed: 1 });
    expect(owner.getSnapshot()).toMatchObject({ generation: 2, selected: null, audio: null });
    await flush();
    expect(owner.getSnapshot().audio).not.toBeNull();
    expect(owner.getSnapshot().audio).not.toBe(audio);
  });

  it('drops a pending audition when the package is replaced', async () => {
    const { holder, open, capability } = setup({ initialState: 'suspended' });
    const owner = open()!;
    await flush();
    const audio = owner.getSnapshot().audio!;
    expect(audio.audition(SYNTHETIC_ASSETS.audio[0].id)).toEqual({ status: 'pending' });
    const context = capability.context;
    holder.acceptImport(finishedJob(packageGroups()));
    context.setState('running');
    expect(context.voices).toHaveLength(0);
  });

  it('creates no audio for a replaced package until the old context is confirmed closed', async () => {
    const { holder, open, capability } = setup();
    const owner = open()!;
    await flush();
    owner.getSnapshot().audio!.audition(SYNTHETIC_ASSETS.audio[0].id);
    capability.context.closing = 'pending';
    holder.acceptImport(finishedJob(packageGroups()));
    await flush();
    expect(owner.getSnapshot()).toMatchObject({ generation: 2, audio: null });
  });

  it('latches when a replaced package audio context fails to close, and creates no new audio', async () => {
    const { holder, open, capability, failures, lifecycle } = setup();
    const owner = open()!;
    await flush();
    owner.getSnapshot().audio!.audition(SYNTHETIC_ASSETS.audio[0].id);
    holder.acceptImport(finishedJob(packageGroups()));
    await flush();
    expect(failures).toEqual([new Error('close rejected')]);
    expect(lifecycle.cleanupFailure()).toEqual({ cause: new Error('close rejected') });
    expect(owner.getSnapshot().audio).toBeNull();
    expect(capability.contexts).toHaveLength(1);
  });
});

describe('viewer owner release barriers and failures', () => {
  it('keeps every replacement waiting for the first pending close', async () => {
    const { holder, open, capability } = setup();
    const owner = open()!;
    await flush();
    owner.getSnapshot().audio!.audition(SYNTHETIC_ASSETS.audio[0].id);
    capability.context.closing = 'pending';
    holder.acceptImport(finishedJob(packageGroups()));
    holder.acceptImport(finishedJob(packageGroups()));
    await flush();
    expect(owner.getSnapshot()).toMatchObject({ generation: 3, audio: null });
    expect(capability.contexts).toHaveLength(1);
  });

  it('keeps every reopened viewer waiting for an earlier pending close', async () => {
    const { open, lifecycle, capability } = setup();
    const owner = open()!;
    await flush();
    owner.getSnapshot().audio!.audition(SYNTHETIC_ASSETS.audio[0].id);
    capability.context.closing = 'pending';
    lifecycle.close();
    open();
    lifecycle.close();
    const third = open()!;
    await flush();
    expect(third.getSnapshot().audio).toBeNull();
  });

  it('releases the shown item before a replacement even after the renderer failed', () => {
    const { holder, open, surfaces } = setup();
    const owner = open()!;
    owner.select(id('image/synthetic-panel'));
    surfaces[0].layoutFailure = new Error('layout');
    surfaces[0].resize(800, 600);
    expect(owner.renderer.getSnapshot().state).toBe('failed');
    expect(surfaces[0].gpuStats().textures).toBeGreaterThan(0);
    holder.acceptImport(finishedJob(packageGroups()));
    expect(surfaces[0].gpuStats()).toEqual({ geometries: 0, textures: 0, programs: 0 });
  });

  it('latches when the shown item cannot be released before a replacement', () => {
    const { holder, open, surfaces, failures } = setup();
    const owner = open()!;
    owner.select(id('image/synthetic-panel'));
    const material = surfaces[0].lastDraw!.objects[1].material as unknown as { map: { dispose: () => void } };
    material.map.dispose = () => { throw new Error('texture'); };
    holder.acceptImport(finishedJob(packageGroups()));
    expect(failures).toEqual([expect.any(AggregateError)]);
    expect(owner.getSnapshot().generation).toBe(2);
  });

  it('latches when a holder subscription cannot be removed', () => {
    const { holder } = testHolder();
    holder.acceptImport(finishedJob(packageGroups()));
    const failures: unknown[] = [];
    const lifecycle = createViewerLifecycle({ onCleanupFailure: cause => failures.push(cause), reportError: vi.fn() });
    const removal = new Error('unsubscribe');
    const leaky = { ...holder, current: () => holder.current(), subscribe: () => () => { throw removal; }, beforeReplace: holder.beforeReplace.bind(holder) };
    lifecycle.open({ holder: leaky, render: { surface: new RecordingSurface(), reportError: vi.fn() }, audio: { capability: new FakeAudio(), lifecycle: new FakeLifecycle() }, reportError: vi.fn() });
    lifecycle.close();
    expect(failures).toEqual([removal]);
    expect(lifecycle.open({ holder, render: { surface: new RecordingSurface(), reportError: vi.fn() }, audio: { capability: new FakeAudio(), lifecycle: new FakeLifecycle() }, reportError: vi.fn() })).toBeNull();
  });

  it('lists items without a picture when the surface cannot connect but is released cleanly', () => {
    const { holder } = testHolder();
    holder.acceptImport(finishedJob(packageGroups()));
    const lifecycle = createViewerLifecycle({ onCleanupFailure: vi.fn(), reportError: vi.fn() });
    const surface = new RecordingSurface();
    surface.connectFailure = new Error('connect');
    const owner = lifecycle.open({ holder, render: { surface, reportError: vi.fn() }, audio: { capability: new FakeAudio(), lifecycle: new FakeLifecycle() }, reportError: vi.fn() })!;
    expect(owner.renderer.getSnapshot()).toEqual({ state: 'unavailable', error: surface.connectFailure });
    expect(owner.getSnapshot().entries.length).toBeGreaterThan(0);
    expect(lifecycle.cleanupFailure()).toBeNull();
  });

  it('latches a failed renderer rollback and creates no viewer afterwards', () => {
    const { holder } = testHolder();
    holder.acceptImport(finishedJob(packageGroups()));
    const failures: unknown[] = [];
    const lifecycle = createViewerLifecycle({ onCleanupFailure: cause => failures.push(cause), reportError: vi.fn() });
    const surface = new RecordingSurface();
    surface.connectFailure = new Error('connect');
    surface.disposeFailure = new Error('dispose');
    const options = { holder, render: { surface, reportError: vi.fn() }, audio: { capability: new FakeAudio(), lifecycle: new FakeLifecycle() }, reportError: vi.fn() };
    expect(() => lifecycle.open(options)).toThrow(RollbackError);
    expect(failures).toEqual([expect.any(RollbackError)]);
    expect(lifecycle.open({ ...options, render: { surface: new RecordingSurface(), reportError: vi.fn() } })).toBeNull();
  });
});

describe('viewer lifecycle', () => {
  it('releases the renderer and the audio on close, and opens again once the audio closed', async () => {
    const { open, lifecycle, capability, surfaces, failures } = setup();
    const owner = open()!;
    await flush();
    owner.select(id('image/synthetic-panel'));
    owner.getSnapshot().audio!.audition(SYNTHETIC_ASSETS.audio[0].id);
    capability.context.closing = 'resolve';
    const listener = vi.fn();
    owner.subscribe(listener);
    lifecycle.close();
    expect(owner.renderer.getSnapshot().state).toBe('disposed');
    expect(surfaces[0].calls).toContain('dispose');
    expect(capability.context.count('close')).toBe(1);
    const next = open()!;
    expect(next.getSnapshot().audio).toBeNull();
    await flush();
    expect(next.getSnapshot().audio).not.toBeNull();
    expect(failures).toEqual([]);
    expect(listener).not.toHaveBeenCalled();
  });

  it('keeps a new viewer without audio while the previous close is pending', async () => {
    const { open, lifecycle, capability } = setup();
    const owner = open()!;
    await flush();
    owner.getSnapshot().audio!.audition(SYNTHETIC_ASSETS.audio[0].id);
    capability.context.closing = 'pending';
    lifecycle.close();
    const next = open()!;
    await flush();
    expect(next.getSnapshot().audio).toBeNull();
    expect(capability.contexts).toHaveLength(1);
  });

  it('latches a rejected audio close and creates no viewer afterwards, while the holder still takes imports', async () => {
    const { holder, open, lifecycle, failures } = setup();
    const owner = open()!;
    await flush();
    owner.getSnapshot().audio!.audition(SYNTHETIC_ASSETS.audio[0].id);
    lifecycle.close();
    await flush();
    expect(failures).toEqual([new Error('close rejected')]);
    expect(open()).toBeNull();
    const before = holder.getSnapshot().package!.generation;
    expect(holder.acceptImport(finishedJob(packageGroups()))).toBe(true);
    expect(holder.getSnapshot().package!.generation).toBe(before + 1);
  });

  it('latches a renderer release failure at once', () => {
    const { open, lifecycle, surfaces, failures } = setup();
    open();
    surfaces[0].disposeFailure = new Error('dispose failed');
    lifecycle.close();
    expect(failures).toHaveLength(1);
    expect(lifecycle.cleanupFailure()).not.toBeNull();
    expect(open()).toBeNull();
  });

  it('closes a still-open viewer before opening the next', async () => {
    const { open, surfaces } = setup();
    const first = open()!;
    open();
    expect(first.renderer.getSnapshot().state).toBe('disposed');
    expect(surfaces[0].calls).toContain('dispose');
  });

  it('reports what the cleanup outlet throws and still latches', () => {
    const { holder } = testHolder();
    holder.acceptImport(finishedJob(packageGroups()));
    const reportError = vi.fn();
    const lifecycle = createViewerLifecycle({ onCleanupFailure: () => { throw new Error('outlet'); }, reportError });
    const surface = new RecordingSurface();
    lifecycle.open({ holder, render: { surface, reportError }, audio: { capability: new FakeAudio(), lifecycle: new FakeLifecycle() }, reportError });
    surface.disposeFailure = new Error('dispose failed');
    lifecycle.close();
    expect(reportError).toHaveBeenCalledWith(new Error('outlet'));
    expect(lifecycle.cleanupFailure()).not.toBeNull();
  });
});
