import { join } from 'node:path';
import type { Browser, Page } from '@playwright/test';
import { ordinaryFiles } from '../../tools/compliance/distribution.ts';
import {
  auditNetwork, type AuditReport, type Canary, type DeclaredRequest, type Gap, type NetworkPolicy, type Violation,
} from '../../tools/e2e-network-policy.ts';
import { expect, test as base } from './browser-test.ts';
import { previewOrigin } from './environment.ts';
import { NetworkAudit, type ServedResponse } from './network-audit.ts';

export { expect };

// P2-12 S-06: the browser test with the network audit. Every case using this `test` is audited from before its first
// navigation until its pages close, and fails on any violation of the project's network policy (the production `dist/`
// allowlist or the development rules), on incomplete evidence, and on declared test requests that never happened.

/** A partial record to match: strings or patterns for text fields, nested objects field by field. */
export type Pattern<T> = { readonly [K in keyof T]?: T[K] extends string | undefined ? T[K] | RegExp : Pattern<NonNullable<T[K]>> | T[K] };

export interface Audit {
  /** `production` on the preview server, judged by the candidate's allowlist; `development` by the development rules. */
  readonly mode: NetworkPolicy['mode'];
  /** Synthetic markers that must not leave the browser in any representation the policy checks. */
  canaries(...canaries: Canary[]): void;
  /** Test-only requests the case makes on purpose, each without data and with its expected outcome. */
  declare(...requests: DeclaredRequest[]): void;
  /**
   * For control samples only: violations the case causes on purpose. Each pattern must match at least one violation,
   * and the violations they match are excluded from the zero-violation assertion.
   */
  expectViolations(...patterns: Pattern<Violation>[]): void;
  /** For control samples only: gaps the case causes on purpose, settled like `expectViolations`. */
  expectGaps(...patterns: Pattern<Gap>[]): void;
  /**
   * For control samples only: answers matching requests at the browser's network layer, so they never leave the
   * browser; a served Worker script is still held until the audit observes the Worker, which a page route prevents.
   */
  serve(url: RegExp, response: ServedResponse): void;
  /** Labels the events that follow in the report. */
  phase(name: string): void;
  /** Attaches another page, before it navigates. */
  attachPage(page: Page): Promise<void>;
  /** Attaches a target another CDP client created in `browser`, before it navigates. */
  attachTarget(browser: Browser, targetId: string): Promise<void>;
  /** Closes an attached page as the `close` phase, after which its unload traffic is in the report. */
  close(page: Page | string): Promise<void>;
  /**
   * Waits until every Worker whose script has passed the network layer is observed. A case that ends a Worker right
   * after creating it, such as cancelling at once, waits for this first, or the Worker may end unobserved and uncovered.
   */
  ready(): Promise<void>;
  /** The classification of what was observed so far; the audit continues. */
  report(): Promise<AuditReport>;
}

const root = join(import.meta.dirname, '..', '..');

/** The policy for the project's origin; `declared` and `canaries` are the case's lists, which it may still extend. */
function policy(baseURL: string | undefined, declared: readonly DeclaredRequest[], canaries: readonly Canary[]): NetworkPolicy {
  if (!baseURL) throw new Error('The network audit needs the project base URL');
  const origin = new URL(baseURL).origin;
  if (origin === previewOrigin) {
    return { mode: 'production', origin, files: ordinaryFiles(root, 'dist').map(path => path.slice('dist/'.length)), declared, canaries };
  }
  return { mode: 'development', origin, files: [...ordinaryFiles(root, 'src'), ...ordinaryFiles(root, 'e2e/entries')], declared, canaries };
}

function matches(record: unknown, pattern: unknown): boolean {
  if (pattern instanceof RegExp) return typeof record === 'string' && pattern.test(record);
  if (typeof pattern !== 'object' || pattern === null) return Object.is(record, pattern);
  if (typeof record !== 'object' || record === null) return false;
  return Object.entries(pattern).every(([key, value]) => matches((record as Record<string, unknown>)[key], value));
}

/** Splits records into those matching some pattern and the rest, and lists patterns that matched nothing. */
function settle<T>(records: readonly T[], patterns: readonly Pattern<T>[]) {
  return {
    unexpected: records.filter(record => !patterns.some(pattern => matches(record, pattern))),
    unmatched: patterns.filter(pattern => !records.some(record => matches(record, pattern))),
  };
}

const counts = (values: readonly string[]): Record<string, number> => {
  const result: Record<string, number> = {};
  for (const value of values) result[value] = (result[value] ?? 0) + 1;
  return result;
};

export const test = base.extend<{ audit: Audit }>({
  audit: [async ({ page, baseURL }, use, testInfo) => {
    const network = new NetworkAudit();
    const canaries: Canary[] = [];
    const declared: DeclaredRequest[] = [];
    const expectedViolations: Pattern<Violation>[] = [];
    const expectedGaps: Pattern<Gap>[] = [];
    const settings = policy(baseURL, declared, canaries);
    let finished = false;
    try {
      await network.attachPage(page);
      await use({
        mode: settings.mode,
        canaries: (...values) => { canaries.push(...values); },
        declare: (...requests) => { declared.push(...requests); },
        expectViolations: (...patterns) => { expectedViolations.push(...patterns); },
        expectGaps: (...patterns) => { expectedGaps.push(...patterns); },
        serve: (url, response) => { network.serve(url, response); },
        phase: name => { network.phase(name); },
        attachPage: other => network.attachPage(other),
        attachTarget: (browser, targetId) => network.attachTarget(browser, targetId),
        close: target => network.close(target),
        ready: () => network.ready(),
        report: async () => auditNetwork(await network.capture(), settings),
      });
      finished = true;
      const capture = await network.finish();
      const report = auditNetwork(capture, settings);
      const violations = settle(report.violations, expectedViolations);
      const gaps = settle(report.gaps, expectedGaps);
      await testInfo.attach('network-audit', {
        contentType: 'application/json',
        body: JSON.stringify({
          mode: settings.mode,
          complete: report.complete,
          targets: counts(capture.targets.map(target => `${target.type}${target.covered ? '' : ' (uncovered)'}`)),
          allowed: counts(report.allowed.map(entry => `${entry.kind} ${entry.channel}`)),
          violations: counts(report.violations.map(violation => `${violation.category}${expectedViolations.length && !violations.unexpected.includes(violation) ? ' (expected)' : ''}`)),
          unexpectedViolations: violations.unexpected, gaps: report.gaps, missingDeclared: report.missing,
        }, null, 1),
      });
      expect(violations.unexpected, 'Unexpected network audit violations').toEqual([]);
      expect(violations.unmatched, 'Expected network audit violations that did not occur').toEqual([]);
      expect(gaps.unexpected, 'Incomplete network audit evidence').toEqual([]);
      expect(gaps.unmatched, 'Expected network audit gaps that did not occur').toEqual([]);
      expect(report.missing, 'Declared test requests that did not occur').toEqual([]);
    } finally {
      if (!finished) await network.finish().catch(() => undefined);
    }
  }, { auto: true }],
  // Sets the audit up before, and so tears it down after, the browser error checks, which need the page still open.
  observeErrors: async ({ audit, observeErrors }, use) => {
    void audit;
    void observeErrors;
    await use();
  },
});
