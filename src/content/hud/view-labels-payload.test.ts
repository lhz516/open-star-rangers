import { describe, expect, it } from 'vitest';
import { asciiBytes as ascii, asciiText as text } from '../graphics/graphics-format.ts';
import { expectContractError } from '../graphics/graphics.test-support.ts';
import { deepFrozen } from '../logic/logic-content.test-support.ts';
import { payloadTransferList } from '../ownership.ts';
import { syntheticGroup } from '../synthetic-content.test-support.ts';
import {
  VIEW_LABELS_LIMITS, decodeViewLabelsPayload, encodeViewLabelsPayload, readViewLabels, type ViewLabels,
} from './view-labels-payload.ts';

// Code-generated synthetic labels; they never hold original text. MARKER proves texts never reach diagnostics.
const MARKER = 'PRIVATE-MARKER-label-7e2a';
const CODE = 'invalid-flight-data-payload';

type Descriptor = Parameters<typeof decodeViewLabelsPayload>[1];
type MutableDescriptor = { id: string; role: string; kind: string; dependencies: { id: string; kind: string }[]; payloadIdentity: { schemaVersion: number } };

const decode = (bytes: Uint8Array, descriptor: unknown) => decodeViewLabelsPayload(bytes, descriptor as Descriptor);
const labels = (label: string) => ({ labels: [{ subMode: 8 as const, text: label }] as [{ subMode: 8; text: string }] });

/** The canonical bytes and a matching mutable descriptor for synthetic labels. */
function syntheticAsset(content: unknown = labels(`${MARKER} \u00e9\u00ff`)) {
  const bytes = encodeViewLabelsPayload(content as ViewLabels);
  const [descriptor] = syntheticGroup('cockpit-hud-map', [{ id: 'data/hud/view-labels', role: 'view-labels', bytes }]).manifest.assets;
  return { bytes, descriptor };
}

function edited(edit: (json: string) => string) {
  const { bytes, descriptor } = syntheticAsset();
  const changed = edit(text(bytes));
  expect(changed).not.toBe(text(bytes));
  return { bytes: ascii(changed), descriptor };
}

describe('view labels reader', () => {
  it('keeps the label as a deeply frozen copy isolated from its input', () => {
    const input = labels(`${MARKER}\u0001\u007f\u0080\u00ff`);
    const read = readViewLabels(input);
    expect(read).toEqual(input);
    expect(deepFrozen(read)).toBe(true);
    input.labels[0].text = 'changed';
    expect(read.labels[0].text).toBe(`${MARKER}\u0001\u007f\u0080\u00ff`);
  });

  it('accepts an empty text and exactly the text byte limit, and rejects one byte more', () => {
    const limit = VIEW_LABELS_LIMITS.textBytes;
    expect(readViewLabels(labels('')).labels[0].text).toBe('');
    expect(readViewLabels(labels('\u00ff'.repeat(limit))).labels[0].text).toHaveLength(limit);
    expectContractError(() => readViewLabels(labels('x'.repeat(limit + 1))), CODE, 'viewLabels.labels[0].text');
  });

  it.each([
    ['no label', { labels: [] }, 'viewLabels.labels'],
    ['two labels', { labels: [{ subMode: 8, text: 'a' }, { subMode: 8, text: 'b' }] }, 'viewLabels.labels'],
    ['another sub-mode', { labels: [{ subMode: 9, text: 'a' }] }, 'viewLabels.labels[0].subMode'],
    ['a string sub-mode', { labels: [{ subMode: '8', text: 'a' }] }, 'viewLabels.labels[0].subMode'],
    ['a NUL byte', labels('a\u0000b'), 'viewLabels.labels[0].text'],
    ['a code unit above 255', labels('a\u0100'), 'viewLabels.labels[0].text'],
    ['a text that is no string', { labels: [{ subMode: 8, text: [97] }] }, 'viewLabels.labels[0].text'],
    ['a missing text', { labels: [{ subMode: 8 }] }, 'viewLabels.labels[0].text'],
    ['an unknown label field', { labels: [{ subMode: 8, text: 'a', colour: 1 }] }, 'viewLabels.labels[0]'],
    ['an unknown field', { ...labels('a'), items: [] }, 'viewLabels'],
    ['labels that are no array', { labels: { 0: { subMode: 8, text: 'a' } } }, 'viewLabels.labels'],
    ['a null label', { labels: [null] }, 'viewLabels.labels[0]'],
  ])('rejects %s', (_, input, path) => {
    expectContractError(() => readViewLabels(input), CODE, path);
  });
});

describe('view labels payload', () => {
  it('round-trips byte for byte as printable ASCII with escaped bytes', () => {
    const label = `${MARKER}"\\\n\u0001\u007f\u00e9`;
    const { bytes, descriptor } = syntheticAsset(labels(label));
    expect(text(bytes)).toBe(`{"labels":[{"subMode":8,"text":"${MARKER}\\"\\\\\\n\\u0001\\u007f\\u00e9"}]}`);
    const decoded = decode(bytes, descriptor);
    expect(decoded).toEqual(labels(label));
    expect(encodeViewLabelsPayload(decoded)).toEqual(bytes);
    expect(bytes.buffer.byteLength).toBe(bytes.length);
  });

  it('encodes the longest label within the payload byte limit, reserving its length first', () => {
    const reserved: number[] = [];
    const bytes = encodeViewLabelsPayload(labels('\u00ff'.repeat(VIEW_LABELS_LIMITS.textBytes)), length => reserved.push(length));
    expect(reserved).toEqual([bytes.length]);
    expect(bytes.length).toBeLessThanOrEqual(VIEW_LABELS_LIMITS.payloadBytes);
    expectContractError(() => encodeViewLabelsPayload(labels('x'.repeat(VIEW_LABELS_LIMITS.textBytes + 1))), CODE, 'viewLabels.labels[0].text');
  });

  it.each([
    ['whitespace between tokens', (json: string) => json.replace('"subMode":8', '"subMode": 8'), 'non-canonical-payload', 'payload'],
    ['another field order', (json: string) => json.replace(/\{"subMode":8,("text":".*")\}/, '{$1,"subMode":8}'), 'non-canonical-payload', 'payload'],
    ['a longer number spelling', (json: string) => json.replace('"subMode":8', '"subMode":8.0'), 'non-canonical-payload', 'payload'],
    ['an escaped printable character', (json: string) => json.replace('PRIVATE', '\\u0050RIVATE'), 'non-canonical-payload', 'payload'],
    ['an upper-case escape', (json: string) => json.replace('\\u00e9', '\\u00E9'), 'non-canonical-payload', 'payload'],
    ['a repeated key', (json: string) => json.replace('{"subMode":8,', '{"subMode":8,"subMode":8,'), 'non-canonical-payload', 'payload'],
    ['an escape above 255', (json: string) => json.replace('\\u00e9', '\\u0100'), CODE, 'viewLabels.labels[0].text'],
    ['a NUL escape', (json: string) => json.replace('\\u00e9', '\\u0000'), CODE, 'viewLabels.labels[0].text'],
    ['a second label', (json: string) => json.replace('}]}', '},{"subMode":8,"text":"a"}]}'), CODE, 'viewLabels.labels'],
    ['another sub-mode', (json: string) => json.replace('"subMode":8', '"subMode":9'), CODE, 'viewLabels.labels[0].subMode'],
    ['a missing field', (json: string) => json.replace('"subMode":8,', ''), CODE, 'viewLabels.labels[0].subMode'],
    ['an unknown field', (json: string) => json.replace('"subMode":8,', '"subMode":8,"item":8,'), CODE, 'viewLabels.labels[0]'],
    ['a trailing newline', (json: string) => `${json}\n`, CODE, 'payload'],
    ['text that is not JSON', (json: string) => json.slice(0, -1), CODE, 'payload'],
  ])('rejects %s', (_, edit, code, path) => {
    const { bytes, descriptor } = edited(edit);
    expectContractError(() => decode(bytes, descriptor), code, path, [MARKER]);
  });

  it('rejects a text over the limit and non-ASCII bytes', () => {
    const over = edited(json => json.replace(MARKER, MARKER.repeat(2)));
    expectContractError(() => decode(over.bytes, over.descriptor), CODE, 'viewLabels.labels[0].text', [MARKER]);
    const { bytes, descriptor } = syntheticAsset();
    const changed = new Uint8Array(bytes);
    changed[text(bytes).indexOf(MARKER)] = 0xe9;
    expectContractError(() => decode(changed, descriptor), CODE, 'payload');
  });

  it('checks the byte limit before the descriptor and rejects transferred bytes', () => {
    expectContractError(() => decode(new Uint8Array(VIEW_LABELS_LIMITS.payloadBytes + 1), { role: 'unknown' }), CODE, 'payload');
    const { bytes, descriptor } = syntheticAsset();
    structuredClone(bytes, { transfer: [...payloadTransferList([bytes])] });
    expectContractError(() => decode(bytes, descriptor), 'payload-detached', 'payload');
  });

  it.each([
    ['another role', (d: MutableDescriptor) => { d.role = 'flight-messages'; }, CODE, 'descriptor.role'],
    ['a kind other than data', (d: MutableDescriptor) => { Object.assign(d, { id: 'image/hud/view-labels', kind: 'image' }); }, CODE, 'descriptor.kind'],
    ['another schema version', (d: MutableDescriptor) => { d.payloadIdentity.schemaVersion = 2; }, 'unsupported-payload-schema', 'descriptor.payloadIdentity.schemaVersion'],
    ['a dependency', (d: MutableDescriptor) => { d.dependencies.push({ id: 'font/synthetic-hud', kind: 'font' }); }, 'flight-data-reference-mismatch', 'descriptor.dependencies'],
  ] as const)('rejects a descriptor with %s', (_, change, code, path) => {
    const { bytes, descriptor } = syntheticAsset();
    change(descriptor as MutableDescriptor);
    expectContractError(() => decode(bytes, descriptor), code, path);
  });

  it('returns a deeply frozen result isolated from the input bytes and earlier results', () => {
    const { bytes, descriptor } = syntheticAsset();
    const first = decode(bytes, descriptor);
    expect(deepFrozen(first)).toBe(true);
    expect(() => { (first.labels[0] as { text: string }).text = 'changed'; }).toThrowError(TypeError);
    const second = decode(bytes, descriptor);
    expect(second).not.toBe(first);
    bytes.fill(0x20);
    expect(first).toEqual(labels(`${MARKER} \u00e9\u00ff`));
    expect(second).toEqual(first);
  });
});
