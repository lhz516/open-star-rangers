/**
 * Development diagnostics panel of the mission screen (docs/plan/p3/04/spec.md: 开发诊断): entity and mission state,
 * the event log, frame timing, the flight renderer's state, draws and GPU counts (docs/plan/p3/12/spec.md, 渲染器生命周期),
 * a command editor with the command feedback, and the recording export. It reads the
 * owner's diagnostics and game store through per-section selectors, acts only through the diagnostics actions and the
 * command feedback's submit, uses native controls and registers no global keyboard listener. Development builds only:
 * the app assembly leaves it, and everything it imports from `ui/dev`, out of production builds.
 */
import { useId, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { COMMAND_TYPES, type Command, type CommandType } from '../../core/contracts/tick-input.ts';
import type { Vec3 } from '../../core/contracts/domain-events.ts';
import type { FlightRenderDiagnostics, FlightRenderer } from '../../render/flight/renderer/flight-renderer.ts';
import { describeError } from '../game/describe-error.ts';
import { selectPhase, selectRunId, type GameStoreReader, type GameUiState, type UiCommandResult } from '../game/game-store.ts';
import { useGame } from '../game/use-game.ts';
import { COMMAND_FORMS, commandDraft, editDraft, readDraft, type CommandDraft } from './command-draft.ts';
import type { InspectionView } from './entity-inspection.ts';
import {
  selectCanRead, selectCanRetry, type MissionDiagnostics, type MissionDiagnosticsState, type RecordingSaveStatus,
} from './mission-diagnostics.ts';

export interface MissionDevPanelProps {
  readonly diagnostics: Pick<MissionDiagnostics, 'reader' | 'clearLog' | 'refreshSnapshot' | 'exportRecording' | 'retrySave'>;
  readonly game: GameStoreReader;
  /** The owner's command feedback `submit`: returns the commandId, or null after writing the action error. */
  readonly submitCommand: (command: Command) => number | null;
  /** The owner's flight renderer, whose diagnostics are read when refreshed. */
  readonly flight?: Pick<FlightRenderer, 'diagnostics'> | null;
}

type Diagnostics = MissionDevPanelProps['diagnostics'];

const panelStyle: CSSProperties = { display: 'grid', gap: '1rem', maxWidth: '64rem' };
const rowStyle: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' };
const valueStyle: CSSProperties = { fontFamily: 'ui-monospace, monospace', whiteSpace: 'pre-wrap' };
const scrollStyle: CSSProperties = { ...valueStyle, maxHeight: '20rem', overflow: 'auto' };

function useDiagnostics<T>(diagnostics: Diagnostics, selector: (state: MissionDiagnosticsState) => T): T {
  return useStore(diagnostics.reader, selector);
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3);
}

const formatPosition = ({ x, y, z }: Vec3) => `(${formatNumber(x)}, ${formatNumber(y)}, ${formatNumber(z)})`;
const formatMs = (value: number | null) => (value === null ? 'none' : `${value.toFixed(2)} ms`);
const hex = (value: number) => `0x${value.toString(16).padStart(2, '0')}`;

function Section({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id}>
      <h4 id={id}>{title}</h4>
      {children}
    </section>
  );
}

function InspectionDetails({ view }: { readonly view: InspectionView }) {
  return (
    <>
      <dl data-testid="dev-state" style={valueStyle}>
        <dt>Run</dt><dd data-testid="dev-state-run">{view.runId}</dd>
        <dt>Tick</dt><dd data-testid="dev-state-tick">{view.tick}</dd>
        <dt>Clock</dt><dd>{view.clock} units</dd>
        <dt>Seed</dt><dd data-testid="dev-state-seed">{view.seed}</dd>
        <dt>setupHash</dt><dd>{view.setupHash}</dd>
        <dt>Mission</dt><dd>{view.mission} (group {view.campaign.group}, slot {view.campaign.slot})</dd>
        <dt>Raw difficulty</dt><dd>{view.rawDifficulty}</dd>
        <dt>Wingman option</dt><dd data-testid="dev-state-wingman">{view.wingman ?? 'none'}</dd>
        <dt>Content identity</dt>
        <dd>{view.content.map(([field, value]) => `${field}=${value}`).join('\n')}</dd>
        <dt>Mission status</dt><dd>{view.missionStatus}</dd>
        <dt>Player</dt>
        <dd data-testid="dev-state-player">
          entity {view.player.entityId ?? 'none'}, view mode {hex(view.player.viewMode)} (previous {hex(view.player.previousViewMode)}), sub-mode {view.player.subMode}
        </dd>
        <dt>Spawn queue</dt>
        <dd>
          {view.spawn.enabled ? 'enabled' : 'disabled'}, {view.spawn.queue.length} entries, {view.spawn.records} records, {view.spawn.groups} groups
          {view.spawn.queue.map((entry, index) => `\n#${index}: ${entry.source} ${entry.index} due ${entry.due}, requests ${entry.requests}`).join('')}
        </dd>
      </dl>
      <table data-testid="dev-entities" style={valueStyle}>
        <caption>{view.entities.length} entities at tick {view.tick}; names are shown as references</caption>
        <thead>
          <tr>
            <th scope="col">ID</th><th scope="col">Kind bit</th><th scope="col">Source</th><th scope="col">Name</th><th scope="col">Position</th>
            <th scope="col">State</th><th scope="col">Activity</th><th scope="col">Destroyed</th><th scope="col">Placement</th>
          </tr>
        </thead>
        <tbody>
          {view.entities.map((entity) => (
            <tr key={entity.id} data-testid="dev-entity" data-entity-id={entity.id} data-kind-bit={entity.kindBit} data-source={entity.source}>
              <td>{entity.id}</td><td>{entity.kindBit}</td><td>{entity.source}</td><td>{entity.name}</td><td>{formatPosition(entity.position)}</td>
              <td>{entity.state}</td><td>{entity.activity}</td><td>{entity.destroyed ? 'yes' : 'no'}</td><td>{entity.placementSerial}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function InspectionSection({ diagnostics }: { readonly diagnostics: Diagnostics }) {
  const canRead = useDiagnostics(diagnostics, selectCanRead);
  const { view, error } = useDiagnostics(diagnostics, (state) => state.inspection);
  return (
    <Section title="Entity and mission state">
      <div style={rowStyle}>
        <button type="button" disabled={!canRead} onClick={() => { diagnostics.refreshSnapshot(); }}>Refresh state</button>
        {!canRead && <span>Needs a run that has not faulted.</span>}
      </div>
      {error && <pre role="alert" data-testid="dev-state-error" style={valueStyle}>Snapshot failed:{'\n'}{describeError(error.cause)}</pre>}
      {view === null ? <p data-testid="dev-state">Not read yet; the state is read only when refreshed.</p> : <InspectionDetails view={view} />}
    </Section>
  );
}

function EventLogSection({ diagnostics }: { readonly diagnostics: Diagnostics }) {
  const { entries, total, truncated } = useDiagnostics(diagnostics, (state) => state.log);
  return (
    <Section title="Event log">
      <div style={rowStyle}>
        <button type="button" disabled={total === 0} onClick={() => { diagnostics.clearLog(); }}>Clear log</button>
        <span data-testid="dev-log-count">
          {entries.length} of {total} events{truncated ? '; older events were dropped' : ''}
        </span>
      </div>
      {entries.length > 0 && (
        <ol data-testid="dev-log" style={scrollStyle}>
          {entries.map((entry) => (
            <li key={entry.sequence} data-type={entry.type} data-command-id={entry.commandId ?? undefined}>
              tick {entry.tick} · {entry.type}{entry.commandId === null ? '' : ` · command #${entry.commandId}`}
              {entry.fields.map(([name, value]) => ` · ${name}=${String(value)}`).join('')}
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}

function FrameSection({ diagnostics }: { readonly diagnostics: Diagnostics }) {
  const frames = useDiagnostics(diagnostics, (state) => state.frames);
  return (
    <Section title="Frame timing">
      <p>Session frame processing on the main thread, from the start to the end of each frame; not GPU or display time.</p>
      <dl data-testid="dev-frames" style={valueStyle}>
        <dt>Samples</dt><dd data-testid="dev-frames-samples">{frames.samples} (latest 120 frames)</dd>
        <dt>Processing</dt><dd>mean {formatMs(frames.meanProcessingMs)}, max {formatMs(frames.maxProcessingMs)}</dd>
        <dt>Ticks</dt>
        <dd>{frames.totalTicks} total, mean {frames.meanTicks === null ? 'none' : frames.meanTicks.toFixed(2)}, max {frames.maxTicks ?? 'none'}</dd>
        <dt>Capped frames</dt><dd data-testid="dev-frames-capped">{frames.cappedFrames}</dd>
      </dl>
      {frames.lastFailure && (
        <pre role="alert" style={valueStyle}>
          {frames.failedFrames} frames not measured; the clock failed:{'\n'}{describeError(frames.lastFailure.cause)}
        </pre>
      )}
    </Section>
  );
}

function flightRows({ state, runId, draws, lastTick, gpu, resources, layout }: FlightRenderDiagnostics): readonly (readonly [string, string])[] {
  return [
    ['state', state],
    ['run', String(runId ?? 'none')],
    ['draws', String(draws)],
    ['last-tick', String(lastTick ?? 'none')],
    ['gpu', gpu ? `${gpu.geometries} geometries, ${gpu.textures} textures, ${gpu.programs} programs` : 'none'],
    ['resources', resources
      ? `${resources.geometries} geometries (${resources.vertices} vertices, ${resources.indices} indices), ${resources.materials} materials, `
        + `${resources.textures} textures (${resources.texels} texels), ${resources.renderTargets} render targets`
      : 'none'],
    ['buffer', layout ? `${layout.bufferWidth} × ${layout.bufferHeight} at ${layout.pixelRatio}×` : 'none'],
  ];
}

function FlightSection({ flight }: { readonly flight: Pick<FlightRenderer, 'diagnostics'> }) {
  const [diagnostics, setDiagnostics] = useState<FlightRenderDiagnostics | null>(null);
  return (
    <Section title="Flight render">
      <button type="button" data-testid="dev-flight-refresh" onClick={() => { setDiagnostics(flight.diagnostics()); }}>Refresh flight render</button>
      {diagnostics && (
        <dl data-testid="dev-flight" style={valueStyle}>
          {flightRows(diagnostics).map(([name, value]) => (
            <div key={name}><dt>{name}</dt><dd data-testid={`dev-flight-${name}`}>{value}</dd></div>
          ))}
        </dl>
      )}
    </Section>
  );
}

function describeResult(result: UiCommandResult): string {
  switch (result.outcome) {
    case 'accepted':
      return `accepted by Core at tick ${result.event.tick}`;
    case 'rejected':
    case 'ignored':
      return `${result.outcome} by Core at tick ${result.event.tick}: ${result.reason}`;
    case 'cancelled':
      return `cancelled by the session: ${result.reason}`;
    case 'unconfirmed':
      return 'unconfirmed: the session failed before Core reported a result';
  }
}

const selectPending = (state: GameUiState) => state.pendingCommands;
const selectResults = (state: GameUiState) => state.recentResults;
const selectActionError = (state: GameUiState) => state.actionError;

function CommandFeedbackView({ game }: { readonly game: GameStoreReader }) {
  const pending = useGame(game, selectPending);
  const results = useGame(game, selectResults);
  const actionError = useGame(game, selectActionError);
  return (
    <>
      <p data-testid="dev-pending">
        {pending.length === 0 ? 'No pending commands.' : `Pending: ${pending.map((command) => `#${command.commandId} ${command.commandType}`).join(', ')}`}
      </p>
      {results.length > 0 && (
        <ol data-testid="dev-results" style={valueStyle}>
          {results.map((result) => (
            <li key={`${result.runId}:${result.commandId}`} data-command-id={result.commandId} data-outcome={result.outcome} data-reason={result.reason ?? undefined}>
              run {result.runId} · #{result.commandId} {result.commandType}: {describeResult(result)}
            </li>
          ))}
        </ol>
      )}
      {actionError && (
        <pre role="alert" data-testid="dev-action-error" style={valueStyle}>
          {actionError.operation} failed:{'\n'}{describeError(actionError.cause)}
        </pre>
      )}
    </>
  );
}

function CommandSection({ game, submitCommand }: Pick<MissionDevPanelProps, 'game' | 'submitCommand'>) {
  const running = useGame(game, selectPhase) === 'running';
  const runId = useGame(game, selectRunId);
  const [draft, setDraft] = useState<CommandDraft>(() => commandDraft(COMMAND_TYPES[0]));
  // A commandId is unique only within its run, so the acknowledgement shows only while that run is current.
  const [submitted, setSubmitted] = useState<{ readonly runId: number | null; readonly commandId: number } | null>(null);
  const reading = useMemo(() => readDraft(draft), [draft]);
  const typeId = useId();
  const submit = () => {
    if (!reading.valid) return;
    const commandId = submitCommand(reading.command);
    setSubmitted(commandId === null ? null : { runId, commandId });
  };
  return (
    <Section title="Command">
      <p>Submits one Core command through the run&apos;s normal queue; rules that do not exist yet answer not-implemented.</p>
      <div style={rowStyle}>
        <label htmlFor={typeId}>Type</label>
        <select
          id={typeId}
          data-testid="dev-command-type"
          value={draft.type}
          onChange={(event) => { setDraft(commandDraft(event.target.value as CommandType)); }}
        >
          {COMMAND_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
        </select>
        {COMMAND_FORMS[draft.type].map((field) => (
          <CommandField key={`${draft.type}.${field.name}`} draft={draft} field={field} onChange={setDraft} />
        ))}
        <button type="button" data-testid="dev-command-submit" disabled={!running || !reading.valid} onClick={submit}>Submit command</button>
      </div>
      {!running && <p>Commands are accepted while the run is running.</p>}
      {!reading.valid && (
        <p role="alert" data-testid="dev-command-invalid">
          {reading.field === null ? 'The command' : `Field ${reading.field}`} {reading.reason}.
        </p>
      )}
      {submitted !== null && submitted.runId === runId && (
        <p data-testid="dev-command-submitted">Submitted command #{submitted.commandId} to run {runId}.</p>
      )}
      <CommandFeedbackView game={game} />
    </Section>
  );
}

function CommandField({ draft, field, onChange }: {
  readonly draft: CommandDraft;
  readonly field: (typeof COMMAND_FORMS)[CommandType][number];
  readonly onChange: (draft: CommandDraft) => void;
}) {
  const id = useId();
  const value = draft.values[field.name] ?? '';
  return (
    <>
      <label htmlFor={id}>{field.name}</label>
      {field.kind === 'choice' ? (
        <select id={id} data-field={field.name} value={value} onChange={(event) => { onChange(editDraft(draft, field.name, event.target.value)); }}>
          {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      ) : (
        <input
          id={id}
          data-field={field.name}
          type="number"
          min={field.min}
          max={field.max}
          step={field.integer ? 1 : 'any'}
          value={value}
          onChange={(event) => { onChange(editDraft(draft, field.name, event.target.value)); }}
        />
      )}
    </>
  );
}

function describeSave(last: RecordingSaveStatus): string | null {
  switch (last.status) {
    case 'none':
      return null;
    case 'requested':
      return `The browser accepted a download request for ${last.name} (final tick ${last.finalTick}); whether the file was written is not verified.`;
    case 'no-recording':
      return 'This run records nothing.';
    case 'failed':
      return `The ${last.stage === 'save' ? 'file save' : last.stage === 'file' ? 'file name' : 'recording export'} failed:\n${describeError(last.cause)}`;
  }
}

function RecordingSection({ diagnostics }: { readonly diagnostics: Diagnostics }) {
  const canExport = useDiagnostics(diagnostics, selectCanRead);
  const canRetry = useDiagnostics(diagnostics, selectCanRetry);
  const { last, retained } = useDiagnostics(diagnostics, (state) => state.recording);
  const message = describeSave(last);
  return (
    <Section title="Recording">
      <p role="note">
        The run records in memory only. Restarting, returning to the main menu or a hot reload discards a recording that was
        not exported.
      </p>
      <div style={rowStyle}>
        <button type="button" data-testid="dev-recording-export" disabled={!canExport} onClick={() => { diagnostics.exportRecording(); }}>
          Export recording
        </button>
        <button type="button" data-testid="dev-recording-retry" disabled={!canRetry} onClick={() => { diagnostics.retrySave(); }}>
          Retry save{retained ? ` of ${retained.name}` : ''}
        </button>
        {!canExport && <span>A faulted run, or no run, gives no new export.</span>}
      </div>
      {message !== null && (
        <pre role={last.status === 'failed' ? 'alert' : 'status'} data-testid="dev-recording-status" data-status={last.status} style={valueStyle}>
          {message}
        </pre>
      )}
    </Section>
  );
}

export function MissionDevPanel({ diagnostics, game, submitCommand, flight = null }: MissionDevPanelProps) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} data-testid="mission-dev-panel" style={panelStyle}>
      <h3 id={titleId}>Development diagnostics</h3>
      <p role="note">Development build only: reads the run through its public handle and submits commands through its normal queue.</p>
      <InspectionSection diagnostics={diagnostics} />
      <EventLogSection diagnostics={diagnostics} />
      <FrameSection diagnostics={diagnostics} />
      {flight && <FlightSection flight={flight} />}
      <CommandSection game={game} submitCommand={submitCommand} />
      <RecordingSection diagnostics={diagnostics} />
    </section>
  );
}
