import type { ResourceGroup } from './asset-contract.ts';
import type { GroupCompletenessResult, PackageCompletenessResult } from './completeness.ts';
import { SLICE_ID } from './content-identity.ts';
import { sha256Fingerprint } from './sha256.ts';
import { CLASSIC_P2_SLICE } from './slice-definition.ts';

// Code-generated synthetic content for contract tests; it never holds original data. The package covers every
// CLASSIC_P2_SLICE role, and builders return fresh mutable plain data that a test may corrupt.

export interface SyntheticAssetSpec {
  readonly id: string;
  readonly role: string;
  readonly dependencies?: readonly string[];
  /** Payload bytes; defaults to an ASCII label of the ID. */
  readonly bytes?: Uint8Array;
}

export const SYNTHETIC_ASSETS: Readonly<Record<ResourceGroup, readonly SyntheticAssetSpec[]>> = {
  logic: [{ id: 'mission/synthetic-first', role: 'mission', dependencies: ['model/synthetic-base', 'model/synthetic-enemy-a', 'model/synthetic-enemy-b', 'model/synthetic-player'] }],
  models: [
    { id: 'image/synthetic-debris', role: 'debris' },
    { id: 'image/synthetic-hull', role: 'model-texture' },
    { id: 'model/synthetic-base', role: 'base', dependencies: ['image/synthetic-hull'] },
    { id: 'model/synthetic-enemy-a', role: 'enemy-ship', dependencies: ['image/synthetic-hull'] },
    { id: 'model/synthetic-enemy-b', role: 'enemy-ship' },
    { id: 'model/synthetic-missile', role: 'missile' },
    { id: 'model/synthetic-player', role: 'player-ship', dependencies: ['image/synthetic-hull', 'sound/synthetic-engine'] },
    { id: 'model/synthetic-projectile', role: 'projectile' },
  ],
  'cockpit-hud-map': [
    { id: 'font/synthetic-hud', role: 'font' },
    { id: 'image/synthetic-mfd', role: 'hud-mfd' },
    { id: 'image/synthetic-panel', role: 'cockpit-image' },
    { id: 'layout/synthetic-front', role: 'front-cockpit', dependencies: ['font/synthetic-hud', 'image/synthetic-panel'] },
    { id: 'layout/synthetic-map', role: 'strategic-map', dependencies: ['font/synthetic-hud'] },
  ],
  audio: [
    { id: 'sound/synthetic-engine', role: 'model-sound' },
    { id: 'sound/synthetic-explosion', role: 'explosion-sound' },
    { id: 'sound/synthetic-fire', role: 'fire-sound' },
    { id: 'sound/synthetic-missile', role: 'missile-sound' },
    { id: 'sound/synthetic-warp', role: 'warp-sound' },
  ],
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
      assets: assets.map(({ id, role, dependencies = [], bytes }) => ({
        id, kind: kindOf(id), role, group,
        dependencies: dependencies.map(dependency => ({ id: dependency, kind: kindOf(dependency) })),
        payloadIdentity: payloadIdentityOf(bytes),
      })),
    },
    payloads: assets.map(({ id, bytes }) => ({ id, schemaVersion: 1, bytes })),
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
