// Tests for what the Add a Cloud Server form does with its hostname field: a blank hostname is sent as no `name` at all,
// because the reference makes `name` optional. The module has no imports, so Node runs the TypeScript directly:
// node --test scripts/test-create-hostname.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { BLANK_HOSTNAME_TARGET, hostnameFields } from '../src/renderer/src/lib/createServerHostname.ts'

const spec = JSON.parse(readFileSync(new URL('../openapi.json', import.meta.url), 'utf8'))
const form = readFileSync(new URL('../src/renderer/src/components/servers/CreateServerModal.tsx', import.meta.url), 'utf8')

test('the reference makes name optional on a create request, which is why a blank hostname is allowed', () => {
  const create = spec.components.schemas.CreateServerRequest
  assert.ok(!create.required.includes('name'))
  assert.ok(create.properties.name)
  assert.match(create.properties.name.description, /If not provided, the server will be created with a random name/)
})

test('a blank hostname sends no name: the key is absent, not empty or null', () => {
  for (const raw of ['', ' ', '   ', '\t', '\n', ' \t\r\n ', ' ']) {
    const f = hostnameFields(raw)
    assert.equal(f.blank, true, JSON.stringify(raw))
    assert.equal(f.name, '')
    assert.deepEqual(Object.keys(f.request), [], JSON.stringify(raw))
    assert.equal(JSON.stringify({ region: 'syd', ...f.request }), '{"region":"syd"}')
  }
})

test('a typed hostname is sent without the spaces around it', () => {
  for (const [raw, want] of [['web-01', 'web-01'], ['  web-01', 'web-01'], ['web-01  ', 'web-01'], ['\tweb-01.example.com\n', 'web-01.example.com']]) {
    const f = hostnameFields(raw)
    assert.equal(f.blank, false)
    assert.equal(f.name, want)
    assert.deepEqual(f.request, { name: want })
  }
})

test('spaces inside a hostname are left alone (the form does not judge whether BinaryLane accepts it)', () => {
  assert.deepEqual(hostnameFields(' my host ').request, { name: 'my host' })
})

test('the History entry names a blank hostname "New server" and says it was left blank; a typed one is its own target with no extra row', () => {
  const blank = hostnameFields('  ')
  assert.equal(blank.historyTarget, BLANK_HOSTNAME_TARGET)
  assert.equal(BLANK_HOSTNAME_TARGET, 'New server')
  assert.deepEqual(blank.changes, [{ label: 'Hostname', to: 'left blank, so BinaryLane names the server' }])
  const typed = hostnameFields(' web-01 ')
  assert.equal(typed.historyTarget, 'web-01')
  assert.deepEqual(typed.changes, [])
})

test('the form no longer refuses a blank hostname, and builds the request name and the History entry from these fields', () => {
  assert.ok(!form.includes('Enter a hostname for the server'))
  assert.match(form, /hostnameFields\(hostname\)/)
  assert.match(form, /\.\.\.host\.request/)
  assert.match(form, /historyTarget/)
  assert.match(form, /\.\.\.host\.changes/)
})
