// Tests for which notifications may be shown, and for reading a saved settings file from an older version:
// node --experimental-strip-types --no-warnings --test scripts/test-notification-settings.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_TRAY_SETTINGS,
  NOTIFICATION_SETTING_UNSAVED,
  NOTIFICATION_SETTING,
  NOTIFICATION_SETTING_KEYS,
  createNotificationSettingsStore,
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

// --- Keeping the settings on Android and in the browser build -------------------------------------------------------

const KEY = 'settings'
// A storage that can be made to fail, and that waits before answering so calls made together really do overlap.
function memoryStorage({ delay = 5 } = {}) {
  const data = new Map()
  const fail = { get: false, set: false, remove: false }
  let failNextSets = 0 // the next this many writes fail, whatever `fail.set` says
  const wait = () => new Promise((resolve) => setTimeout(resolve, delay))
  return {
    data,
    fail,
    reads: 0,
    async get(key) { await wait(); this.reads++; if (fail.get) throw new Error('read failed'); return data.get(key) ?? null },
    failNext(count) { failNextSets = count },
    async set(key, value) { await wait(); if (fail.set || failNextSets-- > 0) throw new Error('write failed'); data.set(key, value) },
    async remove(key) { await wait(); if (fail.remove) throw new Error('remove failed'); data.delete(key) }
  }
}
// The device clock, moving on a second at each reading, so saves made at different times get different times.
const fakeClock = (start = 1_700_000_000_000) => { let t = start; return () => (t += 1000) }
const storeOver = (primary, fallback, clock) => createNotificationSettingsStore(primary, fallback, KEY, clock)
const saved = (storage) => (storage.data.has(KEY) ? JSON.parse(storage.data.get(KEY)).settings : null)
const versionOf = (storage) => JSON.parse(storage.data.get(KEY)).v

test('two changes made together are both kept, in memory and in storage, and after a restart', async () => {
  const primary = memoryStorage(), fallback = memoryStorage()
  const store = storeOver(primary, fallback)
  await Promise.all([store.set('notifyActions', false), store.set('notifyBalance', false)])
  const now = await store.get()
  assert.equal(now.notifyActions, false)
  assert.equal(now.notifyBalance, false)
  assert.equal(saved(primary).notifyActions, false)
  assert.equal(saved(primary).notifyBalance, false)
  const restarted = await storeOver(primary, fallback).get()
  assert.equal(restarted.notifyActions, false)
  assert.equal(restarted.notifyBalance, false)
})

test('many changes made together are all kept, and the last change to one switch wins', async () => {
  const primary = memoryStorage(), fallback = memoryStorage()
  const store = storeOver(primary, fallback)
  await Promise.all([
    store.set('notifyServerState', false),
    store.set('notifyActions', false),
    store.set('notifyActions', true),
    store.set('notifyGeneral', false),
    store.set('notificationsEnabled', false)
  ])
  const now = await storeOver(primary, fallback).get()
  assert.deepEqual(
    { ...now, launchAtLogin: false, closeToTray: false },
    { ...DEFAULT_TRAY_SETTINGS, notifyServerState: false, notifyActions: true, notifyGeneral: false, notificationsEnabled: false, launchAtLogin: false, closeToTray: false }
  )
})

test('each answer includes the changes made before it', async () => {
  const store = storeOver(memoryStorage(), memoryStorage())
  const [first, second] = await Promise.all([store.set('notifyActions', false), store.set('notifyBalance', false)])
  assert.deepEqual([first.notifyActions, first.notifyBalance], [false, true])
  assert.deepEqual([second.notifyActions, second.notifyBalance], [false, false])
})

test('a write the app preferences refuse is saved to the fallback, and read back from it', async () => {
  const primary = memoryStorage(), fallback = memoryStorage()
  primary.fail.set = true // writes fail while reads just find nothing
  const store = storeOver(primary, fallback)
  const answer = await store.set('notificationsEnabled', false)
  assert.equal(answer.notificationsEnabled, false)
  assert.equal(notificationAllowed(await store.get(), 'action'), false, 'the gate disagrees with the answer')
  const restarted = storeOver(primary, fallback)
  assert.equal((await restarted.get()).notificationsEnabled, false, 'the next launch did not read what was written')
  assert.equal(notificationAllowed(await restarted.get(), 'action'), false)
})

test('a change that cannot be saved anywhere applies until the app is closed, and says it was not saved', async () => {
  const primary = memoryStorage(), fallback = memoryStorage()
  primary.fail.set = fallback.fail.set = true
  const store = storeOver(primary, fallback)
  await assert.rejects(store.set('notificationsEnabled', false), { message: NOTIFICATION_SETTING_UNSAVED })
  assert.equal(notificationAllowed(await store.get(), 'action'), false, 'the choice must hold in this session')
  // Storage comes back: the next change saves everything changed so far, the unsaved one included.
  primary.fail.set = fallback.fail.set = false
  await store.set('notifyBalance', false)
  const after = saved(primary)
  assert.equal(after.notificationsEnabled, false)
  assert.equal(after.notifyBalance, false)
})

test('a failed save does not hold up the changes made after it', async () => {
  const primary = memoryStorage(), fallback = memoryStorage()
  primary.failNext(1); fallback.failNext(1) // the first save fails in both places, the second finds storage working
  const store = storeOver(primary, fallback)
  const failing = store.set('notifyActions', false)
  failing.catch(() => {})
  await store.set('notifyBalance', false)
  await assert.rejects(failing, { message: NOTIFICATION_SETTING_UNSAVED })
  assert.equal(saved(primary).notifyActions, false, 'the later save must carry the change whose own save failed')
  assert.equal(saved(primary).notifyBalance, false)
  const now = await store.get()
  assert.equal(now.notifyActions, false)
  assert.equal(now.notifyBalance, false)
})

test('a newer fallback copy outranks an older app-preferences copy, and a later good save outranks the fallback', async () => {
  const primary = memoryStorage(), fallback = memoryStorage()
  await storeOver(primary, fallback).set('notifyActions', false) // saved to the primary
  primary.fail.set = true
  const store = storeOver(primary, fallback)
  await store.set('notifyBalance', false) // primary refuses, so the fallback gets it
  const restarted = await storeOver(primary, fallback).get()
  assert.equal(restarted.notifyActions, false)
  assert.equal(restarted.notifyBalance, false, 'the older primary copy came back')
  primary.fail.set = false
  await store.set('notifyGeneral', false) // the primary works again; the older fallback copy is left where it is
  const again = await storeOver(primary, fallback).get()
  assert.deepEqual([again.notifyActions, again.notifyBalance, again.notifyGeneral], [false, false, false], 'the older fallback copy outranked the newer primary one')
  assert.ok(versionOf(primary) > versionOf(fallback))
})

test('a saved change is not undone by an older copy that can be neither removed nor rewritten', async () => {
  // The review's case: master on is saved to the fallback while the primary refuses; the primary then works again but the
  // fallback stays readable and every write to it fails; master off is saved to the primary.
  const primary = memoryStorage(), fallback = memoryStorage()
  await storeOver(primary, fallback).set('notificationsEnabled', false) // master off in the primary
  primary.fail.set = true
  await storeOver(primary, fallback).set('notificationsEnabled', true) // master on, saved to the fallback
  primary.fail.set = false
  fallback.fail.set = true; fallback.fail.remove = true // the fallback copy is now untouchable
  const store = storeOver(primary, fallback)
  assert.equal((await store.set('notificationsEnabled', false)).notificationsEnabled, false) // reported saved: it was, in the primary
  assert.equal(saved(fallback).notificationsEnabled, true, 'the test did not leave the older copy in the fallback')
  const restarted = storeOver(primary, fallback)
  assert.equal((await restarted.get()).notificationsEnabled, false, 'the older fallback copy undid the saved change')
  assert.equal(notificationAllowed(await restarted.get(), 'action'), false)
})

test('versions keep rising across restarts, so the newest save always wins', async () => {
  const clock = fakeClock()
  const primary = memoryStorage(), fallback = memoryStorage()
  await storeOver(primary, fallback, clock).set('notifyActions', false) // first, primary
  const first = versionOf(primary)
  primary.fail.set = true
  await storeOver(primary, fallback, clock).set('notifyBalance', false) // second, fallback
  primary.fail.set = false
  await storeOver(primary, fallback, clock).set('notifyUpdates', false) // third, primary
  assert.ok(first < versionOf(fallback) && versionOf(fallback) < versionOf(primary), 'each save must outrank the one before')
  const now = await storeOver(primary, fallback, clock).get()
  assert.deepEqual([now.notifyActions, now.notifyBalance, now.notifyUpdates], [false, false, false])
})

test('a save made while the app preferences cannot be read outranks what they hold, so recovery does not bring an older setting back', async () => {
  // The third review's case, step by step, on one device clock.
  const clock = fakeClock()
  const primary = memoryStorage(), fallback = memoryStorage()
  await storeOver(primary, fallback, clock).set('notificationsEnabled', true) // 1. master on, in the primary
  primary.fail.set = true
  await storeOver(primary, fallback, clock).set('notificationsEnabled', true) // 2. the primary refuses: master on, in the fallback
  primary.fail.set = false
  await storeOver(primary, fallback, clock).set('notificationsEnabled', true) // 3. the primary works again: master on, in the primary
  primary.fail.get = primary.fail.set = true // 4. a restart during an outage of the primary: it can be neither read nor written
  const outage = storeOver(primary, fallback, clock)
  assert.equal((await outage.set('notificationsEnabled', false)).notificationsEnabled, false) // saved to the fallback, reported saved
  assert.equal(notificationAllowed(await outage.get(), 'action'), false, 'the choice must hold in this session')
  primary.fail.get = primary.fail.set = false // 5. the primary is back, holding its older copy
  const recovered = await storeOver(primary, fallback, clock).get()
  assert.equal(recovered.notificationsEnabled, false, 'the older primary copy came back')
  assert.equal(notificationAllowed(recovered, 'action'), false)
})

test('the same when it is the fallback that cannot be read and holds the newer copy', async () => {
  const clock = fakeClock()
  const primary = memoryStorage(), fallback = memoryStorage()
  await storeOver(primary, fallback, clock).set('notifyActions', false) // in the primary
  primary.fail.set = true
  const refused = storeOver(primary, fallback, clock)
  await refused.set('notifyBalance', false) // in the fallback
  await refused.set('notifyGeneral', false) // in the fallback again, a higher version than the primary's
  primary.fail.set = false
  fallback.fail.get = true // a restart in which only the fallback cannot be read: the primary's older copy is all that loads
  const store = storeOver(primary, fallback, clock)
  assert.equal((await store.get()).notifyActions, false)
  await store.set('notifyUpdates', false) // saved to the primary
  fallback.fail.get = false
  const recovered = await storeOver(primary, fallback, clock).get()
  assert.equal(recovered.notifyUpdates, false, 'the fallback copy that could not be read outranked the newer save')
})

test('a version is above every copy seen and no lower than the clock, and two saves in one millisecond differ', async () => {
  const primary = memoryStorage(), fallback = memoryStorage()
  const still = () => 5_000_000 // the clock has not moved
  primary.data.set(KEY, JSON.stringify({ v: 7, settings: DEFAULT_TRAY_SETTINGS })) // a copy from before versions followed the clock
  const store = storeOver(primary, fallback, still)
  await store.set('notifyActions', false)
  assert.equal(versionOf(primary), 5_000_000, 'a small old version must not set the pace')
  await store.set('notifyBalance', false)
  assert.equal(versionOf(primary), 5_000_001, 'two saves in the same millisecond got the same version')
  primary.data.set(KEY, JSON.stringify({ v: 9_000_000, settings: DEFAULT_TRAY_SETTINGS })) // a copy from the future (the clock was set back)
  await storeOver(primary, fallback, still).set('notifyUpdates', false)
  assert.equal(versionOf(primary), 9_000_001, 'a save must outrank a readable copy even if the clock says it is older')
})

test('without a clock handed in the store uses the real one', async () => {
  const primary = memoryStorage(), fallback = memoryStorage()
  const before = Date.now()
  await createNotificationSettingsStore(primary, fallback, KEY).set('notifyActions', false)
  assert.ok(versionOf(primary) >= before && versionOf(primary) <= Date.now(), 'the version is not the time in milliseconds')
})

test('on equal versions the app preferences copy is the one used', async () => {
  const primary = memoryStorage(), fallback = memoryStorage()
  primary.data.set(KEY, JSON.stringify({ v: 5, settings: { ...DEFAULT_TRAY_SETTINGS, notifyActions: false } }))
  fallback.data.set(KEY, JSON.stringify({ v: 5, settings: { ...DEFAULT_TRAY_SETTINGS, notifyBalance: false } }))
  const now = await storeOver(primary, fallback).get()
  assert.deepEqual([now.notifyActions, now.notifyBalance], [false, true])
})

test('a copy saved before versions existed is older than a versioned one, and still loads on its own', async () => {
  const primary = memoryStorage(), fallback = memoryStorage()
  primary.data.set(KEY, JSON.stringify({ ...DEFAULT_TRAY_SETTINGS, notifyActions: false })) // a bare settings object
  assert.equal((await storeOver(primary, fallback).get()).notifyActions, false, 'a lone unversioned copy was ignored')
  fallback.data.set(KEY, JSON.stringify({ v: 1, settings: { ...DEFAULT_TRAY_SETTINGS, notifyActions: true, notifyBalance: false } }))
  const both = await storeOver(primary, fallback).get()
  assert.deepEqual([both.notifyActions, both.notifyBalance], [true, false], 'the unversioned copy outranked a versioned one')
})

test('storage that cannot be read or holds rubbish gives the defaults, and is only read once', async () => {
  const primary = memoryStorage(), fallback = memoryStorage()
  primary.fail.get = fallback.fail.get = true
  assert.deepEqual(await storeOver(primary, fallback).get(), DEFAULT_TRAY_SETTINGS)
  primary.fail.get = fallback.fail.get = false
  primary.data.set(KEY, '{not json')
  assert.deepEqual(await storeOver(primary, fallback).get(), DEFAULT_TRAY_SETTINGS)
  const store = storeOver(primary, fallback)
  await store.get()
  const reads = primary.reads + fallback.reads
  await store.get(); await store.get()
  assert.equal(primary.reads + fallback.reads, reads, 'each notification must not read storage again')
})

test('a copy handed out cannot change the settings in force', async () => {
  const store = storeOver(memoryStorage(), memoryStorage())
  const copy = await store.get()
  copy.notificationsEnabled = false
  assert.equal((await store.get()).notificationsEnabled, true)
})
