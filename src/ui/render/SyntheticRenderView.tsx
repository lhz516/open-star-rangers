/**
 * The synthetic view: a black 4:3 letterboxed area whose canvas the WebGL surface manages, plus the
 * renderer state as text. React renders this only when the renderer state changes, never per drawn
 * frame. It is a P1 engineering demo, not the Classic flight screen or original graphics.
 */
import { useSyncExternalStore, type CSSProperties, type Ref } from 'react';
import type { SyntheticRendererReader, SyntheticRendererStatus } from '../../render/synthetic/synthetic-renderer.ts';
import type { SyntheticKeyboardReader } from '../game/synthetic-keyboard-input.ts';
import { describeError } from '../game/describe-error.ts';

export interface SyntheticRenderViewProps {
  /** The container the WebGL surface draws in; React renders no children into it. */
  readonly ref: Ref<HTMLDivElement>;
  /** Null until the demo owner exists. */
  readonly renderer: SyntheticRendererReader | null;
  readonly keyboard: SyntheticKeyboardReader | null;
}

/** Content box per docs/plan/p1/07/spec.md 画面布局; the background is the letterbox. */
const containerStyle: CSSProperties = {
  boxSizing: 'content-box', width: '100%', height: 'clamp(240px, 70vh, 720px)', padding: 0, border: 0,
  position: 'relative', overflow: 'hidden', background: '#000',
};

const NO_RENDERER = Object.freeze({ subscribe: () => () => {}, getSnapshot: () => null });

function errorText(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

/** What the view says for each renderer state; failures are alerts, everything else a status. */
function describeStatus(status: SyntheticRendererStatus | null): { readonly alert: boolean; readonly text: string } {
  if (status === null) return { alert: false, text: 'Preparing the synthetic view…' };
  switch (status.state) {
    case 'ready':
      return { alert: false, text: 'Renderer ready.' };
    case 'context-lost':
      return { alert: false, text: 'The WebGL context was lost; the picture resumes when the browser restores it. The session is not affected.' };
    case 'unavailable':
      return { alert: true, text: `WebGL 2 is unavailable, so the synthetic view cannot be shown (${errorText(status.error)}). The session is not affected.` };
    case 'failed':
      return {
        alert: true,
        text: `The renderer failed and stopped drawing (${errorText(status.error)}). The session is not affected. To try to recover, return to the menu and start the demo again; this discards the current synthetic state.`,
      };
    case 'disposed':
      return { alert: false, text: 'Renderer released.' };
  }
}

export function SyntheticRenderView({ ref, renderer, keyboard }: SyntheticRenderViewProps) {
  const source = renderer ?? NO_RENDERER;
  const status = useSyncExternalStore(source.subscribe, source.getSnapshot);
  const { alert, text } = describeStatus(status);
  const keys = keyboard ?? NO_RENDERER;
  const keyboardStatus = useSyncExternalStore(keys.subscribe, keys.getSnapshot);
  return (
    <section aria-labelledby="synthetic-view-title">
      <h3 id="synthetic-view-title">Synthetic view</h3>
      <p role="note" data-testid="synthetic-view-notice">
        <strong>P1 synthetic engineering demo — not original graphics.</strong> The shapes, colours and camera are invented
        to test the renderer.
      </p>
      <p id="synthetic-keyboard-help">
        Synthetic demo keys, not original controls: ArrowLeft / ArrowRight move along X; N adds a marker; X removes it;
        P pauses or resumes. Focus this area to use game keys.
      </p>
      <div
        ref={ref} data-testid="synthetic-view" className="synthetic-input" style={containerStyle}
        tabIndex={0} role="region" aria-label="Synthetic view and game key input"
        aria-describedby="synthetic-keyboard-help"
        onClick={event => {
          if (event.target === event.currentTarget || event.target instanceof HTMLCanvasElement) event.currentTarget.focus();
        }}
      />
      <p
        role={keyboardStatus?.state === 'unavailable' ? 'alert' : 'status'}
        data-testid="keyboard-status" data-state={keyboardStatus?.state ?? 'preparing'}
      >
        {keyboardStatus === null ? 'Preparing keyboard input…' : keyboardStatus.state === 'unavailable'
          ? `Keyboard input is unavailable (${describeError(keyboardStatus.error)}). The session and panel remain usable.`
          : keyboardStatus?.state === 'active'
            ? 'Game keys active.'
            : 'Game keys inactive. Focus the synthetic view to use them.'}
      </p>
      <p role={alert ? 'alert' : 'status'} data-testid="render-status" data-state={status?.state ?? 'preparing'}>{text}</p>
    </section>
  );
}
