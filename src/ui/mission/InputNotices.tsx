/**
 * The mission input's notices in the shell (docs/plan/p3/05/spec.md: 输入区与焦点, 暂缺标注, 全屏与 Keyboard Lock, Alt+F4
 * 风险提示): the focus hint, the G-item notice, capability degradations, the latest input error and the Alt+F4 tip. None
 * is modal, traps or moves focus, or pauses the run.
 */
import { useEffect, useId, useState } from 'react';
import type { PlatformFamily } from '../../platform/browser/platform-family.ts';
import { altF4TipDue, GAP_NOTICE_MS, visibleGapNotice, type CapabilityStatus, type GapNotice, type NoticeLatch } from './input-notices.ts';
import { ALT_F4_TIP, INPUT_FOCUS_HINT } from './mission-copy.ts';
import { GapText } from './MissionParts.tsx';

/** One line of input text, keyed: a new key is a new line, announced again even with the same text. */
export interface InputNoticeLine {
  readonly key: string;
  readonly text: string;
}

/**
 * The mission input as the mission pages show it. The assembly (P3-05 subtask 25) adapts the input consumer, its
 * capabilities and the platform ports to it, and keeps the same view for the owner's lifetime.
 */
export interface MissionInputView {
  /** Receives the input zone element as it mounts and null as it unmounts, e.g. the keyboard source's bound `bind`. */
  readonly bindZone: (zone: HTMLElement | null) => void;
  /** The latest G-item press, its serial rising with every press for the input's lifetime; null when none. */
  readonly gap: GapNotice | null;
  /** Capability degradations and input states, such as a refused key lock or map input that is not ready. */
  readonly status: readonly InputNoticeLine[];
  /** The latest input error, such as a full command queue; null when none. */
  readonly error: InputNoticeLine | null;
  readonly platformFamily: PlatformFamily;
  /** One latch for the whole page load, so the Alt+F4 tip shows at most once per page load. */
  readonly altF4Tip: NoticeLatch;
  readonly fullscreen: {
    /** The document's API fullscreen. */
    readonly status: CapabilityStatus;
    /** The shell's full screen button: requests fullscreen of the whole document, never of the game view alone. */
    readonly request: () => void;
    /** Called synchronously within the start page's Start click, before the start; requests document fullscreen if due. */
    readonly requestOnStart: () => void;
  };
}

/**
 * The latest press, shown for `GAP_NOTICE_MS` from that very press. The mission page calls it for the owner's lifetime,
 * above the pages that replace one another, so a notice that ran out while the mission menu showed stays hidden after
 * Continue.
 */
export function useGapNotice(latest: GapNotice | null): GapNotice | null {
  const [expiredSerial, setExpiredSerial] = useState<number | null>(null);
  const serial = latest?.serial ?? null;
  useEffect(() => {
    if (serial === null) return undefined;
    const timer = setTimeout(() => { setExpiredSerial(serial); }, GAP_NOTICE_MS);
    return () => { clearTimeout(timer); };
  }, [serial]);
  return visibleGapNotice(latest, expiredSerial);
}

/** Shows the Alt+F4 tip the first time it is due in this page load, until dismissed. */
function useAltF4Tip({ platformFamily: family, fullscreen: { status }, altF4Tip: latch }: MissionInputView, running: boolean) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!altF4TipDue({ family, running, fullscreen: status, shown: latch.shown() })) return;
    latch.markShown();
    setVisible(true);
  }, [family, running, status, latch]);
  return { visible, dismiss: () => { setVisible(false); } };
}

export interface InputNoticesProps {
  readonly input: MissionInputView;
  /** The G-item notice to show now, from `useGapNotice`. */
  readonly gap: GapNotice | null;
  readonly focusHint: boolean;
  /** The run is running in flight. */
  readonly running: boolean;
}

export function InputNotices({ input, gap, focusHint, running }: InputNoticesProps) {
  const tip = useAltF4Tip(input, running);
  const tipTitleId = useId();
  return (
    <div className="input-notices" data-testid="input-notices">
      {focusHint && <p data-testid="input-focus-hint">{INPUT_FOCUS_HINT}</p>}
      {/* Live regions stay mounted, so a newly shown text is announced. */}
      <p className="input-gap-notice" role="status" aria-live="polite" data-testid="input-gap-notice" data-gap={gap?.id ?? ''}>
        {gap && <GapText {...gap} />}
      </p>
      <div role="status" data-testid="input-status">
        {input.status.map(line => <p key={line.key}>{line.text}</p>)}
      </div>
      {input.error && (
        <div key={input.error.key} role="alert" className="failure-alert" data-testid="input-error">
          <p>{input.error.text}</p>
        </div>
      )}
      {tip.visible && (
        <div role="note" className="input-tip" data-testid="alt-f4-tip" aria-labelledby={tipTitleId}>
          <p><strong id={tipTitleId}>{ALT_F4_TIP.title}</strong> {ALT_F4_TIP.text}</p>
          <button type="button" onClick={tip.dismiss}>{ALT_F4_TIP.dismiss}</button>
        </div>
      )}
    </div>
  );
}
