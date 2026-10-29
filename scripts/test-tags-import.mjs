// The import's writes, run through the function the Settings card calls (applyTagsImport) against a storage that fails
// the way a full or disabled one does. node --test scripts/test-tags-import.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyTagsImport, loadTagColors, loadTags } from '../src/renderer/src/lib/serverGroups.ts'
import { TAGS_FILE_KIND, readTagsFile } from '../src/renderer/src/lib/tags.ts'

const PROFILE = 'p1'
const TAGS_KEY = `bldesk_server_tags_${PROFILE}`
const COLORS_KEY = `bldesk_tag_colors_${PROFILE}`

/**
 * A stand-in for localStorage and window. `failFrom[key] = n` makes the n-th and every later write to that key throw
 * QuotaExceededError (1 = the first write already fails); `readsThrow` makes every read throw. `events` lists what the
 * tag views would have been told, in order.
 */
function install(initial = {}) {
  const store = new Map(Object.entries(initial))
  const writes = new Map()
  const state = { failFrom: {}, readsThrow: false, events: [], store }
  const guard = (key) => {
    const n = (writes.get(key) ?? 0) + 1
    writes.set(key, n)
    if (state.failFrom[key] && n >= state.failFrom[key]) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
  }
  globalThis.localStorage = {
    getItem: (k) => {
      if (state.readsThrow) throw new DOMException('denied', 'SecurityError')
      return store.has(k) ? store.get(k) : null
    },
    setItem: (k, v) => { guard(k); store.set(k, String(v)) },
    removeItem: (k) => { guard(k); store.delete(k) }
  }
  globalThis.window = { dispatchEvent: (e) => (state.events.push(e.type), true) }
  return state
}

const fileOf = (servers, colors = {}) => {
  const read = readTagsFile({ kind: TAGS_FILE_KIND, servers, colors })
  assert.equal(read.ok, true)
  return read
}
const live = new Set([1, 2])
const seeded = () => install({ [TAGS_KEY]: JSON.stringify({ 1: ['prod'] }), [COLORS_KEY]: JSON.stringify({ prod: 'red' }) })
const snapshot = (s) => JSON.stringify([...s.store.entries()].sort())
const adds = fileOf([{ id: 1, tags: ['prod', 'not-persisted'] }, { id: 2, tags: ['web'] }], { 'not-persisted': 'teal' })

test('an import that the device takes is written, coloured, and the tag views are told', () => {
  const s = seeded()
  const plan = applyTagsImport(PROFILE, adds, live)
  assert.deepEqual(plan.changed.map((c) => c.id), [1, 2])
  assert.deepEqual({ ...loadTags(PROFILE) }, { 1: ['not-persisted', 'prod'], 2: ['web'] })
  const colors = loadTagColors(PROFILE)
  assert.equal(colors.prod, 'red')
  assert.equal(colors['not-persisted'], 'teal', 'the colour from the file')
  assert.ok(colors.web, 'a new tag the file left uncoloured is given one, as any new tag is')
  assert.ok(s.events.length > 0)
})

test('when the tag map cannot be written, the import throws and puts the colours back (the reviewer\'s injected fault)', () => {
  const s = seeded()
  const before = snapshot(s)
  s.failFrom[TAGS_KEY] = 1
  assert.throws(() => applyTagsImport(PROFILE, adds, live), /could not save the imported tags on this device, so nothing was imported/)
  assert.equal(snapshot(s), before, 'neither key holds any of the import: not the tags, and not the colour that was written first')
  assert.deepEqual({ ...loadTags(PROFILE) }, { 1: ['prod'] })
  assert.deepEqual({ ...loadTagColors(PROFILE) }, { prod: 'red' })
  assert.equal(s.events.at(-1), 'bldesk:server-groups', 'the views read again after the colours were put back, so none shows colours that are gone')
})

test('when the colours cannot be written, the import throws and the tags are untouched', () => {
  const s = seeded()
  const before = snapshot(s)
  s.failFrom[COLORS_KEY] = 1
  assert.throws(() => applyTagsImport(PROFILE, adds, live), /nothing was imported/)
  assert.equal(snapshot(s), before)
})

test('when the colours written by the import cannot be put back either, the error says some of it may be saved', () => {
  const s = seeded()
  s.failFrom[TAGS_KEY] = 1
  s.failFrom[COLORS_KEY] = 2 // the first write (the import's colours) is taken, the second (putting the old ones back) is not
  assert.throws(() => applyTagsImport(PROFILE, adds, live), /could not put back the tags it had, so some of the import may have been saved/)
  assert.notEqual(loadTagColors(PROFILE)['not-persisted'], undefined, 'what was left is what the message warns about')
})

test('when storage cannot be read at all, nothing is written and the import throws', () => {
  const s = seeded()
  s.readsThrow = true
  assert.throws(() => applyTagsImport(PROFILE, adds, live), /nothing was imported/)
  assert.equal(s.store.get(TAGS_KEY), JSON.stringify({ 1: ['prod'] }))
})

test('a first import into an empty store that fails leaves the store empty', () => {
  const s = install()
  s.failFrom[TAGS_KEY] = 1
  assert.throws(() => applyTagsImport(PROFILE, adds, live), /nothing was imported/)
  assert.equal(s.store.size, 0, 'the colours written before the failure were removed, not left behind')
})

test('the merge is worked out from what is stored when it is written, so a tag changed meanwhile is kept', () => {
  const s = seeded()
  s.store.set(TAGS_KEY, JSON.stringify({ 1: ['prod', 'added-meanwhile'] }))
  applyTagsImport(PROFILE, adds, live)
  assert.deepEqual([...loadTags(PROFILE)[1]], ['added-meanwhile', 'not-persisted', 'prod'])
})
