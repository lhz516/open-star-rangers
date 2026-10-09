import { describe, expect, it } from 'vitest';
import { SourceError, type SourceLimitName } from './source-error.ts';
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

describe('P3-03 structure limits', () => {
  // The generic names cover the {pointer, count} arrays, entry sizes and texts; the others are P3-03's own names.
  it.each([
    ['payloadItems', 'archive:/MAIN/SR.NOB#3019/sections[2]/triggers[1]/ranges[0]/messages'],
    ['textBytes', 'archive:/MAIN/SR.NOB#3019/triggers[1]/ranges[0]/messages[5]'],
    ['payloadEntryBytes', 'archive:/MAIN/CRAFT.NOB#4037'],
    ['payloadItems', 'archive:/MAIN/CRAFT.NOB#4037/craft[19]/mounts'],
    ['aiProgramRecords', 'archive:/MAIN/AISTUFF.NOB#6003/records'],
    ['aiScriptItems', 'archive:/MAIN/AISTUFF.NOB#6011/items'],
    ['aiEntries', 'archive:/MAIN/AISTUFF.NOB#6003/entries'],
    ['commMenuItems', 'archive:/MAIN/COMM.NOB#2013/items'],
    ['payloadItems', 'archive:/MAIN/SR.NOB#10183/frames'],
    ['animFrameBytes', 'archive:/MAIN/SR.NOB#10183/frames[11]'],
  ] as const satisfies readonly (readonly [SourceLimitName, string])[])('reports %s at %s as frozen, cloneable data', (name, location) => {
    const reason = 'the structure exceeds its payload limit';
    const data = new SourceError('limit-exceeded', location, reason, { name, limit: 64, observed: 65 }).toData();
    expect(inLocationGrammar(data)).toBe(true);
    expect(Object.isFrozen(data) && Object.isFrozen(data.limit)).toBe(true);
    expect(structuredClone(data)).toEqual({ code: 'limit-exceeded', location, reason, limit: { name, limit: 64, observed: 65 } });
  });
});
