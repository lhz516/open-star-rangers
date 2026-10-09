import { describe, expect, expectTypeOf, it } from 'vitest';
import { CoreFaultError, CoreInputError, type CoreFaultCode } from './errors.ts';

describe('CoreFaultError (P3-02 S-01)', () => {
  it('keeps a stable code and site, separate from the message', () => {
    const error = new CoreFaultError('budget-exhausted', 'step.events');
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({ name: 'CoreFaultError', code: 'budget-exhausted', site: 'step.events', message: 'budget-exhausted at step.events' });
  });

  it('is distinguishable from CoreInputError in both directions', () => {
    const fault = new CoreFaultError('invariant-violated', 'entities.order');
    const input = new CoreInputError('tickInput', 'must be a plain object');
    expect(fault).not.toBeInstanceOf(CoreInputError);
    expect(input).not.toBeInstanceOf(CoreFaultError);
  });

  it('has a closed code set', () => {
    expectTypeOf<CoreFaultCode>().toEqualTypeOf<'invariant-violated' | 'budget-exhausted' | 'world-faulted'>();
    expectTypeOf<CoreFaultError['code']>().toEqualTypeOf<CoreFaultCode>();
  });
});

function checkTypes() {
  // @ts-expect-error Codes are closed.
  new CoreFaultError('unknown', 'site');
  // @ts-expect-error A site is required.
  new CoreFaultError('world-faulted');
  const error = new CoreFaultError('world-faulted', 'step');
  // @ts-expect-error The code is read-only.
  error.code = 'budget-exhausted';
}
void checkTypes;
