/**
 * AI program selection and the controller's install values (docs/plan/p3/02/spec.md, CR-16, CR-23;
 * docs/original/formats/ai.md §1, §1.1; executable.md A1, A2):
 * - selectProgram: `0x5dbc8` at instantiation `0x20990`, the group table's scan `0x5de18` and, when it matches nothing,
 *   the built-in table's, one draw per scanned table;
 * - installedController: the configuration `0x5dc0c` writes after clearing the controller, with the steering block
 *   `0x5c530` and its `0x5c768`(1.0, 1.0, 0) leaves; the handler's mode 0 writes the rest.
 *
 * The selection happens once per object: a reinstall after parking, resuming or a Warp departure keeps the slot's
 * record. Run-time values are those of ai-support.ts's static data (AiRuleData), whose reachability already proved
 * that every record this selection can reach is supported.
 */
import type { BuiltInProgram } from '../../content/rule-data/ai-programs.ts';
import type { CraftRecord } from '../../content/rule-data/craft-info.ts';
import { isDue } from '../contracts/time.ts';
import { CoreFaultError } from '../errors.ts';
import { clearedControllerCommon, NO_AI_PROGRAM, type AiControllerCommon, type AiProgramSlot, type Entity } from '../world/entity-table.ts';
import { scanProgramTable, SELECTION_KINDS, type LoadedTableProgram, type SelectableRecord, type SelectionSubject } from './ai-support.ts';
import type { RandSource } from './original-random.ts';
import { steeringLimits } from './steering.ts';

const fault = (site: string): CoreFaultError => new CoreFaultError('invariant-violated', `ai-selection.${site}`);

/** Whether `0x20990` selects a program for an object of `kindBit` (ai §1): the kinds of SELECTION_KINDS. */
export function selectsProgram(kindBit: number): boolean {
  return kindBit < 32 && ((SELECTION_KINDS >>> kindBit) & 1) === 1;
}

/** The values the selection reads of `entity`: its kind, runtime +0xDC (`aiValueA`) and +0xE0 (`aiValueB`). */
export function selectionSubject({ kindBit, ruleInputs }: Entity): SelectionSubject {
  return { kindBit, dc: ruleInputs.aiValueA, e0: ruleInputs.aiValueB };
}

/** One table's scan of `0x5de18` from a drawn start, rand mod count; null when nothing matches even partially. */
function scanFrom(records: readonly SelectableRecord[], subject: SelectionSubject, rand: RandSource): number | null {
  // An empty table divides by zero (#DE); world creation rejects that for every object that selects (CR-15).
  if (records.length === 0) throw fault('empty-table');
  const { full, partial } = scanProgramTable(records, rand.next() % records.length, subject);
  return full ?? partial;
}

/**
 * `0x5dbc8` for `subject`: none and no draw for a kind outside the selection; otherwise one draw for the group table
 * (TABL 6003 after the load transforms), whose full match, else last partial match, is the result; only when it gives
 * neither, a second draw for the built-in table, likewise; none when that matches nothing either.
 */
export function selectProgram(
  subject: SelectionSubject, tablePrograms: readonly LoadedTableProgram[], builtInPrograms: readonly BuiltInProgram[], rand: RandSource,
): AiProgramSlot {
  if (!selectsProgram(subject.kindBit)) return NO_AI_PROGRAM;
  const table = scanFrom(tablePrograms, subject, rand);
  if (table !== null) return { type: 'table', record: table, controller: null };
  const builtIn = scanFrom(builtInPrograms, subject, rand);
  return builtIn === null ? NO_AI_PROGRAM : { type: 'built-in', record: builtIn, controller: null };
}

/** The record fields `0x5dc0c` reads: the period +0x14, the limits +0x24, +0x28, +0x2C and the threshold +0x30. */
export type ControllerRecord = Pick<BuiltInProgram, 'at14' | 'at24' | 'at28' | 'at2C' | 'at30'>;

/** `0x5c530`'s size class. */
const INSTALL_SIZE_CLASS = 2;

/**
 * The controller `0x5dc0c` installs for `record` (a table record after the load transforms) on a craft of `craft`,
 * before its handler's mode 0: the cleared 0x16C bytes; the period (+0x14, a non-negative i32: CR-15); the limits a =
 * F(D(D(+0x24 × π′) × 1/180′)), b likewise from +0x28, the saturation and roll-match threshold bit copies of +0x2C and
 * +0x30; the AI lock off; the steering block as `0x5c530` leaves it: size class 2, lead mode 0, approach radius 0 and
 * `0x5c768`(1.0, 1.0, 0): both fractions 1, roll matching off, the speed limit F(+0xB8 × 1), its half F(D(that) × 0.5)
 * and the turn rates F(+0xAC × 1), F(+0xB4 × 1), F(+0xB0 × 1). Draws nothing.
 */
export function installedController(record: ControllerRecord, craft: CraftRecord): AiControllerCommon {
  if (!Number.isSafeInteger(record.at14) || record.at14 < 0 || record.at14 > 0x7fff_ffff) throw fault('period');
  const { upper: turn, high: saturation } = steeringLimits(record);
  const { upper: speed } = steeringLimits({ ...record, at24: record.at28 });
  const common = clearedControllerCommon();
  return {
    ...common,
    period: record.at14,
    limits: { turn, speed, saturation, rollMatchThreshold: Math.fround(record.at30) },
    aiLock: false,
    steering: {
      ...common.steering,
      sizeClass: INSTALL_SIZE_CLASS,
      leadMode: 0,
      approachRadius: 0,
      // 0x5c768(1.0, 1.0, 0): each product with a fraction of 1 is the f32 craft field itself.
      speedFraction: 1,
      turnFraction: 1,
      rollMatch: false,
      speedLimit: craft.atB8,
      halfSpeedLimit: Math.fround(craft.atB8 * 0.5),
      turnRates: Object.freeze([craft.atAC, craft.atB4, craft.atB0] as const),
    },
  };
}

/** The AI step's schedule (`0x5dcd4`): the handler runs when the sample is past the deadline (unsigned, strict). */
export function isControllerDue({ nextUpdateClock }: Pick<AiControllerCommon, 'nextUpdateClock'>, clock: number): boolean {
  return isDue(clock, nextUpdateClock);
}
