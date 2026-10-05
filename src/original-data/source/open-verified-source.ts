import { openDiscImage, type DiscInputFile, type OpenDiscOptions } from '../disc/disc-image.ts';
import { identifySource, type VerifiedSource } from './identify-source.ts';
import { PRODUCTION_CATALOG } from './source-catalog.ts';

export type { DiscInputFile, OpenDiscOptions } from '../disc/disc-image.ts';
export type { SourceIdentity, VerifiedSource } from './identify-source.ts';
export type { CatalogFile } from './source-catalog.ts';

/**
 * The product entry to original data (P2-03): opens a CloneCD file set with P2-02 `openDiscImage` and identifies it
 * against the production whitelist only. It returns a verified source whose covered files and archives are the only
 * original bytes products may convert. Disc failures pass through unchanged; any other version is `unsupported-version`.
 */
export async function openVerifiedSource(files: readonly DiscInputFile[], options?: OpenDiscOptions): Promise<VerifiedSource> {
  return identifySource(await openDiscImage(files, options), PRODUCTION_CATALOG);
}
