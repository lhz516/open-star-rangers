import { describe, expect, it } from 'vitest';
import { decodeCanonicalJson, encodeCanonicalJson, requireCanonicalJsonBytes, type CanonicalJsonFormat } from './canonical-json.ts';
import { fail, readArray, readRecord, requireFields } from './contract-validation.ts';
import { asciiBytes as ascii, asciiText as asText } from './graphics/graphics-format.ts';
import { expectContractError } from './graphics/graphics.test-support.ts';
import { payloadTransferList } from './ownership.ts';

// Code-generated samples only; the reader below stands in for a payload family's strict reader.

const MARKER = 'PRIVATE-MARKER-json-7a3e';
const FORMAT: CanonicalJsonFormat = Object.freeze({ name: 'sample payload', byteLimit: 4096, invalid: 'invalid-flight-data-payload' });

interface Sample {
  readonly name: string;
  readonly values: readonly number[];
  readonly flag: boolean;
  readonly note: string | null;
}

const text = (value: unknown, path: string): string => (typeof value === 'string' ? value : fail(FORMAT.invalid, path, 'must be a string'));
const finite = (value: unknown, path: string): number =>
  (typeof value === 'number' && Number.isFinite(value) ? value : fail(FORMAT.invalid, path, 'must be a finite number'));

/** A strict reader in the style of the content readers: a frozen result built in contract field order. */
function readSample(value: unknown, path = 'sample'): Sample {
  const record = readRecord(value, path);
  requireFields(record, path, ['name', 'values', 'flag', 'note']);
  if (typeof record.flag !== 'boolean') fail(FORMAT.invalid, `${path}.flag`, 'must be a boolean');
  return Object.freeze({
    name: text(record.name, `${path}.name`),
    values: readArray(record.values, `${path}.values`, FORMAT.invalid, finite),
    flag: record.flag,
    note: record.note === null ? null : text(record.note, `${path}.note`),
  });
}

const sample = (change: Partial<Sample> = {}) => ({ name: `${MARKER} a`, values: [0, 1.5, -2], flag: true, note: null, ...change });
const encode = (value: unknown, format = FORMAT) => encodeCanonicalJson(readSample(value), format);
const decode = (bytes: Uint8Array, format = FORMAT) => decodeCanonicalJson(bytes, format, value => readSample(value));
const limitOf = (byteLimit: number): CanonicalJsonFormat => ({ ...FORMAT, byteLimit });

describe('canonical JSON encoding', () => {
  it('writes the reader field order without whitespace, numbers in their shortest form and -0 as 0', () => {
    const input = { note: null, flag: true, values: [-0, 1.5, 1e21, 5e-7, -1.5e-300], name: `${MARKER} "q" \\ a` };
    expect(asText(encode(input))).toBe(
      `{"name":"${MARKER} \\"q\\" \\\\ a","values":[0,1.5,1e+21,5e-7,-1.5e-300],"flag":true,"note":null}`);
  });

  it('escapes every code unit outside printable ASCII so the bytes stay printable ASCII', () => {
    const name = String.fromCharCode(...Array.from({ length: 255 }, (_, index) => index + 1));
    const bytes = encode(sample({ name }));
    expect(bytes.every(byte => byte >= 0x20 && byte <= 0x7e)).toBe(true);
    const json = asText(bytes);
    for (const escape of ['\\u0001', '\\n', '\\t', '\\u001f', ' !', '\\"', '\\\\', '}~\\u007f', '\\u0080', '\\u00e9', '\\u00ff"']) {
      expect(json).toContain(escape);
    }
    expect(decode(bytes).name).toBe(name);
    const surrogates = asText(encodeCanonicalJson('\u{1f600}\ud800', FORMAT));
    expect(surrogates).toBe('"\\ud83d\\ude00\\ud800"');
    expect(JSON.parse(surrogates)).toBe('\u{1f600}\ud800');
  });

  it('round-trips f32 values bit for bit, denormals included', () => {
    const values = [Math.fround(0.1), 2 ** -149, 2 ** -126 - 2 ** -149, 2 ** -126, Math.fround(3.4028234663852886e38),
      -(2 ** -149), Math.fround(-1 / 3), Math.fround(16_777_217)];
    const decoded = decode(encode(sample({ values })));
    expect(decoded.values).toEqual(values);
    const bits = (numbers: readonly number[]) => [...new Uint32Array(Float32Array.from(numbers).buffer)];
    expect(bits(decoded.values)).toEqual(bits(values));
    expect(bits(decoded.values).slice(1, 3)).toEqual([0x0000_0001, 0x007f_ffff]);
  });

  it('reserves the exact byte length once, before allocating a buffer of its own', () => {
    const reserved: number[] = [];
    const bytes = encodeCanonicalJson(readSample(sample()), FORMAT, byteLength => reserved.push(byteLength));
    expect(reserved).toEqual([bytes.length]);
    expect(bytes.byteOffset).toBe(0);
    expect(bytes.buffer.byteLength).toBe(bytes.length);
  });

  it('passes an encoding of exactly the byte limit and rejects one byte more after reserving it', () => {
    const length = encode(sample()).length;
    expect(encode(sample(), limitOf(length))).toHaveLength(length);
    const reserved: number[] = [];
    expect(() => encodeCanonicalJson(readSample(sample()), limitOf(length - 1), byteLength => reserved.push(byteLength)))
      .toThrowError(expect.objectContaining({ code: FORMAT.invalid, path: 'payload', reason: 'must not exceed the sample payload byte limit' }));
    expect(reserved).toEqual([length]);
  });

  it('stops when the reservation fails', () => {
    const refuse = () => { throw new RangeError('over budget'); };
    expect(() => encodeCanonicalJson(readSample(sample()), FORMAT, refuse)).toThrowError(RangeError);
  });
});

describe('canonical JSON decoding', () => {
  it('returns the read result, isolated from the bytes', () => {
    const bytes = encode(sample());
    const decoded = decode(bytes);
    bytes.fill(0x20);
    expect(decoded).toEqual(sample());
    expect(Object.isFrozen(decoded)).toBe(true);
  });

  it('compares the canonical text of the projected result', () => {
    const bytes = encode(sample());
    const wrap = (value: unknown) => Object.freeze({ role: 'sample', content: readSample(value) });
    expect(decodeCanonicalJson(bytes, FORMAT, wrap, result => result.content).content).toEqual(sample());
    expectContractError(() => decodeCanonicalJson(bytes, FORMAT, wrap), 'non-canonical-payload', 'payload', [MARKER]);
  });

  it.each([
    ['whitespace between tokens', (json: string) => json.replace('"flag":true', '"flag": true'), 'non-canonical-payload', 'payload'],
    ['another field order', (json: string) => json.replace('"flag":true,"note":null', '"note":null,"flag":true'), 'non-canonical-payload', 'payload'],
    ['-0', (json: string) => json.replace('[0,', '[-0,'), 'non-canonical-payload', 'payload'],
    ['a longer number spelling', (json: string) => json.replace('1.5', '15e-1'), 'non-canonical-payload', 'payload'],
    ['an escaped printable character', (json: string) => json.replace(' a"', ' \\u0061"'), 'non-canonical-payload', 'payload'],
    ['a repeated key', (json: string) => json.replace('{"name"', '{"flag":false,"name"'), 'non-canonical-payload', 'payload'],
    ['a trailing newline', (json: string) => `${json}\n`, FORMAT.invalid, 'payload'],
    ['text that is not JSON', (json: string) => json.slice(0, -1), FORMAT.invalid, 'payload'],
    ['a value its reader rejects', (json: string) => json.replace('"flag":true', '"flag":1'), FORMAT.invalid, 'sample.flag'],
    ['an unknown field', (json: string) => json.replace('"note":null', '"note":null,"extra":1'), 'invalid-record', 'sample'],
  ])('rejects %s', (_, edit, code, path) => {
    expectContractError(() => decode(ascii(edit(asText(encode(sample()))))), code, path, [MARKER]);
  });

  it.each([
    ['a newline escaped in long form', '\n', '\\n', '\\u000a'],
    ['an upper-case hexadecimal escape', '\u00e9', '\\u00e9', '\\u00E9'],
  ])('rejects %s', (_, character, canonical, other) => {
    const json = asText(encode(sample({ name: `${MARKER}${character}` })));
    expect(json).toContain(canonical);
    expectContractError(() => decode(ascii(json.replace(canonical, other))), 'non-canonical-payload', 'payload', [MARKER]);
  });

  it('rejects bytes outside printable ASCII before parsing', () => {
    const bytes = encode(sample());
    for (const byte of [0x00, 0x0a, 0x7f, 0x80, 0xe9, 0xff]) {
      const changed = new Uint8Array(bytes);
      changed[asText(bytes).indexOf(MARKER)] = byte;
      expectContractError(() => decode(changed), FORMAT.invalid, 'payload', [MARKER]);
    }
  });

  it('checks the byte limit before reading any byte, and accepts exactly the limit', () => {
    const bytes = encode(sample());
    let reads = 0;
    const counted = (value: unknown) => { reads++; return readSample(value); };
    expect(() => decodeCanonicalJson(new Uint8Array(bytes.length).fill(0xff), limitOf(bytes.length - 1), counted))
      .toThrowError(expect.objectContaining({ code: FORMAT.invalid, path: 'payload', reason: 'must not exceed the sample payload byte limit' }));
    expect(reads).toBe(0);
    expect(decodeCanonicalJson(bytes, limitOf(bytes.length), counted)).toEqual(sample());
    expect(reads).toBe(1);
  });

  it('checks the bytes themselves before a caller reads its descriptor', () => {
    const bytes = encode(sample());
    expect(() => requireCanonicalJsonBytes(bytes, limitOf(bytes.length))).not.toThrow();
    expectContractError(() => requireCanonicalJsonBytes([1, 2], FORMAT), FORMAT.invalid, 'payload');
    expectContractError(() => requireCanonicalJsonBytes(bytes, limitOf(bytes.length - 1)), FORMAT.invalid, 'payload');
    structuredClone(bytes, { transfer: [...payloadTransferList([bytes])] });
    expectContractError(() => requireCanonicalJsonBytes(bytes, FORMAT), 'payload-detached', 'payload');
    expectContractError(() => decode(bytes), 'payload-detached', 'payload');
  });
});
