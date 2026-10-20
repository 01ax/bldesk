import { test } from 'node:test'
import assert from 'node:assert/strict'
import { retainedBackupTypes, reducedBackupSlots } from '../src/renderer/src/lib/backupSlots.ts'

const none = { daily_backups: 0, weekly_backups: 0, monthly_backups: 0 }
for (const type of ['daily', 'weekly', 'monthly']) {
  test(`disabling ${type} excludes that pre-action backup type`, () => {
    const current = { ...none, [`${type}_backups`]: 2 }
    assert.deepEqual(retainedBackupTypes(current, none), ['temporary'])
    assert.deepEqual(reducedBackupSlots(current, none), [type])
  })
  test(`a positive ${type} reduction remains usable but needs a warning`, () => {
    const current = { ...none, [`${type}_backups`]: 3 }
    const pending = { ...none, [`${type}_backups`]: 1 }
    assert.deepEqual(retainedBackupTypes(current, pending), ['temporary', type])
    assert.deepEqual(reducedBackupSlots(current, pending), [type])
  })
}
test('newly purchased retention cannot supply a pre-action backup type', () => {
  const pending = { daily_backups: 2, weekly_backups: 2, monthly_backups: 2 }
  assert.deepEqual(retainedBackupTypes(none, pending), ['temporary'])
  assert.deepEqual(reducedBackupSlots(none, pending), [])
})
test('independent retained types are preserved without mutating either input', () => {
  const current = Object.freeze({ daily_backups: 3, weekly_backups: 2, monthly_backups: 1 })
  const pending = Object.freeze({ daily_backups: 1, weekly_backups: 0, monthly_backups: 1 })
  assert.deepEqual(retainedBackupTypes(current, pending), ['temporary', 'daily', 'monthly'])
  assert.deepEqual(reducedBackupSlots(current, pending), ['daily', 'weekly'])
  assert.deepEqual(reducedBackupSlots(current, current), [])
})
test('absent scheduled retention does not enable a scheduled type', () => {
  for (const current of [undefined, null, {}]) {
    assert.deepEqual(retainedBackupTypes(current, none), ['temporary'])
    assert.deepEqual(reducedBackupSlots(current, none), [])
  }
})
