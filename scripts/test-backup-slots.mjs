import { test } from 'node:test'
import assert from 'node:assert/strict'
import { availableBackupSlots, freeBackupSlots, replaceableBackups, isIsoBackup } from '../src/renderer/src/lib/backupSlots.ts'

const none = { daily_backups: 0, weekly_backups: 0, monthly_backups: 0 }
const image = (id, type) => ({ id, backup_info: { type } })

test('only an explicit ISO flag restricts an image to attachment', () => {
  assert.equal(isIsoBackup({ backup_info: { iso: true } }), true)
  for (const value of [undefined, null, {}, { backup_info: null }, { backup_info: {} }, { backup_info: { iso: false } }, { backup_info: { iso: null } }]) {
    assert.equal(isIsoBackup(value), false)
  }
})

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

test('named replacements exclude locked, attached and unknown-type images', () => {
  const valid = [image(1, 'temporary'), image(2, 'daily')]
  const locked = { ...image(3, 'weekly'), backup_info: { type: 'weekly', locked: true } }
  const existing = [...valid, locked, image(4, 'monthly'), image(5, 'unknown'), { id: 6 }]
  assert.deepEqual(replaceableBackups(existing, 4), valid)
  assert.equal(existing.length, 6)
})

test('an image becoming locked or attached is no longer a replacement', () => {
  const held = image(1, 'daily')
  assert.deepEqual(replaceableBackups([held]), [held])
  assert.deepEqual(replaceableBackups([{ ...held, backup_info: { type: 'daily', locked: true } }]), [])
  assert.deepEqual(replaceableBackups([held], held.id), [])
})

test('no eligible named replacements does not make an occupied slot free', () => {
  const existing = [image(1, 'temporary')]
  assert.deepEqual(replaceableBackups(existing, 1), [])
  assert.deepEqual(freeBackupSlots(none, existing), [])
})
