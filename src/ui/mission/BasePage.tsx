/**
 * The G-05 base page (docs/plan/p3/10/spec.md: 缺省与标注, 技术决定 10): a labelled project page inside the game input
 * zone while the player is in the base view. It reads the sampled projection from the owner's store and shows the
 * service rows in their one order with each item, its state in words and whether it is being serviced, the selection,
 * the base's completion marks, the readings, the base keys (wired, project controls, or awaiting a later task), and the
 * result of the last base command and a failed submission since the page opened. It binds no key and has no mouse rule entry: the input zone around it
 * submits the bound base commands through the command feedback, once per key press.
 */
import { useMemo, useState } from 'react';
import type { ResourceReading } from '../../core/projections/projection.ts';
import { useGame } from '../game/use-game.ts';
import type { GameStoreReader, GameUiState } from '../game/game-store.ts';
import { baseActionError, baseFeedbackStart, basePageView, lastBaseCommand } from './base-page.ts';
import { describeStructure } from './mission-copy.ts';
import { GapNote } from './MissionParts.tsx';
import { BASE_PAGE } from './slice-gaps-copy.ts';

const selectProjection = (state: GameUiState) => state.projection;
const selectResults = (state: GameUiState) => state.recentResults;
const selectActionError = (state: GameUiState) => state.actionError;

const reading = (value: ResourceReading | null): string =>
  (value === null ? BASE_PAGE.readings.unavailable : `${value.current} / ${value.maximum}`);

export function BasePage({ game }: { readonly game: GameStoreReader }) {
  const projection = useGame(game, selectProjection);
  const results = useGame(game, selectResults);
  const [start] = useState(() => baseFeedbackStart(game.getState()));
  const actionError = baseActionError(useGame(game, selectActionError), start);
  const view = useMemo(() => (projection === null ? null : basePageView(projection)), [projection]);
  const lastCommand = useMemo(() => lastBaseCommand(results, start), [results, start]);
  if (view === null) return null;
  const { rows, flags } = view;
  return (
    <section className="base-page" aria-labelledby="base-page-heading" data-testid="base-page" data-cursor={view.cursor} data-base={view.baseEntityId ?? ''}>
      <h3 id="base-page-heading">{BASE_PAGE.title} ({BASE_PAGE.gap})</h3>
      <GapNote id={BASE_PAGE.gap} />
      <table className="base-service" data-testid="base-service">
        <caption>{BASE_PAGE.noProgress} {BASE_PAGE.namesNote}</caption>
        <thead>
          <tr>{Object.values(BASE_PAGE.columns).map(column => <th key={column} scope="col">{column}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr
              key={row.record}
              className="base-service-row"
              aria-current={row.selected ? 'true' : undefined}
              data-row={row.row}
              data-record={row.record}
              data-selector={row.selector}
              data-state={row.state}
              data-in-service={row.inService}
              data-selected={row.selected}
            >
              <td>{row.row + 1}</td>
              <th scope="row">{row.name}</th>
              <td>{BASE_PAGE.state(row.state)}</td>
              <td>{row.inService ? BASE_PAGE.inService : ''}</td>
              <td>{row.selected ? BASE_PAGE.selected : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="base-readings" data-testid="base-readings" aria-label={BASE_PAGE.readings.title}>
        <div data-reading="energy"><dt>{BASE_PAGE.readings.energy}</dt><dd>{reading(view.energy)}</dd></div>
        <div data-reading="hull"><dt>{BASE_PAGE.readings.hull}</dt><dd>{reading(view.hull)}</dd></div>
        <div data-reading="missiles">
          <dt>{BASE_PAGE.readings.missiles}</dt><dd>{view.missiles ?? BASE_PAGE.readings.unavailable}</dd>
        </div>
        {(Object.keys(BASE_PAGE.flags) as (keyof typeof flags)[]).map(flag => (
          <div key={flag} data-flag={flag} data-set={flags[flag]}>
            <dt>{BASE_PAGE.flags[flag]}</dt><dd>{flags[flag] ? BASE_PAGE.yes : BASE_PAGE.no}</dd>
          </div>
        ))}
      </dl>
      <ul className="base-keys" data-testid="base-keys">
        {BASE_PAGE.keys.map(({ keys, status, text }) => (
          <li key={keys} data-key-status={status}><kbd>{keys}</kbd> ({BASE_PAGE.keyStatus[status]}): {text}</li>
        ))}
      </ul>
      <p data-testid="base-last-command">{BASE_PAGE.lastCommand}: {lastCommand ?? BASE_PAGE.noCommand}</p>
      {actionError && (
        <div role="alert" className="failure-alert" data-testid="base-command-error" data-operation={actionError.operation}>
          <p>{BASE_PAGE.sendFailed(actionError.operation)}</p>
          <pre>{describeStructure(actionError.cause)}</pre>
        </div>
      )}
    </section>
  );
}
