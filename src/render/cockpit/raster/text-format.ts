// The closed printf subset of the cockpit texts (P3-13 spec, 文字与格式化 and DC-08; docs/original/formats/hud.md §4.1).
// The original formats with a Watcom-style `__prtf`: ordinary bytes are copied, `%%` gives one `%`, `%s` copies the
// argument's bytes, `%d` is decimal with a leading `-` (`0x74b67`), and `%.0f` prints the sign and the absolute value
// rounded half to even (`0xa4a50`). Only these four conversions are used by the slice's formats; any other `%`
// sequence, including widths such as `%15s`, is an error rather than an approximation. Texts are byte strings: one
// character code 1–255 per byte. The caller turns a `TextFormatError` into its own content contract error.

/** The conversions the cockpit's formats may contain, in the HUD text payload's spelling. */
export const TEXT_FORMAT_CONVERSIONS = Object.freeze(['%d', '%.0f', '%s', '%%'] as const);

export type TextFormatConversion = (typeof TEXT_FORMAT_CONVERSIONS)[number];

/** `%d` takes an i32 integer, `%.0f` a finite number below 10¹⁶ in magnitude, `%s` a byte string. */
export type TextFormatArgument = number | string;

export type TextFormatErrorCode = 'unknown-conversion' | 'invalid-byte' | 'argument-count' | 'argument-type' | 'argument-range' | 'result-too-long';

export class TextFormatError extends Error {
  readonly code: TextFormatErrorCode;
  readonly path: string;

  constructor(code: TextFormatErrorCode, path: string, reason: string) {
    super(`${path} ${reason}`);
    this.name = 'TextFormatError';
    this.code = code;
    this.path = path;
  }
}

/**
 * Magnitude bound of `%.0f`: the original estimates at most 16 decimal digits and takes another path beyond them, so
 * larger values are rejected instead of formatted differently.
 */
const FLOAT_LIMIT = 1e16;
const I32 = Object.freeze({ min: -0x8000_0000, max: 0x7fff_ffff });

const isByteString = (text: string): boolean => {
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (code < 1 || code > 255) return false;
  }
  return true;
};

/** Splits a format into literal byte runs and conversions, in order. */
function parse(format: string, path: string): (string | { readonly conversion: TextFormatConversion })[] {
  if (!isByteString(format)) throw new TextFormatError('invalid-byte', path, 'must hold only byte values 1 to 255');
  const parts: (string | { readonly conversion: TextFormatConversion })[] = [];
  let literal = '';
  for (let index = 0; index < format.length; index++) {
    if (format[index] !== '%') {
      literal += format[index];
      continue;
    }
    const conversion = TEXT_FORMAT_CONVERSIONS.find(candidate => format.startsWith(candidate, index));
    if (conversion === undefined) throw new TextFormatError('unknown-conversion', `${path}[${index}]`, 'must start %d, %.0f, %s or %%');
    if (literal) parts.push(literal);
    literal = '';
    parts.push({ conversion });
    index += conversion.length - 1;
  }
  if (literal) parts.push(literal);
  return parts;
}

/** The conversions of `format` in order (`%%` included); any other `%` sequence is `unknown-conversion`. */
export function textFormatConversions(format: string, path = 'format'): readonly TextFormatConversion[] {
  return Object.freeze(parse(format, path).flatMap(part => typeof part === 'string' ? [] : [part.conversion]));
}

/** `%.0f`: the sign (taken from the sign bit, so −0 and negatives that round to 0 print `-`), then |value| rounded half to even. */
function fixed0(value: number): string {
  const magnitude = Math.abs(value);
  const floor = Math.floor(magnitude);
  const fraction = magnitude - floor;
  const rounded = fraction > 0.5 || (fraction === 0.5 && floor % 2 === 1) ? floor + 1 : floor;
  return `${value < 0 || Object.is(value, -0) ? '-' : ''}${BigInt(rounded)}`;
}

function convert(conversion: Exclude<TextFormatConversion, '%%'>, argument: TextFormatArgument, path: string): string {
  if (conversion === '%s') {
    if (typeof argument !== 'string') throw new TextFormatError('argument-type', path, 'must be a byte string for %s');
    if (!isByteString(argument)) throw new TextFormatError('invalid-byte', path, 'must hold only byte values 1 to 255');
    return argument;
  }
  if (typeof argument !== 'number') throw new TextFormatError('argument-type', path, `must be a number for ${conversion}`);
  if (conversion === '%d') {
    if (!Number.isInteger(argument) || argument < I32.min || argument > I32.max) {
      throw new TextFormatError('argument-range', path, 'must be an i32 integer for %d');
    }
    return String(argument);
  }
  if (!Number.isFinite(argument) || Math.abs(argument) >= FLOAT_LIMIT) {
    throw new TextFormatError('argument-range', path, 'must be finite and below 1e16 in magnitude for %.0f');
  }
  return fixed0(argument);
}

/**
 * Formats `format` with exactly one argument per conversion other than `%%`, in order, and returns the byte string.
 * A result longer than `maxBytes` (for DIAG 79, the original's 80-byte buffer less its NUL) is `result-too-long`.
 */
export function formatText(format: string, args: readonly TextFormatArgument[], maxBytes: number, path = 'format'): string {
  if (!Number.isInteger(maxBytes) || maxBytes < 0) throw new RangeError('maxBytes must be a non-negative integer');
  let result = '';
  let used = 0;
  for (const part of parse(format, path)) {
    if (typeof part === 'string') result += part;
    else if (part.conversion === '%%') result += '%';
    else {
      if (used === args.length) throw new TextFormatError('argument-count', `${path}.args`, 'must hold one argument per conversion');
      result += convert(part.conversion, args[used], `${path}.args[${used}]`);
      used++;
    }
  }
  if (used !== args.length) throw new TextFormatError('argument-count', `${path}.args`, 'must hold one argument per conversion');
  if (result.length > maxBytes) throw new TextFormatError('result-too-long', path, `must format to at most ${maxBytes} bytes`);
  return result;
}
