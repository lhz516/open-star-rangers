import { describe, expect, it } from 'vitest';
import type { AssetDescriptor } from '../../content/asset-contract.ts';
import { encodeImagePayload } from '../../content/graphics/image-payload.ts';
import { encodeStatusMessagesPayload, readStatusMessagesPayload } from '../../content/hud/status-messages-payload.ts';
import { payloadIdentityOf } from '../../content/synthetic-content.test-support.ts';
import type { NameReference } from '../../core/world/entity-table.ts';
import { PresentationError } from '../../render/cockpit/presentation/cockpit-limits.ts';
import { cockpitCopy } from '../composition/cockpit-copy.ts';
import { loadMission } from '../../core/mission/load-mission.ts';
import { craftInfoInput, missionInput, type PackageGroup } from '../resources/mission-input.ts';
import { COCKPIT_ASSET_IDS, cockpitContentOf, type CockpitCopySource } from './cockpit-content.ts';
import { missionGroups } from './mission.test-support.ts';
import type { CraftInfo } from '../../content/rule-data/craft-info.ts';

// P3-13/24 (docs/plan/p3/13/spec.md, 内容输入与校验, 接线与生命周期 内容准备; DC-07, DC-08): the cockpit content of a held
// package, decoded and checked before any run of it is wired.

interface Payload { id: string; schemaVersion: number; bytes: Uint8Array }

/** `groups` with the cockpit-hud-map payload `id` replaced by `bytes` and its descriptor patched by `descriptor`. */
function withCockpitPayload(groups: readonly PackageGroup[], id: string, bytes: Uint8Array, descriptor: Partial<AssetDescriptor> = {}): PackageGroup[] {
  return groups.map((group) => {
    if (group.group !== 'cockpit-hud-map') return group;
    const manifest = structuredClone(group.manifest) as { assets: AssetDescriptor[] };
    const payloads = structuredClone(group.payloads) as Payload[];
    const at = manifest.assets.findIndex((asset) => asset.id === id);
    const payload = payloads.find((record) => record.id === id)!;
    payload.bytes = bytes;
    manifest.assets[at] = { ...manifest.assets[at], ...descriptor, payloadIdentity: { ...payloadIdentityOf(bytes), schemaVersion: payload.schemaVersion } } as AssetDescriptor;
    return { ...group, manifest, payloads };
  });
}

/** The synthetic mission package, whose HUD content has the shapes of the shipped content. */
const drawableGroups = async (): Promise<PackageGroup[]> => [...await missionGroups('mission-startable')];

const PACKAGE = { generation: 3, identity: 'identity' };
const contentOf = (groups: readonly PackageGroup[], copy: CockpitCopySource = cockpitCopy()) => cockpitContentOf({ groups, ...PACKAGE }, copy);

describe('cockpit content', () => {
  it('decodes and checks the HUD content of a package, bound to its generation and content identity', async () => {
    const groups = await drawableGroups();
    const content = contentOf(groups);
    expect(content.binding).toEqual(PACKAGE);
    expect([...content.layouts.keys()]).toEqual(['layout/cockpit/front', 'layout/map/frame']);
    expect([...content.elementImages.keys()]).toEqual([...content.layouts.values()].flatMap(({ elements }) => elements.map(({ image }) => image)));
    expect(content.palettes.byId.get(COCKPIT_ASSET_IDS.flightPalette)).toBe(content.palettes.flight);
    expect(content.palettes.byId.get(COCKPIT_ASSET_IDS.mapPalette)).toBe(content.palettes.map);
    expect([content.unitMarkers.length, content.zoomIcons.length, content.interferenceFrames.length]).toEqual([29, 29, 9]);
    expect(content.leftDisplay).toMatchObject({ statusBackgrounds: { length: 3 }, statusOverlays: { length: 9 }, levelImages: { length: 4 } });
    expect(content.mapGeometry.rectangle).toEqual(content.instruments.slots[1].instruments.find(({ type }) => type === 10)!.rectangle);
  });

  it('resolves names from the mission setup, the craft info and the map marker text, and fails on a reference without a name', async () => {
    const groups = await drawableGroups();
    const { names, hudText } = contentOf(groups);
    const logic = groups.find(({ group }) => group === 'logic')!;
    const setup = loadMission(missionInput(logic));
    const craft = (craftInfoInput(logic)!.content as CraftInfo).craft;
    const declaration = setup.declarations.findIndex(({ nameCandidates }) => nameCandidates.length > 0);
    expect(names({ type: 'none' })).toBe('');
    expect(names({ type: 'map-marker' })).toBe(hudText.entries.mapMarkerName);
    expect(names({ type: 'craft-type', kindBit: 3 })).toBe(craft[3].name);
    expect(names({ type: 'candidate', declaration: { collection: 'mission', index: declaration }, candidate: 0 })).toBe(setup.declarations[declaration].nameCandidates[0]);
    if (setup.namePool.length > 0) expect(names({ type: 'pool', index: 0 })).toBe(setup.namePool[0]);
    const missing: NameReference = { type: 'pool', index: setup.namePool.length };
    expect(() => names(missing)).toThrow(expect.objectContaining({ kind: 'invariant-violated' }));
  });

  it('refuses DIAG formats with conversions DC-08 does not allow', async () => {
    const groups = await drawableGroups();
    const diag = 'data/hud/status-display/messages';
    const record = (groups.find(({ group }) => group === 'cockpit-hud-map')!.payloads as Payload[]).find(({ id }) => id === diag)!;
    const messages = readStatusMessagesPayload(record.bytes, record.schemaVersion);
    const broken = withCockpitPayload(groups, diag, encodeStatusMessagesPayload({ ...messages, statusFormats: [messages.statusFormats[0], 'S2 %u', ...messages.statusFormats.slice(2)] }));
    expect(() => contentOf(broken)).toThrow(expect.objectContaining({ code: 'invalid-status-messages-payload', path: expect.stringMatching(/^leftDisplay\.statusMessages\.statusFormats\[1\]/) }));
  });

  it('refuses a package without an Asset the cockpit draws', async () => {
    const groups = (await drawableGroups()).map((group) => {
      if (group.group !== 'cockpit-hud-map') return group;
      const manifest = structuredClone(group.manifest) as { assets: AssetDescriptor[] };
      manifest.assets = manifest.assets.filter(({ id }) => id !== 'image/map/zoom-icon/7');
      return { ...group, manifest, payloads: (group.payloads as Payload[]).filter(({ id }) => id !== 'image/map/zoom-icon/7') };
    });
    expect(() => contentOf(groups)).toThrow(expect.objectContaining({ code: 'invalid-resource-group', path: 'cockpit-hud-map' }));
  });

  it('refuses decoded images beyond 2^20 indexed pixels before decoding any, from the payload headers', async () => {
    let groups = await drawableGroups();
    // Headers of 640 × 480 images whose pixels are missing: decoding one would fail differently.
    const header = Uint8Array.of(0x80, 0x02, 0xe0, 0x01);
    for (const record of [0, 1, 2, 3]) groups = withCockpitPayload(groups, `image/map/zoom-icon/${record}`, header);
    expect(() => contentOf(groups)).toThrow(PresentationError);
    expect(() => contentOf(groups)).toThrow(expect.objectContaining({ kind: 'presentation-capacity', path: 'cockpit.images' }));
  });

  it('refuses an image outside the palette of the screen it is drawn on', async () => {
    const groups = await drawableGroups();
    const marker = 'image/map/unit-marker/2';
    const palette = COCKPIT_ASSET_IDS.flightPalette;
    const bytes = encodeImagePayload({ width: 2, height: 2, palette, display: 'direct', indices: Uint8Array.of(1, 2, 3, 4), mask: null });
    const descriptor = { dependencies: [{ kind: 'palette', id: palette }] } as unknown as Partial<AssetDescriptor>;
    expect(() => contentOf(withCockpitPayload(groups, marker, bytes, descriptor))).toThrow(expect.objectContaining({ code: 'binding-mismatch', path: `cockpit-hud-map[${marker}].palette` }));
  });

  it('checks the project copy before a start: 58-byte summaries and 2 × 16-byte labels in the fonts that draw them', async () => {
    const groups = await drawableGroups();
    const copy = cockpitCopy();
    const with_ = (patch: Partial<CockpitCopySource>, incoming: Partial<CockpitCopySource['incoming']> = {}): CockpitCopySource =>
      ({ ...copy, ...patch, incoming: { ...copy.incoming, ...incoming } });
    expect(() => contentOf(groups, with_({ summaries: ['x'.repeat(58)] }))).not.toThrow();
    expect(() => contentOf(groups, with_({ summaries: ['x'.repeat(59)] }))).toThrow(expect.objectContaining({ kind: 'invalid-input' }));
    expect(() => contentOf(groups, with_({ summaries: ['a{b'] }))).toThrow();
    expect(() => contentOf(groups, with_({ labels: [['X'.repeat(16), 'Y']] }))).not.toThrow();
    expect(() => contentOf(groups, with_({ labels: [['X'.repeat(17)]] }))).toThrow(expect.objectContaining({ kind: 'invalid-input' }));
    expect(() => contentOf(groups, with_({ labels: [['A', 'B', 'C']] }))).toThrow(expect.objectContaining({ kind: 'invalid-input' }));
    expect(() => contentOf(groups, with_({}, { uncoveredSummary: '' }))).toThrow(expect.objectContaining({ kind: 'invalid-input' }));
  });
});

describe('cockpit copy (interim, until P3-13/25)', () => {
  it('gives the G-03 summaries that keep DC-07\'s limits, and the explicit uncovered feedback for every other message and label', () => {
    const { incoming, summaries, labels, costUnavailable } = cockpitCopy();
    // 20011 index 1: the base reports no threat, a short summary.
    expect(incoming.summary({ table: 20011, face: 0, index: 1 })).toBe('Status reply: the base reports no threat.');
    // 20011 index 0: the docking reply is longer than 58 bytes; unidentified messages have no summary.
    expect(incoming.summary({ table: 20011, face: 0, index: 0 })).toBeNull();
    expect(incoming.summary({ table: 20985, face: 0, index: 0 })).toBeNull();
    expect(incoming.label({ table: 20011, face: 0, index: 1 })).toBeNull();
    expect(incoming.uncoveredSummary).toBe('G-03');
    expect(incoming.uncoveredLabel).toEqual(['G-03']);
    expect(summaries.every((summary) => summary.length <= 58)).toBe(true);
    expect(summaries).toContain('Status reply: the base reports no threat.');
    expect(labels).toEqual([]);
    expect(costUnavailable).toBe('N/A');
  });
});
