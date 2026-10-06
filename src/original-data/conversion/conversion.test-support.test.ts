import { describe, expect, it } from 'vitest';
import { namesPrivateDetail } from './conversion.test-support.ts';

describe('diagnostic reason privacy', () => {
  it.each([
    'a model must map to one whole MODL entry of MAIN/SR.NOB', 'read from SRANGERS.BIN', 'see model.dat', 'under C:\\games',
    'the value at 0x1c', 'entry 10751 is missing', 'entry ID 10751 is missing', 'entry #10751', 'at offset 1234', 'byte 255 is reserved',
  ])('rejects %j', reason => expect(namesPrivateDetail(reason)).toBe(true));
  it.each([
    'a model must map to one whole MODL entry of the model archive', 'the RENS records do not fill the entry after the header',
    'the model length must be 44 + 28 bytes per part', 'must hold 1 to 4096 triangles of 3 indices', 'a packed colour exceeds 24 bits',
    'must be 1 to 65535',
  ])('accepts %j', reason => expect(namesPrivateDetail(reason)).toBe(false));
});
