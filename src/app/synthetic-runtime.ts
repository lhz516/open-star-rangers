import { CoreInputError } from '../core/errors.ts';
import {
  createSyntheticScene, readTickInput,
  type Command, type DomainEvent, type MoveInput, type SyntheticScene,
  type SyntheticSceneConfig, type SyntheticRenderState, type SyntheticUiProjection,
} from '../core/synthetic-scene.ts';
import { FixedStepClock } from './fixed-step-clock.ts';
import { GameRuntimeError } from './runtime-errors.ts';
import { SyntheticEventBus, type EventListener, type PendingDelivery } from './synthetic-event-bus.ts';

export interface SyntheticRuntimeOptions {
  readonly scene: SyntheticSceneConfig;
  readonly maxTicksPerFrame?: number;
}

export interface RenderFrame {
  readonly previous: SyntheticRenderState;
  readonly current: SyntheticRenderState;
  readonly alpha: number;
}

export interface SyntheticRuntime {
  frame(nowMs: number): Readonly<{ ticks: number; capped: boolean }>;
  submitCommand(command: Command): number;
  setInput(input: MoveInput): void;
  on<T extends DomainEvent['type']>(type: T, listener: EventListener<Extract<DomainEvent, { type: T }>>): () => void;
  onAny(listener: EventListener): () => void;
  renderFrame(): RenderFrame;
  uiProjection(): SyntheticUiProjection;
  exportRecording(): null;
}

function invalid(path: string, reason: string): never {
  throw new GameRuntimeError({ kind: 'invalid-argument', path, reason });
}

function optionsRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) invalid('options', 'must be an object');
  for (const key of Object.keys(value)) {
    if (key !== 'scene' && key !== 'maxTicksPerFrame') invalid(`options.${key}`, 'is not a known field');
  }
  return value as Record<string, unknown>;
}

function coreInput<T>(read: () => T, from: string, to: string): T {
  try {
    return read();
  } catch (error) {
    if (error instanceof CoreInputError) {
      throw new GameRuntimeError({
        kind: 'invalid-argument', path: error.path.replace(from, to), reason: error.reason, cause: error,
      });
    }
    throw error;
  }
}

interface QueuedCommand {
  readonly id: number;
  readonly command: Command;
}

class Runtime implements SyntheticRuntime {
  readonly #scene: SyntheticScene;
  readonly #clock: FixedStepClock;
  readonly #bus = new SyntheticEventBus();
  #input: MoveInput = Object.freeze({ moveX: 0 });
  #commands: QueuedCommand[] = [];
  #nextCommandId = 1;
  #previous: SyntheticRenderState;
  #current: SyntheticRenderState;
  #alpha = 0;
  #inFrame = false;
  #fault: GameRuntimeError | undefined;

  constructor(scene: SyntheticScene, maxTicksPerFrame: number) {
    this.#scene = scene;
    this.#clock = new FixedStepClock(scene.uiProjection().tickRateHz, maxTicksPerFrame);
    this.#previous = this.#current = scene.renderState();
  }

  frame(nowMs: number): Readonly<{ ticks: number; capped: boolean }> {
    this.#requireHealthy();
    if (this.#inFrame) throw new GameRuntimeError({ kind: 'reentrant-call' });
    this.#inFrame = true;
    try {
      const timing = this.#clock.advance(nowMs);
      const input = this.#input;
      const queued = this.#commands;
      const commands = timing.ticks === 0 ? [] : queued.map(entry => entry.command);
      const pending: PendingDelivery[] = [];
      for (let index = 0; index < timing.ticks; index++) {
        let events: readonly DomainEvent[];
        try {
          events = this.#scene.step({ input, commands: index === 0 ? commands : [] });
        } catch (cause) {
          this.#alpha = 0;
          throw this.#fail(cause);
        }
        if (index === 0) this.#commands = [];
        this.#previous = this.#current;
        this.#current = this.#scene.renderState();
        for (const event of events) pending.push({ event, delivery: { commandId: queued[event.commandIndex].id } });
      }
      this.#alpha = timing.alpha;
      if (pending.length > 0) this.#bus.dispatch(pending);
      return Object.freeze({ ticks: timing.ticks, capped: timing.capped });
    } finally {
      this.#inFrame = false;
    }
  }

  submitCommand(command: Command): number {
    this.#requireHealthy();
    if (this.#nextCommandId === Number.MAX_SAFE_INTEGER) throw this.#fail(new RangeError('commandId exhausted'));
    const { commandTypes } = coreInput(
      () => readTickInput({ input: { moveX: 0 }, commands: [command] }), 'tickInput.commands[0]', 'command',
    );
    const id = this.#nextCommandId++;
    this.#commands.push({ id, command: Object.freeze({ type: commandTypes[0] }) });
    return id;
  }

  setInput(input: MoveInput): void {
    this.#requireHealthy();
    const { moveX } = coreInput(() => readTickInput({ input, commands: [] }), 'tickInput.input', 'input');
    this.#input = Object.freeze({ moveX });
  }

  on<T extends DomainEvent['type']>(type: T, listener: EventListener<Extract<DomainEvent, { type: T }>>): () => void {
    return this.#bus.on(type, listener);
  }

  onAny(listener: EventListener): () => void {
    return this.#bus.onAny(listener);
  }

  renderFrame(): RenderFrame {
    return Object.freeze({ previous: this.#previous, current: this.#current, alpha: this.#alpha });
  }

  uiProjection(): SyntheticUiProjection {
    return this.#scene.uiProjection();
  }

  exportRecording(): null {
    return null;
  }

  #fail(cause: unknown): GameRuntimeError {
    this.#fault ??= new GameRuntimeError({ kind: 'faulted', cause });
    return this.#fault;
  }

  #requireHealthy(): void {
    if (this.#fault) throw this.#fault;
  }
}

export function createSyntheticRuntime(options: SyntheticRuntimeOptions): SyntheticRuntime {
  const { scene: config, maxTicksPerFrame = 5 } = optionsRecord(options);
  if (typeof maxTicksPerFrame !== 'number' || !Number.isSafeInteger(maxTicksPerFrame) || maxTicksPerFrame < 1) {
    invalid('options.maxTicksPerFrame', 'must be a positive safe integer');
  }
  const scene = coreInput(() => createSyntheticScene(config as SyntheticSceneConfig), 'config', 'options.scene');
  return new Runtime(scene, maxTicksPerFrame);
}
