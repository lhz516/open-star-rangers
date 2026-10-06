import { describe, expect, it } from 'vitest';
import { readContentIdentityBasis } from '../../content/content-identity.ts';
import { syntheticIdentity } from '../../content/synthetic-content.test-support.ts';
import { PRODUCTION_CONVERTER_VERSION } from './converter-version.ts';

describe('production converter version', () => {
  it('is accepted as the converter version of a content identity basis', () => {
    const basis: Record<string, unknown> = syntheticIdentity({ converterVersion: PRODUCTION_CONVERTER_VERSION });
    delete basis.manifestIdentity;
    expect(readContentIdentityBasis(basis).converterVersion).toBe(PRODUCTION_CONVERTER_VERSION);
  });
});
