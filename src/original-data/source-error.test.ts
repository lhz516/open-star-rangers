import { describe, expect, it } from 'vitest';
import { inLocationGrammar } from './source-error.test-support.ts';

describe('P2-03 location grammar', () => {
  it.each([
    'archive', 'archive[3]', 'archive#10001', 'archive#10001.relocations[2]', 'archive:/MAIN/SR.NOB', 'archive:/MAIN/SR.NOB[0]',
    'archive:/MAIN/SR.NOB#10001.relocations[0]', 'file:/MAIN/SRANGERS.EXE', 'catalog', 'catalog.versionId', 'catalog.files[2]',
    'catalog.files[0].sha256', 'request.path', 'request.id', 'request.type', 'sources.sourceFingerprint',
    'sources.mappings[1].parts[0].alternatives[2]', 'file:/A/B/C/D/E/F/G/H.NOB',
  ])('accepts %s', location => expect(inLocationGrammar({ location })).toBe(true));

  it.each([
    'request.entry', 'catalog.files', 'catalog.files[0].size', 'archive:/main/sr.nob', 'archive:/MAIN/SR.NOB#x', 'file:/C:/x',
    'sources.mappings[0]', 'dir:/MAIN', 'PRIVATE-MARKER', 'file:/A/B/C/D/E/F/G/H/I', 'archive:/A/B/C/D/E/F/G/H/I#1',
    'file:/A/B/C/D/E/F/G/H/I.NOB',
  ])('rejects %s', location => expect(inLocationGrammar({ location })).toBe(false));
});
