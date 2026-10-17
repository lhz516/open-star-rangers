import { describe, expect, it } from 'vitest';
import { readContentIdentityBasis, readSourceFingerprint } from '../../content/content-identity.ts';
import { syntheticIdentity } from '../../content/synthetic-content.test-support.ts';
import { AUDIO_CONVERTER_COMPONENT } from './audio-conversion.ts';
import { GRAPHICS_CONVERTER_COMPONENT } from './convert-graphics.ts';
import { LOGIC_CONVERTER_COMPONENT } from './convert-logic.ts';
import { MODEL_CONVERTER_COMPONENT } from './convert-models.ts';
import { PRODUCTION_CONVERTER_VERSION, productionIdentityBasis } from './converter-version.ts';

describe('production converter version', () => {
  it('is osr-import followed by the packaged converters\' components in stage order', () => {
    // P3-09 incremented graphics (map geometry) and P3-10 logic (comm-messages): distinct components, both kept; P3-08
    // incremented logic again for the keyword tables (P3-03 revision 3).
    expect(PRODUCTION_CONVERTER_VERSION).toBe('osr-import.graphics-5.logic-4.audio-2.models-4');
    expect(PRODUCTION_CONVERTER_VERSION.split('.').slice(1))
      .toEqual([GRAPHICS_CONVERTER_COMPONENT, LOGIC_CONVERTER_COMPONENT, AUDIO_CONVERTER_COMPONENT, MODEL_CONVERTER_COMPONENT]);
  });

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
    // P3-03 切片定义版本 5 on each branch (P3-09's map geometry revision, P3-10's revision 2), merged as version 6:
    // production and synthetic identities carry slice definition version 6.
    expect([productionIdentityBasis(sourceFingerprint).sliceDefinitionVersion, syntheticIdentity().sliceDefinitionVersion]).toEqual([6, 6]);
  });
});
