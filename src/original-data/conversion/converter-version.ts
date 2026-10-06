import {
  CONTENT_SCHEMA_VERSION, SLICE_ID, readContentIdentityBasis, readConverterVersion, type ContentIdentityBasis, type ConverterVersion,
  type SourceFingerprint,
} from '../../content/content-identity.ts';
import { SLICE_DEFINITION_VERSION } from '../../content/slice-definition.ts';
import { AUDIO_CONVERTER_COMPONENT } from './audio-conversion.ts';
import { LOGIC_CONVERTER_COMPONENT } from './convert-logic.ts';

/**
 * The only production converter version, shared by every production converter (P2-09 spec S-07, P2-08 spec 包身份):
 * `osr-import.` followed by the `<converter>-<n>` component of each converter whose output a job packages, in stage
 * order. Any change to a converter's output for the same source increments its component, which changes this value; it
 * is part of the resource cache key, so old cached packages are then never mistaken for new output (P2-10).
 */
export const PRODUCTION_CONVERTER_VERSION: ConverterVersion = readConverterVersion(
  ['osr-import', LOGIC_CONVERTER_COMPONENT, AUDIO_CONVERTER_COMPONENT].join('.'),
  'PRODUCTION_CONVERTER_VERSION',
);

/** The identity basis of every group the production converters derive from the source with `sourceFingerprint`. */
export const productionIdentityBasis = (sourceFingerprint: SourceFingerprint): ContentIdentityBasis => readContentIdentityBasis({
  schemaVersion: CONTENT_SCHEMA_VERSION,
  sliceId: SLICE_ID,
  sliceDefinitionVersion: SLICE_DEFINITION_VERSION,
  converterVersion: PRODUCTION_CONVERTER_VERSION,
  origin: { type: 'original-import', sourceFingerprint },
});
