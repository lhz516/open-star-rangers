/** React access to a mission owner's game store. Components get reading only; there is no writer here. */
import { useStore } from 'zustand';
import type { GameStoreReader, GameUiState } from './game-store.ts';

/**
 * Subscribes a component to one selected value. The selector must return a scalar or a value whose identity changes
 * only when its content does (a stored field, or a cached derived object), so unrelated store updates, such as each
 * projection sample, do not re-render the component.
 */
export function useGame<Flow, T>(reader: GameStoreReader<Flow>, selector: (state: GameUiState<Flow>) => T): T {
  return useStore(reader, selector);
}
