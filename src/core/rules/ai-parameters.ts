/**
 * Creation-time checks of AI script arguments (docs/plan/p3/02/spec.md, CR-15 and CR-26; docs/original/formats/ai.md
 * §5.3, §12). For every item of a script the run can execute, the argument is checked without drawing: its class's
 * syntax, the keyword lookup and ranges. The result is the item's parse plan, the part of the parse that needs no draw:
 * fixed values, range bounds and sign permissions. The draws of the actual parse happen at run time when a script is
 * loaded (P3-08/16), in the order the plan's terms give.
 *
 * Numbers are held to a grammar the original's `atoi`/`strtod` read completely and exactly, so the run never needs
 * their tolerance for trailing text, wrap-around or stale bytes (ai §5.3): an integer is an optional sign and decimal
 * digits within i32; a float an optional sign, digits with at most one `.` and an optional exponent (e, E, d or D),
 * with at most 15 significant digits and a decimal exponent of at most 22 in magnitude once the fraction is counted,
 * which makes the original's single exact scaling the correctly rounded value. Every failure is a CoreInputError at the
 * item's argument with one of CR-15's stable reasons; no error repeats the text. A negative wait (opcodes 1000–1003)
 * is accepted: it acts as 0 at run time (docs/plan/p3/02/spec.md, CR-24 decision 16).
 */
import { AI_KEYWORD_TABLE_BY_OPCODE, foldKeywordName, type KeywordTables } from '../../content/rule-data/ai-programs.ts';
import type { ByteString } from '../../content/rule-data/rule-data-fields.ts';
import { CoreInputError } from '../errors.ts';

/** How `0x5eb64` parses an argument, for the opcodes Core supports (ai §5, CR-15). */
export type ArgumentClass = 'none' | 'integer' | 'float' | 'degrees' | 'boolean' | 'keyword' | 'optional-floats' | 'floats';

/** The 25 opcodes Core supports (CR-15; ai §10.2) and their argument classes (ai §5). */
export const SUPPORTED_OPCODES: ReadonlyMap<number, ArgumentClass> = new Map([
  [100, 'optional-floats'], [104, 'float'], [106, 'none'], [107, 'none'], [111, 'floats'], [200, 'boolean'], [210, 'float'],
  [211, 'float'], [222, 'boolean'], [231, 'keyword'], [232, 'boolean'], [240, 'integer'], [300, 'keyword'], [301, 'keyword'],
  [400, 'integer'], [401, 'integer'], [402, 'integer'], [1000, 'integer'], [1001, 'degrees'], [1002, 'degrees'], [1003, 'degrees'],
  [1101, 'boolean'], [9500, 'none'], [9999, 'integer'], [10000, 'integer'],
]);

/** An i32 term: a fixed value, or `[lo hi sign]` drawn at load (ai §5.3). */
export type IntegerTerm =
  | { readonly type: 'value'; readonly value: number }
  /** lo + rand % (hi − lo + 1) in i32 (never a zero divisor); when `signed`, a second draw negates it when (rand & 2) ≠ 0. */
  | { readonly type: 'range'; readonly lo: number; readonly hi: number; readonly signed: boolean };

/** A float term: a fixed f32, or `[lo hi sign]` with f64 bounds drawn at load (ai §5.3). */
export type FloatTerm =
  | { readonly type: 'value'; readonly value: number }
  /** F(D(lo + D(D(r × c) × D(hi − lo)))); when `signed`, a second draw flips the f32 sign bit when (rand & 2) ≠ 0. */
  | { readonly type: 'range'; readonly lo: number; readonly hi: number; readonly signed: boolean };

/**
 * An item's parse plan: what its argument becomes (world-state.ts, ParsedArgument) apart from the draws. Boolean and
 * keyword arguments are fixed integers; an integer argument without text is 0 and a float one 0.0.
 */
export type ArgumentPlan =
  | { readonly type: 'none' }
  | { readonly type: 'integer'; readonly term: IntegerTerm }
  /**
   * `degrees`: opcodes 1001–1003, whose parsed f32 v becomes F(D(D(v × 3.1415927) × 0.005555555555555555)) (ai §5.3). A
   * fixed value already holds the scaled slot; a range's bounds are the float parser's, scaled after the draw.
   */
  | { readonly type: 'float'; readonly term: FloatTerm; readonly degrees: boolean }
  /** Opcode 100: four terms, null for an absent one (a token starting with x or X). */
  | { readonly type: 'optional-floats'; readonly terms: readonly [FloatTerm | null, FloatTerm | null, FloatTerm | null, FloatTerm | null] }
  /** Opcode 111: three terms. */
  | { readonly type: 'floats'; readonly terms: readonly [FloatTerm, FloatTerm, FloatTerm] };

/** The degree scaling of opcodes 1001–1003 at parse time (ai §5.3; the constants of executable.md H5). */
export const degreeSlot = (value: number): number => Math.fround((value * 3.1415927) * 0.005555555555555555);

const INTEGER = /^[+-]?\d+$/;
const FLOAT = /^[+-]?(\d*)(?:\.(\d*))?(?:[eEdD]([+-]?\d+))?$/;
/** Tokens of the multi-value tokenizer `0x60924` stop at 32 characters; the range tokenizer `0x609e8` at 0x30. */
const TOKEN_LIMIT = 32;
const RANGE_TOKEN_LIMIT = 0x30;
const MAX_SIGNIFICANT_DIGITS = 15;
const MAX_EXACT_EXPONENT = 22;

type Reason = 'missing-argument' | 'invalid-boolean' | 'unknown-keyword' | 'unterminated-range' | 'invalid-number' | 'zero-range';

/** A failure of one item's argument, raised as a CoreInputError at its path by planArgument. */
class ArgumentFailure {
  readonly reason: Reason;

  constructor(reason: Reason) {
    this.reason = reason;
  }
}

const fail = (reason: Reason): never => {
  throw new ArgumentFailure(reason);
};

const skipSpaces = (text: string): string => text.replace(/^ +/, '');

function readInteger(text: string): number {
  if (!INTEGER.test(text)) return fail('invalid-number');
  const value = Number(text);
  return value >= -0x8000_0000 && value <= 0x7fff_ffff ? value + 0 : fail('invalid-number');
}

/** `strtod` on a complete number within the exact domain (see the module comment), as an f64. */
function readFloat(text: string): number {
  const match = FLOAT.exec(text);
  if (match === null) return fail('invalid-number');
  const [, whole, fraction = '', exponent = '0'] = match;
  const digits = `${whole}${fraction}`;
  if (digits.length === 0) return fail('invalid-number');
  const significant = digits.replace(/^0+/, '');
  const scale = Number(exponent) - fraction.length;
  if (significant.length > MAX_SIGNIFICANT_DIGITS || Math.abs(scale) > MAX_EXACT_EXPONENT) return fail('invalid-number');
  return Number(`${text[0] === '-' ? '-' : ''}${digits}e${scale}`);
}

/** The three tokens of `[lo hi sign]`, which must be the whole of `text`; the sign token may be empty. */
function rangeTokens(text: string): { readonly lo: string; readonly hi: string; readonly signed: boolean } {
  const close = text.indexOf(']');
  if (close < 0) return fail('unterminated-range');
  const inner = text.slice(1, close);
  if (close !== text.length - 1 || inner.includes('[')) return fail('invalid-number');
  const tokens = inner.split(' ').filter((token) => token !== '');
  if (tokens.length < 2 || tokens.length > 3 || tokens.some((token) => token.length > RANGE_TOKEN_LIMIT)) return fail('invalid-number');
  const [lo, hi, sign = ''] = tokens;
  if (sign !== '' && sign[0] !== '+' && sign[0] !== '-') return fail('invalid-number');
  return { lo, hi, signed: sign[0] === '-' || sign[1] === '-' };
}

function integerTerm(text: string): IntegerTerm {
  const body = skipSpaces(text);
  if (body[0] !== '[') return { type: 'value', value: readInteger(body) };
  const tokens = rangeTokens(body);
  const lo = readInteger(tokens.lo);
  const hi = readInteger(tokens.hi);
  if ((hi - lo + 1) % 2 ** 32 === 0) return fail('zero-range');
  return { type: 'range', lo, hi, signed: tokens.signed };
}

/** A float term of `text`, a whole argument or a multi-value token. */
function floatTerm(text: string): FloatTerm {
  if (text[0] === '[') {
    const tokens = rangeTokens(text);
    return { type: 'range', lo: readFloat(tokens.lo), hi: readFloat(tokens.hi), signed: tokens.signed };
  }
  const body = skipSpaces(text);
  // Whether the float parser skips spaces before a `[` is not recorded; such a text is rejected rather than guessed.
  if (body[0] === '[') return fail('invalid-number');
  return { type: 'value', value: Math.fround(body === '' && text === '' ? 0 : readFloat(body)) };
}

/** The tokens of a multi-value argument as `0x60924` splits it (ai §5.3), exactly `count` of them. */
function multiValueTokens(text: string, count: number): string[] {
  const tokens: string[] = [];
  let at = 0;
  const delimiter = (character: string | undefined) => character === ' ' || character === ',';
  for (let index = 0; index < count; index++) {
    while (text[at] === ' ') at++;
    let depth = 0;
    let token = '';
    while (at < text.length && (depth > 0 || !delimiter(text[at]))) {
      if (text[at] === '[') depth++;
      if (text[at] === ']') depth--;
      // A longer token would be split mid-token.
      if (depth < 0 || token.length >= TOKEN_LIMIT) return fail('invalid-number');
      token += text[at++];
    }
    while (delimiter(text[at])) at++;
    tokens.push(token.replace(/ +$/, ''));
  }
  // Text the tokens leave unread would be ignored by the original.
  return at < text.length ? fail('invalid-number') : tokens;
}

function booleanValue(text: string): number {
  const first = skipSpaces(text)[0];
  if (first !== undefined && 'NFnf'.includes(first)) return 0;
  return first !== undefined && 'YTyt'.includes(first) ? 1 : fail('invalid-boolean');
}

/** The keyword lookup `0x60894`: trailing spaces removed, A–Z folded, the first equal name's value (CR-26). */
function keywordValue(text: string, opcode: number, tables: KeywordTables): number {
  const folded = foldKeywordName(text.replace(/ +$/, ''));
  const entry = tables[AI_KEYWORD_TABLE_BY_OPCODE.get(opcode) as number].find(({ name }) => foldKeywordName(name) === folded);
  return entry === undefined ? fail('unknown-keyword') : entry.value;
}

function plan(opcode: number, argumentClass: ArgumentClass, argument: ByteString | null, tables: KeywordTables): ArgumentPlan {
  switch (argumentClass) {
    case 'none':
      return { type: 'none' };
    case 'integer':
      return { type: 'integer', term: argument === null ? { type: 'value', value: 0 } : integerTerm(argument) };
    case 'float':
    case 'degrees': {
      const term: FloatTerm = argument === null ? { type: 'value', value: 0 } : floatTerm(argument);
      const degrees = argumentClass === 'degrees';
      return { type: 'float', term: degrees && term.type === 'value' ? { type: 'value', value: degreeSlot(term.value) } : term, degrees };
    }
    default:
      break;
  }
  if (argument === null) return fail('missing-argument');
  switch (argumentClass) {
    case 'boolean':
      return { type: 'integer', term: { type: 'value', value: booleanValue(argument) } };
    case 'keyword':
      return { type: 'integer', term: { type: 'value', value: keywordValue(argument, opcode, tables) } };
    case 'optional-floats': {
      const [a, b, c, d] = multiValueTokens(argument, 4).map((token) => (token[0] === 'x' || token[0] === 'X' ? null : floatTerm(token)));
      return { type: 'optional-floats', terms: [a, b, c, d] };
    }
    default: {
      const [a, b, c] = multiValueTokens(argument, 3).map(floatTerm);
      return { type: 'floats', terms: [a, b, c] };
    }
  }
}

const freeze = (value: ArgumentPlan): ArgumentPlan => {
  if (value.type === 'integer' || value.type === 'float') Object.freeze(value.term);
  if (value.type === 'optional-floats' || value.type === 'floats') {
    value.terms.forEach((term) => term !== null && Object.freeze(term));
    Object.freeze(value.terms);
  }
  return Object.freeze(value);
};

/**
 * The parse plan of the script item at `path` with `opcode` and `argument` (its stored text, or null), checked as
 * CR-15 requires; throws CoreInputError at the item's `opcode` or `argument` otherwise. Draws nothing.
 */
export function planArgument(opcode: number, argument: ByteString | null, tables: KeywordTables, path: string): ArgumentPlan {
  const argumentClass = SUPPORTED_OPCODES.get(opcode);
  if (argumentClass === undefined) throw new CoreInputError(`${path}.opcode`, 'unsupported-opcode');
  try {
    return freeze(plan(opcode, argumentClass, argument, tables));
  } catch (error) {
    if (error instanceof ArgumentFailure) throw new CoreInputError(`${path}.argument`, error.reason);
    throw error;
  }
}
