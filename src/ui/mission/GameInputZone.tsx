/**
 * The mission screen's one game input zone (docs/plan/p3/05/spec.md: 输入区与焦点): a focusable container filling the game
 * view, whose element the keyboard source binds, so game keys reach only it. A click focuses it like any focusable
 * element; the zone starts no game action of its own. It reports its own focus for the focus hint.
 */
import type { ReactNode } from 'react';
import { INPUT_ZONE_LABEL } from './mission-copy.ts';

export interface GameInputZoneProps {
  /** Receives the element as it mounts and null as it unmounts. Keep its identity: a new function rebinds the zone. */
  readonly zoneRef: (zone: HTMLElement | null) => void;
  readonly onFocusChange: (focused: boolean) => void;
  readonly children: ReactNode;
}

export function GameInputZone({ zoneRef, onFocusChange, children }: GameInputZoneProps) {
  return (
    <div
      ref={zoneRef}
      className="game-input-zone"
      data-testid="game-input-zone"
      role="application"
      aria-label={INPUT_ZONE_LABEL}
      tabIndex={0}
      onFocus={() => { onFocusChange(true); }}
      onBlur={() => { onFocusChange(false); }}
    >
      {children}
    </div>
  );
}
