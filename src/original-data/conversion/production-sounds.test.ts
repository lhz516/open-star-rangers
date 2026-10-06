import { describe, expect, it } from 'vitest';
import { expectSourceError } from './conversion.test-support.ts';
import { convertSnd } from '../formats/snd.ts';
import { syntheticSnd } from '../synthetic.ts';
import { PRODUCTION_SND_RULES, PRODUCTION_SOUND_TABLE } from './production-sounds.ts';

const AT = 'sources.mappings[0].parts[0].alternatives[0]';
const block = (bitsPerSample: number, flags: number) => {
  const { data, relocations } = syntheticSnd({ samples: [1, 2, 3, 4], bitsPerSample, flags });
  return { bytes: data, relocations };
};

describe('production sounds before research', () => {
  it('maps no sound Asset, so the production audio group has none', () => {
    expect(PRODUCTION_SOUND_TABLE).toEqual([]);
    expect(Object.isFrozen(PRODUCTION_SOUND_TABLE)).toBe(true);
  });

  it.each([0, 1, 2])('rejects the flags value %i rather than guessing its meaning', flags => {
    expectSourceError(() => convertSnd(block(8, flags), PRODUCTION_SND_RULES, AT), 'unsupported-payload', `${AT}.flags`);
  });

  it('rejects 16-bit samples until their interpretation is confirmed', () => {
    expect(PRODUCTION_SND_RULES).toEqual({ flags: [], s16le: false });
    expect(Object.isFrozen(PRODUCTION_SND_RULES) && Object.isFrozen(PRODUCTION_SND_RULES.flags)).toBe(true);
    expectSourceError(() => convertSnd(block(16, 0), PRODUCTION_SND_RULES, AT), 'unsupported-payload', `${AT}.bitsPerSample`);
  });
});
