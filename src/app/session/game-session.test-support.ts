import type { SessionVisibility } from './session-host.ts';
import { runtimeSpec, type RuntimeSpecParts } from '../runtime/game-runtime.test-support.ts';
import { createGameSession, type DepartureTransition, type GameRunSpec, type GameSession, type GameSessionRun } from './game-session.ts';
import type { GameSessionError } from './session-errors.ts';
import { ControlledHost } from './session-host.test-support.ts';

// Formal Session fixtures for Node tests: a ControlledHost and the Runtime test support's synthetic specs.

export interface RunSpecParts extends RuntimeSpecParts {
  readonly initialTransition?: DepartureTransition | null;
}

/** A fresh mutable run spec, by default without a wingman, recording or departure hold. */
export function runSpec(parts: RunSpecParts = {}): GameRunSpec {
  return { ...runtimeSpec(parts), initialTransition: parts.initialTransition ?? null };
}

export const departure = (variant: DepartureTransition['variant'] = 'solo'): DepartureTransition => ({ gap: 'G-02/2', variant });

/** An idle Session on a ControlledHost; `errors` collects what reaches onError, which then calls `outlet`. */
export function sessionSetup(visibility: SessionVisibility = 'visible', outlet?: (error: GameSessionError) => undefined) {
  const host = new ControlledHost();
  host.visibility = visibility;
  const errors: GameSessionError[] = [];
  const session = createGameSession(host, (error) => { errors.push(error); return outlet?.(error); });
  return { host, session, errors };
}

export function current(session: GameSession): GameSessionRun {
  const run = session.currentRun();
  if (!run) throw new Error('Expected a current run');
  return run;
}

/** A Session already started with `parts`. */
export function started(parts: RunSpecParts = {}, visibility: SessionVisibility = 'visible', outlet?: (error: GameSessionError) => undefined) {
  const setup = sessionSetup(visibility, outlet);
  setup.session.control({ type: 'start', spec: runSpec(parts) });
  return { ...setup, run: current(setup.session) };
}
