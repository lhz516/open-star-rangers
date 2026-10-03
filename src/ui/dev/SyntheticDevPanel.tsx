/**
 * Development panel for the P1 synthetic demo: session controls, marker commands, the sampled
 * projection, command results and errors. It reads the UI store through selectors and acts only
 * through `dispatch`; it is not a flight HUD, menu or original-game screen.
 */
import { useState, type CSSProperties } from 'react';
import type { Vec3 } from '../../core/synthetic/synthetic-scene.ts';
import type { SyntheticRenderDiagnostics, SyntheticRendererReader } from '../../render/synthetic/synthetic-renderer.ts';
import { describeError } from '../game/describe-error.ts';
import type { SyntheticGameStoreReader, UiCommandResult } from '../game/synthetic-game-store.ts';
import {
  syntheticControlAvailability, type SyntheticControlAvailability, type SyntheticPanelAction,
} from '../game/synthetic-game-controls.ts';
import { useSyntheticGame } from '../game/use-synthetic-game.ts';

export interface SyntheticDevPanelProps {
  readonly store: SyntheticGameStoreReader;
  readonly dispatch: (action: SyntheticPanelAction) => void;
  /** Read on demand only; the panel never subscribes to drawing. */
  readonly renderer: SyntheticRendererReader;
}

interface SectionProps {
  readonly store: SyntheticGameStoreReader;
}

const SESSION_ACTIONS: readonly (readonly [SyntheticPanelAction, string])[] = [
  ['start', 'Start'], ['pause', 'Pause'], ['resume', 'Resume'], ['restart', 'Restart'], ['exit', 'Exit'],
];
const COMMAND_ACTIONS: readonly (readonly [SyntheticPanelAction, string])[] = [
  ['add-marker', 'Add marker'], ['remove-marker', 'Remove marker'],
];

const panelStyle: CSSProperties = { display: 'grid', gap: '1rem', maxWidth: '48rem' };
const rowStyle: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: '0.5rem' };
const valueStyle: CSSProperties = { fontFamily: 'ui-monospace, monospace', whiteSpace: 'pre-wrap' };

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3);
}

function formatPosition({ x, y, z }: Vec3): string {
  return `(${formatNumber(x)}, ${formatNumber(y)}, ${formatNumber(z)})`;
}

function describeResult(result: UiCommandResult): string {
  switch (result.outcome) {
    case 'accepted': {
      const { event } = result;
      return `accepted by Core at tick ${event.tick}: ${event.type} entity ${event.entityId} at ${formatPosition(event.position)}`;
    }
    case 'rejected':
      return `rejected by Core at tick ${result.event.tick}: ${result.event.reason}`;
    case 'cancelled':
      return `cancelled by the session: ${result.reason}`;
    case 'unconfirmed':
      return 'unconfirmed: the session failed before Core reported a result';
  }
}

function ActionButtons({ availability, dispatch, actions, label }: {
  readonly availability: SyntheticControlAvailability;
  readonly dispatch: SyntheticDevPanelProps['dispatch'];
  readonly actions: readonly (readonly [SyntheticPanelAction, string])[];
  readonly label: string;
}) {
  return (
    <div role="group" aria-label={label} style={rowStyle}>
      {actions.map(([action, text]) => (
        <button key={action} type="button" disabled={!availability[action]} onClick={() => { dispatch(action); }}>
          {text}
        </button>
      ))}
    </div>
  );
}

function ControlsView({ store, dispatch }: Pick<SyntheticDevPanelProps, 'store' | 'dispatch'>) {
  // Availability is one shared object per set of enabled actions, so this re-renders only when a button changes.
  const availability = useSyntheticGame(store, state => syntheticControlAvailability(state.status));
  return (
    <>
      <ActionButtons availability={availability} dispatch={dispatch} actions={SESSION_ACTIONS} label="Session controls" />
      <ActionButtons availability={availability} dispatch={dispatch} actions={COMMAND_ACTIONS} label="Marker commands" />
    </>
  );
}

function SessionStatusView({ store }: SectionProps) {
  const status = useSyntheticGame(store, state => state.status);
  return (
    <section aria-label="Session status">
      <h4>Session</h4>
      {status === null ? <p data-testid="session-status">No session controller.</p> : (
        <dl data-testid="session-status" style={valueStyle}>
          <dt>Phase</dt><dd data-testid="phase">{status.phase}</dd>
          <dt>Run</dt><dd data-testid="run-id">{status.runId ?? 'none'}</dd>
          <dt>Pause reason</dt><dd data-testid="pause-reason">{status.pauseReason ?? 'none'}</dd>
          <dt>Page visible</dt><dd data-testid="environment-visible">{status.environmentVisible ? 'yes' : 'no'}</dd>
          <dt>Cleanup failed</dt><dd data-testid="cleanup-failed">{status.cleanupFailed ? 'yes' : 'no'}</dd>
        </dl>
      )}
    </section>
  );
}

function ProjectionView({ store }: SectionProps) {
  const projection = useSyntheticGame(store, state => state.projection);
  return (
    <section aria-label="Projection">
      <h4>Projection (sampled at 10 Hz)</h4>
      {projection === null ? <p data-testid="projection">No current world.</p> : (
        <dl data-testid="projection" style={valueStyle}>
          <dt>Scenario</dt><dd data-testid="scenario">{projection.scenario}</dd>
          <dt>Tick</dt><dd data-testid="tick">{projection.tick}</dd>
          <dt>Tick rate</dt><dd data-testid="tick-rate">{projection.tickRateHz} Hz</dd>
          <dt>Mover</dt><dd data-testid="mover">#{projection.mover.id} at {formatPosition(projection.mover.position)}</dd>
          <dt>Marker</dt>
          <dd data-testid="marker">
            {projection.marker === null ? 'none' : `#${projection.marker.id} at ${formatPosition(projection.marker.position)}`}
          </dd>
        </dl>
      )}
    </section>
  );
}

function CommandFeedbackView({ store }: SectionProps) {
  const pending = useSyntheticGame(store, state => state.pendingCommands);
  const results = useSyntheticGame(store, state => state.recentResults);
  return (
    <section aria-label="Command feedback">
      <h4>Pending commands</h4>
      {pending.length === 0 ? <p data-testid="pending">None.</p> : (
        <ul data-testid="pending" style={valueStyle}>
          {pending.map(command => (
            <li key={`${command.runId}:${command.commandId}`}>
              run {command.runId} · #{command.commandId} {command.commandType}: waiting for Core
            </li>
          ))}
        </ul>
      )}
      <h4>Recent results</h4>
      {results.length === 0 ? <p data-testid="results">None.</p> : (
        <ol data-testid="results" style={valueStyle}>
          {results.map(result => (
            <li key={`${result.runId}:${result.commandId}`} data-outcome={result.outcome}>
              run {result.runId} · #{result.commandId} {result.commandType}: {describeResult(result)}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function ErrorView({ store }: SectionProps) {
  const actionError = useSyntheticGame(store, state => state.actionError);
  const sessionError = useSyntheticGame(store, state => state.sessionError);
  const cleanupFailed = useSyntheticGame(store, state => state.status?.cleanupFailed ?? false);
  if (!actionError && !sessionError && !cleanupFailed) return null;
  return (
    <section aria-label="Errors" role="alert">
      <h4>Errors</h4>
      {cleanupFailed && (
        <p data-testid="cleanup-advice">
          Cleanup failed, so start and restart stay blocked and no new demo can be created. Reload the page to start over.
        </p>
      )}
      {actionError && (
        <pre data-testid="action-error" style={valueStyle}>Action {actionError.operation} failed:{'\n'}{describeError(actionError.cause)}</pre>
      )}
      {sessionError && <pre data-testid="session-error" style={valueStyle}>Session error:{'\n'}{describeError(sessionError)}</pre>}
    </section>
  );
}

function describeLayout(layout: SyntheticRenderDiagnostics['layout']): string {
  if (layout === null) return 'none';
  const { bufferWidth, bufferHeight, pixelRatio, frame } = layout;
  return `buffer ${bufferWidth}×${bufferHeight} at pixel ratio ${formatNumber(pixelRatio)}; frame ${formatNumber(frame.width)}×${formatNumber(frame.height)} CSS px at (${formatNumber(frame.left)}, ${formatNumber(frame.top)})`;
}

function RenderDiagnosticsView({ renderer }: { readonly renderer: SyntheticRendererReader }) {
  // A snapshot taken on mount, on each refresh and for a replaced renderer; drawing never re-renders this section.
  const [read, setRead] = useState(() => ({ renderer, diagnostics: renderer.diagnostics() }));
  if (read.renderer !== renderer) setRead({ renderer, diagnostics: renderer.diagnostics() });
  const { diagnostics } = read;
  const { gpu } = diagnostics;
  return (
    <section aria-label="Renderer diagnostics">
      <h4>Renderer diagnostics</h4>
      <button type="button" onClick={() => { setRead({ renderer, diagnostics: renderer.diagnostics() }); }}>Refresh diagnostics</button>
      <dl data-testid="render-diagnostics" style={valueStyle}>
        <dt>State</dt><dd data-testid="render-state">{diagnostics.state}</dd>
        <dt>Run</dt><dd data-testid="render-run-id">{diagnostics.runId ?? 'none'}</dd>
        <dt>Drawn tick</dt><dd data-testid="render-drawn-tick">{diagnostics.drawnTick ?? 'none'}</dd>
        <dt>Draws</dt><dd data-testid="render-draws">{diagnostics.draws}</dd>
        <dt>Entity objects</dt><dd data-testid="render-entities">{diagnostics.entities}</dd>
        <dt>GPU</dt>
        <dd data-testid="render-gpu">
          {gpu === null ? 'none' : `${gpu.geometries} geometries, ${gpu.textures} textures, ${gpu.programs} programs`}
        </dd>
        <dt>Layout</dt><dd data-testid="render-layout">{describeLayout(diagnostics.layout)}</dd>
      </dl>
    </section>
  );
}

export function SyntheticDevPanel({ store, dispatch, renderer }: SyntheticDevPanelProps) {
  return (
    <section aria-labelledby="dev-panel-title" style={panelStyle}>
      <h3 id="dev-panel-title">Development panel</h3>
      <p role="note" data-testid="synthetic-notice">
        <strong>P1 synthetic engineering demo — not original gameplay.</strong> The marker, positions and rules are invented
        to test the architecture.
      </p>
      <ControlsView store={store} dispatch={dispatch} />
      <SessionStatusView store={store} />
      <ProjectionView store={store} />
      <CommandFeedbackView store={store} />
      <ErrorView store={store} />
      <RenderDiagnosticsView renderer={renderer} />
    </section>
  );
}
