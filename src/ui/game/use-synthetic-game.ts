/** React access to the synthetic game store. Components get reading only; there is no writer here. */
import { useStore } from 'zustand';
import type { SyntheticGameState, SyntheticGameStoreReader } from './synthetic-game-store.ts';

/**
 * Subscribes a component to one selected value. The selector must return a scalar or a value
 * whose identity changes only when its content does (a stored field, or a cached availability
 * object), so unrelated store updates do not re-render the component.
 */
export function useSyntheticGame<T>(store: SyntheticGameStoreReader, selector: (state: SyntheticGameState) => T): T {
  return useStore(store, selector);
}
