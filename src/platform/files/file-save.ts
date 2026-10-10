import type { FileSave, FileSaveResult } from '../../app/mission/mission-ports.ts';
import { RollbackError } from '../../app/session/rollback-error.ts';

/** A temporary download element; the browser passes an `<a download>`. */
export interface DownloadLink {
  click(): void;
  remove(): void;
}

export interface FileSaveHost {
  createObjectURL(blob: Blob): string;
  revokeObjectURL(url: string): void;
  /** Adds a hidden link that downloads `url` as `name`. Atomic: throwing means no link remains attached. */
  attachLink(url: string, name: string): DownloadLink;
}

const REQUESTED: FileSaveResult = Object.freeze({ status: 'requested' });
const DISPOSED: FileSaveResult = Object.freeze({ status: 'failed', reason: 'disposed' });

function failed(reason: 'failed' | 'cleanup-failed', error: unknown): FileSaveResult {
  return Object.freeze({ status: 'failed', reason, error });
}

/**
 * Development file saves (P3-04 开发诊断). Each save creates a Blob, its object URL and a temporary link, clicks the
 * link and releases both again before returning, in reverse order, each attempted once. Releasing right after the click
 * is safe because a download resolves its blob URL when the click starts it (URL standard, blob URL entry). Disposing
 * the owner, even from inside a save, leaves that save's own release in place and refuses every later save.
 */
export function createFileSave(host: FileSaveHost): FileSave {
  let disposed = false;
  return {
    save(name, text) {
      if (disposed) return DISPOSED;
      const releases: (() => void)[] = [];
      let failure: { readonly error: unknown } | null = null;
      try {
        const url = host.createObjectURL(new Blob([text], { type: 'application/octet-stream' }));
        releases.push(() => { host.revokeObjectURL(url); });
        const link = host.attachLink(url, name);
        releases.push(() => { link.remove(); });
        link.click();
      } catch (error) {
        failure = { error };
      }
      const errors: unknown[] = [];
      for (const release of releases.reverse()) {
        try { release(); } catch (error) { errors.push(error); }
      }
      if (errors.length > 0) {
        return failed('cleanup-failed', failure ? new RollbackError(failure.error, errors, 'File save and its release failed')
          : new AggregateError(errors, 'File save release failed'));
      }
      return failure ? failed('failed', failure.error) : REQUESTED;
    },
    dispose() {
      disposed = true;
      return undefined;
    },
  };
}
