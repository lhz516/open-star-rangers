import { describe, expect, it } from 'vitest';
import { readContentIdentityBasis, readSourceFingerprint } from '../../content/content-identity.ts';
import { syntheticIdentity } from '../../content/synthetic-content.test-support.ts';
import { PRODUCTION_CONVERTER_VERSION, productionIdentityBasis } from './converter-version.ts';

describe('production converter version', () => {
  it('is accepted as the converter version of a content identity basis', () => {
    const basis: Record<string, unknown> = syntheticIdentity({ converterVersion: PRODUCTION_CONVERTER_VERSION });
    delete basis.manifestIdentity;
    expect(readContentIdentityBasis(basis).converterVersion).toBe(PRODUCTION_CONVERTER_VERSION);
  });

  it('forms the original-import identity basis of a source from the P2-01 constants', () => {
    const sourceFingerprint = readSourceFingerprint(`source:sha256:${'ab'.repeat(32)}`);
    const synthetic: Record<string, unknown> = syntheticIdentity();
    delete synthetic.manifestIdentity;
    expect(productionIdentityBasis(sourceFingerprint)).toEqual({
      ...synthetic,
      converterVersion: PRODUCTION_CONVERTER_VERSION,
      origin: { type: 'original-import', sourceFingerprint },
    });
    expect(Object.isFrozen(productionIdentityBasis(sourceFingerprint))).toBe(true);
  });
});
