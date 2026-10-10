import { createFrameTiming } from '../../app/mission/dev-frame-timing.ts';
import { developmentRecording, type MissionOwnerConsumer, type MissionOwnerSetup } from '../../app/mission/mission-owner.ts';
import type { FileSave } from '../../app/mission/mission-ports.ts';
import { openMission, TestClock } from '../../app/mission/mission.test-support.ts';
import { ControlledHost } from '../../app/session/session-host.test-support.ts';
import { createFileSave, type DownloadLink, type FileSaveHost } from '../../platform/files/file-save.ts';
import { createGameCommandFeedback, type GameCommandFeedback } from '../game/game-command-feedback.ts';
import { createGameSessionBridge, type GameSessionBridge } from '../game/game-session-bridge.ts';
import { createGameStore, type GameStoreWriter } from '../game/game-store.ts';
import { createMissionDiagnostics } from './mission-diagnostics.ts';

// Node test support for the development diagnostics (P3-04 subtask 07): a real mission owner whose session host is
// wrapped by the frame timing, with the subtask 06 UI bridge and command feedback and a file save on a host double.

/**
 * A FileSaveHost that tracks what is acquired and not yet released: object URLs and attached links. Each step can be
 * made to fail; `blobs` keeps every Blob saved.
 */
export class SaveHost implements FileSaveHost {
  readonly urls = new Set<string>();
  readonly links = new Set<string>();
  readonly blobs: Blob[] = [];
  readonly names: string[] = [];
  created = 0;
  clickFailure: unknown;
  createFailure: unknown;
  revokeFailure: unknown;

  createObjectURL(blob: Blob): string {
    if (this.createFailure !== undefined) throw this.createFailure;
    const url = `blob:test/${++this.created}`;
    this.urls.add(url);
    this.blobs.push(blob);
    return url;
  }

  revokeObjectURL(url: string): void {
    if (this.revokeFailure !== undefined) throw this.revokeFailure;
    this.urls.delete(url);
  }

  attachLink(url: string, name: string): DownloadLink {
    const link = `${url} ${name}`;
    this.links.add(link);
    this.names.push(name);
    return {
      click: () => { if (this.clickFailure !== undefined) throw this.clickFailure; },
      remove: () => { this.links.delete(link); },
    };
  }

  /** Nothing acquired is still held. */
  get released(): boolean {
    return this.urls.size === 0 && this.links.size === 0;
  }

  /** The text of the `index`th Blob, the last by default. */
  text(index = this.blobs.length - 1): Promise<string> {
    return this.blobs[index].text();
  }
}

/** The subtask 06 store, bridge and command feedback of one owner, created as a `ui` consumer connects. */
export function uiConsumer() {
  let parts: { store: GameStoreWriter; bridge: GameSessionBridge; feedback: GameCommandFeedback } | null = null;
  let now = 0;
  const consumer: MissionOwnerConsumer = {
    stage: 'ui',
    connect(context) {
      const store = createGameStore(context.ownerId);
      const feedback = createGameCommandFeedback(store);
      // A clock 1 s on per read, so every frame publishes its projection.
      const bridge = createGameSessionBridge({ store, clock: () => (now += 1_000), consumers: [feedback] });
      bridge.bind(context.session);
      parts = { store, bridge, feedback };
      return { release: () => { bridge.unbind(); }, onSessionError: bridge.onError };
    },
  };
  const ui = () => {
    if (!parts) throw new Error('The UI consumer is not connected');
    return parts;
  };
  return { consumer, ui };
}

/**
 * Opens a development mission owner (recording `osr-test`) through `openMission`, whose session runs on `host`, a
 * ControlledHost wrapped by a frame timing on `timingClock`. Its consumers are the UI bridge and feedback, the timing,
 * the diagnostics, then `overrides.consumers`. `saves` is the host of the diagnostics' file save, `files()` that save.
 */
export async function openDiagnostics(overrides: Partial<MissionOwnerSetup> = {}) {
  const host = new ControlledHost();
  const timingClock = new TestClock();
  const timing = createFrameTiming(host, timingClock.read);
  const saves = new SaveHost();
  let files: FileSave | null = null;
  const diagnostics = createMissionDiagnostics({ timing, fileSave: () => (files = createFileSave(saves)) });
  const ui = uiConsumer();
  const mission = await openMission('mission-startable', {
    recording: developmentRecording('osr-test'),
    ...overrides,
    host: timing.host,
    consumers: [ui.consumer, timing.consumer, diagnostics.consumer, ...(overrides.consumers ?? [])],
  });
  return {
    ...mission, host, timingClock, timing, saves, files: () => files, diagnostics, state: () => diagnostics.reader.getState(), ui: ui.ui,
  };
}

export type OpenDiagnostics = Awaited<ReturnType<typeof openDiagnostics>>;
