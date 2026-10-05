import { describe, expect, it } from 'vitest';
import { EMPTY_BUDGET_USAGE } from '../../content/budget.ts';
import { ByteWriter, cloneCdSections, cloneCdText, memoryByteSource, SyntheticByteSource, type CloneCdSection } from '../synthetic.ts';
import { MAX_DESCRIPTOR_BYTES, MAX_IMAGE_SECTORS, MIN_IMAGE_SECTORS, openCloneCd, RAW_SECTOR_BYTES, type DiscInputFile, type OpenDiscOptions } from './clone-cd.ts';
import { failure, failureOf, MARKER } from './disc.test-support.ts';

const SECTORS = 20;
const BASE = cloneCdText(cloneCdSections(SECTORS));
const BASE_TEXT = String.fromCharCode(...BASE);

/** An image port that only reports its size and records reads; opening a file set never reads the image. */
const imagePort = (sectors = SECTORS, extraBytes = 0): SyntheticByteSource =>
  new SyntheticByteSource(sectors * RAW_SECTOR_BYTES + extraBytes, (_offset, length) => new Uint8Array(length));
/** A port that fails the test if anything touches it, even its size. */
const untouchable = { get byteLength(): number { throw new Error('touched'); }, read: () => Promise.reject(new Error('read')) };
const latin1 = (text: string): Uint8Array => new ByteWriter().ascii(text, text.length).toBytes();

function descriptor(edit: (sections: CloneCdSection[]) => void, sectors = SECTORS): Uint8Array {
  const sections = cloneCdSections(sectors);
  edit(sections);
  return cloneCdText(sections);
}

function setKey(sections: CloneCdSection[], name: string, key: string, value?: string): void {
  const { keys } = sections.find(section => section.name === name)!;
  const index = keys.findIndex(([existing]) => existing === key);
  if (value === undefined) keys.splice(index, 1);
  else if (index < 0) keys.push([key, value]);
  else keys[index] = [key, value];
}

function open(ccd: Uint8Array | SyntheticByteSource, image: SyntheticByteSource = imagePort(), options?: OpenDiscOptions) {
  const ccdPort = ccd instanceof Uint8Array ? memoryByteSource(ccd) : ccd;
  const files: DiscInputFile[] = [{ name: `${MARKER}.ccd`, source: ccdPort }, { name: `${MARKER}.img`, source: image }];
  return { ccdPort, image, files, result: () => openCloneCd(files, options) };
}

const lineOf = (text: string, line: string): number => text.split('\r\n').indexOf(line) + 1;
const lineFailure = (line: number) => failureOf('invalid-descriptor', `descriptor:line ${line}`);

describe('file sets', () => {
  it('pairs names case-insensitively and never touches a .sub or .cue', async () => {
    const ccd = memoryByteSource(BASE);
    const image = imagePort();
    const opened = await openCloneCd([
      { name: `${MARKER.toLowerCase()}.Ccd`, source: ccd }, { name: `${MARKER.toUpperCase()}.IMG`, source: image },
      { name: `${MARKER}.Sub`, source: untouchable }, { name: `${MARKER}.cUE`, source: untouchable },
    ]);
    expect(opened.sectorCount).toBe(SECTORS);
    expect(ccd.requests).toEqual([{ offset: 0, length: BASE.length }]);
    expect(image.requests).toEqual([]);
    expect(opened.reader.usage()).toEqual({ ...EMPTY_BUDGET_USAGE, sourceReadBytes: BASE.length });
  });

  const other = `${MARKER}-other`;
  it.each([
    ['no files', []],
    ['no descriptor', [`${MARKER}.img`]],
    ['no image', [`${MARKER}.ccd`]],
    ['only a cue sheet and an image', [`${MARKER}.cue`, `${MARKER}.img`]],
    ['a repeated descriptor', [`${MARKER}.ccd`, `${MARKER}.CCD`, `${MARKER}.img`]],
    ['a repeated subchannel file', [`${MARKER}.ccd`, `${MARKER}.img`, `${MARKER}.sub`, `${MARKER}.SUB`]],
    ['empty stems', ['.ccd', '.img']],
    ['different stems', [`${MARKER}.ccd`, `${other}.img`]],
    ['a subchannel file with another stem', [`${MARKER}.ccd`, `${MARKER}.img`, `${other}.sub`]],
    ['another file type', [`${MARKER}.ccd`, `${MARKER}.img`, `${MARKER}.iso`]],
    ['a file without an extension', [`${MARKER}.ccd`, `${MARKER}.img`, MARKER]],
    ['more than four files', [`${MARKER}.ccd`, `${MARKER}.img`, `${MARKER}.sub`, `${MARKER}.cue`, `${MARKER}.txt`]],
  ])('rejects %s without reading anything', async (_case, names) => {
    const ports = names.map(() => memoryByteSource(BASE));
    const files = names.map((name, index) => ({ name, source: ports[index] }));
    expect(await failure(() => openCloneCd(files))).toEqual(failureOf('unsupported-file-set', 'files'));
    expect(ports.flatMap(port => port.requests)).toEqual([]);
  });

  it.each([
    ['a non-array file set', {}],
    ['a missing file record', [null, { name: 'a.img', source: imagePort() }]],
    ['a name that is not text', [{ name: 1, source: imagePort() }, { name: 'a.img', source: imagePort() }]],
    ['a missing source', [{ name: 'a.ccd' }, { name: 'a.img', source: imagePort() }]],
    ['a sparse file list', Object.assign(new Array<unknown>(2), { 1: { name: 'a.img', source: imagePort() } })],
    ['a name accessor that throws host text', [{ get name(): string { throw new Error(MARKER); }, source: imagePort() }, { name: 'a.img', source: imagePort() }]],
  ])('rejects %s as an unsupported file set', async (_case, files) => {
    expect(await failure(() => openCloneCd(files as unknown as DiscInputFile[]))).toEqual(failureOf('unsupported-file-set', 'files'));
  });
});

describe('input sizes', () => {
  it.each([
    ['descriptor', -1],
    ['descriptor', 1.5],
    ['image', Number.NaN],
    ['image', Number.MAX_SAFE_INTEGER + 1],
  ] as const)('rejects a %s source size of %s as invalid-range', async (role, size) => {
    const port = new SyntheticByteSource(size, () => undefined);
    const { result } = role === 'descriptor' ? open(port) : open(BASE, port);
    expect(await failure(result)).toEqual(failureOf('invalid-range', role));
  });

  it('opens a descriptor of exactly 65,536 bytes and rejects one byte more before reading', async () => {
    const padded = (bytes: number): Uint8Array => descriptor(sections => {
      setKey(sections, 'Disc', 'Padding', 'x'.repeat(bytes - BASE.length - 'Padding=\r\n'.length));
    });
    expect(padded(MAX_DESCRIPTOR_BYTES)).toHaveLength(65_536);
    expect((await open(padded(MAX_DESCRIPTOR_BYTES)).result()).sectorCount).toBe(SECTORS);
    const tooLong = open(padded(MAX_DESCRIPTOR_BYTES + 1));
    expect(await failure(tooLong.result)).toEqual(failureOf('limit-exceeded', 'descriptor', { name: 'descriptorBytes', limit: 65_536, observed: 65_537 }));
    expect(tooLong.ccdPort.requests).toEqual([]);
  });

  it('rejects an empty descriptor before reading', async () => {
    const empty = open(new Uint8Array());
    expect(await failure(empty.result)).toEqual(failureOf('limit-exceeded', 'descriptor', { name: 'descriptorBytes', limit: 1, observed: 0 }));
    expect(empty.ccdPort.requests).toEqual([]);
  });

  it('rejects an image of partial raw sectors before reading', async () => {
    const partial = open(BASE, imagePort(SECTORS, 1));
    expect(await failure(partial.result)).toEqual(failureOf('image-size-mismatch', 'image'));
    expect([...partial.ccdPort.requests, ...partial.image.requests]).toEqual([]);
  });

  it.each([
    [MIN_IMAGE_SECTORS - 1, 18],
    [MAX_IMAGE_SECTORS + 1, 449_850],
  ])('rejects %s image sectors before reading', async (sectors, limit) => {
    const outside = open(descriptor(() => {}, sectors), imagePort(sectors));
    expect(await failure(outside.result)).toEqual(failureOf('limit-exceeded', 'image', { name: 'imageSectors', limit, observed: sectors }));
    expect([...outside.ccdPort.requests, ...outside.image.requests]).toEqual([]);
  });

  it.each([18, 449_850])('passes the size gate at %s image sectors without reading the image', async sectors => {
    const { image, result } = open(descriptor(() => {}, sectors), imagePort(sectors));
    expect((await result()).sectorCount).toBe(sectors);
    expect(image.requests).toEqual([]);
  });

  it('rejects a lead-out that differs from the image sector count', async () => {
    const { result } = open(descriptor(() => {}, SECTORS + 1));
    expect(await failure(result)).toEqual(failureOf('image-size-mismatch', 'descriptor[Entry 2].PLBA'));
  });
});

describe('descriptor syntax', () => {
  it.each(['\r\n', '\n'])('opens a base-shaped descriptor with %j line ends', async lineEnd => {
    expect((await open(cloneCdText(cloneCdSections(SECTORS), lineEnd)).result()).sectorCount).toBe(SECTORS);
  });

  it('accepts a last line without a line end', async () => {
    expect((await open(BASE.subarray(0, BASE.length - 2)).result()).sectorCount).toBe(SECTORS);
  });

  it('ignores unknown keys and unused fields in known sections, including the lead-in PLBA', async () => {
    const ccd = descriptor(sections => {
      setKey(sections, 'Disc', MARKER, MARKER);
      setKey(sections, 'Entry 0', 'PLBA', MARKER);
      setKey(sections, 'Entry 1', 'PLBA', '-99999999999999999999');
      setKey(sections, 'Entry 2', 'ALBA', MARKER);
      setKey(sections, 'TRACK 1', 'index 0', '150');
    });
    expect((await open(ccd).result()).sectorCount).toBe(SECTORS);
  });

  const insertAfter = (anchor: string, line: string) => (text: string) => text.replace(`${anchor}\r\n`, `${anchor}\r\n${line}\r\n`);
  it.each([
    ['a byte order mark', (text: string) => `\u00ef\u00bb\u00bf${text}`, '[CloneCD]'],
    ['a non-ASCII byte', insertAfter('[Disc]', `${MARKER}=\u00e9`), `${MARKER}=\u00e9`],
    ['a tab', insertAfter('[Disc]', `${MARKER}=\t`), `${MARKER}=\t`],
    ['a lone carriage return', insertAfter('[Disc]', `${MARKER}=\r`), `${MARKER}=\r`],
    ['a line that is neither a section nor a key', insertAfter('[Disc]', MARKER), MARKER],
    ['a key without a name', insertAfter('[Disc]', `=${MARKER}`), `=${MARKER}`],
    ['a malformed section header', insertAfter('Version=3', `[${MARKER}`), `[${MARKER}`],
    ['a key before any section', (text: string) => `${MARKER}=1\r\n${text}`, `${MARKER}=1`],
    ['a repeated section', (text: string) => `${text}[Disc]\r\n`, ''],
    ['a repeated key', insertAfter('Sessions=1', 'Sessions=01'), 'Sessions=01'],
    ['a repeated unknown key', insertAfter('[Disc]', `${MARKER}=1\r\n${MARKER}=2`), `${MARKER}=2`],
    ['entries out of order', (text: string) => text.replace('[Entry 1]', '[Entry 2]').replace('[Entry 2]\r\nSession=1\r\nPoint=0xa2', '[Entry 1]\r\nSession=1\r\nPoint=0xa2'), '[Entry 2]'],
  ])('rejects %s as invalid-descriptor at its line, without echoing it', async (_case, edit, line) => {
    const text = edit(BASE_TEXT);
    // A repeated trailing section is the last line; otherwise the edited line is located by its content.
    const expected = line === '' ? text.split('\r\n').length - 1 : lineOf(text.replace('\u00ef\u00bb\u00bf', ''), line);
    expect(await failure(open(latin1(text)).result)).toEqual(lineFailure(expected));
  });

  it.each(['1x', '0x', '0X1', '1.0', '1e0', ' 1', '1 ', '-1', '+1', '', '9007199254740992', '0x20000000000000'])(
    'rejects the incomplete or unsafe number %j', async value => {
      expect(await failure(open(descriptor(sections => setKey(sections, 'Disc', 'Sessions', value))).result))
        .toEqual(failureOf('invalid-descriptor', 'descriptor[Disc].Sessions'));
    },
  );

  it('reads decimal with leading zeros and 0x hexadecimal in either digit case', async () => {
    const ccd = descriptor(sections => {
      setKey(sections, 'CloneCD', 'Version', '0x3');
      setKey(sections, 'Disc', 'Sessions', '001');
      setKey(sections, 'Entry 0', 'Point', '0xA0');
    });
    expect((await open(ccd).result()).sectorCount).toBe(SECTORS);
  });

  it.each(['CloneCD', 'Disc', 'Session 1', 'TRACK 1'])('rejects a descriptor without [%s]', async name => {
    const ccd = descriptor(sections => sections.splice(sections.findIndex(section => section.name === name), 1));
    expect(await failure(open(ccd).result)).toEqual(failureOf('invalid-descriptor', `descriptor[${name}]`));
  });

  it.each([
    ['CloneCD', 'Version'], ['Disc', 'TocEntries'], ['Disc', 'Sessions'], ['Disc', 'DataTracksScrambled'],
    ...[0, 1, 2, 3].flatMap(index => ['Session', 'Point', 'ADR', 'Control'].map(key => [`Entry ${index}`, key])),
    ['Entry 0', 'PMin'], ['Entry 1', 'PMin'], ['Entry 2', 'PLBA'], ['Entry 3', 'PLBA'],
    ['TRACK 1', 'MODE'], ['TRACK 1', 'INDEX 1'],
  ])('rejects a descriptor whose [%s] lacks the required %s', async (name, key) => {
    const ccd = descriptor(sections => setKey(sections, name, key));
    expect(await failure(open(ccd).result)).toEqual(failureOf('invalid-descriptor', `descriptor[${name}].${key}`));
  });

  it.each([
    ['fewer', '3'],
    ['more', '5'],
  ])('rejects a TocEntries count %s than the entries', async (_case, count) => {
    const ccd = descriptor(sections => setKey(sections, 'Disc', 'TocEntries', count));
    expect(await failure(open(ccd).result)).toEqual(failureOf('invalid-descriptor', 'descriptor[Disc].TocEntries'));
  });
});

describe('supported layout', () => {
  const extraEntry = (point: string) => (sections: CloneCdSection[]): void => {
    sections.splice(7, 0, { name: 'Entry 4', keys: [['Session', '1'], ['Point', point], ['ADR', '0x01'], ['Control', '0x04']] });
    setKey(sections, 'Disc', 'TocEntries', '5');
  };
  it.each([
    ['another version', 'CloneCD', 'Version', '2'],
    ['two sessions', 'Disc', 'Sessions', '2'],
    ['scrambled data tracks', 'Disc', 'DataTracksScrambled', '1'],
    ['an entry in another session', 'Entry 0', 'Session', '2'],
    ['another ADR', 'Entry 1', 'ADR', '0x02'],
    ['an audio control', 'Entry 2', 'Control', '0x00'],
    ['a control beyond 4 bits', 'Entry 3', 'Control', '0x14'],
    ['a repeated TOC point', 'Entry 3', 'Point', '0xa0'],
    ['a first track other than 1', 'Entry 0', 'PMin', '2'],
    ['a last track other than 1', 'Entry 1', 'PMin', '2'],
    ['a track starting after a pregap', 'Entry 3', 'PLBA', '150'],
    ['MODE2', 'TRACK 1', 'MODE', '2'],
    ['a nonzero INDEX 1', 'TRACK 1', 'INDEX 1', '150'],
  ])('rejects %s as unsupported-layout at that key', async (_case, name, key, value) => {
    const ccd = descriptor(sections => setKey(sections, name, key, value));
    expect(await failure(open(ccd).result)).toEqual(failureOf('unsupported-layout', `descriptor[${name}].${key}`));
  });

  it('rejects an extra TOC point at its Point key', async () => {
    expect(await failure(open(descriptor(extraEntry('0x02'))).result)).toEqual(failureOf('unsupported-layout', 'descriptor[Entry 4].Point'));
  });

  it('rejects a TOC without the track 1 point', async () => {
    const ccd = descriptor(sections => {
      sections.splice(6, 1);
      setKey(sections, 'Disc', 'TocEntries', '3');
    });
    expect(await failure(open(ccd).result)).toEqual(failureOf('unsupported-layout', 'descriptor[Disc].TocEntries'));
  });

  it.each([
    ['INDEX 0', (sections: CloneCdSection[]) => setKey(sections, 'TRACK 1', 'INDEX 0', '0'), 'INDEX 0=0'],
    ['a second track', (sections: CloneCdSection[]) => sections.push({ name: 'TRACK 2', keys: [['MODE', '1']] }), '[TRACK 2]'],
    ['a second session', (sections: CloneCdSection[]) => sections.splice(3, 0, { name: 'Session 2', keys: [] }), '[Session 2]'],
    ['an unknown section', (sections: CloneCdSection[]) => sections.splice(1, 0, { name: MARKER, keys: [[MARKER, MARKER]] }), `[${MARKER}]`],
  ])('rejects %s as unsupported-layout at its line, without echoing it', async (_case, edit, line) => {
    const ccd = descriptor(edit);
    expect(await failure(open(ccd).result)).toEqual(failureOf('unsupported-layout', `descriptor:line ${lineOf(String.fromCharCode(...ccd), line)}`));
  });

  it('reports descriptor syntax before layout, and layout before the lead-out', async () => {
    const both = descriptor(sections => {
      setKey(sections, 'Disc', 'Sessions', '2');
      setKey(sections, 'TRACK 1', 'MODE');
    });
    expect((await failure(open(both).result)).code).toBe('invalid-descriptor');
    expect((await failure(open(descriptor(sections => setKey(sections, 'TRACK 1', 'MODE', '2')), imagePort(SECTORS + 1)).result)).code)
      .toBe('unsupported-layout');
  });
});

describe('open options', () => {
  const inputBytes = BASE.length + SECTORS * RAW_SECTOR_BYTES;
  const limits = (sourceReadBytes: number): Record<string, number> => ({ ...EMPTY_BUDGET_USAGE, sourceReadBytes });

  it('defaults the source read budget to the descriptor and image byte total', async () => {
    const { reader } = await open(BASE).result();
    reader.precheck(inputBytes - BASE.length, 'image');
    expect(await failure(() => reader.precheck(inputBytes - BASE.length + 1, 'image')))
      .toEqual(failureOf('budget-exceeded', 'image', { name: 'sourceReadBytes', limit: inputBytes, observed: inputBytes + 1 }));
  });

  it('accepts a budget up to the input total and rejects a higher one before reading', async () => {
    expect((await open(BASE, imagePort(), { limits: limits(inputBytes) }).result()).sectorCount).toBe(SECTORS);
    const over = open(BASE, imagePort(), { limits: limits(inputBytes + 1) });
    expect(await failure(over.result))
      .toEqual(failureOf('limit-exceeded', 'limits.sourceReadBytes', { name: 'sourceReadBytes', limit: inputBytes, observed: inputBytes + 1 }));
    expect(over.ccdPort.requests).toEqual([]);
  });

  it('reads the descriptor within a budget of exactly its size and rejects one byte less before reading', async () => {
    const exact = await open(BASE, imagePort(), { limits: limits(BASE.length) }).result();
    expect(exact.reader.usage().sourceReadBytes).toBe(BASE.length);
    const short = open(BASE, imagePort(), { limits: limits(BASE.length - 1) });
    expect(await failure(short.result))
      .toEqual(failureOf('budget-exceeded', 'descriptor', { name: 'sourceReadBytes', limit: BASE.length - 1, observed: BASE.length }));
    expect(short.ccdPort.requests).toEqual([]);
  });

  it('keeps P2-01 codes and paths for a malformed limits record', async () => {
    const missing: Record<string, number> = limits(1);
    delete missing.sourceReadBytes;
    expect(await failure(open(BASE, imagePort(), { limits: missing }).result)).toEqual(failureOf('missing-budget-dimension', 'limits.sourceReadBytes'));
    expect(await failure(open(BASE, imagePort(), { limits: { ...limits(1), [MARKER]: 1 } }).result)).toEqual(failureOf('unknown-budget-dimension', 'limits'));
  });

  it.each([
    ['null', null],
    ['a number', 1],
    ['text', 'aborted'],
    ['an object without a flag', {}],
    ['a non-boolean flag', { aborted: 0 }],
    ['a flag getter that throws host text', { get aborted(): boolean { throw new Error(MARKER); } }],
  ])('rejects a cancellation probe that is %s', async (_case, cancellation) => {
    const options = { cancellation } as unknown as OpenDiscOptions;
    expect(await failure(open(BASE, imagePort(), options).result)).toEqual(failureOf('invalid-record', 'cancellation'));
  });

  it('accepts an AbortSignal as the cancellation probe', async () => {
    expect((await open(BASE, imagePort(), { cancellation: new AbortController().signal }).result()).sectorCount).toBe(SECTORS);
  });

  it.each([
    ['null', null],
    ['an array', []],
    ['a class instance', new (class Options {})()],
    ['an accessor that throws host text', { get limits(): unknown { throw new Error(MARKER); } }],
  ])('rejects options that are %s without running accessors', async (_case, options) => {
    expect(await failure(open(BASE, imagePort(), options as unknown as OpenDiscOptions).result)).toEqual(failureOf('invalid-record', 'options'));
  });

  it('reads nothing when cancelled before opening', async () => {
    const cancelled = open(BASE, imagePort(), { cancellation: { aborted: true } });
    expect(await failure(cancelled.result)).toEqual(failureOf('cancelled', 'descriptor'));
    expect(cancelled.ccdPort.requests).toEqual([]);
  });

  it('snapshots the file list and budget, so later caller changes do not reach the opened state', async () => {
    const budget = limits(inputBytes);
    const { files, result } = open(BASE, imagePort(), { limits: budget });
    const opening = result();
    files.splice(0, files.length, { name: 'other.ccd', source: untouchable }, { name: 'other.img', source: untouchable });
    budget.sourceReadBytes = 1;
    const { reader } = await opening;
    reader.precheck(inputBytes - BASE.length, 'image');
    expect(reader.usage().sourceReadBytes).toBe(BASE.length);
  });

  it('reports the file set before sizes and sizes before the descriptor', async () => {
    const files = [{ name: 'a.ccd', source: new SyntheticByteSource(-1, () => undefined) }, { name: 'b.img', source: imagePort() }];
    expect((await failure(() => openCloneCd(files))).code).toBe('unsupported-file-set');
    expect((await failure(open(latin1(`${MARKER}\r\n`.repeat(6_000))).result)).code).toBe('limit-exceeded');
  });
});
