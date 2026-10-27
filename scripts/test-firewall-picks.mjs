// Tests for what the magnifier beside a rule's addresses and ports offers. The modules import only other plain lib files, so Node runs
// the TypeScript directly: node --test scripts/test-firewall-picks.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addressChoicesFor, PORT_CHOICES, privateAddressesOf } from '../src/renderer/src/lib/firewallPicks.ts'
import { isIpv4OrRange, MAX_RULES, readImportedRules, RULE_LIMIT_NOTE } from '../src/renderer/src/lib/firewallRules.ts'

const net = (ip, type, extra = {}) => ({ ip_address: ip, type, netmask: '255.255.255.0', gateway: null, ...extra })
const server = (id, name, v4, extra = {}) => ({ id, name, networks: { v4, v6: [] }, failover_ips: [], ...extra })
const me = server(1, 'web', [net('198.51.100.10', 'public'), net('172.26.8.82', 'private')])
const a = server(2, 'alpha', [net('198.51.100.20', 'public'), net('198.51.100.21', 'public'), net('172.26.8.20', 'private')])
const b = server(3, 'bravo', [net('203.0.113.30', 'public', { nat_target: '10.240.0.30' }), net('10.240.0.30', 'private')])
const c = server(4, 'charlie', [net('203.0.113.40', 'public')])
const byLabel = (choices, label) => choices.find((x) => x.label === label)

test('a server with its own addresses offers them, and any address, after the other servers', () => {
  const labels = addressChoicesFor(me, [me, a, b, c]).map((x) => x.label)
  assert.deepEqual(labels, [
    'My Other Addresses',
    'My Other Public Addresses',
    'My Other Private Addresses',
    'Server: alpha (172.26.8.20)',
    'Server: bravo (10.240.0.30)',
    'Server: charlie (203.0.113.40)',
    'Server Public Addresses',
    'Server Private Addresses',
    'Server All Addresses',
    'Server Address: 198.51.100.10',
    'Server Address: 172.26.8.82',
    'Any address'
  ])
})

test("this server's choices hold its own addresses, and not another server's", () => {
  const picks = addressChoicesFor(me, [me, a, b, c])
  assert.deepEqual(byLabel(picks, 'Server Public Addresses').values, ['198.51.100.10'])
  assert.deepEqual(byLabel(picks, 'Server Private Addresses').values, ['172.26.8.82'])
  assert.deepEqual(byLabel(picks, 'Server All Addresses').values, ['198.51.100.10', '172.26.8.82'])
  assert.deepEqual(byLabel(picks, 'Server Address: 172.26.8.82').values, ['172.26.8.82'])
  assert.deepEqual(byLabel(picks, 'Any address').values, ['0.0.0.0/0'])
  for (const x of picks.filter((p) => p.label.startsWith('Server'))) assert.ok(!x.label.includes('alpha') || x.values.every((v) => v === '172.26.8.20'))
})

test('the other servers never include this one, and public and private are told apart', () => {
  const picks = addressChoicesFor(me, [me, a, b, c])
  assert.deepEqual(byLabel(picks, 'My Other Public Addresses').values, ['198.51.100.20', '198.51.100.21', '203.0.113.30', '203.0.113.40'])
  assert.deepEqual(byLabel(picks, 'My Other Private Addresses').values, ['172.26.8.20', '10.240.0.30'])
  // Every address of every other server, a server at a time: its public ones, then its private ones.
  assert.deepEqual(byLabel(picks, 'My Other Addresses').values, ['198.51.100.20', '198.51.100.21', '172.26.8.20', '203.0.113.30', '10.240.0.30', '203.0.113.40'])
  for (const x of picks.filter((p) => p.id.startsWith('others'))) assert.ok(!x.values.includes('198.51.100.10') && !x.values.includes('172.26.8.82'))
})

test('a server is named by its private address, or its public one when it has none', () => {
  const picks = addressChoicesFor(me, [me, a, c])
  assert.deepEqual(byLabel(picks, 'Server: alpha (172.26.8.20)').values, ['172.26.8.20'])
  assert.deepEqual(byLabel(picks, 'Server: charlie (203.0.113.40)').values, ['203.0.113.40'])
})

test('a choice with no address behind it is left out', () => {
  const vpcOnly = server(9, 'inner', [net('10.240.0.9', 'private')])
  const picks = addressChoicesFor(vpcOnly, [vpcOnly])
  assert.deepEqual(picks.map((x) => x.label), ['Server Private Addresses', 'Server All Addresses', 'Server Address: 10.240.0.9', 'Any address'])
  assert.deepEqual(addressChoicesFor(undefined, []).map((x) => x.label), ['Any address'])
  // A server whose networks were not read offers nothing of its own, and is not counted among the others.
  const unread = { id: 8, name: 'unread', failover_ips: [] }
  assert.deepEqual(addressChoicesFor(me, [me, unread]).map((x) => x.label), ['Server Public Addresses', 'Server Private Addresses', 'Server All Addresses', 'Server Address: 198.51.100.10', 'Server Address: 172.26.8.82', 'Any address'])
})

test('a failover address counts as a public address, and an address is listed once', () => {
  const withFailover = server(5, 'fo', [net('198.51.100.50', 'public'), net('198.51.100.50', 'public')], { failover_ips: ['198.51.100.51'] })
  assert.deepEqual(byLabel(addressChoicesFor(withFailover, [withFailover]), 'Server Public Addresses').values, ['198.51.100.50', '198.51.100.51'])
  // Two other servers that list the same address give it once, and so does a server that lists it twice.
  const twin1 = server(11, 'twin-a', [net('198.51.100.70', 'public'), net('10.9.0.7', 'private'), net('10.9.0.7', 'private')])
  const twin2 = server(12, 'twin-b', [net('198.51.100.70', 'public'), net('10.9.0.7', 'private')])
  const picks = addressChoicesFor(me, [me, twin1, twin2])
  assert.deepEqual(byLabel(picks, 'My Other Addresses').values, ['198.51.100.70', '10.9.0.7'])
  assert.deepEqual(byLabel(picks, 'My Other Public Addresses').values, ['198.51.100.70'])
  assert.deepEqual(byLabel(picks, 'My Other Private Addresses').values, ['10.9.0.7'])
  assert.deepEqual(privateAddressesOf(twin1), ['10.9.0.7'])
})

test('only IPv4 addresses are offered', () => {
  const v6 = server(6, 'six', [net('198.51.100.60', 'public'), net('2001:db8::1', 'public'), net('fd00::1', 'private')])
  const picks = addressChoicesFor(v6, [v6])
  for (const x of picks) for (const v of x.values) assert.ok(isIpv4OrRange(v), `${x.label}: ${v}`)
  assert.equal(privateAddressesOf(v6).length, 0)
  assert.equal(privateAddressesOf({ networks: undefined }), undefined)
})

test('every choice is something the field can hold, and the port ranges are start:end', () => {
  for (const x of PORT_CHOICES) {
    assert.ok(x.values.length > 0)
    for (const v of x.values) {
      const m = /^(\d{1,5})(?::(\d{1,5}))?$/.exec(v)
      assert.ok(m, `${x.label}: ${v}`)
      const [lo, hi] = [Number(m[1]), m[2] === undefined ? Number(m[1]) : Number(m[2])]
      assert.ok(lo <= hi && hi <= 65535, `${x.label}: ${v}`)
      if (m[2] !== undefined) assert.ok(hi > lo, 'BinaryLane refuses a range whose end is not larger than its start')
    }
  }
  assert.deepEqual(Object.fromEntries(PORT_CHOICES.map((x) => [x.label, x.values])), {
    '80,443 (HTTP+HTTPS)': ['80', '443'], '80 (HTTP)': ['80'], '443 (HTTPS)': ['443'], '22 (SSH)': ['22'], '25 (SMTP)': ['25'], '3389 (Remote Desktop)': ['3389'],
    'System ports': ['0:1023'], 'User ports': ['1024:49151'], 'Dynamic ports': ['49152:65535']
  })
  assert.deepEqual(PORT_CHOICES.map((x) => x.label), ['80,443 (HTTP+HTTPS)', '80 (HTTP)', '443 (HTTPS)', '22 (SSH)', '25 (SMTP)', '3389 (Remote Desktop)', 'System ports', 'User ports', 'Dynamic ports'])
  const ids = PORT_CHOICES.map((x) => x.id)
  assert.equal(new Set(ids).size, ids.length)
})

test('the limit is 100 rules, and an import over it is refused with the reason', () => {
  assert.equal(MAX_RULES, 100)
  assert.ok(RULE_LIMIT_NOTE.includes(String(MAX_RULES)))
  const one = { action: 'accept', protocol: 'tcp', source_addresses: ['0.0.0.0/0'], destination_ports: ['22'] }
  const atLimit = readImportedRules(Array.from({ length: 100 }, () => one))
  assert.equal(atLimit.error, undefined)
  assert.equal(atLimit.rules.length, 100)
  const over = readImportedRules(Array.from({ length: 101 }, () => one))
  assert.equal(over.error, 'The file has 101 rules. Firewall rules are limited to 100 per server.')
  assert.equal(over.rules, undefined)
})
