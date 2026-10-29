/**
 * The mission's sound status and its enable-sound control (docs/plan/p3/14/spec.md, 声音状态与开发诊断, S-09; P3-04 spec,
 * 任务音频接线（P3-14 的修订））: a `role="status"` line, and while a trusted click can change the sound, a labelled button
 * that calls the owner's `enableSound` from the click itself, so the unlock runs within the user activation. The click
 * controls no session: it resumes no paused game and closes no menu. The button sits outside the game input zone, so
 * Tab reaches it. Once a click changed the status, focus follows `enableSoundFocus`, decided in the owner's notification
 * before the button may unmount: it stays on a button still offered, moves to the input zone only when the sound became
 * available under the P3-05 conditions, otherwise to the page's first enabled action (`.mission-actions` in the page's
 * section, else its heading), and never moves once the user moved it or the page is hidden.
 * Without `owner.enableSound` (a page where the owner takes no activation) it shows only the status.
 */
import { useEffect, useRef, type RefObject } from 'react';
import type { MissionOwner, MissionOwnerSnapshot } from '../../app/mission/mission-owner.ts';
import { ENABLE_SOUND, enableSoundFocus, enableSoundOffered, soundStatusText } from './audio-copy.ts';

export interface AudioStatusProps {
  readonly snapshot: Pick<MissionOwnerSnapshot, 'sound' | 'session'>;
  readonly owner: Pick<MissionOwner, 'getSnapshot' | 'subscribe'> & Partial<Pick<MissionOwner, 'enableSound'>>;
  /** The page heading, where focus goes when the button disappears and the page has no enabled action. */
  readonly heading: RefObject<HTMLElement | null>;
  /** The input zone when the P3-05 conditions for focusing it hold now; null otherwise and on pages without one. */
  readonly readyZone?: () => HTMLElement | null;
}

export function AudioStatus({ snapshot: { sound, session }, owner, heading, readyZone }: AudioStatusProps) {
  const button = useRef<HTMLButtonElement>(null);
  /** A click is waiting for the status it changes. */
  const waiting = useRef(false);
  const offered = owner.enableSound !== undefined && enableSoundOffered(sound, session.phase);
  useEffect(() => owner.subscribe(() => {
    if (!waiting.current) return;
    const { sound: status, session: { phase } } = owner.getSnapshot();
    const zone = readyZone?.() ?? null;
    const target = enableSoundFocus({
      status,
      offered: enableSoundOffered(status, phase),
      controlFocused: button.current !== null && document.activeElement === button.current,
      visible: document.visibilityState === 'visible',
      zoneReady: zone !== null,
    });
    if (target === 'stay') return;
    waiting.current = false;
    if (target === 'zone') {
      zone?.focus();
    } else if (target === 'action') {
      const action = button.current?.closest('section')?.querySelector<HTMLButtonElement>('.mission-actions button:not(:disabled)');
      (action ?? heading.current)?.focus();
    }
  }), [owner, heading, readyZone]);
  return (
    <span className="mission-sound">
      <span role="status" data-testid="mission-sound" data-sound={sound}>{soundStatusText(sound)}</span>
      {offered && (
        <button
          ref={button}
          type="button"
          data-testid="mission-enable-sound"
          onClick={() => {
            waiting.current = true;
            owner.enableSound?.();
          }}
        >
          {ENABLE_SOUND}
        </button>
      )}
    </span>
  );
}
