/**
 * The synthetic view: a black 4:3 letterboxed area whose canvas the WebGL surface manages, plus the
 * renderer state as text. React renders this only when the renderer state changes, never per drawn
 * frame. It is a P1 engineering demo, not the Classic flight screen or original graphics.
 */
import { useSyncExternalStore, type CSSProperties, type Ref } from 'react';
import type { SyntheticRendererReader, SyntheticRendererStatus } from '../../render/synthetic/synthetic-renderer.ts';

export interface SyntheticRenderViewProps {
  /** The container the WebGL surface draws in; React renders no children into it. */
  readonly ref: Ref<HTMLDivElement>;
  /** Null until the demo owner exists. */
  readonly renderer: SyntheticRendererReader | null;
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

export function SyntheticRenderView({ ref, renderer }: SyntheticRenderViewProps) {
  const source = renderer ?? NO_RENDERER;
  const status = useSyncExternalStore(source.subscribe, source.getSnapshot);
  const { alert, text } = describeStatus(status);
  return (
    <section aria-labelledby="synthetic-view-title">
      <h3 id="synthetic-view-title">Synthetic view</h3>
      <p role="note" data-testid="synthetic-view-notice">
        <strong>P1 synthetic engineering demo — not original graphics.</strong> The shapes, colours and camera are invented
        to test the renderer.
      </p>
      <div ref={ref} data-testid="synthetic-view" style={containerStyle} />
      <p role={alert ? 'alert' : 'status'} data-testid="render-status" data-state={status?.state ?? 'preparing'}>{text}</p>
    </section>
  );
}
