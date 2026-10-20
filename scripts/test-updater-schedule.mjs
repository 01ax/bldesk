// Tests for when the updater is due to check for a new version.
// node --experimental-strip-types --no-warnings --test scripts/test-updater-schedule.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CHECK_INTERVAL_MS, dueForCheck, MIN_GAP_BETWEEN_EVENT_CHECKS_MS, RESUME_CHECK_DELAY_MS } from '../src/main/updaterSchedule.ts'

const MIN = 60 * 1000

test('a check is due when none has started yet', () => {
  assert.equal(dueForCheck(null, 1_000_000, MIN_GAP_BETWEEN_EVENT_CHECKS_MS), true)
})

test('a check that started less than the gap ago makes the next one not due, and exactly the gap makes it due', () => {
  const last = 10_000_000
  assert.equal(dueForCheck(last, last + 14 * MIN, MIN_GAP_BETWEEN_EVENT_CHECKS_MS), false)
  assert.equal(dueForCheck(last, last + 15 * MIN - 1, MIN_GAP_BETWEEN_EVENT_CHECKS_MS), false)
  assert.equal(dueForCheck(last, last + 15 * MIN, MIN_GAP_BETWEEN_EVENT_CHECKS_MS), true)
  assert.equal(dueForCheck(last, last + 8 * 60 * MIN, MIN_GAP_BETWEEN_EVENT_CHECKS_MS), true)
})

test('a clock that has gone backwards does not stop checks for ever', () => {
  assert.equal(dueForCheck(10_000_000, 9_000_000, MIN_GAP_BETWEEN_EVENT_CHECKS_MS), true)
})

test('the timings are the ones the docs promise', () => {
  assert.equal(CHECK_INTERVAL_MS, 60 * MIN, 'every hour')
  assert.equal(MIN_GAP_BETWEEN_EVENT_CHECKS_MS, 15 * MIN, 'no focus or wake-up check within 15 minutes of another')
  assert.equal(RESUME_CHECK_DELAY_MS, 15 * 1000, 'fifteen seconds after waking')
  assert.ok(MIN_GAP_BETWEEN_EVENT_CHECKS_MS < CHECK_INTERVAL_MS, 'an event check can still happen between two scheduled ones')
})
