// Tests for which notifications may be shown, and for reading a saved settings file from an older version:
// node --experimental-strip-types --no-warnings --test scripts/test-notification-settings.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_TRAY_SETTINGS,
  NOTIFICATION_SETTING,
  NOTIFICATION_SETTING_KEYS,
  normaliseTraySettings,
  notificationAllowed
} from '../src/shared/notifications.ts'

const KINDS = ['general', 'server-state', 'action', 'balance', 'update']

test('every kind has its own switch, and it is a boolean in the defaults that starts on', () => {
  assert.deepEqual(Object.keys(NOTIFICATION_SETTING).sort(), [...KINDS].sort())
  const switches = Object.values(NOTIFICATION_SETTING)
  assert.equal(new Set(switches).size, switches.length, 'two kinds share a switch')
  for (const key of switches) assert.equal(DEFAULT_TRAY_SETTINGS[key], true, key)
})

test('with the defaults every kind is shown', () => {
  for (const kind of KINDS) assert.equal(notificationAllowed(DEFAULT_TRAY_SETTINGS, kind), true, kind)
})

test('the master switch mutes every kind, even the ones left on', () => {
  const muted = { ...DEFAULT_TRAY_SETTINGS, notificationsEnabled: false }
  for (const kind of KINDS) assert.equal(notificationAllowed(muted, kind), false, kind)
  assert.equal(notificationAllowed(muted), false)
})

test('turning one kind off mutes that kind and no other', () => {
  for (const muted of KINDS) {
    const settings = { ...DEFAULT_TRAY_SETTINGS, [NOTIFICATION_SETTING[muted]]: false }
    for (const kind of KINDS) assert.equal(notificationAllowed(settings, kind), kind !== muted, `${kind} with ${muted} off`)
  }
})

test('a notification sent without a kind is a general one', () => {
  assert.equal(notificationAllowed({ ...DEFAULT_TRAY_SETTINGS, notifyGeneral: false }), false)
  assert.equal(notificationAllowed({ ...DEFAULT_TRAY_SETTINGS, notifyActions: false }), true)
})

test('the renderer can set the notification switches and nothing else', () => {
  assert.deepEqual([...NOTIFICATION_SETTING_KEYS].sort(), ['notificationsEnabled', ...Object.values(NOTIFICATION_SETTING)].sort())
  assert.ok(!NOTIFICATION_SETTING_KEYS.includes('launchAtLogin'))
  assert.ok(!NOTIFICATION_SETTING_KEYS.includes('closeToTray'))
})

test('a settings file from before these switches keeps its choices and starts the new ones on', () => {
  const old = { launchAtLogin: true, closeToTray: false, notifyServerState: false, notifyActions: true, notifyBalance: false }
  assert.deepEqual(normaliseTraySettings(old), {
    launchAtLogin: true,
    closeToTray: false,
    notificationsEnabled: true,
    notifyServerState: false,
    notifyActions: true,
    notifyBalance: false,
    notifyGeneral: true,
    notifyUpdates: true
  })
})

test('anything that is not a boolean in a settings file is ignored, and a file that is not an object gives the defaults', () => {
  assert.deepEqual(normaliseTraySettings({ notifyActions: 'no', notificationsEnabled: 0, closeToTray: null, extra: true }), DEFAULT_TRAY_SETTINGS)
  for (const junk of [null, undefined, 'x', 7, [], true]) assert.deepEqual(normaliseTraySettings(junk), DEFAULT_TRAY_SETTINGS)
})
