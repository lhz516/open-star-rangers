import { describe, expect, it } from 'vitest';
import config from '../vite.config.ts';
import { PREVIEW_CONTENT_SECURITY_POLICY } from './preview-csp.ts';

// P2-11 S-11 and technical decision 11: only the local production preview sends the strict policy.
describe('preview Content Security Policy', () => {
  const directives = new Map(PREVIEW_CONTENT_SECURITY_POLICY.split(';').map(directive => {
    const [name, ...sources] = directive.trim().split(/\s+/);
    return [name, sources] as const;
  }));

  it('allows scripts, Workers and styles from the same origin only, and denies everything else by default', () => {
    expect(directives.get('default-src')).toEqual(["'none'"]);
    for (const name of ['script-src', 'worker-src', 'style-src', 'img-src', 'connect-src']) expect(directives.get(name), name).toEqual(["'self'"]);
    for (const name of ['base-uri', 'form-action', 'frame-ancestors']) expect(directives.get(name), name).toEqual(["'none'"]);
  });

  it('names no unsafe keyword, blob or data scheme, wildcard or other origin', () => {
    const sources = [...directives.values()].flat();
    expect(sources.filter(source => !["'self'", "'none'"].includes(source))).toEqual([]);
    expect(PREVIEW_CONTENT_SECURITY_POLICY).not.toMatch(/unsafe|blob:|data:|\*|https?:/);
  });

  it('is sent by the preview server and not by the development server', () => {
    expect(config.preview?.headers).toEqual({ 'Content-Security-Policy': PREVIEW_CONTENT_SECURITY_POLICY });
    expect(config.server?.headers).toBeUndefined();
  });
});
