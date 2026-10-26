import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { startRetryFixture } from './http-retry-fixture.mjs'

const request = (port, path, body, method = body === undefined ? 'GET' : 'POST') => new Promise((resolve, reject) => {
  const call = http.request({ host: '127.0.0.1', port, path, method, headers: { 'content-type': 'application/json' } }, response => {
    const chunks = []
    response.on('data', chunk => chunks.push(chunk))
    response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, data: JSON.parse(Buffer.concat(chunks).toString()) }))
  })
  call.on('error', reject)
  call.end(body === undefined ? undefined : JSON.stringify(body))
})
async function fixture(t, options) {
  const instance = await startRetryFixture({ port: 0, ...options })
  t.after(() => instance.close())
  return instance.ports.http
}
const configure = (port, extra = {}) => request(port, '/__fault/config', { id: 'case', drop: 'first', when: 'after', ...extra })
const state = async port => (await request(port, '/__fault/state')).data.case

test('a lost answer follows one execution; only another request makes another execution', async t => {
  const port = await fixture(t)
  await configure(port)
  await assert.rejects(request(port, '/probe?id=case', { fixture: '\u00e9\u2603' }))
  assert.equal((await state(port)).requests, 1)
  assert.equal((await state(port)).executions, 1)
  assert.equal((await request(port, '/probe?id=case', { fixture: '\u00e9\u2603' })).status, 200)
  const observed = await state(port)
  assert.equal(observed.executions, 2)
  assert.equal(observed.events[0].body, JSON.stringify({ fixture: '\u00e9\u2603' }))
})

test('dropping before execution records the arrival without executing it', async t => {
  const port = await fixture(t)
  await configure(port, { when: 'before' })
  await assert.rejects(request(port, '/probe?id=case', {}))
  const observed = await state(port)
  assert.equal(observed.requests, 1)
  assert.equal(observed.executions, 0)
})

test('reset-style loss, empty writes, and repeated loss are counted independently', async t => {
  const port = await fixture(t)
  await configure(port, { close: 'rst', drop: 'always' })
  await assert.rejects(request(port, '/probe?id=case', undefined, 'POST'))
  await assert.rejects(request(port, '/probe?id=case', undefined, 'POST'))
  const observed = await state(port)
  assert.equal(observed.executions, 2)
  assert.ok(observed.events.every(event => event.body === '' && event.drop))
  await configure(port, { drop: 'never', status: 400 })
  assert.equal((await request(port, '/probe?id=case', {})).status, 400)
  assert.equal((await state(port)).requests, 1)
})

test('an API response can be dropped only after the fake backend has handled the request', async t => {
  let executions = 0
  const backend = http.createServer(async (req, res) => {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    executions++
    assert.equal(req.url, '/v2/servers')
    assert.equal(Buffer.concat(chunks).toString(), JSON.stringify({ name: 'fixture.example' }))
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ server: { id: executions } }))
  })
  await new Promise(resolve => backend.listen(0, '127.0.0.1', resolve))
  t.after(() => { backend.closeAllConnections(); return new Promise(resolve => backend.close(resolve)) })
  const port = await fixture(t, { apiPort: backend.address().port })
  await configure(port, { path: '/v2/servers', method: 'POST' })
  await assert.rejects(request(port, '/v2/servers', { name: 'fixture.example' }))
  assert.equal(executions, 1)
  assert.equal((await state(port)).events[0].responseStatus, 200)
})

test('redirects and authentication challenges expose their configured status and headers', async t => {
  const port = await fixture(t)
  await configure(port, { drop: 'never', status: 307, responseHeaders: { location: '/probe?id=target' } })
  const redirect = await request(port, '/probe?id=case', {})
  assert.equal(redirect.status, 307)
  assert.equal(redirect.headers.location, '/probe?id=target')
  assert.equal((await state(port)).executions, 1)
  await configure(port, { drop: 'never', status: 401, responseHeaders: { 'www-authenticate': 'Basic realm="fixture"' } })
  const challenge = await request(port, '/probe?id=case', {})
  assert.equal(challenge.status, 401)
  assert.equal(challenge.headers['www-authenticate'], 'Basic realm="fixture"')
  assert.equal((await state(port)).executions, 1)
})
