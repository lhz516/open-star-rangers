import { describe, expect, it } from 'vitest';
import { ByteWriter } from '../original-data/synthetic.ts';
import { chargeManifestBudget, EMPTY_BUDGET_USAGE, type BudgetRecord, type BudgetResult } from './budget.ts';
import { validateGroup, validatePackage } from './completeness.ts';
import { exclusiveBytes, payloadTransferList } from './ownership.ts';
import { CLASSIC_P2_SLICE } from './slice-definition.ts';
import {
  diagnosticCodes, payloadIdentityOf, SYNTHETIC_ASSETS, syntheticGroup, syntheticPackage,
} from './synthetic-content.test-support.ts';

// docs/plan/p2/01/spec.md S-12: the content contracts compose over one code-generated synthetic package.

/** A synthetic model payload: a label followed by vertex geometry, which lives inside its model's single Asset. */
const modelPayload = (label: string, vertices: readonly number[]): Uint8Array =>
  new ByteWriter().ascii(label, label.length).f32(...vertices).toBytes();

const TRIANGLE = [0, 0, 0, 1, 0, 0, 0, 1, 0];
const PLAYER = 'model/synthetic-player';
const withBytes = (ids: readonly string[], bytes: Uint8Array) =>
  SYNTHETIC_ASSETS.models.map(spec => (ids.includes(spec.id) ? { ...spec, bytes } : spec));

describe('model geometry inside the model payload', () => {
  it('rejects a geometry-only change through the payload identity while the Asset ID and graph stay unchanged', () => {
    const declared = modelPayload('model:player', TRIANGLE);
    const moved = modelPayload('model:player', TRIANGLE.map((value, index) => (index === 4 ? 0.5 : value)));
    expect(moved.length).toBe(declared.length);
    const input = syntheticGroup('models', withBytes([PLAYER], declared));
    const index = input.payloads.findIndex(payload => payload.id === PLAYER);
    expect(validateGroup(CLASSIC_P2_SLICE, input).status).toBe('group-complete');

    input.payloads[index].bytes = moved;
    expect(diagnosticCodes(validateGroup(CLASSIC_P2_SLICE, input))).toEqual([`payload-mismatch@payloads[${index}]`]);
    const groups = syntheticPackage();
    groups[1] = input;
    expect(diagnosticCodes(validatePackage(CLASSIC_P2_SLICE, groups))).toEqual([`payload-mismatch@groups[1].payloads[${index}]`]);

    // Declaring the new geometry changes only the fingerprint; no mesh Asset or ID change is involved.
    const redeclared = syntheticGroup('models', withBytes([PLAYER], moved));
    expect(validateGroup(CLASSIC_P2_SLICE, redeclared).status).toBe('group-complete');
    const before = input.manifest.assets[index];
    const movedFingerprint = payloadIdentityOf(moved).fingerprint;
    expect(redeclared.manifest.assets[index]).toEqual({ ...before, payloadIdentity: { ...before.payloadIdentity, fingerprint: movedFingerprint } });
    expect(movedFingerprint).not.toBe(before.payloadIdentity.fingerprint);
  });

  it('publishes isolated payloads for two models built from one source mesh', () => {
    const mesh = modelPayload('mesh:shared', TRIANGLE);
    const archive = new Uint8Array(8 + mesh.length);
    archive.set(mesh, 8);
    const source = archive.subarray(8);
    const enemies = ['model/synthetic-enemy-a', 'model/synthetic-enemy-b'];
    const input = syntheticGroup('models', withBytes(enemies, source));
    const indexes = enemies.map(id => input.payloads.findIndex(payload => payload.id === id));

    // Views of the shared source would let one consumer change or detach the other model's bytes.
    expect(() => payloadTransferList(indexes.map(index => input.payloads[index].bytes)))
      .toThrowError(expect.objectContaining({ code: 'payload-not-exclusive', path: 'payloads[0]' }));
    const whole = exclusiveBytes(source);
    expect(() => payloadTransferList([whole, whole])).toThrowError(expect.objectContaining({ code: 'payload-aliased', path: 'payloads[1]' }));

    for (const index of indexes) input.payloads[index].bytes = exclusiveBytes(input.payloads[index].bytes);
    const [first, second] = indexes.map(index => input.payloads[index].bytes);
    expect(payloadTransferList([first, second])).toEqual([first.buffer, second.buffer]);
    // Equal bytes give equal payload identities; the two Assets stay distinct.
    expect(input.manifest.assets[indexes[0]].payloadIdentity).toEqual(input.manifest.assets[indexes[1]].payloadIdentity);
    expect(validateGroup(CLASSIC_P2_SLICE, input).status).toBe('group-complete');

    first.fill(0);
    expect([...second]).toEqual([...source]);
    expect([...source]).toEqual([...mesh]);
    expect(diagnosticCodes(validateGroup(CLASSIC_P2_SLICE, input))).toEqual([`payload-mismatch@payloads[${indexes[0]}]`]);
  });
});

describe('one synthetic package across the contracts', () => {
  it('budgets, publishes, transfers and revalidates the package without sharing bytes', () => {
    const groups = syntheticPackage();
    const complete = validatePackage(CLASSIC_P2_SLICE, groups);
    expect(complete.status).toBe('complete');

    // Declared sizes are charged per group manifest before any payload is read.
    const specs = CLASSIC_P2_SLICE.groups.flatMap(group => SYNTHETIC_ASSETS[group]);
    const totals: BudgetRecord = {
      ...EMPTY_BUDGET_USAGE,
      assets: specs.length,
      dependencyEdges: specs.reduce((sum, { dependencies = [] }) => sum + dependencies.length, 0),
      payloadBytes: groups.reduce((sum, { payloads }) => payloads.reduce((total, { bytes }) => total + bytes.length, sum), 0),
    };
    const chargeAll = (limits: BudgetRecord) => groups.reduce<BudgetResult>(
      (result, { manifest }, index) => (result.status === 'over-budget' ? result : chargeManifestBudget(limits, result.usage, manifest, `groups[${index}].manifest`)),
      { status: 'within-budget', usage: EMPTY_BUDGET_USAGE },
    );
    expect(chargeAll(totals)).toEqual({ status: 'within-budget', usage: totals });
    const last = `groups[${groups.length - 1}].manifest.assets[${SYNTHETIC_ASSETS.audio.length - 1}]`;
    expect(chargeAll({ ...totals, payloadBytes: totals.payloadBytes - 1 })).toMatchObject({
      status: 'over-budget',
      violations: [{ code: 'budget-exceeded', dimension: 'payloadBytes', path: last, limit: totals.payloadBytes - 1, observed: totals.payloadBytes }],
    });

    // Publish exclusive copies, transfer them, and let the receiver revalidate from raw inputs.
    const published = groups.map(group => ({ ...group, payloads: group.payloads.map(payload => ({ ...payload, bytes: exclusiveBytes(payload.bytes) })) }));
    const transfer = payloadTransferList(published.flatMap(group => group.payloads.map(payload => payload.bytes)));
    const received = structuredClone(published, { transfer: [...transfer] });
    expect(validatePackage(CLASSIC_P2_SLICE, received)).toEqual(complete);

    // The sender cannot reuse what it transferred, and its own source bytes were never shared.
    expect(diagnosticCodes(validatePackage(CLASSIC_P2_SLICE, published)))
      .toEqual(published.map((_, index) => `payload-detached@groups[${index}].payloads[0].bytes`));
    expect(validatePackage(CLASSIC_P2_SLICE, groups)).toEqual(complete);
  });
});
