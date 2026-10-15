/**
 * The G-05 base page's reading of the projection (docs/plan/p3/10/spec.md: 基地内部、修理与补给 (只读视图), 缺省与标注):
 * the base service in its one order (both the service queue and the display order, BS5), each row's item, state and
 * whether it is being serviced, the selection, the base's three completion marks, and the player's energy, hull and
 * selected missile ammunition. DOM-free, so Node tests read it; BasePage.tsx shows it. It reads the projection only and
 * derives no timing: the projection has no service dues or rates, so there is no countdown.
 */
import type { Projection, ResourceReading } from '../../core/projections/projection.ts';
import { projectedBase, type GameUiState } from '../game/game-store.ts';
import { GAME_INPUT_BINDINGS } from '../game-input/bindings.ts';
import { BASE_PAGE } from './slice-gaps-copy.ts';

export interface BaseRowView {
  /** 0 is the top row. */
  readonly row: number;
  /** The TABL 10165 record index. */
  readonly record: number;
  readonly selector: number;
  /** The service state `0x39cb4`: 0 needs no service. */
  readonly state: number;
  readonly name: string;
  /**
   * The top row while it needs service, which the next repair step services. A later row is not marked: the steps never
   * pass a top row that needs none (BS6), so whether it is reached depends on the player's Enter.
   */
  readonly inService: boolean;
  readonly selected: boolean;
}

export interface BasePageView {
  readonly baseEntityId: number | null;
  readonly rows: readonly BaseRowView[];
  readonly cursor: number;
  readonly flags: { readonly repairsComplete: boolean; readonly energyAndMissilesFull: boolean; readonly hullFull: boolean };
  /** Null when the combat readings are not available. */
  readonly energy: ResourceReading | null;
  readonly hull: ResourceReading | null;
  /** The selected missile mount chain's ammunition; null without one. */
  readonly missiles: number | null;
}

const ITEM_NAMES: Readonly<Record<number, string>> = BASE_PAGE.itemNames;

/** An item's project name by its selector; an unknown subsystem is named by its number. */
export const serviceItemName = (selector: number): string =>
  (Object.hasOwn(ITEM_NAMES, selector) ? ITEM_NAMES[selector] : BASE_PAGE.unknownItem(selector));

/** The base page's view, or null outside the base view (the communications partition gives no base then). */
export function basePageView(projection: Projection): BasePageView | null {
  const base = projectedBase(projection);
  if (base === null) return null;
  const { combat: group } = projection.flight;
  const combat = group.readiness === 'ready' ? group.player : null;
  return {
    baseEntityId: base.baseEntityId,
    rows: base.rows.map(({ record, selector, state }, row) => ({
      row, record, selector, state, name: serviceItemName(selector), inService: row === 0 && state !== 0, selected: row === base.cursor,
    })),
    cursor: base.cursor,
    flags: base.flags,
    energy: combat?.resources.energy ?? null,
    hull: combat?.resources.hull ?? null,
    missiles: combat?.weapons[1].ammunition ?? null,
  };
}

/** Whether the latest sampled projection shows the base view: a scalar, so the shell re-renders only as it changes. */
export const selectBaseShown = ({ projection }: GameUiState): boolean => projection !== null && projectedBase(projection) !== null;

/** The commands the base context binds: their latest settled result is the page's command feedback. */
const BASE_COMMANDS: ReadonlySet<string> = new Set(GAME_INPUT_BINDINGS.bindings.flatMap(({ contexts, action }) =>
  (contexts.includes('base') && action.kind === 'command' ? [action.command.type] : [])));

/** Where the page's feedback starts: the run and its highest commandId known as the page opened, and the error shown then. */
export interface BaseFeedbackStart {
  readonly runId: number | null;
  readonly commandId: number;
  readonly actionError: GameUiState['actionError'];
}

/**
 * The feedback start of a base page opening now, so that a flight command with a base command's type (Enter's speed
 * match is `confirm-selection`, M is `toggle-map` in flight too) and an earlier failure are not shown as the base's.
 * Every command submitted before is still pending or among the results, since a result leaves the list only after a
 * newer one.
 */
export function baseFeedbackStart({ status, pendingCommands, recentResults, actionError }: GameUiState): BaseFeedbackStart {
  const runId = status?.runId ?? null;
  const ids = [...pendingCommands, ...recentResults].filter((entry) => entry.runId === runId).map(({ commandId }) => commandId);
  return { runId, commandId: Math.max(0, ...ids), actionError };
}

/**
 * The latest base command settled since `start` as text, e.g. `confirm-selection: accepted` or `toggle-map: rejected
 * (not-implemented)`; null without one. Queryable on the page, not announced.
 */
export function lastBaseCommand(results: GameUiState['recentResults'], start: BaseFeedbackStart): string | null {
  const result = results.findLast(({ runId, commandId, commandType }) =>
    runId === start.runId && commandId > start.commandId && BASE_COMMANDS.has(commandType));
  if (!result) return null;
  return `${result.commandType}: ${result.outcome}${result.reason === null ? '' : ` (${result.reason})`}`;
}

/** A submission failure since `start`; the one shown as the page opened belongs to an earlier action. */
export const baseActionError = (actionError: GameUiState['actionError'], start: BaseFeedbackStart): GameUiState['actionError'] =>
  (actionError === start.actionError ? null : actionError);
