// Tests for the in-app failure store that replaced native alert(): node --test scripts/test-failures.mjs
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { notifyFailure, dismissFailure, clearFailures, enterDialog, leaveDialog, getFailures, getFloatingFailures, getDialogFailures, subscribeFailures, resetFailures, reasonOf, MAX_FAILURES } from '../src/renderer/src/lib/failures.ts'

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

test('a repeat is counted on the failure it repeats and raised afresh, as the newest', () => {
  notifyFailure('One', 'x')
  notifyFailure('Two', 'x')
  const before = getFailures()[0].id
  notifyFailure('One', 'x')
  assert.deepEqual(getFailures().map((f) => [f.title, f.count]), [['Two', 1], ['One', 2]])
  assert.ok(getFailures()[1].id > before, 'a repeat gets a new id, so it belongs to whatever dialog is open now')
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

test('with no dialog open every failure is for the corner of the window', () => {
  notifyFailure('One', 'x')
  notifyFailure('Two', 'x')
  assert.deepEqual(getFloatingFailures().map((f) => f.title), ['One', 'Two'])
  assert.equal(getDialogFailures(Symbol('nobody')).length, 0)
})

test('a failure raised while a dialog is open shows in that dialog, not at the corner', () => {
  const dialog = Symbol('dialog')
  enterDialog(dialog)
  notifyFailure('Failed to add record', 'x')
  assert.deepEqual(getDialogFailures(dialog).map((f) => f.title), ['Failed to add record'])
  assert.equal(getFloatingFailures().length, 0)
})

test('a failure from before the dialog opened is kept, not shown while it is open, and comes back at the corner when it closes', () => {
  notifyFailure('Earlier', 'x')
  const dialog = Symbol('dialog')
  enterDialog(dialog)
  notifyFailure('During', 'x')
  assert.equal(getFloatingFailures().length, 0, 'behind a dialog a card could only be dimmed, and a tap on it would close the dialog')
  assert.deepEqual(getDialogFailures(dialog).map((f) => f.title), ['During'], 'and it is not repeated inside the dialog')
  assert.equal(getFailures().length, 2)
  leaveDialog(dialog)
  assert.deepEqual(getFloatingFailures().map((f) => f.title), ['Earlier', 'During'])
})

test('a failure repeated while a dialog is open moves into that dialog', () => {
  notifyFailure('Backup failed', 'locked')
  const dialog = Symbol('dialog')
  enterDialog(dialog)
  notifyFailure('Backup failed', 'locked')
  assert.equal(getFloatingFailures().length, 0)
  assert.deepEqual(getDialogFailures(dialog).map((f) => [f.title, f.count]), [['Backup failed', 2]])
})

test('only the dialog on top shows failures; the one beneath gets them back when it closes', () => {
  const under = Symbol('under')
  const over = Symbol('over')
  enterDialog(under)
  notifyFailure('Raised under', 'x')
  enterDialog(over)
  notifyFailure('Raised over', 'x')
  assert.deepEqual(getDialogFailures(over).map((f) => f.title), ['Raised over'])
  assert.equal(getDialogFailures(under).length, 0, 'a dialog that is not on top shows nothing')
  assert.equal(getFloatingFailures().length, 0, 'what was raised before the top dialog opened is not in it, and not at the corner either')
  leaveDialog(over)
  assert.deepEqual(getDialogFailures(under).map((f) => f.title), ['Raised under', 'Raised over'])
  assert.equal(getFloatingFailures().length, 0)
})

test('when the last dialog closes its failures go to the corner and are not lost', () => {
  const dialog = Symbol('dialog')
  enterDialog(dialog)
  notifyFailure('Raised in the dialog', 'x')
  leaveDialog(dialog)
  assert.deepEqual(getFloatingFailures().map((f) => f.title), ['Raised in the dialog'])
  assert.equal(getDialogFailures(dialog).length, 0)
})

test('dismissing a failure in a dialog removes it everywhere, and leaving a dialog twice is harmless', () => {
  const dialog = Symbol('dialog')
  enterDialog(dialog)
  notifyFailure('One', 'x')
  dismissFailure(getDialogFailures(dialog)[0].id)
  assert.equal(getFailures().length, 0)
  leaveDialog(dialog)
  leaveDialog(dialog)
  assert.equal(getFloatingFailures().length, 0)
})

test('the dialog and corner lists are the same object until something changes, which the React store needs', () => {
  const dialog = Symbol('dialog')
  enterDialog(dialog)
  notifyFailure('One', 'x')
  const inside = getDialogFailures(dialog)
  const corner = getFloatingFailures()
  assert.equal(getDialogFailures(dialog), inside)
  assert.equal(getFloatingFailures(), corner)
  assert.equal(getDialogFailures(Symbol('other')), getDialogFailures(Symbol('another')), 'a dialog with nothing to show always gets the same empty list')
  notifyFailure('Two', 'x')
  assert.notEqual(getDialogFailures(dialog), inside)
})

test('listeners hear a dialog opening and closing, since what shows where changes', () => {
  let heard = 0
  const stop = subscribeFailures(() => heard++)
  const dialog = Symbol('dialog')
  enterDialog(dialog)
  leaveDialog(dialog)
  assert.equal(heard, 2)
  stop()
})
