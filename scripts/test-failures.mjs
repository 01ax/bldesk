// Tests for the in-app failure store that replaced native alert(): node --test scripts/test-failures.mjs
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { notifyFailure, dismissFailure, clearFailures, getFailures, subscribeFailures, resetFailures, reasonOf, MAX_FAILURES } from '../src/renderer/src/lib/failures.ts'

beforeEach(() => resetFailures())

test('the reason is the message of an Error, a string as given, and nothing when there is none', () => {
  assert.equal(reasonOf(new Error('The specified backup is locked or attached.')), 'The specified backup is locked or attached.')
  assert.equal(reasonOf('The window did not open.'), 'The window did not open.')
  assert.equal(reasonOf({ message: 'from an object' }), 'from an object')
  assert.equal(reasonOf(undefined), undefined)
  assert.equal(reasonOf(null), undefined)
})

test('an error with no readable message still says something, rather than showing a bare title', () => {
  assert.equal(reasonOf(new Error('')), 'Unknown error')
  assert.equal(reasonOf('   '), 'Unknown error')
  assert.equal(reasonOf({}), 'Unknown error')
  assert.equal(reasonOf({ message: 404 }), 'Unknown error')
})

test('a failure carries its title, reason, note and command', () => {
  notifyFailure('Failed to add record', new Error('The default TTL of 3600 may not be changed.'))
  notifyFailure("Couldn't open a terminal for 203.0.113.9", 'Not available.', { note: 'Run this yourself:', code: 'ssh root@203.0.113.9' })
  const [a, b] = getFailures()
  assert.deepEqual({ title: a.title, detail: a.detail }, { title: 'Failed to add record', detail: 'The default TTL of 3600 may not be changed.' })
  assert.deepEqual({ detail: b.detail, note: b.note, code: b.code }, { detail: 'Not available.', note: 'Run this yourself:', code: 'ssh root@203.0.113.9' })
})

test('a title alone is a failure with no reason', () => {
  notifyFailure("Couldn't get a rescue console URL for web-01")
  assert.equal(getFailures().length, 1)
  assert.equal(getFailures()[0].detail, undefined)
})

test('the same failure raised again while it is on screen is not stacked but counted, a different reason is stacked', () => {
  notifyFailure('Backup failed', new Error('locked'))
  assert.equal(getFailures()[0].count, 1)
  notifyFailure('Backup failed', new Error('locked'))
  assert.equal(getFailures().length, 1)
  assert.equal(getFailures()[0].count, 2)
  notifyFailure('Backup failed', new Error('attached'))
  assert.equal(getFailures().length, 2)
  assert.deepEqual(getFailures().map((f) => f.count), [2, 1])
})

test('a repeat is counted on the failure it repeats, not on a newer one, and the order is kept', () => {
  notifyFailure('One', 'x')
  notifyFailure('Two', 'x')
  notifyFailure('One', 'x')
  assert.deepEqual(getFailures().map((f) => [f.title, f.count]), [['One', 2], ['Two', 1]])
})

test('once dismissed, a failure starts again from a count of one', () => {
  notifyFailure('One', 'x')
  notifyFailure('One', 'x')
  dismissFailure(getFailures()[0].id)
  notifyFailure('One', 'x')
  assert.equal(getFailures()[0].count, 1)
})

test('clearing drops every failure, and does nothing when there are none', () => {
  let heard = 0
  const stop = subscribeFailures(() => heard++)
  clearFailures()
  assert.equal(heard, 0)
  notifyFailure('One', 'x')
  notifyFailure('Two', 'x')
  heard = 0
  clearFailures()
  assert.equal(getFailures().length, 0)
  assert.equal(heard, 1)
  stop()
})

test('once dismissed, the same failure can be shown again', () => {
  notifyFailure('Backup failed', new Error('locked'))
  dismissFailure(getFailures()[0].id)
  assert.equal(getFailures().length, 0)
  notifyFailure('Backup failed', new Error('locked'))
  assert.equal(getFailures().length, 1)
})

test('a burst keeps the newest few and drops the oldest first', () => {
  for (let i = 1; i <= MAX_FAILURES + 3; i++) notifyFailure(`Failure ${i}`, 'x')
  const titles = getFailures().map((f) => f.title)
  assert.equal(titles.length, MAX_FAILURES)
  assert.equal(titles[0], 'Failure 4')
  assert.equal(titles.at(-1), `Failure ${MAX_FAILURES + 3}`)
})

test('dismissing one leaves the others, and an id that is not showing does nothing', () => {
  notifyFailure('One', 'x')
  notifyFailure('Two', 'x')
  notifyFailure('Three', 'x')
  dismissFailure(getFailures()[1].id)
  assert.deepEqual(getFailures().map((f) => f.title), ['One', 'Three'])
  const before = getFailures()
  dismissFailure(9999)
  assert.equal(getFailures(), before)
})

test('listeners hear changes, not dismissals of nothing, and stop hearing once unsubscribed', () => {
  let heard = 0
  const stop = subscribeFailures(() => heard++)
  notifyFailure('One', 'x')
  assert.equal(heard, 1)
  notifyFailure('One', 'x') // a repeat changes the count, which is on screen
  assert.equal(heard, 2)
  dismissFailure(9999) // dismissing something that is not there changes nothing
  assert.equal(heard, 2)
  dismissFailure(getFailures()[0].id)
  assert.equal(heard, 3)
  stop()
  notifyFailure('Two', 'x')
  assert.equal(heard, 3)
})

test('the list is the same object until something changes, which the React store needs', () => {
  notifyFailure('One', 'x')
  const first = getFailures()
  assert.equal(getFailures(), first)
  assert.equal(getFailures(), first)
  notifyFailure('One', 'x')
  assert.notEqual(getFailures(), first)
  assert.equal(first[0].count, 1) // the list a component already holds is never changed under it
  const second = getFailures()
  notifyFailure('Two', 'x')
  assert.notEqual(getFailures(), second)
})
