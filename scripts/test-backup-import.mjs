import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ApiError } from '../src/renderer/src/api/errors.ts'
import { importSource, importSourceSummary, planImageImport, readImportState, submitImageImport, IMPORT_UNKNOWN_OUTCOME, IMPORT_NO_ACTION } from '../src/renderer/src/lib/backupImport.ts'

const none = { daily_backups: 0, weekly_backups: 0, monthly_backups: 0 }
const draft = { url: 'https://example.com/server.img.zst', label: '', slot: 'temporary', strategy: 'none', replacementId: null }
const image = (id, type, created_at = '2026-01-01T00:00:00Z', locked = false) => ({ id, created_at, name: `image-${id}`, backup_info: { type, locked } })

test('only absolute HTTP and HTTPS source URLs are accepted, without restricting file suffixes', () => {
  for (const url of ['https://example.com/image.iso?download=1', 'http://example.com/download/123', ' https://example.com/a.zst ']) assert.ok(importSource(url))
  for (const url of ['', 'not a URL', '/local.img', 'file:///disk.img', 'ftp://example.com/a', 'javascript:alert(1)', 'https://', 'http:example.com/a.iso', 'https:example.com/a.iso']) assert.throws(() => importSource(url), /HTTP or HTTPS/)
})

test('the source row hides access details while the request retains them', () => {
  const url = 'https://user:secret@example.com/image.iso?signature=secret#fragment'
  assert.equal(importSourceSummary(url), 'https://example.com/image.iso (access details omitted)')
  assert.equal(planImageImport({ ...draft, url }, none, []).body.url, url)
  assert.equal(importSourceSummary(draft.url), draft.url)
})

test('the default import uses the free temporary slot with no replacement or local-file payload', () => {
  assert.deepEqual(planImageImport(draft, none, []), { body: { url: draft.url, replacement_strategy: 'none', backup_type: 'temporary' } })
})

test('labels are trimmed, omitted when blank and capped at the public 250-character limit', () => {
  assert.equal(planImageImport({ ...draft, label: ' Example ' }, none, []).body.label, 'Example')
  assert.equal(planImageImport({ ...draft, label: 'a'.repeat(250) }, none, []).body.label.length, 250)
  assert.throws(() => planImageImport({ ...draft, label: 'a'.repeat(251) }, none, []), /250/)
})

for (const slot of ['daily', 'weekly', 'monthly']) {
  test(`imports into ${slot} use current purchased retention`, () => {
    assert.throws(() => planImageImport({ ...draft, slot }, none, []), /no longer has/)
    assert.equal(planImageImport({ ...draft, slot }, { [`${slot}_backups`]: 1 }, []).body.backup_type, slot)
  })
}

test('an occupied temporary slot is refused under none without changing the chosen strategy', () => {
  assert.throws(() => planImageImport(draft, none, [image(1, 'temporary')]), /No free slot/)
})

test('oldest and newest use free capacity before considering a replacement', () => {
  for (const strategy of ['oldest', 'newest']) {
    assert.equal(planImageImport({ ...draft, strategy, slot: 'daily' }, { daily_backups: 2 }, [image(1, 'daily')]).replaced, undefined)
  }
})

test('oldest and newest skip locked, attached and other-type images without reordering the list', () => {
  const existing = Object.freeze([image(1, 'daily', '2026-01-01', true), image(2, 'daily', '2026-01-02'), image(3, 'daily', '2026-01-03'), image(4, 'daily', '2026-01-04'), image(5, 'monthly')])
  const options = { daily_backups: 4 }
  assert.equal(planImageImport({ ...draft, slot: 'daily', strategy: 'oldest' }, options, existing, 2).replaced.id, 3)
  assert.equal(planImageImport({ ...draft, slot: 'daily', strategy: 'newest' }, options, existing, 4).replaced.id, 3)
  assert.deepEqual(existing.map((b) => b.id), [1, 2, 3, 4, 5])
})

test('specified replacement sends the chosen image type, not the form slot type', () => {
  const chosen = image(12, 'weekly')
  assert.deepEqual(planImageImport({ ...draft, strategy: 'specified', replacementId: 12 }, none, [chosen]), {
    body: { url: draft.url, replacement_strategy: 'specified', backup_id_to_replace: 12, backup_type: 'weekly' }, replaced: chosen
  })
})

test('a removed, locked, attached or unknown-type specified image is not silently replaced by another', () => {
  const selected = { ...draft, strategy: 'specified', replacementId: 1 }
  for (const existing of [[], [image(2, 'temporary')], [image(1, 'temporary', undefined, true)], [image(1, 'unknown')]]) {
    assert.throws(() => planImageImport(selected, none, existing), /no longer replaceable/)
  }
  assert.throws(() => planImageImport(selected, none, [image(1, 'temporary')], 1), /no longer replaceable/)
})

test('automatic replacement refuses a full slot with only protected images', () => {
  for (const strategy of ['oldest', 'newest']) {
    assert.throws(() => planImageImport({ ...draft, strategy }, none, [image(1, 'temporary', undefined, true)]), /No image/)
    assert.throws(() => planImageImport({ ...draft, strategy }, none, [image(1, 'temporary')], 1), /No image/)
  }
})

test('missing dates do not produce a misleading named automatic candidate', () => {
  const existing = [{ id: 1, backup_info: { type: 'temporary' } }]
  assert.equal(planImageImport({ ...draft, strategy: 'oldest' }, none, existing).replaced, undefined)
  assert.equal(planImageImport({ ...draft, strategy: 'oldest', slot: 'daily' }, { daily_backups: 2 }, [...existing.map(b => ({...b, backup_info: {type: 'daily'}})), image(2, 'daily')]).replaced, undefined)
})

test('the canonical URL sent to the API matches the displayed source', () => {
  for (const [raw, canonical] of [['HTTPS://EXAMPLE.com:443/a.iso', 'https://example.com/a.iso'], ['https://example.com/a b.iso', 'https://example.com/a%20b.iso']]) {
    assert.equal(planImageImport({ ...draft, url: raw }, none, []).body.url, canonical)
    assert.equal(importSourceSummary(raw), canonical)
  }
})

test('userinfo-only and empty-query/fragment URLs do not copy access details into the source row', () => {
  for (const suffix of ['?', '#']) assert.equal(importSourceSummary(`https://example.com/image${suffix}`), 'https://example.com/image (access details omitted)')
  assert.equal(importSourceSummary('https://user:secret@example.com/image'), 'https://example.com/image (access details omitted)')
})

test('an occupied temporary slot with oldest has the held image as its candidate', () => {
  const held = image(1, 'temporary')
  assert.deepEqual(planImageImport({ ...draft, strategy: 'oldest' }, none, [held]), {
    body: { url: draft.url, replacement_strategy: 'oldest', backup_type: 'temporary' }, replaced: held
  })
})

test('server preflight reads resolve, reject, and time out without resuming after a late answer', async () => {
  assert.equal(await readImportState(async () => 123), 123)
  await assert.rejects(readImportState(async () => { throw new Error('Refused read') }), /Refused read/)
  let release, continued = false
  const pending = readImportState(() => new Promise(resolve => release = resolve), 5).then(() => continued = true)
  await assert.rejects(pending, /Could not read the server/)
  release(123)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(continued, false)
})

test('a submitted import calls once and hands off the returned action', async () => {
  let count = 0
  const action = {id: 1, status: 'in-progress'}
  assert.deepEqual(await submitImageImport(async () => { count++; return action }), {kind: 'queued', action})
  assert.equal(count, 1)
})

test('a lost or unreadable POST response stays unknown and is never retried', async () => {
  for (const error of [new TypeError('Failed to fetch'), new TypeError('Native connection lost'), new SyntaxError('Invalid JSON')]) {
    let count = 0
    assert.deepEqual(await submitImageImport(async () => { count++; throw error }), {kind: 'unknown', detail: IMPORT_UNKNOWN_OUTCOME})
    assert.equal(count, 1)
  }
})

test('missing actions are unknown but an API refusal remains a failure', async () => {
  assert.deepEqual(await submitImageImport(async () => undefined), {kind: 'unknown', detail: IMPORT_NO_ACTION})
  for (const status of [400, 401, 403, 404, 409, 422, 429]) {
    const error = new ApiError(`HTTP ${status}: refused`, status)
    assert.deepEqual(await submitImageImport(async () => { throw error }), {kind: 'failed', error})
  }
})

test('server-side 5xx responses stay unknown and are not retried', async () => {
  for (const status of [500, 501, 502, 503, 504, 599]) {
    let count = 0
    const result = await submitImageImport(async () => { count++; throw new ApiError('Server error', status) })
    assert.equal(result.kind, 'unknown')
    assert.match(result.detail, new RegExp(`HTTP ${status}`))
    assert.match(result.detail, /may or may not have started.*Check Backups and server actions before trying again/)
    assert.equal(count, 1)
  }
})
