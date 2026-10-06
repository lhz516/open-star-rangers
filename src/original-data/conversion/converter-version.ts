import { readConverterVersion, type ConverterVersion } from '../../content/content-identity.ts';

/**
 * The only production converter version, shared by every production converter. Increment it whenever any converter's
 * output can change, including a payload schema or canonical encoding: it is part of the resource cache key, so old
 * cached packages are then never mistaken for new output (P2-10).
 */
export const PRODUCTION_CONVERTER_VERSION: ConverterVersion = readConverterVersion('osr-converter.1', 'PRODUCTION_CONVERTER_VERSION');
