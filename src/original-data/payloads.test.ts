import { describe, expect, it } from 'vitest';
import * as payloads from './payloads.ts';
import { parseIdList } from './payloads.ts';
import { ByteWriter } from './synthetic.test-support.ts';

describe('parseIdList', () => {
  it('reads an ID list', () => {
    expect(parseIdList(new ByteWriter().u32(8, 3, 10743, 10743, 0).toBytes())).toEqual([10743, 10743, 0]);
  });
});

describe('research payload parsers', () => {
  it('keep only the ID list parser now that meshes and models have hardened readers', () => {
    expect(Object.keys(payloads).sort()).toEqual(['PayloadError', 'parseIdList']);
  });
});
