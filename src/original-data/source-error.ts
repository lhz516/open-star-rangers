import type { BudgetDimension } from '../content/budget.ts';

/**
 * Stable failure codes of P2-03 archive reading, version identification and source mapping verification
 * (docs/plan/p2/03/spec.md, error codes), followed by those of P2-05 graphics conversion (docs/plan/p2/05/spec.md,
 * error codes), P2-09 mission conversion (docs/plan/p2/09/spec.md, errors) and P2-08 sound conversion
 * (docs/plan/p2/08/spec.md): `unsupported-payload` marks a valid structure that uses a position or format the
 * converter does not support, `subresource-mismatch` a subresource that disagrees with its mapping, and
 * `invalid-payload` is shared. Budget overruns are `budget-exceeded` with a P2-01 budget dimension. Consumers
 * classify failures by code only; P2-02 `DiscReadError` and P2-01 `ContentContractError` pass through with their
 * own codes.
 */
export type SourceErrorCode =
  | 'invalid-archive'
  | 'invalid-entry'
  | 'limit-exceeded'
  | 'entry-not-found'
  | 'entry-type-mismatch'
  | 'invalid-request'
  | 'invalid-catalog'
  | 'unsupported-version'
  | 'path-not-covered'
  | 'alternatives-differ'
  | 'fingerprint-mismatch'
  | 'invalid-payload'
  | 'unsupported-payload'
  | 'unsupported-encoding'
  | 'budget-exceeded'
  | 'palette-index-out-of-range'
  | 'subresource-not-found'
  | 'invalid-declaration'
  | 'geometry-mismatch'
  | 'subresource-mismatch';

/**
 * Names a `limit-exceeded` diagnostic reports: the P2-03 archive limits, the P2-05 graphics structural limits, the
 * P2-09 payload limits (entry bytes, item counts and text bytes), the P2-06 mesh, model, effect and executable limits
 * and the P2-07 container counts (CCKD directory slots, elements per slot, records per MFDD list and records per TABL
 * image list) and SNIP and DIAG bounds (frames, startup messages and text bytes); P3-09 adds `cockpitInstruments`, the
 * instrument records of the CCKD slot the map geometry reads. `budget-exceeded` reports a P2-01 budget dimension instead.
 *
 * P3-03 structures (docs/plan/p3/03/spec.md, limits and budgets; layouts in docs/original/formats/) reuse the generic
 * names wherever they describe the structure; the location's structure path then names it:
 * - `payloadEntryBytes`: the size of each entry read as a payload block: TABL 4003, CINF, DEBRIS TABL 4501, AICO 6001,
 *   TABL 6003, DFPG, AI script TABL, COMM menu TABL, TABL 10165, TABL 10399, RENS 10751, EXIC, EXPL, NEBC and ANIM.
 * - `payloadItems`: the count of each {pointer, count} array: SCEN section-2 event triggers, the ranges of a trigger
 *   and the message pointers of a range; CINF gun, missile, craft and missile body records, and a craft record's
 *   mounts, mount lists, boxes and pairs; the DEBRIS records of a kind bit and the boxes of a record; the AICO triples
 *   and 16-byte elements; the six DFPG ID lists; the three EXIC lists; the NEBC IDs; and the ANIM frame records.
 * - `textBytes`: the bytes before the NUL of each text: SCEN section-2 messages, CINF names, AI program names and
 *   script texts, COMM menu item texts, the TABL 10399 label and the EXE flight messages.
 * - `executableRegion`: the EXE regions of the flight messages and of the built-in AI program table.
 *
 * The other P3-03 structures have their own names:
 * - `aiProgramRecords`: the 0x54-byte program records of one table: TABL 6003 before its terminator record, or the
 *   EXE built-in table.
 * - `aiScriptItems`: the 0x18-byte items of one AI script, up to and including its terminator item.
 * - `aiEntries`: the distinct entries (DFPG and scripts) that the group-0 ID chain names.
 * - `commMenuItems`: the 8-byte items of one COMM menu, up to and including its last item.
 * - `animFrameBytes`: the encoded data bytes of one ANIM frame (frame record +32).
 *
 * Counts the format fixes, such as the 20 kind bits, the 18 × 3 TABL 4003 pairs and the 3 EXIC lists, are format
 * rules rather than limits.
 */
export type SourceLimitName =
  | 'archiveEntries'
  | 'entryBytes'
  | 'imageWidth'
  | 'imageHeight'
  | 'paletteEntryCount'
  | 'fontCellWidth'
  | 'fontHeight'
  | 'payloadEntryBytes'
  | 'payloadItems'
  | 'textBytes'
  | 'meshVertices'
  | 'meshTriangles'
  | 'modelParts'
  | 'effectRecords'
  | 'missileTypes'
  | 'ringSegments'
  | 'executableObjects'
  | 'executablePages'
  | 'executableRegion'
  | 'cockpitSlots'
  | 'cockpitElements'
  | 'cockpitInstruments'
  | 'mfdRecords'
  | 'tableRecords'
  | 'snipFrames'
  | 'diagStartupMessages'
  | 'diagTextBytes'
  | 'aiProgramRecords'
  | 'aiScriptItems'
  | 'aiEntries'
  | 'commMenuItems'
  | 'animFrameBytes'
  | BudgetDimension;

export interface SourceLimit {
  readonly name: SourceLimitName;
  readonly limit: number;
  /** Always a number for structural limits; null only when a budget total exceeds the safe integer range. */
  readonly observed: number | null;
}

/** Plain, structured-cloneable diagnostic with the same shape as P2-02 `DiscReadErrorData`. */
export interface SourceErrorData {
  readonly code: SourceErrorCode;
  /**
   * A safe structural position: `archive[:/PATH]` with a directory index, entry ID or relocation index, an entry ID
   * followed by a payload structure path such as `/records[3]/craftType`, `file:/PATH`, `catalog…`, `request…` or a
   * source mapping path, which a converter may follow with a field name. Never bytes, raw type tags, names, values,
   * host names or host paths.
   */
  readonly location: string;
  /** Fixed safe text. */
  readonly reason: string;
  readonly limit: SourceLimit | null;
}

export class SourceError extends Error {
  readonly code: SourceErrorCode;
  readonly location: string;
  readonly reason: string;
  readonly limit: SourceLimit | null;

  constructor(code: SourceErrorCode, location: string, reason: string, limit: SourceLimit | null = null) {
    super(`${location}: ${reason}`);
    this.name = 'SourceError';
    this.code = code;
    this.location = location;
    this.reason = reason;
    this.limit = limit && Object.freeze({ name: limit.name, limit: limit.limit, observed: limit.observed });
  }

  toData(): SourceErrorData {
    return Object.freeze({ code: this.code, location: this.location, reason: this.reason, limit: this.limit });
  }
}
