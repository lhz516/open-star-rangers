import { describe, expect, it } from 'vitest';
import { addBudgets, BUDGET_DIMENSIONS, EMPTY_BUDGET_USAGE, type BudgetRecord } from '../content/budget.ts';
import { AUDIO_BUDGET_LIMITS } from '../original-data/conversion/audio-conversion.ts';
import { PRODUCTION_LOGIC_SHARE } from '../original-data/conversion/convert-logic.ts';
import { PRODUCTION_CONVERTER_VERSION } from '../original-data/conversion/converter-version.ts';
import { PRODUCTION_FLIGHT_DATA_SHARE } from '../original-data/conversion/production-flight-data.ts';
import { PRODUCTION_FLIGHT_GRAPHICS_SHARE } from '../original-data/conversion/production-flight-graphics.ts';
import { PRODUCTION_GRAPHICS_SHARE } from '../original-data/conversion/production-graphics.ts';
import { PRODUCTION_HUD_TEXT_SHARE } from '../original-data/conversion/production-hud-text.ts';
import { PRODUCTION_MODEL_SHARE } from '../original-data/conversion/production-models.ts';
import { PRODUCTION_RULE_DATA_SHARE } from '../original-data/conversion/production-rule-data.ts';
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

  it('budgets the package as the sum of every approved share and the audio limits', () => {
    // The graphics share includes the P3-03 flight graphics and HUD text shares; the rule-data and flight data shares join
    // the logic and model stages.
    const shares = [PRODUCTION_GRAPHICS_SHARE, PRODUCTION_LOGIC_SHARE, PRODUCTION_RULE_DATA_SHARE, PRODUCTION_MODEL_SHARE, PRODUCTION_FLIGHT_DATA_SHARE, AUDIO_BUDGET_LIMITS];
    expect(PRODUCTION_PACKAGE.limits).toEqual(shares.reduce((total, share) => addBudgets(total, share)));
  });

  // P3-03 spec 限值与预算: each P3-03 share is twice the baseline usage of its Assets, rounded up to a power of two, per
  // dimension. The observations are the counts the local derivation (local/research/p3-03/shares/) recorded on the
  // baseline image with unlimited limits (P3-03/19 and P3-03/26 completion evidence); the usage of the flight graphics,
  // and of the HUD text, is the graphics step's usage with them less its usage without them. The rule-data usage
  // includes `data/comm-messages` (P3-10/29 completion evidence, local/research/p3-10/comm-messages/).
  const BASELINE_USAGE = {
    flightGraphics: { assets: 205, dependencyEdges: 204, paletteEntries: 256, imagePixels: 1_870_336, payloadBytes: 2_078_499 },
    hudText: { assets: 1, payloadBytes: 2_018 },
    ruleData: { assets: 7, payloadBytes: 98_237 },
    flightData: { assets: 20, dependencyEdges: 222, payloadBytes: 11_895 },
  };
  const derived = (observed: Partial<BudgetRecord>): BudgetRecord => Object.fromEntries(BUDGET_DIMENSIONS.map(dimension => {
    const value = observed[dimension] ?? 0;
    return [dimension, value === 0 ? 0 : 2 ** Math.ceil(Math.log2(2 * value))];
  })) as unknown as BudgetRecord;

  it.each([
    ['flight graphics', PRODUCTION_FLIGHT_GRAPHICS_SHARE, BASELINE_USAGE.flightGraphics],
    ['HUD text', PRODUCTION_HUD_TEXT_SHARE, BASELINE_USAGE.hudText],
    ['rule-data', PRODUCTION_RULE_DATA_SHARE, BASELINE_USAGE.ruleData],
    ['flight data', PRODUCTION_FLIGHT_DATA_SHARE, BASELINE_USAGE.flightData],
  ])('derives the %s share from the baseline usage by the spec rule', (_name, share, observed) => {
    expect(share).toEqual(derived(observed));
  });

  it('keeps the logic share and the audio limits, which the baseline P3-03 usage stays within', () => {
    // The mission with its event triggers (P3-03/07), and the 29 sounds; P3-03/27 remeasured them with SND 10181 as
    // `repeat`, whose play count changes no size.
    const logic = { assets: 3, dependencyEdges: 8, payloadBytes: 7_593, missionObjects: 14, missionReferences: 41 };
    const audio = { assets: 29, payloadBytes: 470_861, audioSamples: 304_035 };
    for (const [limits, observed] of [[PRODUCTION_LOGIC_SHARE, logic], [AUDIO_BUDGET_LIMITS, audio]] as const) {
      for (const [dimension, value] of Object.entries(observed)) expect(value, dimension).toBeLessThanOrEqual(limits[dimension as keyof BudgetRecord]);
    }
    expect(PRODUCTION_LOGIC_SHARE).toEqual({ ...EMPTY_BUDGET_USAGE, assets: 8, dependencyEdges: 32, payloadBytes: 1_048_576, missionObjects: 256, missionReferences: 4_096 });
  });

  it('is frozen', () => {
    expect(Object.isFrozen(PRODUCTION_PACKAGE)).toBe(true);
    expect(Object.isFrozen(PRODUCTION_PACKAGE.limits)).toBe(true);
  });
});
