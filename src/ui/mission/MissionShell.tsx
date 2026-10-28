/**
 * The mission screen during flight and after a run ended (docs/plan/p3/04/spec.md: 应用流程, 任务菜单、暂停与退出): the
 * game view area with the flight picture of P3-12, whose cockpit and HUD are P3-13's; the project status bar outside it with
 * the phase, the pause reason, why resume is unavailable, the missing music (G-01) and the sound effects still in progress
 * (P3-14, not a G item); pause, resume and mission menu
 * controls; and, once the run faulted or stopped, its reason without imported content, with restart (unless a cleanup
 * failed) and the way back. Focus starts on the heading.
 *
 * With the mission input (docs/plan/p3/05/spec.md: 输入区与焦点, 全屏与 Keyboard Lock), the game view holds the one game
 * input zone and the shell adds the input's notices and a full screen button for the whole page. Right after the
 * departure or a running hold ended or Continue resumed the run, focus starts on the zone instead when `useShellFocus`
 * allows. While the sampled projection shows the base view, the game view holds the G-05 base page (P3-10).
 */
import type { MissionOwner, MissionOwnerSnapshot } from '../../app/mission/mission-owner.ts';
import type { GameStoreReader } from '../game/game-store.ts';
import { useGame } from '../game/use-game.ts';
import { selectBaseShown } from './base-page.ts';
import { BasePage } from './BasePage.tsx';
import { FlightView, type MissionFlightView } from './FlightView.tsx';
import { GameInputZone } from './GameInputZone.tsx';
import { fullscreenButtonState, type GapNotice, type InputFocusEntry } from './input-notices.ts';
import { InputNotices, type MissionInputView } from './InputNotices.tsx';
import { describeStructure, FLIGHT_IN_PROGRESS, FULLSCREEN_BUTTON, pauseText, phaseText, resumeBlockedText } from './mission-copy.ts';
import { ActionErrorAlert, GapNote, GapNotes, SkeletonNote } from './MissionParts.tsx';
import { SLICE_GAPS } from './slice-gaps-copy.ts';
import { useShellFocus } from './use-input-focus.ts';

export interface MissionShellProps {
  readonly snapshot: MissionOwnerSnapshot;
  readonly owner: Pick<MissionOwner, 'pause' | 'resume' | 'openMenu' | 'restart'>;
  readonly onReturn: () => void;
  /** The mission input; without one the game view has no input zone and focus always starts on the heading. */
  readonly input?: MissionInputView | null;
  /** The flow change that showed the shell, after which focus may start on the input zone. */
  readonly entry?: InputFocusEntry | null;
  /** The G-item notice to show now. */
  readonly gap?: GapNotice | null;
  /** The owner's UI store. */
  readonly game: GameStoreReader;
  /** The owner's flight picture; without one the flight area shows only its note. */
  readonly flight?: MissionFlightView | null;
}

/** The game view's content: the base page in the base view, otherwise the flight area. */
function GameView({ game, flight }: { readonly game: GameStoreReader; readonly flight: MissionFlightView | null }) {
  return useGame(game, selectBaseShown) ? <BasePage game={game} /> : <FlightView flight={flight} />;
}

function EndedNotice({ snapshot, owner, onReturn }: Pick<MissionShellProps, 'snapshot' | 'owner' | 'onReturn'>) {
  const { flow, session, cleanupFailure } = snapshot;
  const canRestart = cleanupFailure === null && flow.ended !== 'cleanup-failed';
  return (
    <div data-testid="mission-ended" data-ended={flow.ended}>
      <div role="alert" className="failure-alert">
        {flow.ended === 'stopped' && (
          <p>
            The run stopped: its development recording reached its capacity. The diagnostics panel can still export it;
            restarting or returning discards it.
          </p>
        )}
        {flow.ended === 'faulted' && <p>The run stopped on a fault and cannot continue.</p>}
        {flow.ended === 'cleanup-failed' && <p>Ending the run could not be cleaned up, so no new run can start.</p>}
        {session.error && <pre>{describeStructure(session.error)}</pre>}
      </div>
      <p className="mission-actions">
        {canRestart && <button type="button" onClick={() => { owner.restart(); }}>Restart mission</button>}
        <button type="button" onClick={onReturn}>Return to main menu</button>
      </p>
      {canRestart && <GapNote id="G-06" />}
    </div>
  );
}

export function MissionShell({ snapshot, owner, onReturn, input = null, entry = null, gap = null, game, flight = null }: MissionShellProps) {
  const { session, flow, actionError } = snapshot;
  const running = session.phase === 'running';
  const focus = useShellFocus(entry, running, input?.bindZone);
  const paused = pauseText(session);
  const blocked = resumeBlockedText(session);
  const inFlight = flow.position === 'flight';
  const fullscreenButton = input ? fullscreenButtonState(input.fullscreen.status) : 'hidden';
  const view = <GameView game={game} flight={flight} />;
  return (
    <section aria-labelledby="mission-shell-heading" data-testid="mission-shell">
      <h2 id="mission-shell-heading" ref={focus.heading} tabIndex={-1}>Mission</h2>
      <SkeletonNote />
      <div className="mission-view" data-testid="mission-view">
        {input ? <GameInputZone zoneRef={focus.zone}>{view}</GameInputZone> : view}
      </div>
      {input && <InputNotices input={input} gap={gap} running={inFlight && running} />}
      <div className="mission-status-bar" data-testid="mission-status" data-phase={session.phase} data-pause={session.pauseReason ?? ''}>
        <span>Phase: {phaseText(session.phase)}</span>
        {paused && <span>{paused}</span>}
        {blocked && <span id="mission-resume-blocked">{blocked}</span>}
        <span data-gap="G-01">{SLICE_GAPS['G-01'].title} (G-01)</span>
        <span data-testid="flight-in-progress">{FLIGHT_IN_PROGRESS}</span>
      </div>
      {inFlight && (
        <p className="mission-actions">
          {/* One control that switches between pause and resume, so focus stays on it. */}
          {session.phase === 'paused' ? (
            <button
              type="button"
              disabled={blocked !== null}
              aria-describedby={blocked ? 'mission-resume-blocked' : undefined}
              onClick={() => { owner.resume(); }}
            >
              Resume
            </button>
          ) : (
            <button type="button" disabled={session.phase !== 'running'} onClick={() => { owner.pause(); }}>Pause</button>
          )}
          <button type="button" disabled={session.phase !== 'running' && session.phase !== 'paused'} onClick={() => { owner.openMenu(); }}>
            Mission menu
          </button>
          {input && fullscreenButton !== 'hidden' && (
            <button type="button" disabled={fullscreenButton === 'disabled'} onClick={() => { input.fullscreen.request(); }}>
              {FULLSCREEN_BUTTON}
            </button>
          )}
        </p>
      )}
      <ActionErrorAlert error={actionError} />
      {flow.position === 'ended' && <EndedNotice snapshot={snapshot} owner={owner} onReturn={onReturn} />}
      <GapNotes ids={['G-01', 'G-02/1', 'G-02/2']} />
    </section>
  );
}
