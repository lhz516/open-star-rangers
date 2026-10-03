import { useEffect, useRef, type RefObject } from 'react';

/** Focuses the referenced element once the screen mounts, so keyboard and screen reader users land on it. */
export function useFocusOnMount<T extends HTMLElement>(): RefObject<T | null> {
  const ref = useRef<T>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return ref;
}
