import { describe, expect, it } from 'vitest';
import { addBudgets } from '../content/budget.ts';
import { AUDIO_BUDGET_LIMITS } from '../original-data/conversion/audio-conversion.ts';
import { PRODUCTION_LOGIC_SHARE } from '../original-data/conversion/convert-logic.ts';
import { PRODUCTION_CONVERTER_VERSION } from '../original-data/conversion/converter-version.ts';
import { PRODUCTION_GRAPHICS_SHARE } from '../original-data/conversion/production-graphics.ts';
import { PRODUCTION_MODEL_SHARE } from '../original-data/conversion/production-models.ts';
import { PRODUCTION_CATALOG, sourceFingerprint } from '../original-data/source/source-catalog.ts';
import { PRODUCTION_PACKAGE } from './production-package.ts';

// A failure here means a converter component, the production catalog or an approved share changed: update the
// constants in production-package.ts to the derived value (P2-11 spec, 包预算与生产身份).
describe('production package profile', () => {
  it('names the production converter version', () => {
    expect(PRODUCTION_PACKAGE.converterVersion).toBe(PRODUCTION_CONVERTER_VERSION);
  });

  it('names the production source fingerprint', () => {
    expect(PRODUCTION_PACKAGE.sourceFingerprint).toBe(sourceFingerprint(PRODUCTION_CATALOG));
  });

  it('budgets the package as the sum of the approved graphics, logic and model shares and the audio limits', () => {
    const shares = [PRODUCTION_GRAPHICS_SHARE, PRODUCTION_LOGIC_SHARE, PRODUCTION_MODEL_SHARE, AUDIO_BUDGET_LIMITS];
    expect(PRODUCTION_PACKAGE.limits).toEqual(shares.reduce((total, share) => addBudgets(total, share)));
  });

  it('is frozen', () => {
    expect(Object.isFrozen(PRODUCTION_PACKAGE)).toBe(true);
    expect(Object.isFrozen(PRODUCTION_PACKAGE.limits)).toBe(true);
  });
});
