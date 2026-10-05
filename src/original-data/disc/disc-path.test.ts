import { describe, expect, it } from 'vitest';
import { isDiscPath, isDosName } from './disc-path.ts';

describe('disc paths', () => {
  it.each(['SR.NOB', 'MAIN/SR.NOB', 'A_-9', 'ABCDEFGH.XYZ', 'A/B/C/D/E/F/G/H', 'README'])('accepts %s', path => {
    expect(isDiscPath(path)).toBe(true);
  });

  it.each([
    ['lower case', 'main/sr.nob'],
    ['nine segments', 'A/B/C/D/E/F/G/H/I'],
    ['a parent segment', 'MAIN/../SR.NOB'],
    ['a current segment', './SR.NOB'],
    ['an empty segment', 'MAIN//SR.NOB'],
    ['an absolute path', '/MAIN/SR.NOB'],
    ['a trailing separator', 'MAIN/'],
    ['a backslash', 'MAIN\\SR.NOB'],
    ['a version suffix', 'SR.NOB;1'],
    ['a long name', 'ABCDEFGHI.NOB'],
    ['a long extension', 'SR.NOBX'],
    ['two dots', 'A.B.C'],
    ['a trailing dot', 'SR.'],
    ['a trailing newline', 'SR.NOB\n'],
    ['an empty path', ''],
  ])('rejects %s', (_case, path) => {
    expect(isDiscPath(path)).toBe(false);
  });

  it('rejects values that are not text', () => {
    expect([undefined, null, 1, ['SR.NOB']].some(isDiscPath)).toBe(false);
  });

  it('checks single 8.3 names', () => {
    expect([isDosName('SR.NOB'), isDosName('SR/NOB'), isDosName('')]).toEqual([true, false, false]);
  });
});
