import { describe, expect, it } from 'vitest';
import { readAssetDescriptor } from '../../content/asset-contract.ts';
import { decodeViewLabelsPayload, encodeViewLabelsPayload, readViewLabels, VIEW_LABELS_LIMITS } from '../../content/hud/view-labels-payload.ts';
import { deepFrozen } from '../../content/logic/logic-content.test-support.ts';
import { syntheticGroup } from '../../content/synthetic-content.test-support.ts';
import type { DiscPath } from '../disc/disc-path.ts';
import { sourceFailure } from '../source-error.test-support.ts';
import { entryRead, MARKER, type SyntheticBlock } from './formats.test-support.ts';
import { parseViewLabels, VIEW_LABEL_LIMITS, VIEW_LABEL_TABLE } from './view-labels.ts';

// Code-generated synthetic TABL 10399 blocks; they never hold original data. Labels carry MARKER for privacy assertions,
// and item 8 holds bytes 1, 0x7F, 0x80 and 0xFF.

const SR_NOB = 'MAIN/SR.NOB' as DiscPath;
const TABL_ID = 10_399;
const at = `archive:/MAIN/SR.NOB#${TABL_ID}`;
const TABLE_BYTES = VIEW_LABEL_TABLE.labels * 4;
const ITEM_8 = `${MARKER}\u0001\u007f\u0080\u00ff~`;

const defaultLabels = (): string[] => Array.from({ length: VIEW_LABEL_TABLE.labels }, (_, index) => index === 8 ? ITEM_8 : `${MARKER}-${index}`);

interface LabelBlockOptions {
  /** Bytes between the pointer table and the first string; an odd count leaves the strings unaligned. */
  gap?: number;
  /** Bytes after the last string. */
  tail?: number;
  /** Omit the NUL after the last string. */
  unterminatedLast?: boolean;
}

/** TABL 10399: 13 relocated pointers, listed in reverse order, then the strings in index order. */
function syntheticLabels(labels: readonly string[] = defaultLabels(), { gap = 1, tail = 0, unterminatedLast = false }: LabelBlockOptions = {}): SyntheticBlock {
  const length = TABLE_BYTES + gap + labels.reduce((sum, text) => sum + text.length + 1, 0) - (unterminatedLast ? 1 : 0) + tail;
  const bytes = new Uint8Array(length).fill(0x5a, length - tail);
  const view = new DataView(bytes.buffer);
  let offset = TABLE_BYTES + gap;
  labels.forEach((text, index) => {
    view.setUint32(index * 4, offset, true);
    for (let character = 0; character < text.length; character++) bytes[offset + character] = text.charCodeAt(character);
    offset += text.length + 1;
  });
  return { bytes, relocations: labels.map((_, index) => index * 4).reverse() };
}

const parse = (block: SyntheticBlock) => parseViewLabels(SR_NOB, entryRead(TABL_ID, 'TABL', block));
const expected = (text: string) => ({ labels: [{ subMode: 8, text }] });

/** The default block with label 8's pointer replaced by `target`, listed or not. */
function pointing(target: number, listed = true): SyntheticBlock {
  const block = syntheticLabels();
  new DataView(block.bytes.buffer).setUint32(0x20, target, true);
  if (!listed) block.relocations = block.relocations.filter(position => position !== 0x20);
  return block;
}

const failure = (action: () => unknown) => sourceFailure(action, new RegExp(MARKER));

const invalid = (path = '/labels[8]') => ({ code: 'invalid-payload', location: `${at}${path}`, limit: null });

describe('TABL 10399 view label parsing', () => {
  it('converts item 8 as a frozen byte string, keeping bytes 1 to 255', () => {
    const parsed = parse(syntheticLabels());
    expect(parsed).toEqual(expected(ITEM_8));
    expect([...parsed.labels[0].text].map(character => character.charCodeAt(0))).toContain(0xff);
    expect(deepFrozen(parsed)).toBe(true);
  });

  it('takes the text from the input and accepts an empty label', () => {
    const labels = defaultLabels();
    labels[8] = `${MARKER}-other\u00c4`;
    expect(parse(syntheticLabels(labels))).toEqual(expected(labels[8]));
    labels[8] = '';
    expect(parse(syntheticLabels(labels))).toEqual(expected(''));
  });

  it('produces content that the view labels reader and the canonical payload accept unchanged', () => {
    const parsed = parse(syntheticLabels());
    expect(readViewLabels(parsed)).toEqual(parsed);
    const bytes = encodeViewLabelsPayload(parsed);
    const [descriptor] = syntheticGroup('cockpit-hud-map', [{ id: 'data/hud/view-labels', role: 'view-labels', bytes }]).manifest.assets;
    expect(decodeViewLabelsPayload(bytes, readAssetDescriptor(descriptor, 'descriptor'))).toEqual(parsed);
  });

  it('ignores the other items: their text, lengths and pointers do not change the result', () => {
    const labels = defaultLabels().map((text, index) => index === 8 ? text : `${index}`.repeat(index + 1));
    expect(parse(syntheticLabels(labels, { gap: 0, tail: 7 }))).toEqual(expected(ITEM_8));
    const loose = syntheticLabels();
    const view = new DataView(loose.bytes.buffer);
    // Item 0 null and unlisted, item 1 unlisted, item 12 outside the block.
    view.setUint32(0, 0, true);
    view.setUint32(12 * 4, 0xffff, true);
    loose.relocations = loose.relocations.filter(position => position !== 0 && position !== 4);
    expect(parse(loose)).toEqual(expected(ITEM_8));
    // Without its NUL, the last item runs to the end of the block.
    expect(parse(syntheticLabels(defaultLabels(), { unterminatedLast: true }))).toEqual(expected(ITEM_8));
  });

  it('accepts a label at the text limit and rejects one byte more', async () => {
    const { textBytes } = VIEW_LABELS_LIMITS;
    const labels = defaultLabels();
    labels[8] = `${MARKER}${'\u00e9'.repeat(textBytes - MARKER.length)}`;
    expect(parse(syntheticLabels(labels))).toEqual(expected(labels[8]));
    labels[8] += 'x';
    expect(await failure(() => parse(syntheticLabels(labels))))
      .toEqual({ code: 'limit-exceeded', location: `${at}/labels[8]`, limit: { name: 'textBytes', limit: textBytes, observed: textBytes + 1 } });
  });

  it('rejects a label without a NUL in the block', async () => {
    const labels = defaultLabels().slice(0, 9);
    expect(await failure(() => parse(syntheticLabels(labels, { unterminatedLast: true })))).toEqual(invalid());
  });

  it('rejects an unlisted, null or outside pointer to item 8 as invalid-payload', async () => {
    const block = syntheticLabels();
    const target = new DataView(block.bytes.buffer).getUint32(0x20, true);
    expect(await failure(() => parse(pointing(target, false)))).toEqual(invalid());
    expect(await failure(() => parse(pointing(0, false)))).toEqual(invalid());
    expect(await failure(() => parse(pointing(block.bytes.length)))).toEqual(invalid());
    expect(await failure(() => parse(pointing(0xffff_fff0)))).toEqual(invalid());
  });

  it('rejects a listed pointer into the pointer table as unsupported-payload', async () => {
    for (const target of [0, 0x20, TABLE_BYTES - 1]) {
      expect(await failure(() => parse(pointing(target)))).toEqual({ ...invalid(), code: 'unsupported-payload' });
    }
  });

  it('rejects a relocation over the label or its NUL', async () => {
    const block = syntheticLabels();
    const target = new DataView(block.bytes.buffer).getUint32(0x20, true);
    for (const position of [target - 3, target, target + ITEM_8.length]) {
      const overlapped = syntheticLabels();
      overlapped.relocations.push(position);
      expect(await failure(() => parse(overlapped))).toEqual(invalid());
    }
    const clear = syntheticLabels();
    clear.relocations.push(target - 4, target + ITEM_8.length + 1);
    expect(parse(clear)).toEqual(expected(ITEM_8));
  });

  it('rejects a block too short for the pointer table', async () => {
    const block = syntheticLabels();
    expect(await failure(() => parse({ bytes: block.bytes.slice(0, TABLE_BYTES - 1), relocations: [0x20] }))).toEqual(invalid('/labels'));
  });

  it('accepts an entry at the byte limit and rejects one byte more before reading it', async () => {
    const { entryBytes } = VIEW_LABEL_LIMITS;
    const base = syntheticLabels().bytes.length;
    expect(parse(syntheticLabels(defaultLabels(), { tail: entryBytes - base }))).toEqual(expected(ITEM_8));
    expect(await failure(() => parse(syntheticLabels(defaultLabels(), { tail: entryBytes - base + 1 }))))
      .toEqual({ code: 'limit-exceeded', location: at, limit: { name: 'payloadEntryBytes', limit: entryBytes, observed: entryBytes + 1 } });
  });
});
