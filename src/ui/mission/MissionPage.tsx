/**
 * The mission screen's page (docs/plan/p3/04/spec.md: 应用流程, 衔接占位, 任务开始配置, 任务菜单、暂停与退出): it shows the
 * current mission owner where its flow is, the G-02/1 introduction, the start page, the G-02/2 departure, the flight
 * shell or the mission menu, and below them the development panel the app passes in development builds. The owner is
 * created and released outside this component; the page renders its snapshot and calls its intents from event
 * handlers. The screen carries the owner, its run and the latest sampled Core tick as read-only data attributes for
 * lifecycle evidence; nothing here holds a world reference. The mission input, when the app passes one, reaches the
 * shell with the flow change that showed it and its G-item notice, timed here for the owner's lifetime, and the start
 * page as its full screen request (docs/plan/p3/05/spec.md: 输入区与焦点, 暂缺标注, 全屏与 Keyboard Lock).
 */
import { useSyncExternalStore, type ReactNode } from 'react';
import { MissionUnavailableError, type MissionOwner } from '../../app/mission/mission-owner.ts';
import { selectRunId, selectTick, type GameStoreReader } from '../game/game-store.ts';
import { useGame } from '../game/use-game.ts';
import { useGapNotice, type MissionInputView } from './InputNotices.tsx';
import { describeStructure, eligibilityReason } from './mission-copy.ts';
import { MissionMenuPage } from './MissionMenuPage.tsx';
import { MissionShell } from './MissionShell.tsx';
import { PlaceholderPage } from './PlaceholderPage.tsx';
import { StartConfigPage } from './StartConfigPage.tsx';
import { useInputFocusEntry } from './use-input-focus.ts';

export interface MissionPageProps {
  /** The current owner with its UI store; null while it is prepared, between owners, and when none could open. */
  readonly mission: { readonly owner: MissionOwner; readonly game: GameStoreReader } | null;
  /** Why no owner could be opened, such as a package that is no longer eligible. */
  readonly openFailure: { readonly cause: unknown } | null;
  /** The development diagnostics panel; null in production builds. */
  readonly devPanel: ReactNode;
  readonly onReturn: () => void;
  /** The current owner's mission input; without one the pages keep their P3-04 behaviour. */
  readonly input?: MissionInputView | null;
}

/**
 * The screen root with the run evidence attributes. Only it follows each sampled tick: its children are elements its
 * parent made, so a tick re-renders this element and not the pages under it.
 */
function RunFrame({ ownerId, game, position, children }: {
  readonly ownerId: number;
  readonly game: GameStoreReader;
  readonly position: string;
  readonly children: ReactNode;
}) {
  const runId = useGame(game, selectRunId);
  const tick = useGame(game, selectTick);
  return (
    <div data-testid="mission-screen" data-owner={ownerId} data-run={runId ?? ''} data-tick={tick ?? ''} data-position={position}>
      {children}
    </div>
  );
}

function OwnerPages({ owner, game, devPanel, onReturn, input = null }: Omit<MissionPageProps, 'mission' | 'openFailure'> & {
  readonly owner: MissionOwner;
  readonly game: GameStoreReader;
}) {
  const snapshot = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  const { position } = snapshot.flow;
  const { placeholder } = snapshot;
  const entry = useInputFocusEntry(position);
  const gap = useGapNotice(input?.gap ?? null);
  let page: ReactNode = null;
  if ((position === 'intro' || position === 'departure') && placeholder) {
    // Keyed by placeholder, so each one mounts afresh and takes focus.
    page = <PlaceholderPage key={placeholder.id} placeholder={placeholder} onSkip={id => { owner.skip(id); }} onReturn={onReturn} />;
  } else if (position === 'config') {
    page = <StartConfigPage snapshot={snapshot} owner={owner} onReturn={onReturn} startWithFullscreen={input?.fullscreen.requestOnStart} />;
  } else if (position === 'menu') {
    page = <MissionMenuPage snapshot={snapshot} owner={owner} onReturn={onReturn} />;
  } else if (position === 'flight' || position === 'ended') {
    page = <MissionShell snapshot={snapshot} owner={owner} onReturn={onReturn} input={input} entry={entry} gap={gap} />;
  }
  return (
    <RunFrame ownerId={owner.ownerId} game={game} position={position}>
      {page}
      {devPanel}
    </RunFrame>
  );
}

export function MissionPage({ mission, openFailure, devPanel, onReturn, input = null }: MissionPageProps) {
  if (mission) {
    // Keyed, so nothing a replaced owner's pages or panel held survives into the next owner's, whose runIds restart at 1.
    return (
      <OwnerPages key={mission.owner.ownerId} owner={mission.owner} game={mission.game} devPanel={devPanel} onReturn={onReturn} input={input} />
    );
  }
  return (
    <section aria-labelledby="mission-unavailable-heading" data-testid="mission-screen" data-owner="" data-run="" data-tick="">
      <h2 id="mission-unavailable-heading">Mission</h2>
      {openFailure ? (
        <>
          <div role="alert" className="failure-alert" data-testid="mission-open-failure">
            <p>The mission could not be opened.</p>
            {openFailure.cause instanceof MissionUnavailableError
              ? <p>{eligibilityReason(openFailure.cause.eligibility)}</p>
              : <pre>{describeStructure(openFailure.cause)}</pre>}
          </div>
          <p><button type="button" onClick={onReturn}>Return to main menu</button></p>
        </>
      ) : (
        <p role="status">Preparing the mission…</p>
      )}
    </section>
  );
}
