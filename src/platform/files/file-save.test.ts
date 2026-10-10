import { describe, expect, it } from 'vitest';
import { RollbackError } from '../../app/session/rollback-error.ts';
import type { FileSave } from '../../app/mission/mission-ports.ts';
import { createFileSave } from './file-save.ts';
import type { DownloadLink, FileSaveHost } from './file-save.ts';

type Step = 'create' | 'attach' | 'click';

class Host implements FileSaveHost {
  readonly log: string[] = [];
  readonly blobs: Blob[] = [];
  failAt: Step | null = null;
  readonly failRelease = new Map<'revoke' | 'remove', Error>();
  onClick: (() => void) | null = null;
  readonly failure = new Error('injected');
  createObjectURL(blob: Blob): string {
    this.log.push('create');
    if (this.failAt === 'create') throw this.failure;
    this.blobs.push(blob);
    return `blob:test/${this.blobs.length}`;
  }
  revokeObjectURL(url: string): void {
    this.log.push(`revoke ${url}`);
    const failure = this.failRelease.get('revoke');
    if (failure) throw failure;
  }
  attachLink(url: string, name: string): DownloadLink {
    this.log.push(`attach ${url} ${name}`);
    if (this.failAt === 'attach') throw this.failure;
    return {
      click: () => {
        this.log.push('click');
        this.onClick?.();
        if (this.failAt === 'click') throw this.failure;
      },
      remove: () => {
        this.log.push('remove');
        const failure = this.failRelease.get('remove');
        if (failure) throw failure;
      },
    };
  }
}

function setup(): { host: Host; files: FileSave } {
  const host = new Host();
  return { host, files: createFileSave(host) };
}

describe('file save', () => {
  it('acquires nothing until a save', () => {
    const { host } = setup();
    expect(host.log).toEqual([]);
  });

  it('clicks a link to a Blob of the text, then removes the link and revokes the URL before returning', async () => {
    const { host, files } = setup();
    const result = files.save('run.json', '{"tick":1,"name":"\u00e9"}');
    expect(result).toEqual({ status: 'requested' });
    expect(Object.isFrozen(result)).toBe(true);
    expect(host.log).toEqual(['create', 'attach blob:test/1 run.json', 'click', 'remove', 'revoke blob:test/1']);
    expect(host.blobs[0]!.type).toBe('application/octet-stream');
    // 21 code units, one of them two bytes in UTF-8.
    expect(host.blobs[0]!.size).toBe(22);
    expect(await host.blobs[0]!.text()).toBe('{"tick":1,"name":"\u00e9"}');
  });

  it('gives each save its own URL and link', () => {
    const { host, files } = setup();
    files.save('a.json', 'a');
    files.save('b.json', 'b');
    expect(host.log).toEqual([
      'create', 'attach blob:test/1 a.json', 'click', 'remove', 'revoke blob:test/1',
      'create', 'attach blob:test/2 b.json', 'click', 'remove', 'revoke blob:test/2',
    ]);
  });

  it('releases what it acquired when a step fails, reports the failure, and can be retried', () => {
    const logs: Record<Step, string[]> = {
      create: ['create'],
      attach: ['create', 'attach blob:test/1 x.json', 'revoke blob:test/1'],
      click: ['create', 'attach blob:test/1 x.json', 'click', 'remove', 'revoke blob:test/1'],
    };
    for (const step of ['create', 'attach', 'click'] as const) {
      const { host, files } = setup();
      host.failAt = step;
      const result = files.save('x.json', 'x');
      expect(result).toEqual({ status: 'failed', reason: 'failed', error: host.failure });
      expect(Object.isFrozen(result)).toBe(true);
      expect(host.log).toEqual(logs[step]);
      host.failAt = null;
      host.log.length = 0;
      expect(files.save('x.json', 'x').status).toBe('requested');
      expect(host.log.at(-1)).toMatch(/^revoke /);
    }
  });

  it('attempts every release once and reports a failed release after a requested download', () => {
    const { host, files } = setup();
    const removal = new Error('remove failed');
    const revocation = new Error('revoke failed');
    host.failRelease.set('remove', removal).set('revoke', revocation);
    const result = files.save('x.json', 'x');
    expect(host.log).toEqual(['create', 'attach blob:test/1 x.json', 'click', 'remove', 'revoke blob:test/1']);
    expect(result).toMatchObject({ status: 'failed', reason: 'cleanup-failed' });
    const error = (result as { error: unknown }).error;
    expect(error).toBeInstanceOf(AggregateError);
    expect(error).not.toBeInstanceOf(RollbackError);
    expect((error as AggregateError).errors).toEqual([removal, revocation]);
  });

  it('reports a failed step whose release also failed as a rollback failure', () => {
    const { host, files } = setup();
    const revocation = new Error('revoke failed');
    host.failAt = 'attach';
    host.failRelease.set('revoke', revocation);
    const result = files.save('x.json', 'x');
    expect(result).toMatchObject({ status: 'failed', reason: 'cleanup-failed' });
    const error = (result as { error: unknown }).error as RollbackError;
    expect(error).toBeInstanceOf(RollbackError);
    expect(error.cause).toBe(host.failure);
    expect(error.errors).toEqual([host.failure, revocation]);
  });

  it('refuses saves after its owner disposes it, without acquiring anything', () => {
    const { host, files } = setup();
    expect(files.dispose()).toBeUndefined();
    expect(files.dispose()).toBeUndefined();
    const result = files.save('x.json', 'x');
    expect(result).toEqual({ status: 'failed', reason: 'disposed' });
    expect(Object.isFrozen(result)).toBe(true);
    expect(host.log).toEqual([]);
  });

  it('still releases a save once when its owner disposes it during the click', () => {
    const { host, files } = setup();
    host.onClick = () => { files.dispose(); };
    expect(files.save('x.json', 'x')).toEqual({ status: 'requested' });
    expect(host.log).toEqual(['create', 'attach blob:test/1 x.json', 'click', 'remove', 'revoke blob:test/1']);
    expect(files.save('y.json', 'y')).toEqual({ status: 'failed', reason: 'disposed' });
    expect(host.log).toHaveLength(5);
  });
});
