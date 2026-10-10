/**
 * The page-level default-interception decision for one key event in the game input zone (docs/plan/p3/05/spec.md:
 * 页面层拦截). The first matching priority gives the only decision:
 *
 * 1. Not qualified (including a stale callback), composition, any Meta combination, Tab and F12 with any modifier:
 *    leave the browser's default.
 * 2. Alt itself, and any other event with the Alt or AltGraph flag, keydown and keyup alike: prevent. A Ctrl flag the
 *    AltGr key may have added does not turn the event into a browser Ctrl shortcut.
 * 3. A Ctrl combination without a binding: leave it. A bound event, keydown (repeat included) or keyup, in any
 *    context: prevent, and so for the keyup that released a held key and for F1–F11 without Ctrl or Meta. Escape keeps
 *    the browser's exit behaviour.
 * 4. Anything else: leave it.
 *
 * The caller releases local held state before asking, so a released key never sticks. `preventDefault` is only the
 * page's decision: whether the browser or the system lets it stop a shortcut is a separate, real-device question.
 */
import type { KeyboardInput } from '../../platform/input/keyboard-input.ts';

export interface InterceptFacts {
  readonly event: KeyboardInput;
  /** The source qualifies the input zone and the callback belongs to the current consumer. */
  readonly eligible: boolean;
  /** The effective Ctrl after AltGr normalization. */
  readonly ctrl: boolean;
  /**
   * The code has a binding under the effective modifiers in some context, or this keyup released a key an effective
   * press had established.
   */
  readonly bound: boolean;
}

const NATIVE_CODES: ReadonlySet<string> = new Set(['Tab', 'F12', 'MetaLeft', 'MetaRight']);
const ALT_CODES: ReadonlySet<string> = new Set(['AltLeft', 'AltRight']);
const FUNCTION_CODES: ReadonlySet<string> = new Set(Array.from({ length: 11 }, (_, index) => `F${index + 1}`));

export function shouldPreventDefault({ event, eligible, ctrl, bound }: InterceptFacts): boolean {
  if (!eligible || event.isComposing || event.metaKey || NATIVE_CODES.has(event.code)) return false;
  if (ALT_CODES.has(event.code) || event.altKey || event.altGraph) return true;
  if (event.code === 'Escape') return false;
  if (ctrl) return bound;
  return bound || FUNCTION_CODES.has(event.code);
}
