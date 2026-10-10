import { readKeyboardEvent } from './keyboard-input.ts';
import type { KeyboardSource, KeyboardZoneBinding } from './keyboard-input.ts';
import { createKeyboardSource } from './keyboard-source.ts';
import type { KeyboardHost } from './keyboard-source.ts';

const host: KeyboardHost<HTMLElement> = {
  readFacts: element => ({
    elementFocused: document.activeElement === element,
    windowFocused: document.hasFocus(),
    visible: document.visibilityState === 'visible',
  }),
  listenKey(element, type, listener) {
    const callback = (event: KeyboardEvent): void => {
      listener(readKeyboardEvent(type, event), () => event.preventDefault());
    };
    element.addEventListener(type, callback);
    return () => element.removeEventListener(type, callback);
  },
  listenZone(element, type, listener) {
    element.addEventListener(type, listener);
    return () => element.removeEventListener(type, listener);
  },
  listenPage(type, listener) {
    const target = type === 'visibilitychange' ? document : window;
    target.addEventListener(type, listener);
    return () => target.removeEventListener(type, listener);
  },
};

/** The input zone is bound with `bind(element)` as the container mounts and `bind(null)` as it unmounts. */
export function createBrowserKeyboardSource(): KeyboardSource & KeyboardZoneBinding<HTMLElement> {
  return createKeyboardSource(host);
}
