import { readBudgetRecord, type BudgetRecord } from '../content/budget.ts';
import { readConverterVersion, readSourceFingerprint, type ConverterVersion, type SourceFingerprint } from '../content/content-identity.ts';

/**
 * The package the app expects to hold and restore: cached entries are offered only when their converter version and
 * source fingerprint equal these, and commits and restores charge `limits` (P2-11 spec, 包预算与生产身份). The
 * production entry passes `PRODUCTION_PACKAGE`; only the development test entry passes one matching its synthetic catalog.
 */
export interface ExpectedPackageProfile {
  readonly converterVersion: ConverterVersion;
  readonly sourceFingerprint: SourceFingerprint;
  /** The package budget: the sum of every conversion's approved share and the audio limits. */
  readonly limits: BudgetRecord;
}

/**
 * The production package profile as constants, so the main thread never loads the converters or the production tables
 * to obtain them. `production-package.test.ts` derives each value from `original-data` and fails when a converter
 * component, the production catalog or an approved share changes; update the constants with it.
 */
export const PRODUCTION_PACKAGE: ExpectedPackageProfile = Object.freeze({
  converterVersion: readConverterVersion('osr-import.graphics-5.logic-3.audio-2.models-4', 'PRODUCTION_PACKAGE.converterVersion'),
  sourceFingerprint: readSourceFingerprint(
    'source:sha256:67391efbb13ceda3e264f18ae0905d1ba39909ef36b002491ffa33076a35ddeb',
    'PRODUCTION_PACKAGE.sourceFingerprint',
  ),
  limits: readBudgetRecord({
    assets: 813,
    dependencyEdges: 1408,
    sourceReadBytes: 0,
    payloadBytes: 16_568_576,
    vertices: 8192,
    triangles: 8192,
    imagePixels: 5_373_952,
    paletteEntries: 3072,
    glyphs: 768,
    audioSamples: 4_194_304,
    missionObjects: 256,
    missionReferences: 4096,
  }, 'PRODUCTION_PACKAGE.limits'),
});
