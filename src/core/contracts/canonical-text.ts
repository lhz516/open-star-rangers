/**
 * Canonical text and state hash of formal Core (docs/plan/p3/02/spec.md, 快照、哈希与 replay): compact JSON in which
 * every object lists its members in an explicit order, so a plain object's key insertion order never reaches the text.
 * -0 is written as 0, non-finite numbers are rejected, and every non-ASCII code unit is escaped as \uXXXX, so the text
 * is ASCII and fnv1a64 accepts it. Writing stops with an error as soon as the text would exceed
 * CORE_LIMITS.canonicalTextLength. The hash is only a same-version, same-runtime consistency check.
 */
import { fnv1a64 } from '../determinism/fnv1a64.ts';
import { CoreInputError } from '../errors.ts';
import { CORE_LIMITS } from './limits.ts';

const MEMBERS: unique symbol = Symbol('canonical object members');

export type CanonicalValue = null | boolean | number | string | readonly CanonicalValue[] | CanonicalObject;
export type CanonicalMember = readonly [name: string, value: CanonicalValue];

/** An object written with its members in the listed order; built only by canonicalObject. */
export interface CanonicalObject {
  readonly [MEMBERS]: readonly CanonicalMember[];
}

/** Lists an object's members in their canonical order; names must be unique. Nested arrays are read when written. */
export function canonicalObject(members: readonly CanonicalMember[]): CanonicalObject {
  return Object.freeze({ [MEMBERS]: Object.freeze(members.map(([name, value]) => Object.freeze([name, value] as const))) });
}

function isCanonicalObject(value: object): value is CanonicalObject {
  return Object.hasOwn(value, MEMBERS);
}

const NON_ASCII = /[\u0080-\uffff]/g;
const escapeCodeUnit = (unit: string): string => `\\u${unit.charCodeAt(0).toString(16).padStart(4, '0')}`;
const SHORT_ESCAPES = new Set(['"', '\\', '\b', '\f', '\n', '\r', '\t'].map((character) => character.charCodeAt(0)));

/**
 * The exact length of a string as written, computed without allocating it: JSON.stringify writes `"`, `\` and the
 * five short control escapes as 2 characters and every other control character as \u00XX; every code unit from
 * 0x80, including both halves of a surrogate pair, becomes \uXXXX.
 */
function writtenLength(text: string): number {
  let length = 2;
  for (let index = 0; index < text.length; index++) {
    const unit = text.charCodeAt(index);
    if (SHORT_ESCAPES.has(unit)) length += 2;
    else if (unit < 0x20 || unit > 0x7f) length += 6;
    else length += 1;
  }
  return length;
}

/**
 * Writes `value` as canonical text. Throws CoreInputError at a path under `path` for a non-finite number, a value
 * that is not a CanonicalValue (a plain object, undefined, an array hole, …), a duplicate member name, or text longer
 * than CORE_LIMITS.canonicalTextLength. The caller decides whether that is its caller's error or a Core fault.
 */
export function canonicalText(value: CanonicalValue, path = 'value'): string {
  const limit = CORE_LIMITS.canonicalTextLength;
  const parts: string[] = [];
  let length = 0;
  const append = (text: string, at: string): void => {
    length += text.length;
    if (length > limit) throw new CoreInputError(at, `makes the canonical text longer than ${limit} characters`);
    parts.push(text);
  };
  const writeString = (text: string, at: string): void => {
    // The written length is known exactly before anything is allocated, so an oversized string is never copied.
    if (writtenLength(text) > limit - length) throw new CoreInputError(at, `makes the canonical text longer than ${limit} characters`);
    append(JSON.stringify(text).replace(NON_ASCII, escapeCodeUnit), at);
  };
  const write = (item: unknown, at: string): void => {
    if (item === null || typeof item === 'boolean') {
      append(String(item), at);
    } else if (typeof item === 'number') {
      if (!Number.isFinite(item)) throw new CoreInputError(at, 'must be a finite number');
      // JSON.stringify writes the shortest round-trip form, and -0 as 0.
      append(JSON.stringify(item), at);
    } else if (typeof item === 'string') {
      writeString(item, at);
    } else if (Array.isArray(item)) {
      append('[', at);
      for (let index = 0; index < item.length; index++) {
        if (index > 0) append(',', at);
        write(item[index], `${at}[${index}]`);
      }
      append(']', at);
    } else if (typeof item === 'object' && isCanonicalObject(item)) {
      append('{', at);
      const names = new Set<string>();
      for (const [name, member] of item[MEMBERS]) {
        const memberPath = `${at}.${name}`;
        if (names.has(name)) throw new CoreInputError(memberPath, 'is a duplicate member');
        if (names.size > 0) append(',', at);
        names.add(name);
        writeString(name, memberPath);
        append(':', memberPath);
        write(member, memberPath);
      }
      append('}', at);
    } else {
      throw new CoreInputError(at, 'must be null, a boolean, a finite number, a string, an array or a canonicalObject');
    }
  };
  write(value, path);
  return parts.join('');
}

/** 16 lowercase hex digits: the FNV-1a 64 hash of the canonical text. */
export function canonicalHash(value: CanonicalValue, path = 'value'): string {
  return fnv1a64(canonicalText(value, path));
}
