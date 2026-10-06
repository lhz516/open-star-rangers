import {
  CONTENT_SCHEMA_VERSION, SLICE_ID, readContentIdentityBasis, readConverterVersion, type ContentIdentityBasis, type ConverterVersion,
  type SourceFingerprint,
} from '../../content/content-identity.ts';
import { SLICE_DEFINITION_VERSION } from '../../content/slice-definition.ts';

/**
 * The only production converter version, shared by every production converter. Increment it whenever any converter's
 * output can change, including a payload schema or canonical encoding: it is part of the resource cache key, so old
 * cached packages are then never mistaken for new output (P2-10).
 */
export const PRODUCTION_CONVERTER_VERSION: ConverterVersion = readConverterVersion('osr-converter.1', 'PRODUCTION_CONVERTER_VERSION');

/** The identity basis of every group the production converters derive from the source with `sourceFingerprint`. */
export const productionIdentityBasis = (sourceFingerprint: SourceFingerprint): ContentIdentityBasis => readContentIdentityBasis({
  schemaVersion: CONTENT_SCHEMA_VERSION,
  sliceId: SLICE_ID,
  sliceDefinitionVersion: SLICE_DEFINITION_VERSION,
  converterVersion: PRODUCTION_CONVERTER_VERSION,
  origin: { type: 'original-import', sourceFingerprint },
});
