/**
 * Focus of the mission shell (docs/plan/p3/05/spec.md: 输入区与焦点; docs/plan/p3/04/spec.md: 任务开始配置, 用户激活与焦点):
 * once, as the shell mounts, where `shellFocusTarget` decides. Nothing else moves focus: a page that becomes visible or
 * focused later, a pause or a re-render does not.
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { MissionFlowPosition } from '../../app/mission/mission-flow.ts';
import { inputFocusEntry, shellFocusTarget, type InputFocusEntry } from './input-notices.ts';

/** The entry the latest change of flow position made, kept while the position stays; null before any change. */
export function useInputFocusEntry(position: MissionFlowPosition): InputFocusEntry | null {
  const [seen, setSeen] = useState<{ readonly position: MissionFlowPosition; readonly entry: InputFocusEntry | null }>(
    () => ({ position, entry: null }),
  );
  if (seen.position === position) return seen.entry;
  // State derived from the previous render's position, adjusted while rendering as React documents for this case.
  const next = { position, entry: inputFocusEntry(seen.position, position) };
  setSeen(next);
  return next.entry;
}

export interface ShellFocus {
  readonly heading: RefObject<HTMLHeadingElement | null>;
  /** The input zone's callback ref: it keeps the element and hands it to `bindZone`. */
  readonly zone: (element: HTMLElement | null) => void;
  /** The mounted input zone, for a later focus decision such as the enable-sound control's. */
  readonly zoneElement: RefObject<HTMLElement | null>;
}

/**
 * Focuses the heading or the input zone, or leaves focus alone, once as the shell mounts, by the entry and phase it
 * mounted with. Focus that rested on the page that just ended was dropped with it; focus on any other element was put
 * there by the user.
 */
export function useShellFocus(
  entry: InputFocusEntry | null,
  running: boolean,
  bindZone: ((zone: HTMLElement | null) => void) | undefined,
): ShellFocus {
  const heading = useRef<HTMLHeadingElement>(null);
  const zoneElement = useRef<HTMLElement | null>(null);
  const zone = useCallback((element: HTMLElement | null) => {
    zoneElement.current = element;
    bindZone?.(element);
  }, [bindZone]);
  useEffect(() => {
    const target = zoneElement.current;
    const active = document.activeElement;
    const focusElsewhere = active !== null && active !== document.body && active !== document.documentElement
      && active !== target && active !== heading.current;
    const visible = document.visibilityState === 'visible';
    const focusTarget = shellFocusTarget({ entry, zone: target !== null, running, visible, windowFocused: document.hasFocus(), focusElsewhere });
    if (focusTarget === 'zone') target?.focus();
    else if (focusTarget === 'heading') heading.current?.focus();
    // Once, as the shell mounts.
  }, []);
  return { heading, zone, zoneElement };
}
