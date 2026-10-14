// Tests for what the Add a Cloud Server form does with its hostname field: a blank hostname is sent as no `name` at all,
// because the reference makes `name` optional. The module has no imports, so Node runs the TypeScript directly:
// node --test scripts/test-create-hostname.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { BLANK_HOSTNAME_TARGET, cloudInitToSend, createdDetail, createdName, createdTarget, hostnameFields } from '../src/renderer/src/lib/createServerHostname.ts'

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

test('cloud-init is sent only when the image takes it, the box is ticked and it holds something; the text is sent as typed', () => {
  assert.equal(cloudInitToSend(true, true, '#cloud-config\n'), '#cloud-config\n')
  assert.equal(cloudInitToSend(true, true, '  #cloud-config  '), '  #cloud-config  ')
  assert.equal(cloudInitToSend(true, true, ''), undefined)
  assert.equal(cloudInitToSend(true, true, ' \n\t '), undefined)
  assert.equal(cloudInitToSend(true, false, '#cloud-config'), undefined)
  assert.equal(cloudInitToSend(false, true, '#cloud-config'), undefined)
  assert.equal(cloudInitToSend(false, false, '#cloud-config'), undefined)
})

test('the History detail names the server BinaryLane gave only when no hostname was typed', () => {
  const blank = hostnameFields('')
  const typed = hostnameFields('web-01')
  assert.equal(createdDetail(blank, { id: 7, name: 'quiet-otter-7' }), 'BinaryLane accepted the request; server #7 (quiet-otter-7) is being built.')
  assert.equal(createdDetail(blank, { id: 7 }), 'BinaryLane accepted the request; server #7 is being built.')
  assert.equal(createdDetail(typed, { id: 7, name: 'web-01' }), 'BinaryLane accepted the request; server #7 is being built.')
  // A response with no server, or one with no id, is still an accepted request.
  for (const host of [blank, typed]) {
    assert.equal(createdDetail(host, undefined), 'BinaryLane accepted the request.')
    assert.equal(createdDetail(host, {}), 'BinaryLane accepted the request.')
    assert.equal(createdDetail(host, { name: 'x' }), 'BinaryLane accepted the request.')
  }
})

test('a blank hostname leaves "New server" for the server itself once there is one; otherwise the History target is left as recorded', () => {
  const blank = hostnameFields('  ')
  assert.deepEqual(createdTarget(blank, { id: 7, name: 'quiet-otter-7' }), { kind: 'server', id: 7, name: 'quiet-otter-7' })
  assert.deepEqual(createdTarget(blank, { id: 7 }), { kind: 'server', id: 7, name: '#7' })
  assert.deepEqual(createdTarget(blank, { id: 7, name: '' }), { kind: 'server', id: 7, name: '#7' })
  // No server id (or no response at all): keep the placeholder rather than invent a target.
  assert.equal(createdTarget(blank, undefined), undefined)
  assert.equal(createdTarget(blank, {}), undefined)
  assert.equal(createdTarget(blank, { name: 'x' }), undefined)
  // A typed hostname is already the target.
  assert.equal(createdTarget(hostnameFields('web-01'), { id: 7, name: 'web-01' }), undefined)
})

test('the name handed to onCreated is the typed hostname, else the returned name, else the id, and never an empty string', () => {
  const blank = hostnameFields('')
  const typed = hostnameFields(' web-01 ')
  assert.equal(createdName(typed, { id: 7, name: 'other' }), 'web-01')
  assert.equal(createdName(typed, undefined), 'web-01')
  assert.equal(createdName(blank, { id: 7, name: 'quiet-otter-7' }), 'quiet-otter-7')
  assert.equal(createdName(blank, { id: 7 }), '#7')
  assert.equal(createdName(blank, { id: 7, name: '' }), '#7')
  assert.equal(createdName(blank, undefined), BLANK_HOSTNAME_TARGET)
  assert.equal(createdName(blank, {}), BLANK_HOSTNAME_TARGET)
})

// Crude, on purpose: the behaviour is checked in the running app, but this catches the note being moved back into the
// View All only part of the form, or the note and the request using different tests for "cloud-init is sent".
test('the form builds the request and the History entry from these helpers, and the note sits under the Hostname field', () => {
  assert.ok(!form.includes('Enter a hostname for the server'))
  assert.match(form, /const host = hostnameFields\(hostname\)/)
  assert.match(form, /const userData = cloudInitToSend\(acceptsUserData, cloudInitOn, cloudInit\)/)
  assert.match(form, /\.\.\.host\.request/)
  assert.match(form, /historyTarget/)
  assert.match(form, /\.\.\.host\.changes/)
  assert.match(form, /user_data: userData/)
  assert.match(form, /createdTarget\(host, created\)/)
  assert.match(form, /createdDetail\(host, created\)/)
  assert.match(form, /createdName\(host, created\)/)
  const hostnameField = form.indexOf('<Field label="Hostname"')
  const note = form.indexOf('host.blank && userData')
  const layoutSwitch = form.indexOf('{!showAll ? (')
  assert.ok(hostnameField > 0 && note > hostnameField && note < layoutSwitch, 'the note is inside the Hostname field, before the simple and View All layouts split')
  assert.equal(form.split('No hostname is set, so BinaryLane gives the server a name of its own.').length - 1, 1, 'the note text appears once')
})
