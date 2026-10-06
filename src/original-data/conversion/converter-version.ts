import { readConverterVersion } from '../../content/content-identity.ts';
import { AUDIO_CONVERTER_COMPONENT } from './audio-conversion.ts';

/**
 * The only production `ConverterVersion` (shared mechanism of P2-05, P2-08 and P2-09): `osr-import.` followed by each
 * production converter's `<converter>-<n>` component in a fixed order. Any change to a converter's output for the same
 * source increments its component, which changes this value and therefore every cache key.
 */
export const PRODUCTION_CONVERTER_VERSION = readConverterVersion(['osr-import', AUDIO_CONVERTER_COMPONENT].join('.'), 'PRODUCTION_CONVERTER_VERSION');
