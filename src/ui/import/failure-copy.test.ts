import { describe, expect, it } from 'vitest';
import type { ContentContractErrorCode } from '../../content/contract-validation.ts';
import type { DiscReadErrorData } from '../../original-data/disc/disc-error.ts';
import type { SourceErrorCode } from '../../original-data/source-error.ts';
import { cacheFailure, RESOURCE_CACHE_FAILURE_CODES, type ResourceCacheFailureCode } from '../../platform/storage/resource-cache-contract.ts';
import { importError, type ImportErrorCode, type ImportErrorData } from '../../workers/import-protocol.ts';
import { cacheFailureCopy, jobFailureCopy, missionFailureCopy, startFailureCopy, type FailureCopy } from './failure-copy.ts';

const MARKER = 'PRIVATE-MARKER-copy-7e2a';

// Each table names every code of its type, so a new upstream code fails type checking until it is classified here.
const DISC: Readonly<Record<DiscReadErrorData['code'], string>> = {
  'unsupported-file-set': 'file-set',
  'invalid-descriptor': 'structure',
  'unsupported-layout': 'structure',
  'image-size-mismatch': 'structure',
  'invalid-sector': 'structure',
  'invalid-volume': 'structure',
  'invalid-directory': 'structure',
  'directory-loop': 'structure',
  'invalid-path': 'structure',
  'path-not-found': 'structure',
  'wrong-entry-kind': 'structure',
  'invalid-range': 'structure',
  'limit-exceeded': 'limits',
  'budget-exceeded': 'limits',
  'read-failed': 'read-failed',
  // Not in the spec's disc table: a job is cancelled by its owner, not by a disc error, and a malformed limits record is
  // a configuration defect the production job never passes.
  cancelled: 'default',
  'invalid-record': 'default',
  'missing-budget-dimension': 'default',
  'unknown-budget-dimension': 'default',
  'invalid-budget-value': 'default',
};

const SOURCE: Readonly<Record<SourceErrorCode, string>> = {
  'unsupported-version': 'version',
  'path-not-covered': 'version',
  'fingerprint-mismatch': 'version',
  'alternatives-differ': 'version',
  'limit-exceeded': 'limits',
  'budget-exceeded': 'limits',
  'invalid-archive': 'checks',
  'invalid-entry': 'checks',
  'entry-not-found': 'checks',
  'entry-type-mismatch': 'checks',
  'invalid-request': 'checks',
  'invalid-catalog': 'checks',
  'invalid-payload': 'checks',
  'unsupported-payload': 'checks',
  'unsupported-encoding': 'checks',
  'palette-index-out-of-range': 'checks',
  'subresource-not-found': 'checks',
  'invalid-declaration': 'checks',
  'geometry-mismatch': 'checks',
  'subresource-mismatch': 'checks',
};

const IMPORT: Readonly<Record<ImportErrorCode, string>> = {
  'worker-start-failed': 'worker-start',
  'worker-failed': 'worker-stopped',
  'internal-error': 'internal',
  'protocol-error': 'internal',
  'invalid-result': 'internal',
  'invalid-request': 'internal',
};

const CONTENT: readonly ContentContractErrorCode[] = ['invalid-record', 'unsupported-payload-schema', 'payload-detached'];

const jobError = (layer: string, code: string): ImportErrorData =>
  ({ layer, code, location: 'groups.models.payloads[2]', reason: 'is invalid', limit: null }) as ImportErrorData;

/** The sentence of every category: one per category, shared by no other category. */
function sentences(copies: readonly FailureCopy[]): Map<string, string> {
  const byCategory = new Map<string, string>();
  for (const { category, message } of copies) {
    expect(byCategory.get(category) ?? message, category).toBe(message);
    byCategory.set(category, message);
  }
  return byCategory;
}

describe('job failure copy', () => {
  it.each([['disc', DISC], ['source', SOURCE], ['import', IMPORT]] as const)('classifies every %s code by the spec table', (layer, table) => {
    const copies = Object.entries(table).map(([code, category]) => {
      const result = jobFailureCopy(jobError(layer, code));
      expect(result.category, code).toBe(`${layer}/${category}`);
      return result;
    });
    const messages = sentences(copies);
    expect(new Set(messages.values()).size).toBe(new Set(Object.values(table)).size);
  });

  it('gives every content code the content sentence', () => {
    const copies = CONTENT.map(code => jobFailureCopy(jobError('content', code)));
    expect(new Set(copies.map(({ category }) => category))).toEqual(new Set(['content/default']));
    expect(copies[0].message).toBe('The converted resources did not pass content validation.');
  });

  it.each(['disc', 'source', 'content', 'import'])('gives an unknown %s code the layer default, distinct from other layers', (layer) => {
    const unknown = jobFailureCopy(jobError(layer, 'not-a-known-code'));
    expect(unknown.category).toBe(`${layer}/default`);
    const others = ['disc', 'source', 'content', 'import'].filter(other => other !== layer)
      .map(other => jobFailureCopy(jobError(other, 'not-a-known-code')).message);
    expect(others).not.toContain(unknown.message);
  });

  it('gives an unknown layer the global default', () => {
    const result = jobFailureCopy(jobError('network', 'worker-failed'));
    expect(result).toMatchObject({ category: 'unknown/default', message: 'The operation failed.', details: { layer: 'network', code: 'worker-failed' } });
  });

  it('names the version for an unsupported disc, which the production preview shows for synthetic files', () => {
    expect(jobFailureCopy(jobError('source', 'unsupported-version')).message).toBe('This disc is not a supported version of Star Rangers.');
  });

  it('keeps the layer, code, location, reason and limit as technical details', () => {
    const error: ImportErrorData = {
      layer: 'source', code: 'budget-exceeded', location: 'graphics[image/model-texture/01].pixels', reason: 'the budget is exhausted',
      limit: { name: 'imagePixels', limit: 10, observed: null },
    };
    expect(jobFailureCopy(error).details).toEqual({
      layer: 'source', code: 'budget-exceeded', location: 'graphics[image/model-texture/01].pixels', reason: 'the budget is exhausted',
      limit: { name: 'imagePixels', limit: 10, observed: null },
    });
    expect(jobFailureCopy(importError('worker-failed', 'worker', 'the import Worker failed')).details)
      .toEqual({ layer: 'import', code: 'worker-failed', location: 'worker', reason: 'the import Worker failed', limit: null });
  });

  it('drops every field beside the structural ones, so host text never reaches the copy', () => {
    const error = {
      ...jobError('disc', 'read-failed'), message: MARKER, stack: MARKER, name: `${MARKER}.img`,
      limit: { name: 'portReadBytes', limit: 1, observed: 2, file: MARKER },
    } as unknown as ImportErrorData;
    const result = jobFailureCopy(error);
    expect(JSON.stringify(result)).not.toContain(MARKER);
    expect(result.details.limit).toEqual({ name: 'portReadBytes', limit: 1, observed: 2 });
  });

  it('never classifies by the reason text', () => {
    expect(jobFailureCopy({ ...jobError('disc', 'read-failed'), reason: 'unsupported-version' }).category).toBe('disc/read-failed');
  });
});

describe('start, cache and mission failure copy', () => {
  it('explains the file rules for invalid files', () => {
    const result = startFailureCopy('invalid-files');
    expect(result.category).toBe('start/file-rules');
    expect(result.message).toMatch(/\.ccd.*\.img.*same name.*\.sub.*\.cue.*at most 4 files.*255 UTF-16 code units/);
    expect(result.details).toEqual({ layer: 'start', code: 'invalid-files', location: null, reason: null, limit: null });
  });

  it('gives each of the 13 cache codes its own sentence', () => {
    const copies = RESOURCE_CACHE_FAILURE_CODES.map(code => cacheFailureCopy(cacheFailure(code, 'database')));
    expect(copies.map(({ category }) => category)).toEqual(RESOURCE_CACHE_FAILURE_CODES.map(code => `cache/${code}`));
    expect(new Set(copies.map(({ message }) => message)).size).toBe(RESOURCE_CACHE_FAILURE_CODES.length);
    expect(cacheFailureCopy(cacheFailure('not-a-code' as ResourceCacheFailureCode, 'database'))).toMatchObject({ category: 'cache/default', message: 'The browser cache failed.' });
  });

  it.each([
    ['quota-exceeded', /free some space/i],
    ['storage-unavailable', /kept only in this page/i],
    ['not-found', /import .* again/i],
    ['cache-corrupt', /importing again replaces/i],
    ['cache-incompatible', /importing again replaces/i],
  ] as const)('says what %s means for the player', (code, sentence) => {
    expect(cacheFailureCopy(cacheFailure(code, 'database')).message).toMatch(sentence);
  });

  it('reports the first budget violation of a cache failure as its limit', () => {
    const failure = cacheFailure('over-budget', 'groups[1].manifest', {
      budget: [{ code: 'budget-exceeded', dimension: 'assets', path: 'groups[1].manifest.assets[3]', limit: 3, observed: 4 }],
    });
    expect(cacheFailureCopy(failure).details).toEqual({
      layer: 'cache', code: 'over-budget', location: 'groups[1].manifest', reason: 'the package exceeds the resource budget',
      limit: { name: 'assets', limit: 3, observed: 4 },
    });
  });

  it.each([
    ['core-input', 'mission/core-input'],
    ['content', 'mission/content'],
    ['other', 'mission/default'],
  ] as const)('gives a %s mission failure its sentence with the path and reason', (kind, category) => {
    const result = missionFailureCopy({ kind: kind as 'core-input', path: 'input.mission.content.declarations[4].craftType', reason: 'is a second player declaration' });
    expect(result.category).toBe(category);
    expect(result.details).toEqual({
      layer: 'mission', code: kind, location: 'input.mission.content.declarations[4].craftType', reason: 'is a second player declaration', limit: null,
    });
  });

  it('uses no sentence for two categories across all layers', () => {
    const all = [
      startFailureCopy('invalid-files'),
      ...[['disc', DISC], ['source', SOURCE], ['import', IMPORT]].flatMap(([layer, table]) =>
        Object.keys(table as object).map(code => jobFailureCopy(jobError(layer as string, code)))),
      jobFailureCopy(jobError('content', 'invalid-record')),
      ...RESOURCE_CACHE_FAILURE_CODES.map(code => cacheFailureCopy(cacheFailure(code, 'database'))),
      missionFailureCopy({ kind: 'core-input', path: 'input', reason: 'r' }),
      missionFailureCopy({ kind: 'content', path: 'input', reason: 'r' }),
    ];
    const messages = sentences(all);
    expect(new Set(messages.values()).size).toBe(messages.size);
  });
});
