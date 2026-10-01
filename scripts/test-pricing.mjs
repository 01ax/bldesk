// Tests for how a price is quoted: on the account's tax, and saying which. The module has no imports, so Node runs the
// TypeScript directly: node --test scripts/test-pricing.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { billingTotal, retentionOptionLabel, retentionWording, taxBasis } from '../src/renderer/src/lib/serverPricing.ts'

const gst = { name: 'GST', type: 'scalar', fixed_percent: 10 }
const size = { slug: 'std-min', disk: 20, options: { daily_backups: 0, backups_cost_per_backup_per_gigabyte: 0.05 } }

test('a price is quoted incl. the tax when it is added, nothing when there is none, and before tax when it cannot be worked out', () => {
  assert.equal(taxBasis(gst), 'incl. GST')
  assert.equal(taxBasis({ type: 'scalar', fixed_percent: 10 }), 'incl. tax')
  assert.equal(taxBasis({ name: 'No tax', type: 'none' }), '')
  assert.equal(taxBasis(null), 'before tax')
  assert.equal(taxBasis(undefined), 'before tax')
  assert.equal(taxBasis({ type: 'scalar' }), 'before tax', 'a scalar with no percentage is not worked out')
  assert.equal(taxBasis({ type: 'other', fixed_percent: 10 }), 'before tax')
})

test('a retention label keeps its wording, and its price is worked out before tax where it is shown by itself', () => {
  assert.equal(retentionWording('daily', 1), 'Take daily backups, stored for 1 day')
  assert.equal(retentionWording('weekly', 3), 'Take weekly backups, stored for 3 weeks')
  assert.equal(retentionOptionLabel('daily', 2, 20, size), 'Take daily backups, stored for 2 days (+$2.00 per month)')
  assert.equal(retentionOptionLabel('daily', 0, 20, size), 'Do not take a daily backup')
  // Retention the plan already includes is not charged.
  assert.match(retentionOptionLabel('daily', 2, 20, { ...size, options: { ...size.options, daily_backups: 2 } }), /\(\+\$0\.00 per month\)/)
})

test('the change in a total goes through the same tax step as the total', () => {
  const before = 8
  assert.equal(+(billingTotal(before + 2, gst).total - billingTotal(before, gst).total).toFixed(2), 2.2)
  assert.equal(billingTotal(before, null).total, before)
})
