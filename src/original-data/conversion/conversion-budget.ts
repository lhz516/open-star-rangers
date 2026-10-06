import { chargeBudget, EMPTY_BUDGET_USAGE, readBudgetRecord, type BudgetRecord } from '../../content/budget.ts';
import { fail } from '../../content/contract-validation.ts';
import { SourceError } from '../source-error.ts';

/**
 * Charges a converter's increment under its conversion limits with P2-01 `chargeBudget`: a total equal to a limit
 * passes, and the first dimension over its limit or the safe integer range fails as `budget-exceeded` at `location`
 * without applying any of the increment. Dimensions the increment omits are 0.
 */
export function chargeConversionBudget(limits: BudgetRecord, usage: BudgetRecord, increment: Partial<BudgetRecord>, location: string): BudgetRecord {
  const result = chargeBudget(limits, usage, { ...EMPTY_BUDGET_USAGE, ...increment }, location);
  if (result.status === 'within-budget') return result.usage;
  const [{ dimension, limit, observed }] = result.violations;
  throw new SourceError('budget-exceeded', location, 'the conversion exceeds its budget', { name: dimension, limit, observed });
}

/**
 * Reads a converter's starting usage: the conversion usage of earlier steps, as a complete budget record. Source reads
 * are metered by the verified source, so counting them here too would charge them twice.
 */
export function readConversionUsage(value: unknown): BudgetRecord {
  const usage = readBudgetRecord(value, 'usage');
  if (usage.sourceReadBytes !== 0) fail('invalid-budget-value', 'usage.sourceReadBytes', 'conversion usage never includes source reads');
  return usage;
}
