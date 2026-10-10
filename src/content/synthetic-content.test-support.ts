import type { ResourceGroup } from './asset-contract.ts';
import type { GroupCompletenessResult, PackageCompletenessResult } from './completeness.ts';
import { SLICE_ID } from './content-identity.ts';
import { sha256Fingerprint } from './sha256.ts';
import { CLASSIC_P2_SLICE, type SliceDefinition, type SliceRole } from './slice-definition.ts';
import { SOUND_PAYLOAD_SCHEMA_VERSION } from './sound-payload.ts';

// Code-generated synthetic content for contract tests; it never holds original data. The package covers every
// CLASSIC_P2_SLICE role, and builders return fresh mutable plain data that a test may corrupt.

export interface SyntheticAssetSpec {
  readonly id: string;
  readonly role: string;
  readonly dependencies?: readonly string[];
  /** Payload bytes; defaults to an ASCII label of the ID. */
  readonly bytes?: Uint8Array;
  readonly schemaVersion?: number;
}

/** The eight event sounds and three HUD sounds version 4 requires exactly. */
const EVENT_SOUNDS = Array.from({ length: 8 }, (_, index) => ({ id: `sound/synthetic-signal-${index + 1}`, role: 'event-sound' }));
const HUD_SOUNDS = Array.from({ length: 3 }, (_, index) => ({ id: `sound/synthetic-tone-${index + 1}`, role: 'hud-sound' }));

export const SYNTHETIC_ASSETS: Readonly<Record<ResourceGroup, readonly SyntheticAssetSpec[]>> = {
  logic: [
    { id: 'data/synthetic-ai-programs', role: 'ai-programs' },
    { id: 'data/synthetic-base-repair', role: 'base-repair-items' },
    { id: 'data/synthetic-comm-menus', role: 'comm-menus' },
    { id: 'data/synthetic-craft-info', role: 'craft-info' },
    { id: 'data/synthetic-debris-parameters', role: 'debris-parameters' },
    { id: 'data/synthetic-flight-messages', role: 'flight-messages' },
    { id: 'mission/synthetic-first', role: 'mission', dependencies: ['model/synthetic-base', 'model/synthetic-enemy-a', 'model/synthetic-enemy-b', 'model/synthetic-player'] },
  ],
  models: [
    // The explosion table and the nebula list require their animations, frames and images through their dependencies.
    { id: 'data/synthetic-animation', role: 'explosion-animation', dependencies: ['image/synthetic-spark'] },
    { id: 'data/synthetic-explosions', role: 'explosion-table', dependencies: ['data/synthetic-animation', 'sound/synthetic-explosion'] },
    { id: 'data/synthetic-nebulae', role: 'nebula-backgrounds', dependencies: ['image/synthetic-nebula'] },
    { id: 'data/synthetic-scene', role: 'scene-settings' },
    { id: 'image/synthetic-debris', role: 'debris' },
    { id: 'image/synthetic-hull', role: 'model-texture' },
    { id: 'image/synthetic-nebula', role: 'nebula-background' },
    { id: 'image/synthetic-shimmer', role: 'hit-shimmer' },
    { id: 'image/synthetic-spark', role: 'explosion-frame' },
    { id: 'model/synthetic-base', role: 'base', dependencies: ['image/synthetic-hull'] },
    { id: 'model/synthetic-enemy-a', role: 'enemy-ship', dependencies: ['image/synthetic-hull'] },
    { id: 'model/synthetic-enemy-b', role: 'enemy-ship' },
    { id: 'model/synthetic-missile', role: 'missile' },
    { id: 'model/synthetic-player', role: 'player-ship', dependencies: ['image/synthetic-hull', 'sound/synthetic-engine'] },
    { id: 'model/synthetic-projectile', role: 'projectile' },
  ],
  'cockpit-hud-map': [
    { id: 'data/synthetic-view-labels', role: 'view-labels' },
    { id: 'font/synthetic-hud', role: 'font' },
    { id: 'image/synthetic-mfd', role: 'hud-mfd' },
    { id: 'image/synthetic-panel', role: 'cockpit-image' },
    { id: 'image/synthetic-target-display', role: 'target-display' },
    { id: 'layout/synthetic-front', role: 'front-cockpit', dependencies: ['font/synthetic-hud', 'image/synthetic-panel'] },
    { id: 'layout/synthetic-map', role: 'strategic-map', dependencies: ['font/synthetic-hud'] },
  ],
  // The sounds declare the sound payload schema; every other Asset declares 1.
  audio: [
    { id: 'sound/synthetic-engine', role: 'model-sound' },
    { id: 'sound/synthetic-explosion', role: 'explosion-sound' },
    { id: 'sound/synthetic-fire', role: 'fire-sound' },
    { id: 'sound/synthetic-missile', role: 'missile-sound' },
    ...EVENT_SOUNDS,
    ...HUD_SOUNDS,
    { id: 'sound/synthetic-warp', role: 'warp-sound' },
  ].map(spec => ({ ...spec, schemaVersion: SOUND_PAYLOAD_SCHEMA_VERSION })),
};

/** The pure program has no TextEncoder; synthetic labels are ASCII. */
const asciiBytes = (text: string): Uint8Array => Uint8Array.from(text, character => character.charCodeAt(0));

export const kindOf = (id: string): string => id.split('/')[0];
export const syntheticBytes = (id: string): Uint8Array => asciiBytes(`payload:${id}`);
export const payloadIdentityOf = (bytes: Uint8Array) =>
  ({ schemaVersion: 1, byteLength: bytes.length, fingerprint: sha256Fingerprint(bytes) as string });

export const syntheticIdentity = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  sliceId: SLICE_ID,
  sliceDefinitionVersion: CLASSIC_P2_SLICE.version,
  converterVersion: 'synthetic-converter.1',
  // Opaque fixture token; it names the slice definition version so a version change also changes it.
  manifestIdentity: `manifest:synthetic-definition-${CLASSIC_P2_SLICE.version}`,
  origin: { type: 'synthetic', fixtureId: 'p2-01-contracts' },
  ...overrides,
});

/** One group's raw validation input: manifest, payload records with the declared bytes and no source states. */
export function syntheticGroup(group: ResourceGroup, specs = SYNTHETIC_ASSETS[group], identityOverrides: Record<string, unknown> = {}) {
  const assets = specs.map(spec => ({ ...spec, bytes: spec.bytes ?? syntheticBytes(spec.id) }));
  return {
    manifest: {
      identity: syntheticIdentity(identityOverrides),
      group,
      assets: assets.map(({ id, role, dependencies = [], bytes, schemaVersion = 1 }) => ({
        id, kind: kindOf(id), role, group,
        dependencies: dependencies.map(dependency => ({ id: dependency, kind: kindOf(dependency) })),
        payloadIdentity: { ...payloadIdentityOf(bytes), schemaVersion },
      })),
    },
    payloads: assets.map(({ id, bytes, schemaVersion = 1 }) => ({ id, schemaVersion, bytes })),
    sources: null as null | { sourceFingerprint: string | null; states: { id: string; state: string; unknowns: string[] }[] },
  };
}

/** The group as an original import of `sourceFingerprint` whose every Asset has a verified source state for it. */
export function syntheticSourceGroup(group: ResourceGroup, sourceFingerprint: string) {
  const input = syntheticGroup(group, SYNTHETIC_ASSETS[group], { origin: { type: 'original-import', sourceFingerprint } });
  input.sources = { sourceFingerprint, states: SYNTHETIC_ASSETS[group].map(({ id }) => ({ id, state: 'verified', unknowns: [] as string[] })) };
  return input;
}

/** The group as an original import whose every Asset has a verified source state for the manifest's fingerprint. */
export function syntheticOriginalGroup(group: ResourceGroup) {
  return syntheticSourceGroup(group, 'source:synthetic-disc');
}

/** All four groups in definition order. */
export const syntheticPackage = () => CLASSIC_P2_SLICE.groups.map(group => syntheticGroup(group));

/** `code@path` of each diagnostic: the stable classification tests assert on, never the reason text. */
export const diagnosticCodes = (result: GroupCompletenessResult | PackageCompletenessResult): string[] =>
  ('diagnostics' in result ? result.diagnostics : []).map(({ code, path }) => `${code}@${path}`);

/** The roles slice definition version 4 added (P3-03 spec, 切片定义版本 4), in definition order. */
export const VERSION_4_ROLES: readonly SliceRole[] = Object.freeze([
  'craft-info', 'debris-parameters', 'ai-programs', 'comm-menus', 'base-repair-items', 'flight-messages', 'scene-settings', 'explosion-table',
  'nebula-backgrounds', 'hit-shimmer', 'target-display', 'view-labels', 'event-sound', 'hud-sound',
]);

/**
 * `CLASSIC_P2_SLICE` with only the roles version 3 required, for tests of a step whose group lacks the Assets P3-03
 * steps add to it.
 */
export const P2_ROLES_SLICE: SliceDefinition = Object.freeze({
  ...CLASSIC_P2_SLICE, roles: Object.freeze(CLASSIC_P2_SLICE.roles.filter(({ role }) => !VERSION_4_ROLES.includes(role))),
});
