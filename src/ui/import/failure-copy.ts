import type { MissionFailure } from '../../app/resources/mission-diagnostics.ts';
import {
  RESOURCE_CACHE_FAILURE_CODES, type ResourceCacheFailure, type ResourceCacheFailureCode,
} from '../../platform/storage/resource-cache-contract.ts';
import { IMPORT_ERROR_CODES, type ImportErrorCode, type ImportErrorData, type ImportErrorLimit } from '../../workers/import-protocol.ts';

// Failure copy (P2-11 spec 失败反馈): one fixed English sentence per category, chosen by layer and code alone, with the
// technical details beside it. Host error text, file names and paths never reach it, and `reason` never classifies.

/** Where a failure was reported: the start rules, a job layer, the browser cache or the mission load. */
type FailureLayer = 'start' | 'disc' | 'source' | 'content' | 'import' | 'cache' | 'mission';

export interface FailureDetails {
  /** The reported layer, or the unrecognized value as text. */
  readonly layer: string;
  readonly code: string;
  /** Structural position, when the failure has one. */
  readonly location: string | null;
  /** The failure's own fixed reason text, when it has one. */
  readonly reason: string | null;
  readonly limit: ImportErrorLimit | null;
}

export interface FailureCopy {
  /** `<layer>/<category>`, stable for tests and page markup; unknown codes and layers have `default` categories. */
  readonly category: string;
  readonly message: string;
  readonly details: FailureDetails;
}

interface Category {
  readonly message: string;
  readonly codes: readonly string[];
}

interface LayerCopy {
  readonly categories: Readonly<Record<string, Category>>;
  /** The sentence of a code the layer does not list. */
  readonly fallback: string;
}

const LIMITS = ['limit-exceeded', 'budget-exceeded'];

/** Every cache code has its own category, named after the code. */
const CACHE_MESSAGES: Readonly<Record<ResourceCacheFailureCode, string>> = {
  'invalid-request': 'The browser cache rejected a malformed request.',
  'package-incomplete': 'Only a complete resource package can be saved in this browser.',
  'over-budget': 'The resource package exceeds the resource budget.',
  'storage-unavailable': 'Browser storage is unavailable, so the resources are kept only in this page.',
  'storage-newer-version': 'The browser cache belongs to a newer version of Open Star Rangers.',
  'storage-closed': 'The browser closed the cache connection. Try again.',
  'quota-exceeded': 'Browser storage is full. Free some space for this site, then save again.',
  'write-failed': 'The browser could not finish writing the cache.',
  'read-failed': 'The browser could not finish reading the cache.',
  cancelled: 'Saving was cancelled before anything was written.',
  'not-found': 'No saved resources were found; the browser may have cleared them. Import your disc files again.',
  'cache-incompatible': 'The saved resources belong to another version and cannot be used. Importing again replaces them.',
  'cache-corrupt': 'The saved resources are damaged and cannot be used. Importing again replaces them.',
};

const WORKER_CODES: readonly ImportErrorCode[] = ['worker-start-failed', 'worker-failed'];

/** The categories of each layer; `ui/` cannot import `original-data`, so the disc and source codes are listed here. */
const LAYERS: Readonly<Record<FailureLayer, LayerCopy>> = {
  start: {
    categories: {
      'file-rules': {
        message: 'Select a .ccd file and the .img file with the same name, optionally with their .sub and .cue files: at most 4 files, each name at most 255 UTF-16 code units (some symbols count as two).',
        codes: ['invalid-files'],
      },
    },
    fallback: 'The selected files cannot start an import.',
  },
  disc: {
    categories: {
      'file-set': {
        message: 'The selected files are not a supported CloneCD set: a .ccd file and the .img file with the same name, optionally with .sub and .cue.',
        codes: ['unsupported-file-set'],
      },
      structure: {
        message: 'The disc image layout or structure is not supported.',
        codes: [
          'invalid-descriptor', 'unsupported-layout', 'image-size-mismatch', 'invalid-sector', 'invalid-volume', 'invalid-directory',
          'directory-loop', 'invalid-path', 'path-not-found', 'wrong-entry-kind', 'invalid-range',
        ],
      },
      limits: { message: 'The disc image exceeds a reading limit or budget.', codes: LIMITS },
      'read-failed': { message: 'The selected files could not be read.', codes: ['read-failed'] },
    },
    fallback: 'The disc image could not be read.',
  },
  source: {
    categories: {
      version: {
        message: 'This disc is not a supported version of Star Rangers.',
        codes: ['unsupported-version', 'path-not-covered', 'fingerprint-mismatch', 'alternatives-differ'],
      },
      // The spec's "remaining codes": the default sentence is the same, but listed codes keep their category.
      checks: {
        message: 'The original data did not pass a structure or conversion check.',
        codes: [
          'invalid-archive', 'invalid-entry', 'entry-not-found', 'entry-type-mismatch', 'invalid-request', 'invalid-catalog', 'invalid-payload',
          'unsupported-payload', 'unsupported-encoding', 'palette-index-out-of-range', 'subresource-not-found', 'invalid-declaration',
          'geometry-mismatch', 'subresource-mismatch',
        ],
      },
      limits: { message: 'The original data exceeds a conversion limit or budget.', codes: LIMITS },
    },
    fallback: 'The original data did not pass a structure or conversion check.',
  },
  content: {
    categories: {},
    fallback: 'The converted resources did not pass content validation.',
  },
  import: {
    categories: {
      'worker-start': { message: 'The import Worker could not start.', codes: ['worker-start-failed'] },
      'worker-stopped': { message: 'The import Worker stopped unexpectedly.', codes: ['worker-failed'] },
      internal: {
        message: 'The import failed because of an internal or protocol error.',
        codes: IMPORT_ERROR_CODES.filter(code => !WORKER_CODES.includes(code)),
      },
    },
    fallback: 'The import failed.',
  },
  cache: {
    categories: Object.fromEntries(RESOURCE_CACHE_FAILURE_CODES.map(code => [code, { message: CACHE_MESSAGES[code], codes: [code] }])),
    fallback: 'The browser cache failed.',
  },
  mission: {
    categories: {
      'core-input': { message: 'The mission data does not fit together, so the mission cannot be loaded into Core.', codes: ['core-input'] },
      content: { message: 'A mission payload is invalid, so the mission cannot be loaded into Core.', codes: ['content'] },
    },
    fallback: 'The mission could not be loaded into Core.',
  },
};

/** Each layer's category of every code it lists. */
const CATEGORY_OF: ReadonlyMap<string, ReadonlyMap<string, string>> = new Map(Object.entries(LAYERS).map(([layer, { categories }]) =>
  [layer, new Map(Object.entries(categories).flatMap(([category, { codes }]) => codes.map(code => [code, category] as const)))]));

const GLOBAL_FALLBACK = 'The operation failed.';

const text = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value);

/** The limit's three structural fields only; anything else on the input is dropped. */
function readLimit(value: unknown): ImportErrorLimit | null {
  if (typeof value !== 'object' || value === null) return null;
  const { name, limit, observed } = value as Record<string, unknown>;
  if (typeof name !== 'string' || !count(limit) || (observed !== null && !count(observed))) return null;
  return Object.freeze({ name, limit, observed });
}

function copy(layer: unknown, code: unknown, location: unknown, reason: unknown, limit: unknown): FailureCopy {
  const known = typeof layer === 'string' && Object.hasOwn(LAYERS, layer) ? LAYERS[layer as FailureLayer] : null;
  const codeText = text(code) ?? '';
  const category = known ? CATEGORY_OF.get(layer as FailureLayer)!.get(codeText) ?? null : null;
  return Object.freeze({
    category: `${known ? layer : 'unknown'}/${category ?? 'default'}`,
    message: known === null ? GLOBAL_FALLBACK : category === null ? known.fallback : known.categories[category].message,
    details: Object.freeze({ layer: String(layer), code: codeText, location: text(location), reason: text(reason), limit: readLimit(limit) }),
  });
}

/** A start the job owner refused (`invalid-files`). */
export const startFailureCopy = (code: 'invalid-files'): FailureCopy => copy('start', code, null, null, null);

/** A job failure of any layer, as the job owner's snapshot reports it. */
export const jobFailureCopy = ({ layer, code, location, reason, limit }: ImportErrorData): FailureCopy => copy(layer, code, location, reason, limit);

/** A cache failure; the first budget violation, if any, is the limit. */
export function cacheFailureCopy({ code, location, reason, budget }: ResourceCacheFailure): FailureCopy {
  const violation = Array.isArray(budget) ? budget[0] as Partial<ResourceCacheFailure['budget'][number]> | undefined : undefined;
  return copy('cache', code, location, reason, violation && { name: violation.dimension, limit: violation.limit, observed: violation.observed });
}

/** A mission that could not be loaded into Core. */
export const missionFailureCopy = ({ kind, path, reason }: MissionFailure): FailureCopy => copy('mission', kind, path, reason, null);
