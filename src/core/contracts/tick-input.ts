/**
 * Device-independent tick input of formal Core (docs/plan/p3/02/spec.md, 输入与命令; ADR-0004, ADR-0006): continuous
 * steering axes and the ordered game-action commands of one tick. No DOS scan codes, key names or KeyboardEvents; the
 * pending command queue belongs to the Runtime, and Core keeps no command or key buffer between ticks. This module
 * owns the shapes and their validation; the rule tasks named in the spec own each command's effect.
 */
import { CoreInputError } from '../errors.ts';
import { CORE_LIMITS } from './limits.ts';
import { integerIn, numberIn, readChoice, readDataRecord, readExactRecord, readList, readNumber, requireExactFields, type NumberRule } from './validation.ts';

type FieldReader<Value> = (value: unknown, path: string) => Value;

const choice = <const Choice extends string>(...choices: Choice[]): FieldReader<Choice> => (value, path) => readChoice(value, path, choices);
const number = (rule: NumberRule): FieldReader<number> => (value, path) => readNumber(value, path, rule);
/** Normalised main-map position: 0 at the left or top edge, 1 at the right or bottom edge. */
const MAP_FRACTION = number(numberIn(0, 1));

/**
 * The closed command union, one entry per variant with readers for its own fields in canonical order. The Command
 * type is derived from it, so a variant cannot accept a field this table does not list.
 */
const COMMAND_FIELDS = {
  /** P3-07: one fire request for this tick; a held trigger yields one per sampled tick. */
  fire: { channel: choice('primary', 'secondary') },
  /** P3-06. */
  speed: { operation: choice('increase', 'decrease', 'zero', 'maximum', 'match-target', 'toggle-auto-match') },
  /** Interpreted by the current context: menu item, base choice, speed setting, … */
  'select-number': { value: number(integerIn(1, 9)) },
  'navigate-selection': { direction: choice('previous', 'next') },
  'confirm-selection': {},
  /** P3-07. */
  target: { operation: choice('enemy', 'friendly', 'next', 'previous', 'forward') },
  'cycle-main-weapon': {},
  'select-missile': { direction: choice('previous', 'next') },
  /** P3-09. */
  'toggle-map': {},
  /** P3-09: Core maps the point through the logical map frame; the input carries no world destination or pixels. */
  'map-point': { operation: choice('hover', 'select'), right: MAP_FRACTION, down: MAP_FRACTION },
  'request-warp': {},
  /** P3-10: base and wingman requests go through the open menu's select-number and confirm-selection. */
  communications: { operation: choice('open', 'close') },
  launch: {},
  /** P3-07. */
  energy: { operation: choice('open', 'shield-increase', 'shield-decrease', 'gun-increase', 'gun-decrease') },
  'damage-report': {},
  /** Consumed by P3-12/P3-13; whether it may leave an automatic view is the owning rule's gate. */
  'cockpit-front': {},
} as const satisfies Readonly<Record<string, Readonly<Record<string, FieldReader<unknown>>>>>;

type CommandFieldReaders = typeof COMMAND_FIELDS;
export type CommandType = keyof CommandFieldReaders;

type CommandOf<Type extends CommandType> = { readonly type: Type } & {
  readonly [Field in keyof CommandFieldReaders[Type]]: CommandFieldReaders[Type][Field] extends FieldReader<infer Value> ? Value : never;
};

/** One game action, a closed discriminated union; each variant has only its own fields. */
export type Command = { [Type in CommandType]: CommandOf<Type> }[CommandType];

export const COMMAND_TYPES: readonly CommandType[] = Object.freeze(Object.keys(COMMAND_FIELDS) as CommandType[]);

/** Every axis is a finite number in [-1, 1]; an unsupported direct control stays 0. */
export interface TickAxes {
  /** Positive raises the nose. */
  readonly pitch: number;
  /** Positive turns the nose right. */
  readonly yaw: number;
  /** Positive rolls clockwise as the pilot looks forward. */
  readonly roll: number;
}

export interface TickInput {
  readonly axes: TickAxes;
  /** Processed once each, in array order, in this tick. */
  readonly commands: readonly Command[];
}

const AXIS = numberIn(-1, 1);
/** Each variant's readers as entries in canonical order, and its exact field list including `type`. */
const COMMAND_SHAPES = new Map(Object.entries(COMMAND_FIELDS).map(([type, readers]) => {
  const entries: readonly (readonly [string, FieldReader<unknown>])[] = Object.entries(readers);
  return [type, { entries, fields: ['type', ...entries.map(([field]) => field)] }] as const;
}));
const MAX_COMMAND_FIELDS = Math.max(...[...COMMAND_SHAPES.values()].map(({ fields }) => fields.length));

function readAxes(value: unknown, path: string): TickAxes {
  const { pitch, yaw, roll } = readExactRecord(value, path, ['pitch', 'yaw', 'roll']);
  return Object.freeze({
    pitch: readNumber(pitch, `${path}.pitch`, AXIS),
    yaw: readNumber(yaw, `${path}.yaw`, AXIS),
    roll: readNumber(roll, `${path}.roll`, AXIS),
  });
}

function readCommand(value: unknown, path: string): Command {
  // One pass reads every field, so the type that selects the variant is the type that is kept.
  const record = readDataRecord(value, path, MAX_COMMAND_FIELDS);
  const { type } = record;
  if (!Object.hasOwn(record, 'type')) throw new CoreInputError(`${path}.type`, 'is required');
  const shape = typeof type === 'string' ? COMMAND_SHAPES.get(type) : undefined;
  if (!shape) throw new CoreInputError(`${path}.type`, 'must be a known command type');
  requireExactFields(record, path, shape.fields);
  const command: Record<string, unknown> = { type };
  for (const [field, read] of shape.entries) command[field] = read(record[field], `${path}.${field}`);
  return Object.freeze(command) as Command;
}

/**
 * Reads, validates and copies a whole tick input before anything else happens. Every value of the caller's objects
 * is read exactly once: through its property descriptor, or with [[Get]] for an array's length. The result is deeply
 * frozen, detached from the caller, has fields in canonical order and turns -0 into 0, so equal actions give equal
 * records. Throws CoreInputError at a `tickInput…` path for a missing or extra field, a non-finite or out-of-range
 * number, a wrong type, a sparse command list, an unknown command type, or more than CORE_LIMITS.commandsPerTick
 * commands (checked before any command is read).
 */
export function readTickInput(value: unknown): TickInput {
  const { axes, commands } = readExactRecord(value, 'tickInput', ['axes', 'commands']);
  return Object.freeze({
    axes: readAxes(axes, 'tickInput.axes'),
    commands: readList(commands, 'tickInput.commands', CORE_LIMITS.commandsPerTick, readCommand),
  });
}
