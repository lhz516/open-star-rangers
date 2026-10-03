import { createKeyboardSource } from './keyboard-source.ts';
import type { KeyboardHost, KeyboardLifecycleType } from './keyboard-source.ts';
import type { KeyboardSource } from './keyboard-input.ts';

export function createBrowserKeyboardSource(element: HTMLElement): KeyboardSource {
  const targetFor = (type: KeyboardLifecycleType): EventTarget =>
    type === 'focusin' || type === 'focusout' ? element : type === 'visibilitychange' ? document : window;
  const host: KeyboardHost = {
    readFacts: () => ({
      elementFocused: document.activeElement === element,
      windowFocused: document.hasFocus(),
      visible: document.visibilityState === 'visible',
    }),
    listenKey(type, listener) {
      const callback = (event: KeyboardEvent): void => {
        const { code, repeat, ctrlKey, altKey, metaKey, isComposing } = event;
        listener({ type, code, repeat, ctrlKey, altKey, metaKey, isComposing }, () => event.preventDefault());
      };
      element.addEventListener(type, callback);
      return () => element.removeEventListener(type, callback);
    },
    listenSignal(type, listener) {
      const target = targetFor(type);
      target.addEventListener(type, listener);
      return () => target.removeEventListener(type, listener);
    },
  };
  return createKeyboardSource(host);
}
