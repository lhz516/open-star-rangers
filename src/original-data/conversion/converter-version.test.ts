import { describe, expect, it } from 'vitest';
import { readContentIdentity } from '../../content/content-identity.ts';
import { syntheticIdentity } from '../../content/synthetic-content.test-support.ts';
import { AUDIO_CONVERTER_COMPONENT } from './audio-conversion.ts';
import { PRODUCTION_CONVERTER_VERSION } from './converter-version.ts';

describe('production converter version', () => {
  it('is osr-import followed by the audio component and passes the content identity reader', () => {
    expect(PRODUCTION_CONVERTER_VERSION).toBe('osr-import.audio-1');
    expect(PRODUCTION_CONVERTER_VERSION.split('.').slice(1)).toEqual([AUDIO_CONVERTER_COMPONENT]);
    expect(readContentIdentity(syntheticIdentity({ converterVersion: PRODUCTION_CONVERTER_VERSION })).converterVersion).toBe('osr-import.audio-1');
  });
});
