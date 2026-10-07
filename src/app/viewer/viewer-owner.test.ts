import { describe, expect, it, vi } from 'vitest';
import { readAssetId, type AssetId } from '../../content/asset-id.ts';
import { encodeEffectPayload } from '../../content/effects/effect-payload.ts';
import { syntheticDebris, syntheticMissile, syntheticProjectile } from '../../content/effects/effects.test-support.ts';
import { encodeFontPayload } from '../../content/graphics/font-payload.ts';
import { packMask } from '../../content/graphics/graphics.test-support.ts';
import { encodeImagePayload } from '../../content/graphics/image-payload.ts';
import { encodeLayoutPayload } from '../../content/graphics/layout-payload.ts';
import { encodePalettePayload } from '../../content/graphics/palette-payload.ts';
import { SYNTHETIC_ASSETS, syntheticGroup } from '../../content/synthetic-content.test-support.ts';
import { FakeAudio, FakeLifecycle, sound } from '../../platform/audio/audio-controller.test-support.ts';
import { RecordingSurface } from '../../render/scene/render-surface.test-support.ts';
import { effectViews } from '../../render/viewer/viewer-effects.ts';
import { INITIAL_VIEW } from '../../render/viewer/viewer-view.ts';
import { syntheticModelBytes } from '../../render/viewer/viewer.test-support.ts';
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

const HULL = id('image/synthetic-hull');
const EFFECTS = [
  { id: 'data/synthetic-debris-visuals', role: 'debris', dependencies: ['image/synthetic-debris'], bytes: encodeEffectPayload(syntheticDebris()) },
  { id: 'data/synthetic-missile-visuals', role: 'missile', dependencies: ['image/synthetic-missile'], bytes: encodeEffectPayload(syntheticMissile()) },
  { id: 'data/synthetic-projectile-visuals', role: 'projectile', bytes: encodeEffectPayload(syntheticProjectile()) },
];

/**
 * The synthetic models group with real model, texture and effect payloads; the effects' textures are images too.
 * `brokenTexture` gives the hull texture bytes the reader rejects.
 */
function modelsGroup({ brokenTexture = false, brokenEffectTexture = false } = {}): ImportedGroup {
  const bytes: Record<string, Uint8Array> = {
    'image/synthetic-debris': brokenEffectTexture ? Uint8Array.of(1, 2, 3) : image(),
    'image/synthetic-hull': brokenTexture ? Uint8Array.of(1, 2, 3) : image(),
    'image/synthetic-missile': brokenEffectTexture ? Uint8Array.of(1, 2, 3) : image(),
    'model/synthetic-base': syntheticModelBytes({ texture: HULL }),
    'model/synthetic-enemy-a': syntheticModelBytes({ texture: HULL }),
    'model/synthetic-enemy-b': syntheticModelBytes({ texture: null }),
    'model/synthetic-missile': syntheticModelBytes({ texture: null }),
    'model/synthetic-player': syntheticModelBytes({ texture: HULL, sound: id('sound/synthetic-engine') }),
    'model/synthetic-projectile': syntheticModelBytes({ texture: null }),
  };
  const specs = [...SYNTHETIC_ASSETS.models, ...EFFECTS, { id: 'image/synthetic-missile', role: 'model-texture' }]
    .sort((left, right) => (left.id < right.id ? -1 : 1))
    .map(spec => ({ ...spec, schemaVersion: spec.id.startsWith('data/') ? 2 : 1, bytes: 'bytes' in spec ? spec.bytes : bytes[spec.id] }));
  const input = syntheticGroup('models', specs, { origin: { type: 'original-import', sourceFingerprint: SYNTHETIC_FINGERPRINT } });
  input.sources = { sourceFingerprint: SYNTHETIC_FINGERPRINT, states: specs.map(({ id: asset }) => ({ id: asset, state: 'verified', unknowns: [] })) };
  return imported('models', input);
}

/** `models` adds the real models group; otherwise its payloads are placeholders the readers reject. */
const packageGroups = (options: { broken?: boolean; models?: boolean; brokenTexture?: boolean; brokenEffectTexture?: boolean } = {}): ImportedGroup[] =>
  allGroups().map(group => {
    switch (group.group) {
      case 'cockpit-hud-map': return cockpitGroup(options);
      case 'audio': return audioGroup();
      case 'models': return options.models ? modelsGroup(options) : group;
      default: return group;
    }
  });

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
    const owner = lifecycle.open(() => ({ holder, render: { surface, reportError }, audio: { capability, lifecycle: new FakeLifecycle() }, reportError }));
    // A laid-out surface, so shown items are really drawn and uploaded.
    surface.resize();
    return owner;
  };
  return { holder, capability, lifecycle, failures, reportError, surfaces, open };
}

describe('viewer items', () => {
  it('lists the models, effects and 2D Assets of every complete group in group and manifest order', () => {
    const groups = packageGroups({ models: true });
    expect(viewerCatalog(groups).entries.map(({ kind, id: asset, group }) => [kind, asset, group])).toEqual([
      ['effect', 'data/synthetic-debris-visuals', 'models'],
      ['effect', 'data/synthetic-missile-visuals', 'models'],
      ['effect', 'data/synthetic-projectile-visuals', 'models'],
      ['image', 'image/synthetic-debris', 'models'],
      ['image', 'image/synthetic-hull', 'models'],
      ['image', 'image/synthetic-missile', 'models'],
      ['model', 'model/synthetic-base', 'models'],
      ['model', 'model/synthetic-enemy-a', 'models'],
      ['model', 'model/synthetic-enemy-b', 'models'],
      ['model', 'model/synthetic-missile', 'models'],
      ['model', 'model/synthetic-player', 'models'],
      ['model', 'model/synthetic-projectile', 'models'],
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
    // Bound, as React's useSyncExternalStore takes them.
    const { getSnapshot, subscribe } = owner;
    const unsubscribe = subscribe(() => undefined);
    expect(getSnapshot()).toBe(owner.getSnapshot());
    unsubscribe();
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

describe('viewer owner models, effects and view', () => {
  it('shows each part list of a model with its notes, and ignores a list that does not exist', () => {
    const { open, surfaces } = setup({ groups: packageGroups({ models: true }) });
    const owner = open()!;
    owner.select(id('model/synthetic-player'));
    expect(owner.getSnapshot()).toMatchObject({ selected: 'model/synthetic-player', variant: 0 });
    expect(owner.getSnapshot().variants).toEqual([
      { kind: 'part-list', list: 0, parts: 2, content: 'intact', confidence: 'likely' },
      { kind: 'part-list', list: 1, parts: 1, content: 'fragments', confidence: 'confirmed' },
      { kind: 'part-list', list: 2, parts: 0, content: 'unknown', confidence: 'unconfirmed' },
    ]);
    expect(owner.renderer.diagnostics().item).toEqual({ kind: 'model', id: 'model/synthetic-player' });
    expect(surfaces[0].gpuStats()).toMatchObject({ geometries: 2, textures: 1 });
    const { variants } = owner.getSnapshot();
    owner.select(id('model/synthetic-player'), 2);
    expect(owner.getSnapshot().variant).toBe(2);
    expect(owner.getSnapshot().variants).toBe(variants);
    expect(surfaces[0].lastDraw!.objects).toEqual([]);
    expect(surfaces[0].gpuStats()).toMatchObject({ geometries: 0, textures: 0 });
    const before = owner.getSnapshot();
    owner.select(id('model/synthetic-player'), 3);
    owner.select(id('model/synthetic-player'), -1);
    owner.select(id('image/synthetic-hull'), 1);
    expect(owner.getSnapshot()).toBe(before);
  });

  it('marks a model failed when its payload or a texture cannot be read', () => {
    const owner = setup().open()!;
    owner.select(id('model/synthetic-base'));
    expect(owner.getSnapshot()).toMatchObject({ variants: [], failures: { 'model/synthetic-base': { code: 'invalid-model-payload' } } });
    expect(owner.renderer.diagnostics().item).toBeNull();
    const textured = setup({ groups: packageGroups({ models: true, brokenTexture: true }) }).open()!;
    textured.select(id('model/synthetic-base'));
    expect(textured.getSnapshot().failures['model/synthetic-base']).toMatchObject({
      code: 'invalid-graphics-payload', path: expect.stringContaining('images[image/synthetic-hull]'),
    });
    textured.select(id('model/synthetic-enemy-b'));
    expect(textured.renderer.diagnostics().item).toEqual({ kind: 'model', id: 'model/synthetic-enemy-b' });
  });

  it.each(['debris', 'missile'])('marks %s failed when its texture cannot be read and can select another entry', effect => {
    const { open, surfaces } = setup({ groups: packageGroups({ models: true, brokenEffectTexture: true }) });
    const owner = open()!;
    owner.select(id(`data/synthetic-${effect}-visuals`));
    expect(owner.getSnapshot().variants).toEqual([]);
    expect(owner.getSnapshot().failures[`data/synthetic-${effect}-visuals`]).toMatchObject({
      code: 'invalid-graphics-payload', path: expect.stringContaining(`images[image/synthetic-${effect}]`),
    });
    expect(owner.renderer.diagnostics().item).toBeNull();
    expect(surfaces[0].gpuStats()).toMatchObject({ geometries: 0, textures: 0 });
    owner.select(id('data/synthetic-projectile-visuals'));
    expect(owner.renderer.diagnostics().item).toEqual({ kind: 'effect', id: 'data/synthetic-projectile-visuals' });
  });

  it('shows each view of an effect with its appearance, and ignores a view that does not exist', () => {
    const { open, surfaces } = setup({ groups: packageGroups({ models: true }) });
    const owner = open()!;
    const debris = id('data/synthetic-debris-visuals');
    owner.select(debris, 3);
    const { variants } = owner.getSnapshot();
    expect(variants.map(variant => (variant.kind === 'effect-view' ? `${variant.label} ${variant.index}` : variant.kind))).toEqual(
      effectViews(syntheticDebris()).map(({ label, index }) => `${label} ${index}`),
    );
    expect(variants[3]).toMatchObject({ shapes: [{ rgb: [255, 255, 255], textured: true }] });
    expect(owner.renderer.diagnostics().item).toEqual({ kind: 'effect', id: debris });
    expect(surfaces[0].lastDraw!.objects).toHaveLength(1);
    // Another view of the same effect reuses what was read and expanded.
    owner.select(debris, 0);
    expect(owner.getSnapshot()).toMatchObject({ variant: 0 });
    expect(owner.getSnapshot().variants).toBe(variants);
    owner.select(id('data/synthetic-missile-visuals'));
    expect(owner.getSnapshot().variants[0]).toMatchObject({ kind: 'effect-view', label: 'missile-type', shapes: expect.arrayContaining([expect.objectContaining({ colour: null })]) });
    const before = owner.getSnapshot();
    owner.select(id('data/synthetic-missile-visuals'), effectViews(syntheticMissile()).length);
    expect(owner.getSnapshot()).toBe(before);
  });

  it('changes the view through the renderer, keeps it across items, and rejects an invalid action', () => {
    const { open, surfaces } = setup({ groups: packageGroups({ models: true }) });
    const owner = open()!;
    owner.select(id('model/synthetic-base'));
    const draws = surfaces[0].draws.length;
    owner.changeView({ type: 'rotate', axis: 'vertical', steps: 1 });
    expect(owner.getSnapshot().view).toEqual({ ...INITIAL_VIEW, yaw: 15 });
    expect(owner.renderer.diagnostics().view).toBe(owner.getSnapshot().view);
    expect(surfaces[0].draws.length).toBe(draws + 1);
    const snapshot = owner.getSnapshot();
    owner.changeView({ type: 'rotate', axis: 'vertical', steps: 0 });
    expect(owner.getSnapshot()).toBe(snapshot);
    owner.select(id('model/synthetic-enemy-b'));
    expect(owner.getSnapshot().view.yaw).toBe(15);
    expect(() => owner.changeView({ type: 'zoom', steps: 0.5 })).toThrow(RangeError);
  });
});

describe('viewer owner initial state', () => {
  it('starts from a given selection, variant and view, and only from the view for an entry no longer listed', () => {
    const { holder, lifecycle, surfaces, open } = setup({ groups: packageGroups({ models: true }) });
    const first = open()!;
    first.select(id('model/synthetic-player'), 1);
    first.changeView({ type: 'rotate', axis: 'vertical', steps: 2 });
    const { selected, variant, view } = first.getSnapshot();
    const surface = new RecordingSurface();
    const second = lifecycle.open(() => ({
      holder, render: { surface, reportError: vi.fn() }, audio: { capability: new FakeAudio(), lifecycle: new FakeLifecycle() }, reportError: vi.fn(),
      initial: { selected, variant, view },
    }))!;
    surface.resize();
    expect(second).not.toBe(first);
    expect([first.serial, second.serial]).toEqual([1, 2]);
    expect(second.getSnapshot()).toMatchObject({ selected: 'model/synthetic-player', variant: 1, view: { yaw: 30 } });
    expect(second.renderer.diagnostics()).toMatchObject({ item: { kind: 'model', id: 'model/synthetic-player' }, view: { yaw: 30 } });
    expect(surfaces[0].calls).toContain('dispose');

    const third = lifecycle.open(() => ({
      holder, render: { surface: new RecordingSurface(), reportError: vi.fn() }, audio: { capability: new FakeAudio(), lifecycle: new FakeLifecycle() }, reportError: vi.fn(),
      initial: { selected: id('model/no-longer-listed'), variant: 0, view },
    }))!;
    expect(third.getSnapshot()).toMatchObject({ selected: null, view: { yaw: 30 } });
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
    lifecycle.open(() => ({ holder: leaky, render: { surface: new RecordingSurface(), reportError: vi.fn() }, audio: { capability: new FakeAudio(), lifecycle: new FakeLifecycle() }, reportError: vi.fn() }));
    lifecycle.close();
    expect(failures).toEqual([removal]);
    expect(lifecycle.open(() => ({ holder, render: { surface: new RecordingSurface(), reportError: vi.fn() }, audio: { capability: new FakeAudio(), lifecycle: new FakeLifecycle() }, reportError: vi.fn() }))).toBeNull();
  });

  it('lists items without a picture when the surface cannot connect but is released cleanly', () => {
    const { holder } = testHolder();
    holder.acceptImport(finishedJob(packageGroups()));
    const lifecycle = createViewerLifecycle({ onCleanupFailure: vi.fn(), reportError: vi.fn() });
    const surface = new RecordingSurface();
    surface.connectFailure = new Error('connect');
    const owner = lifecycle.open(() => ({ holder, render: { surface, reportError: vi.fn() }, audio: { capability: new FakeAudio(), lifecycle: new FakeLifecycle() }, reportError: vi.fn() }))!;
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
    expect(() => lifecycle.open(() => options)).toThrow(RollbackError);
    expect(failures).toEqual([expect.any(RollbackError)]);
    expect(lifecycle.open(() => ({ ...options, render: { surface: new RecordingSurface(), reportError: vi.fn() } }))).toBeNull();
  });

  it('creates nothing for a latched slot, and latches what the options factory cannot roll back', () => {
    const { holder } = testHolder();
    holder.acceptImport(finishedJob(packageGroups()));
    const failures: unknown[] = [];
    const lifecycle = createViewerLifecycle({ onCleanupFailure: cause => failures.push(cause), reportError: vi.fn() });
    const rollback = new RollbackError(new Error('surface'), [new Error('canvas removal')], 'Surface creation and cleanup failed');
    expect(() => lifecycle.open(() => { throw rollback; })).toThrow(rollback);
    expect(failures).toEqual([rollback]);
    // Once latched, the factory, which would create a surface, is never called.
    const create = vi.fn();
    expect(lifecycle.open(create)).toBeNull();
    expect(create).not.toHaveBeenCalled();
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
    lifecycle.open(() => ({ holder, render: { surface, reportError }, audio: { capability: new FakeAudio(), lifecycle: new FakeLifecycle() }, reportError }));
    surface.disposeFailure = new Error('dispose failed');
    lifecycle.close();
    expect(reportError).toHaveBeenCalledWith(new Error('outlet'));
    expect(lifecycle.cleanupFailure()).not.toBeNull();
  });
});
