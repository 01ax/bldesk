// Tests for how a failed API call becomes an error and what the app does with it. The modules have no imports, so
// Node runs the TypeScript directly: node --test scripts/test-api-errors.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ApiError, NULL_BODY_STATUSES, apiFailure, describeApiError, fetchAllPages, isFinalFailure, refusesToken } from '../src/renderer/src/api/errors.ts'
import { cleanIpcError } from '../src/shared/ipcErrors.ts'

test('describeApiError gives the reason in words and never raw JSON', () => {
  assert.equal(describeApiError({ id: 'not_found', message: 'Server not found' }), 'Server not found')
  assert.equal(describeApiError({ title: 'Bad Request', detail: 'name is required' }), 'name is required')
  assert.equal(describeApiError({ errors: { name: ['is required', 'is too long'], size: ['is unknown'] } }), 'name: is required, is too long; size: is unknown')
  assert.equal(describeApiError({ title: 'Conflict' }), 'Conflict')
  // A body with none of the documented fields is not dumped to the customer.
  const unknown = describeApiError({ code: 42, data: { deep: [1, 2, 3] } })
  assert.ok(!unknown.includes('{') && !unknown.includes('42'), unknown)
  assert.equal(describeApiError(undefined), 'Unknown error')
  assert.equal(describeApiError('  plain text  '), 'plain text')
  assert.ok(describeApiError('x'.repeat(1000)).length <= 301)
})

test('apiFailure carries the status, including for a failure with an empty body', () => {
  const withBody = apiFailure({ message: 'No such key' }, { status: 404 })
  assert.ok(withBody instanceof ApiError && withBody instanceof Error)
  assert.equal(withBody.message, 'No such key')
  assert.equal(withBody.status, 404)
  const empty = apiFailure('', { status: 502 })
  assert.equal(empty.status, 502)
  assert.match(empty.message, /HTTP 502/)
  assert.equal(apiFailure(undefined, null).status, undefined)
})

test('a refused token or a missing thing is not retried; a server error is', () => {
  for (const status of [401, 403, 404]) assert.equal(isFinalFailure(apiFailure({ message: 'x' }, { status })), true, String(status))
  for (const status of [429, 500, 502, 503]) assert.equal(isFinalFailure(apiFailure({ message: 'x' }, { status })), false, String(status))
  assert.equal(isFinalFailure(new Error('plain')), false, 'a plain Error has no status')
  assert.equal(isFinalFailure(null), false)
})

test('the token banner: 401 always, 403 except where the reference uses it for a VPC delete', () => {
  const api = 'https://api.binarylane.com.au'
  assert.equal(refusesToken('GET', `${api}/v2/servers`, 401), true)
  assert.equal(refusesToken('DELETE', `${api}/v2/vpcs/12`, 401), true)
  assert.equal(refusesToken('GET', `${api}/v2/servers`, 403), true)
  assert.equal(refusesToken('POST', `${api}/v2/servers/5/actions`, 403), true)
  assert.equal(refusesToken('GET', `${api}/v2/vpcs/12`, 403), true, 'only the delete uses 403 as a rule')
  assert.equal(refusesToken('DELETE', `${api}/v2/vpcs/12`, 403), false)
  assert.equal(refusesToken('delete', `${api}/v2/vpcs/12/`, 403), false)
  assert.equal(refusesToken('DELETE', `${api}/v2/vpcs/12?x=1`, 403), false)
  assert.equal(refusesToken('DELETE', `${api}/v2/domains/example.com`, 403), true)
  for (const status of [200, 204, 400, 404, 429, 500]) assert.equal(refusesToken('GET', `${api}/v2/servers`, status), false, String(status))
})

test('null-body statuses are the ones a Response cannot be rebuilt with a body for', () => {
  for (const status of NULL_BODY_STATUSES) {
    assert.throws(() => new Response('', { status }), TypeError, `${status} with a body`)
    assert.doesNotThrow(() => new Response(null, { status }), `${status} without one`)
  }
  for (const status of [200, 202, 400, 404, 500]) assert.doesNotThrow(() => new Response('{}', { status }), String(status))
})

test("cleanIpcError removes Electron's wrapper and the channel name", () => {
  assert.equal(cleanIpcError("Error invoking remote method 'templates:save': Error: EPERM: operation not permitted, fsync"), 'EPERM: operation not permitted, fsync')
  assert.equal(cleanIpcError("Error invoking remote method 'vault:saveProfile': TypeError: bad input"), 'bad input')
  assert.equal(cleanIpcError("Error invoking remote method 'x:y': Key generation is restricted to the main window."), 'Key generation is restricted to the main window.')
  assert.equal(cleanIpcError('Not a wrapped message'), 'Not a wrapped message')
  assert.equal(cleanIpcError("Error invoking remote method 'a:b': "), "Error invoking remote method 'a:b': ", 'keeps the original when nothing is left')
})

// A fake list endpoint: `total` items, 200 to a page, `fail` names the pages that come back as a failure.
const listOf = (total, { fail = {}, calls = [] } = {}) => async (page, perPage) => {
  calls.push(page)
  const f = fail[page]
  if (f === 'empty') return { response: { ok: false, status: 502 } } // a failure with an empty body leaves `error` unset
  if (f) return { error: { message: 'boom' }, response: { ok: false, status: f } }
  const start = (page - 1) * perPage
  const items = Array.from({ length: Math.max(0, Math.min(perPage, total - start)) }, (_, i) => start + i + 1)
  return { data: { things: items, meta: { total } }, response: { ok: true, status: 200 } }
}

test('fetchAllPages returns every page', async () => {
  const calls = []
  const all = await fetchAllPages(listOf(450, { calls }), 'things', 't')
  assert.equal(all.length, 450)
  assert.deepEqual([...new Set(calls)].sort(), [1, 2, 3])
  assert.equal((await fetchAllPages(listOf(0), 'things', 't')).length, 0)
  assert.equal((await fetchAllPages(listOf(30), 'things', 't')).length, 30)
})

test('fetchAllPages reports a failed page as a failed read, not as a shorter list', async () => {
  await assert.rejects(fetchAllPages(listOf(450, { fail: { 2: 500 } }), 'things', 't'), (e) => e instanceof ApiError && e.status === 500 && e.message === 'boom')
  await assert.rejects(fetchAllPages(listOf(450, { fail: { 3: 429 } }), 'things', 't'), (e) => e.status === 429)
  await assert.rejects(fetchAllPages(listOf(450, { fail: { 2: 'empty' } }), 'things', 't'), (e) => e instanceof ApiError && e.status === 502, 'an empty-body failure counts')
  await assert.rejects(fetchAllPages(listOf(450, { fail: { 1: 404 } }), 'things', 't'), (e) => e.status === 404, 'the first page too')
})
