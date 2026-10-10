import { expect, type Page } from '@playwright/test';
import type { HeldGroup } from '../../src/app/resources/resource-holder.ts';
import type { GroupInput } from '../../src/content/completeness.ts';
import { readGroupManifest } from '../../src/content/manifest.ts';
import { applyManifestIdentity } from '../../src/content/manifest-identity.ts';
import { readPayloadRecords } from '../../src/content/payload.ts';
import { sha256Fingerprint } from '../../src/content/sha256.ts';
import { writeSoundPayload } from '../../src/content/sound-payload.ts';
import { readGroupInputs } from '../../src/platform/storage/resource-cache-records.ts';
import { button } from './app-entry.ts';
import { audioSources, type AudioSourceRecord } from './audio-playback.ts';
import { contentSamples, entryButton, expectSamples, modelsEntries, modelsPackage, pictureOf, viewerDiagnostics } from './viewer-observations.ts';

// P3-03/20 (AC-17): the version 4 package in the viewer. Expected pixels and sounds come from the synthetic `models`
// package converted in Node; the audio probe (`installAudioProbe`) observes the sources the viewer starts.

/** The image roles slice definition version 4 adds to the viewer's list. */
const NEW_IMAGE_ROLES = Object.freeze(['explosion-frame', 'nebula-background', 'hit-shimmer', 'target-display'] as const);
/** The sound roles slice definition version 4 adds, with exactly eight event and three HUD sounds. */
export const NEW_SOUND_ROLES = Object.freeze({ 'event-sound': 8, 'hud-sound': 3 } as const);
/** The data roles version 4 adds, which the viewer does not list (spec technical decision 9). */
export const NEW_DATA_ROLES = Object.freeze([
  'craft-info', 'debris-parameters', 'ai-programs', 'comm-menus', 'base-repair-items', 'flight-messages', 'scene-settings', 'explosion-table',
  'explosion-animation', 'nebula-backgrounds', 'view-labels', 'hud-text',
] as const);
/** The event sound that plays a number of times (SND `flags` 8, sound payload schema 2 `repeat`). */
export const REPEAT_SOUND = 'sound/event/warp-arrival';

/** From the menu holding a package: opens the viewer and waits until its picture and audio are prepared. */
export async function openHeldViewer(page: Page): Promise<void> {
  await button(page, 'View resources').click();
  await expect(page.getByRole('heading', { name: 'Resource viewer', exact: true })).toBeFocused();
  await expect(page.getByTestId('viewer-render-status')).not.toHaveText('Preparing the viewer…');
  await expect(page.getByTestId('viewer-audio-status')).not.toHaveText('Preparing audio…');
}

/**
 * In the open viewer: lists every image of the new roles, then shows the first of each and reads its drawn pixels back
 * byte for byte; one of them is a masked explosion frame, read on its checkerboard too.
 */
export async function expectNewImages(page: Page): Promise<void> {
  const entries = await modelsEntries();
  let masked = false;
  for (const role of NEW_IMAGE_ROLES) {
    const ofRole = entries.filter(({ entry }) => entry.kind === 'image' && entry.role === role);
    expect(ofRole.length, `images of ${role}`).toBeGreaterThan(0);
    for (const { entry } of ofRole) await expect(entryButton(page, entry.id)).toHaveCount(1);
    const [{ entry, resolved }] = ofRole;
    await entryButton(page, entry.id).click();
    await expect(page.getByTestId('viewer-view')).toHaveAttribute('aria-label', `Resource viewer picture: ${entry.id}`);
    const { state, layout, placement } = await viewerDiagnostics(page);
    expect(state, entry.id).toBe('ready');
    const picture = pictureOf(resolved.item(0)!);
    await expectSamples(page, layout!, contentSamples(picture, placement!));
    masked ||= role === 'explosion-frame' && picture.rgba.some((alpha, index) => index % 4 === 3 && alpha !== 255);
  }
  expect(masked, 'a masked explosion frame').toBe(true);
}

/** The sound Asset IDs of the package's audio group by role, in Asset ID order. */
export async function soundsByRole(): Promise<Map<string, string[]>> {
  const audio = (await modelsPackage()).find(({ group }) => group === 'audio')!;
  const byRole = new Map<string, string[]>();
  for (const { id, role } of [...readGroupManifest(audio.manifest).assets].sort((left, right) => (left.id < right.id ? -1 : 1))) {
    byRole.set(role, [...(byRole.get(role) ?? []), id]);
  }
  return byRole;
}

/** The Asset IDs of the package's data Assets of the new roles. */
export async function newDataIds(): Promise<string[]> {
  const roles: readonly string[] = NEW_DATA_ROLES;
  return (await modelsPackage()).flatMap(({ manifest }) => readGroupManifest(manifest).assets
    .filter(({ kind, role }) => kind === 'data' && roles.includes(role)).map(({ id }) => id));
}

/**
 * The audio group's payload of `id` in `groups`, the `models` package by default, decoded here from the documented
 * sound payload layout (P2-08 S-02; P3-03 spec, 声音 payload schema 2) rather than by the reader the controller uses:
 * "OSRS", the sample rate and frame count as u32 LE at 4 and 8, then bytes for the channels, the encoding (1 u8,
 * 2 s16le), the loop mode (0 none, 1 whole, 2 repeat) and the play count, and the interleaved PCM from byte 16. The
 * AudioBuffer it must become maps u8 v to (v − 128) / 128 and s16le v to v / 32768.
 */
export async function decodedSound(id: string, groups?: readonly GroupInput[]) {
  const audio = (groups ?? await modelsPackage()).find(({ manifest }) => readGroupManifest(manifest).group === 'audio')!;
  const bytes = readPayloadRecords(audio.payloads).find(record => record.id === id)!.bytes;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  expect(String.fromCharCode(...bytes.subarray(0, 4)), id).toBe('OSRS');
  const [sampleRate, frames, channels, encoding, loop, plays] = [view.getUint32(4, true), view.getUint32(8, true), bytes[12], bytes[13], bytes[14], bytes[15]];
  expect(bytes.byteLength, id).toBe(16 + frames * channels * (encoding === 1 ? 1 : 2));
  const sample = (at: number): number => Math.fround(encoding === 1 ? (bytes[16 + at] - 128) / 128 : view.getInt16(16 + at * 2, true) / 32_768);
  return {
    loop: (['none', 'whole', 'repeat'] as const)[loop],
    /** The passes it plays: its count for `repeat`, otherwise 1. */
    plays: loop === 2 ? plays : 1,
    /** One pass, in seconds. */
    pass: frames / sampleRate,
    buffer: { sampleRate, length: frames, channels: Array.from({ length: channels }, (_, channel) => Array.from({ length: frames }, (_, frame) => sample(frame * channels + channel))) },
  };
}

/** Plays `id` with a trusted click on its Play button and resolves to the one source it started. */
export async function playSound(page: Page, id: string): Promise<AudioSourceRecord> {
  const started = () => page.evaluate(() => window.osrAudioProbe.started());
  const before = await started();
  await button(page, `Play ${id}`).click();
  await expect.poll(started, { message: `${id} starts one source` }).toBe(before + 1);
  return (await audioSources(page))[before];
}

/** Waits until no voice plays and no application node feeds the output. */
export async function expectSilentVoices(page: Page): Promise<void> {
  await expect(page.getByTestId('viewer-voices')).toHaveText('0');
  await expect.poll(() => page.evaluate(() => window.osrAudioProbe.routed())).toBe(0);
}

/**
 * The long repeat sound replacing `REPEAT_SOUND` (u8 mono at 8000 Hz), whose passes can be counted in real time: each
 * pass is a 300 ms square wave of amplitude 0.5 (25 frames low, 25 high) between 150 ms of silence on either side,
 * which with the next pass's lead outlasts the audio probe's analyser window and a stalled sample. The pass begins
 * and ends silent because the browser resamples a looping buffer across its loop point: a tone right after the point
 * would already sound, interpolated, in the last frames before a stop there.
 */
export const LONG_REPEAT = Object.freeze({ sampleRate: 8_000, lead: 1_200, tone: 2_400, tail: 1_200, plays: 3 });

/**
 * The `models` package with `REPEAT_SOUND` replaced by `LONG_REPEAT`, keeping its role; its manifest declares the new
 * payload's identity, and the package identity is derived anew from the same basis.
 */
export async function repeatingPackage(): Promise<readonly HeldGroup[]> {
  const { sampleRate, lead, tone, tail, plays } = LONG_REPEAT;
  const pcm = Uint8Array.from({ length: lead + tone + tail }, (_, index) => (index < lead || index >= lead + tone ? 128 : Math.floor((index - lead) / 25) % 2 ? 192 : 64));
  const bytes = writeSoundPayload({ sampleRate, channels: 1, encoding: 'u8', loop: 'repeat', plays, pcm });
  const inputs = readGroupInputs(await modelsPackage(), 'invalid-request');
  const { schemaVersion, sliceId, sliceDefinitionVersion, converterVersion, origin } = inputs[0].manifest.identity;
  return Object.freeze(applyManifestIdentity({ schemaVersion, sliceId, sliceDefinitionVersion, converterVersion, origin }, inputs.map(({ manifest, payloads, sources }) => ({
    group: manifest.group,
    assets: manifest.assets.map(asset => (asset.id !== REPEAT_SOUND ? asset
      : { ...asset, payloadIdentity: { ...asset.payloadIdentity, byteLength: bytes.byteLength, fingerprint: sha256Fingerprint(bytes) } })),
    payloads: payloads.map(payload => (payload.id === REPEAT_SOUND ? { ...payload, bytes } : payload)),
    sources,
  }))).map((group): HeldGroup => ({ group: group.manifest.group, ...group })));
}
