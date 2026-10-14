/**
 * The command editor of the development diagnostics (docs/plan/p3/04/spec.md: 开发诊断, 命令提交): a draft of any of
 * Core's command variants, with a form description of each variant's fields. A draft becomes a command only through
 * the public `readTickInput` rules, so an invalid field is refused before anything is submitted; the caller then submits
 * the validated command through the normal run handle (the command feedback), never past the Runtime's queue.
 */
import { readTickInput, type Command, type CommandType } from '../../core/contracts/tick-input.ts';
import { CoreInputError } from '../../core/errors.ts';

type Variant<Type extends CommandType> = Extract<Command, { readonly type: Type }>;
type FieldName<Type extends CommandType> = Exclude<keyof Variant<Type>, 'type'>;

/** Input hints only: Core's rules decide what is valid. */
interface NumberSpec {
  readonly kind: 'number';
  readonly min: number;
  readonly max: number;
  readonly integer: boolean;
}

/** Every choice of the field: the type rejects a missing one, and Core's rules (in the tests) an unknown one. */
interface ChoiceSpec<Value extends string> {
  readonly kind: 'choice';
  readonly options: Readonly<Record<Value, true>>;
}

type FieldSpec<Value> = [Value] extends [string] ? ChoiceSpec<Value> : NumberSpec;
type FormOf<Type extends CommandType> = { readonly [Field in FieldName<Type>]: FieldSpec<Variant<Type>[Field]> };

const choice = <const Options extends readonly string[]>(...options: Options) =>
  ({ kind: 'choice', options: Object.fromEntries(options.map((option) => [option, true])) }) as ChoiceSpec<Options[number]>;
const FRACTION: NumberSpec = { kind: 'number', min: 0, max: 1, integer: false };
const DIGIT: NumberSpec = { kind: 'number', min: 1, max: 9, integer: true };
const PREVIOUS_NEXT = choice('previous', 'next');

/** One entry per command variant with its fields in canonical order; the type requires every variant and field. */
const FORMS: { readonly [Type in CommandType]: FormOf<Type> } = {
  fire: { channel: choice('primary', 'secondary') },
  speed: { operation: choice('increase', 'decrease', 'zero', 'maximum', 'match-target', 'toggle-auto-match') },
  'speed-preset': { level: DIGIT },
  'select-number': { value: DIGIT },
  'navigate-selection': { direction: PREVIOUS_NEXT },
  'confirm-selection': {},
  target: { operation: choice('enemy', 'friendly', 'next', 'previous', 'forward') },
  'cycle-main-weapon': {},
  'select-missile': { direction: PREVIOUS_NEXT },
  'toggle-map': {},
  'map-point': { operation: choice('hover', 'select'), right: FRACTION, down: FRACTION },
  'request-warp': {},
  communications: { operation: choice('open', 'close') },
  launch: {},
  energy: { operation: choice('open', 'shield-increase', 'shield-decrease', 'gun-increase', 'gun-decrease') },
  'damage-report': {},
  'cockpit-front': {},
};

export type CommandFieldForm =
  | { readonly name: string; readonly kind: 'choice'; readonly options: readonly string[] }
  | { readonly name: string; readonly kind: 'number'; readonly min: number; readonly max: number; readonly integer: boolean };

/** Each variant's fields as form controls, in canonical order. */
export const COMMAND_FORMS: Readonly<Record<CommandType, readonly CommandFieldForm[]>> = Object.freeze(Object.fromEntries(
  Object.entries(FORMS).map(([type, fields]) => [type, Object.freeze(Object.entries(fields as Record<string, NumberSpec | ChoiceSpec<string>>)
    .map(([name, spec]): CommandFieldForm => Object.freeze(spec.kind === 'choice'
      ? { name, kind: 'choice', options: Object.freeze(Object.keys(spec.options)) }
      : { name, ...spec })))]),
) as Record<CommandType, readonly CommandFieldForm[]>);

/** What the editor holds: the variant and each field's text as entered. */
export interface CommandDraft {
  readonly type: CommandType;
  readonly values: Readonly<Record<string, string>>;
}

export type DraftReading =
  | { readonly valid: true; readonly command: Command }
  /** `field` is null when the refusal is not about one field. */
  | { readonly valid: false; readonly field: string | null; readonly reason: string };

/** A draft of `type` with each field at its first choice or its minimum. */
export function commandDraft(type: CommandType): CommandDraft {
  const values = Object.fromEntries((COMMAND_FORMS[type] ?? []).map((field) => [field.name, field.kind === 'choice' ? field.options[0] : String(field.min)]));
  return Object.freeze({ type, values: Object.freeze(values) });
}

/** The draft with `field` set to `text`. */
export function editDraft(draft: CommandDraft, field: string, text: string): CommandDraft {
  return Object.freeze({ type: draft.type, values: Object.freeze({ ...draft.values, [field]: text }) });
}

const DECIMAL = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
const COMMAND_PATH = 'tickInput.commands[0]';

/** Decimal text as a number; anything else stays text, which Core refuses with its own rule. */
function numberOf(text: string): number | string {
  const trimmed = text.trim();
  return DECIMAL.test(trimmed) ? Number(trimmed) : text;
}

/** Validates the draft as Core reads one command of a tick; the command is Core's frozen canonical copy. */
export function readDraft(draft: CommandDraft): DraftReading {
  const forms: readonly CommandFieldForm[] = Object.hasOwn(COMMAND_FORMS, draft.type) ? COMMAND_FORMS[draft.type] : [];
  const candidate: Record<string, unknown> = { type: draft.type };
  for (const field of forms) {
    const text = Object.hasOwn(draft.values, field.name) ? draft.values[field.name] : '';
    candidate[field.name] = field.kind === 'number' ? numberOf(text) : text;
  }
  try {
    const { commands } = readTickInput({ axes: { pitch: 0, yaw: 0, roll: 0 }, commands: [candidate] });
    return Object.freeze({ valid: true, command: commands[0] });
  } catch (error) {
    if (!(error instanceof CoreInputError)) throw error;
    const field = error.path.startsWith(`${COMMAND_PATH}.`) ? error.path.slice(COMMAND_PATH.length + 1) : null;
    return Object.freeze({ valid: false, field, reason: error.reason });
  }
}
