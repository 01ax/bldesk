import { test } from 'node:test'
import assert from 'node:assert/strict'
import { availableBackupSlots, freeBackupSlots, preActionBackupChoices, reducedBackupSlots } from '../src/renderer/src/lib/backupSlots.ts'

const none = { daily_backups: 0, weekly_backups: 0, monthly_backups: 0 }
const image = (id, type) => ({ id, backup_info: { type } })

test('a server without scheduled backups can use its empty temporary slot', () => {
  assert.deepEqual(availableBackupSlots(none), ['temporary'])
  assert.deepEqual(freeBackupSlots(none, []), ['temporary'])
})

test('an occupied temporary slot is available for replacement, but is not free', () => {
  const existing = [image(1, 'temporary')]
  assert.deepEqual(availableBackupSlots(none), ['temporary'])
  assert.deepEqual(freeBackupSlots(none, existing), [])
})

test('an occupied temporary slot does not hide empty purchased slots', () => {
  const options = { daily_backups: 2, weekly_backups: 1, monthly_backups: 1 }
  assert.deepEqual(freeBackupSlots(options, [image(1, 'temporary'), image(2, 'daily')]), ['daily', 'weekly', 'monthly'])
})

test('only unused scheduled capacity is offered, independently for each type', () => {
  const options = { daily_backups: 1, weekly_backups: 2, monthly_backups: 0 }
  const existing = [image(1, 'daily'), image(2, 'weekly'), image(3, 'monthly')]
  assert.deepEqual(freeBackupSlots(options, existing), ['temporary', 'weekly'])
})

test('no slot is free when temporary and all purchased slots are occupied', () => {
  const options = { daily_backups: 1, weekly_backups: 1, monthly_backups: 1 }
  const existing = ['temporary', 'daily', 'weekly', 'monthly'].map((type, i) => image(i + 1, type))
  assert.deepEqual(freeBackupSlots(options, existing), [])
})

test('temporary-slot occupancy does not depend on scheduled-retention data', () => {
  for (const options of [undefined, null, {}, none]) {
    assert.deepEqual(freeBackupSlots(options, []), ['temporary'])
    assert.deepEqual(freeBackupSlots(options, [image(1, 'temporary')]), [])
  }
})

test('backups beyond retention do not produce a free slot or alter the input', () => {
  const options = { daily_backups: 1 }
  const existing = Object.freeze([Object.freeze(image(1, 'daily')), Object.freeze(image(2, 'daily')), Object.freeze(image(3, 'temporary'))])
  assert.deepEqual(freeBackupSlots(options, existing), [])
  assert.deepEqual(existing.map((b) => b.id), [1, 2, 3])
})

for (const slot of ['daily', 'weekly', 'monthly']) {
  test(`disabling ${slot} excludes both its free capacity and named backups from Backup first`, () => {
    const current = { ...none, [`${slot}_backups`]: 2 }
    const existing = [image(1, 'temporary'), image(2, slot)]
    assert.deepEqual(freeBackupSlots(current, existing), [slot])
    assert.deepEqual(preActionBackupChoices(current, none, existing), {
      freeSlots: [], replacementBackups: [existing[0]], removedSlots: [slot]
    })
  })
}

test('empty temporary capacity survives disabling every scheduled slot', () => {
  const current = { daily_backups: 2, weekly_backups: 2, monthly_backups: 2 }
  const existing = ['daily', 'weekly', 'monthly'].map((slot, i) => image(i + 1, slot))
  assert.deepEqual(preActionBackupChoices(current, none, existing), {
    freeSlots: ['temporary'], replacementBackups: [], removedSlots: ['daily', 'weekly', 'monthly']
  })
})

test('newly purchased scheduled slots cannot be used before the change', () => {
  assert.deepEqual(preActionBackupChoices(none, { daily_backups: 2 }, [image(1, 'temporary')]), {
    freeSlots: [], replacementBackups: [image(1, 'temporary')], removedSlots: []
  })
})

test('retained scheduled slots remain available independently of a disabled slot', () => {
  const current = { daily_backups: 2, weekly_backups: 2, monthly_backups: 2 }
  const pending = { daily_backups: 0, weekly_backups: 1, monthly_backups: 2 }
  const existing = [image(1, 'temporary'), image(2, 'daily'), image(3, 'monthly')]
  assert.deepEqual(preActionBackupChoices(current, pending, existing), {
    freeSlots: ['weekly', 'monthly'], replacementBackups: [existing[0], existing[2]], removedSlots: ['daily']
  })
})

test('every scheduled retention reduction is identified, including positive limits', () => {
  const current = { daily_backups: 3, weekly_backups: 2, monthly_backups: 1 }
  assert.deepEqual(reducedBackupSlots(current, { daily_backups: 1, weekly_backups: 1, monthly_backups: 0 }), ['daily', 'weekly', 'monthly'])
  assert.deepEqual(reducedBackupSlots(current, current), [])
  assert.deepEqual(reducedBackupSlots(none, current), [])
})

test('a positive retention reduction still permits a pre-action backup in current free capacity', () => {
  const current = { daily_backups: 3, weekly_backups: 0, monthly_backups: 0 }
  const pending = { ...current, daily_backups: 1 }
  const existing = [image(1, 'temporary'), image(2, 'daily')]
  assert.deepEqual(preActionBackupChoices(current, pending, existing), {
    freeSlots: ['daily'], replacementBackups: existing, removedSlots: []
  })
  assert.deepEqual(reducedBackupSlots(current, pending), ['daily'])
})
