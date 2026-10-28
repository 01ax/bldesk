// Tests for what the magnifier beside a rule's addresses and ports offers. The modules import only other plain lib files, so Node runs
// the TypeScript directly: node --test scripts/test-firewall-picks.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { exposureLabel, publicAddressesOf as auditedAddressesOf } from '../src/renderer/src/lib/firewallMatrix.ts'
import { addressChoicesFor, ownAddressesOf, PORT_CHOICES, presetRule, privateAddressesOf, withChoice } from '../src/renderer/src/lib/firewallPicks.ts'
import { isIpv4OrRange, MAX_RULES, readImportedRules, RULE_LIMIT_NOTE, ruleLimitNote, rulesAllowed } from '../src/renderer/src/lib/firewallRules.ts'

const net = (ip, type, extra = {}) => ({ ip_address: ip, type, netmask: '255.255.255.0', gateway: null, ...extra })
const server = (id, name, v4, extra = {}) => ({ id, name, networks: { v4, v6: [] }, failover_ips: [], ...extra })
const me = server(1, 'web', [net('198.51.100.10', 'public'), net('172.26.8.82', 'private')])
const a = server(2, 'alpha', [net('198.51.100.20', 'public'), net('198.51.100.21', 'public'), net('172.26.8.20', 'private')])
const b = server(3, 'bravo', [net('203.0.113.30', 'public', { nat_target: '10.240.0.30' }), net('10.240.0.30', 'private')])
const c = server(4, 'charlie', [net('203.0.113.40', 'public')])
const byLabel = (choices, label) => choices.find((x) => x.label === label)

test('the entries come in mPanel\'s order: any address, the other servers, then this server', () => {
  const labels = addressChoicesFor(me, [me, a, b, c]).map((x) => x.label)
  assert.deepEqual(labels, [
    'Any address',
    'My Other Addresses',
    'My Other Public Addresses',
    'My Other Private Addresses',
    'Server: alpha (198.51.100.20)',
    'Server: alpha (198.51.100.21)',
    'Server: alpha (172.26.8.20)',
    'Server: bravo (203.0.113.30)',
    'Server: bravo (10.240.0.30)',
    'Server: charlie (203.0.113.40)',
    'Server Public Addresses',
    'Server Private Addresses',
    'Server All Addresses',
    'Server Address: 198.51.100.10',
    'Server Address: 172.26.8.82'
  ])
})

test("this server's choices hold its own addresses, and not another server's", () => {
  const picks = addressChoicesFor(me, [me, a, b, c])
  assert.deepEqual(byLabel(picks, 'Server Public Addresses').values, ['198.51.100.10'])
  assert.deepEqual(byLabel(picks, 'Server Private Addresses').values, ['172.26.8.82'])
  assert.deepEqual(byLabel(picks, 'Server All Addresses').values, ['198.51.100.10', '172.26.8.82'])
  assert.deepEqual(byLabel(picks, 'Server Address: 198.51.100.10').values, ['198.51.100.10'])
  assert.deepEqual(byLabel(picks, 'Server Address: 172.26.8.82').values, ['172.26.8.82'])
  assert.deepEqual(byLabel(picks, 'Any address').values, ['0.0.0.0/0'])
  assert.equal(picks.filter((p) => p.label.startsWith('Server Address:')).length, 2)
})

test('the other servers never include this one, and public and private are told apart', () => {
  const picks = addressChoicesFor(me, [me, a, b, c])
  assert.deepEqual(byLabel(picks, 'My Other Public Addresses').values, ['198.51.100.20', '198.51.100.21', '203.0.113.30', '203.0.113.40'])
  assert.deepEqual(byLabel(picks, 'My Other Private Addresses').values, ['172.26.8.20', '10.240.0.30'])
  // Every address of every other server, a server at a time: its public ones, then its private ones.
  assert.deepEqual(byLabel(picks, 'My Other Addresses').values, ['198.51.100.20', '198.51.100.21', '172.26.8.20', '203.0.113.30', '10.240.0.30', '203.0.113.40'])
  for (const x of picks.filter((p) => p.id.startsWith('others') || p.label.startsWith('Server: '))) assert.ok(!x.values.includes('198.51.100.10') && !x.values.includes('172.26.8.82'))
})

test('every address of another server is an entry of its own: its public ones, then its private ones, each putting in that address', () => {
  const picks = addressChoicesFor(me, [me, a, b, c])
  const each = picks.filter((p) => p.label.startsWith('Server: '))
  assert.equal(each.length, 6)
  for (const x of each) assert.deepEqual(x.values, [/\(([^)]+)\)$/.exec(x.label)[1]])
  // The NATed public address of a VPC server and its private one are both there.
  assert.deepEqual(byLabel(picks, 'Server: bravo (203.0.113.30)').values, ['203.0.113.30'])
  assert.deepEqual(byLabel(picks, 'Server: bravo (10.240.0.30)').values, ['10.240.0.30'])
  assert.equal(new Set(each.map((x) => x.id)).size, each.length, 'each entry has an id of its own')
})

test('the other servers are in plain character order by name, capitals first, in the entries and in the lists', () => {
  const names = ['lb1', 'cPenial', 'GS1', 'AAAfieldtest', 'kb.01ax.io', 'BLNMAP-ControlRoom', 'kb-diskbench-adl']
  const others = names.map((n, i) => server(20 + i, n, [net(`198.51.100.${100 + i}`, 'public'), net(`172.26.1.${100 + i}`, 'private')]))
  const picks = addressChoicesFor(me, [...others, me])
  assert.deepEqual(
    picks.filter((p) => p.label.startsWith('Server: ')).map((p) => /^Server: (.+) \(/.exec(p.label)[1]).filter((n, i, all) => all.indexOf(n) === i),
    ['AAAfieldtest', 'BLNMAP-ControlRoom', 'GS1', 'cPenial', 'kb-diskbench-adl', 'kb.01ax.io', 'lb1']
  )
  const sorted = ['AAAfieldtest', 'BLNMAP-ControlRoom', 'GS1', 'cPenial', 'kb-diskbench-adl', 'kb.01ax.io', 'lb1'].map((n) => others[names.indexOf(n)])
  assert.deepEqual(byLabel(picks, 'My Other Public Addresses').values, sorted.map((s) => s.networks.v4[0].ip_address))
  assert.deepEqual(byLabel(picks, 'My Other Private Addresses').values, sorted.map((s) => s.networks.v4[1].ip_address))
  assert.deepEqual(byLabel(picks, 'My Other Addresses').values, sorted.flatMap((s) => s.networks.v4.map((n) => n.ip_address)))
  // Servers with the same name keep their id order.
  const twins = [server(31, 'same', [net('198.51.100.131', 'public')]), server(30, 'same', [net('198.51.100.130', 'public')])]
  assert.deepEqual(byLabel(addressChoicesFor(me, [me, ...twins]), 'My Other Public Addresses').values, ['198.51.100.130', '198.51.100.131'])
})

test('a choice with no address behind it is left out, and any address is always there', () => {
  const vpcOnly = server(9, 'inner', [net('10.240.0.9', 'private')])
  const picks = addressChoicesFor(vpcOnly, [vpcOnly])
  assert.deepEqual(picks.map((x) => x.label), ['Any address', 'Server Private Addresses', 'Server All Addresses', 'Server Address: 10.240.0.9'])
  assert.deepEqual(addressChoicesFor(undefined, []).map((x) => x.label), ['Any address'])
  // A server whose networks were not read offers nothing of its own, and is not counted among the others.
  const unread = { id: 8, name: 'unread', failover_ips: [] }
  assert.deepEqual(addressChoicesFor(me, [me, unread]).map((x) => x.label), ['Any address', 'Server Public Addresses', 'Server Private Addresses', 'Server All Addresses', 'Server Address: 198.51.100.10', 'Server Address: 172.26.8.82'])
})

test('a preset\'s destination is all of the server\'s addresses, the same as the menu\'s Server All Addresses', () => {
  assert.deepEqual(ownAddressesOf(me), ['198.51.100.10', '172.26.8.82'])
  assert.deepEqual(ownAddressesOf(me), byLabel(addressChoicesFor(me, [me, a, b, c]), 'Server All Addresses').values)
  // A server with a second public address: the public addresses first, then the private one. Its failover address is not among them.
  const multi = server(13, 'multi', [net('198.51.100.90', 'public'), net('198.51.100.91', 'public'), net('172.26.8.90', 'private')], { failover_ips: ['198.51.100.92'] })
  assert.deepEqual(ownAddressesOf(multi), ['198.51.100.90', '198.51.100.91', '172.26.8.90'])
  // None to offer: not known, or no networks read.
  assert.deepEqual(ownAddressesOf(undefined), [])
  assert.deepEqual(ownAddressesOf({ id: 14, name: 'unread', failover_ips: [] }), [])
})

test('a failover address is not offered anywhere, and an address is listed once', () => {
  const withFailover = server(5, 'fo', [net('198.51.100.50', 'public'), net('198.51.100.50', 'public')], { failover_ips: ['198.51.100.51'] })
  const own = addressChoicesFor(withFailover, [withFailover])
  assert.deepEqual(byLabel(own, 'Server Public Addresses').values, ['198.51.100.50'])
  assert.ok(!own.some((c) => c.values.includes('198.51.100.51') || c.label.includes('198.51.100.51')), 'not in this server\'s own entries')
  // Nor in another server's entries, whichever server the lists are for, and a server with only a failover address has no public entry.
  const elsewhere = addressChoicesFor(me, [me, withFailover])
  assert.ok(!elsewhere.some((c) => c.values.includes('198.51.100.51') || c.label.includes('198.51.100.51')), 'not in the other servers\' entries')
  assert.deepEqual(byLabel(elsewhere, 'My Other Public Addresses').values, ['198.51.100.50'])
  const onlyFailover = server(6, 'only-fo', [net('172.26.8.60', 'private')], { failover_ips: ['198.51.100.61'] })
  assert.equal(byLabel(addressChoicesFor(onlyFailover, [onlyFailover]), 'Server Public Addresses'), undefined)
  assert.deepEqual(ownAddressesOf(onlyFailover), ['172.26.8.60'])
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
  // The saved count only matters above 100, and an ordinary server is refused at 101 however many it has.
  assert.equal(readImportedRules(Array.from({ length: 101 }, () => one), 100).error, over.error)
  assert.equal(readImportedRules(Array.from({ length: 101 }, () => one), 40).error, over.error)
})

test('a server that already has more than 100 rules may keep, edit or reduce them, but not exceed what it has', () => {
  const one = { action: 'accept', protocol: 'tcp', source_addresses: ['0.0.0.0/0'], destination_ports: ['22'] }
  const list = (n) => Array.from({ length: n }, () => one)
  assert.deepEqual([0, 40, 100, 101, 110].map(rulesAllowed), [100, 100, 100, 101, 110])
  // Reduced from 110 to 105, kept at 110, or cut to 100 or fewer: read, though 105 and 110 are above 100.
  for (const n of [0, 1, 100, 105, 110]) {
    const read = readImportedRules(list(n), 110)
    assert.equal(read.error, undefined, `${n} of 110`)
    assert.equal(read.rules.length, n)
  }
  // One more than it has is refused, and the reason says why 110 is not the usual 100.
  const over = readImportedRules(list(111), 110)
  assert.equal(over.error, 'The file has 111 rules. Firewall rules are limited to 100 per server. This server has 110, so its rules can be kept, edited or removed but not added to.')
  assert.equal(over.rules, undefined)
  // A server with 101 may be given 101 and not 102.
  assert.equal(readImportedRules(list(101), 101).error, undefined)
  assert.ok(readImportedRules(list(102), 101).error)
  // The note for the form's Add Rule: the plain limit up to 100, the longer one above it.
  assert.equal(ruleLimitNote(99), RULE_LIMIT_NOTE)
  assert.equal(ruleLimitNote(100), RULE_LIMIT_NOTE)
  assert.match(ruleLimitNote(110), /This server has 110/)
})

test('a choice is added to what the cell holds, as in mPanel, without repeating a value', () => {
  // An empty cell takes the choice, whatever blank it holds.
  assert.equal(withChoice('', ['198.51.100.1']), '198.51.100.1')
  assert.equal(withChoice(' \n ', ['198.51.100.1', '10.0.0.5']), '198.51.100.1\n10.0.0.5')
  // A populated cell keeps its values, in order, and the choice goes after them.
  assert.equal(withChoice('203.0.113.9', ['198.51.100.1', '10.0.0.5']), '203.0.113.9\n198.51.100.1\n10.0.0.5')
  assert.equal(withChoice('22', ['80', '443']), '22\n80\n443')
  // A value the cell already has is not added again, and what was typed is not reordered or de-duplicated.
  assert.equal(withChoice('198.51.100.1\n203.0.113.9', ['203.0.113.9', '10.0.0.5']), '198.51.100.1\n203.0.113.9\n10.0.0.5')
  assert.equal(withChoice('80\n80', ['80']), '80\n80')
  assert.equal(withChoice('203.0.113.9', ['203.0.113.9']), '203.0.113.9')
  // Commas and spaces separate values in a cell, and it is written back one to a line.
  assert.equal(withChoice('203.0.113.9, 203.0.113.10 ', ['10.0.0.5']), '203.0.113.9\n203.0.113.10\n10.0.0.5')
})

test('the any-address is a value like any other: a choice is added after it, and it is added after the others', () => {
  assert.equal(withChoice('0.0.0.0/0', ['198.51.100.1', '10.0.0.5']), '0.0.0.0/0\n198.51.100.1\n10.0.0.5')
  assert.equal(withChoice(' 0.0.0.0/0\n', ['198.51.100.1']), '0.0.0.0/0\n198.51.100.1')
  assert.equal(withChoice('0.0.0.0/0', ['0.0.0.0/0']), '0.0.0.0/0')
  assert.equal(withChoice('203.0.113.9', ['0.0.0.0/0']), '203.0.113.9\n0.0.0.0/0')
  assert.equal(withChoice('203.0.113.9\n0.0.0.0/0', ['198.51.100.1']), '203.0.113.9\n0.0.0.0/0\n198.51.100.1')
  // And in a ports cell it is only text.
  assert.equal(withChoice('0.0.0.0/0', ['80']), '0.0.0.0/0\n80')
})

// What a rule's destination list reaches: the any-address reaches every address, otherwise an address has to be listed.
const reaches = (destination, address) => destination.split('\n').some((d) => d === '0.0.0.0/0' || d === address)

test('Drop All reaches every address the server has, a failover address and one added later included', () => {
  // A server with a failover address, which the lists do not offer: the preset is judged by the rule it writes, not by the picker's entries.
  const fo = server(21, 'fo', [net('198.51.100.20', 'public'), net('172.26.8.20', 'private')], { failover_ips: ['198.51.100.21'] })
  assert.ok(!ownAddressesOf(fo).includes('198.51.100.21'), 'the failover address is not one of the picker\'s addresses')
  const drop = presetRule('drop_all', fo)
  assert.deepEqual({ action: drop.action, protocol: drop.protocol, ports: drop.ports, source: drop.source }, { action: 'drop', protocol: 'all', ports: '', source: '0.0.0.0/0' })
  for (const address of ['198.51.100.20', '172.26.8.20', '198.51.100.21', '203.0.113.99']) assert.ok(reaches(drop.destination, address), `Drop All reaches ${address}`)
  assert.equal(drop.destination, '0.0.0.0/0')
  // Through the app's own exposure model, which counts a failover address as public: the rule the preset writes closes every port on every address.
  const asRule = (p) => ({ action: p.action, protocol: p.protocol, source_addresses: [p.source], destination_addresses: p.destination.split('\n') })
  assert.ok(auditedAddressesOf(fo).includes('198.51.100.21'), 'the audit counts the failover address')
  assert.equal(exposureLabel([asRule(drop)], auditedAddressesOf(fo)), 'none')
  // The control: a Drop All for only the addresses the picker lists leaves the failover address open, which is what the review reproduced.
  assert.notEqual(exposureLabel([{ ...asRule(drop), destination_addresses: ownAddressesOf(fo) }], auditedAddressesOf(fo)), 'none')
  // The same for a server whose networks were not read, and for one with no failover address.
  assert.equal(presetRule('drop_all', undefined).destination, '0.0.0.0/0')
  assert.equal(presetRule('drop_all', { id: 22, name: 'unread' }).destination, '0.0.0.0/0')
  assert.equal(presetRule('drop_all', me).destination, '0.0.0.0/0')
})

test('an accept preset is for this server: all of its addresses, with the failover address typed in, and the any-address when they are not known', () => {
  const fo = server(21, 'fo', [net('198.51.100.20', 'public'), net('172.26.8.20', 'private')], { failover_ips: ['198.51.100.21'] })
  const expected = { ssh: ['tcp', '22', 'Allow SSH'], http_https: ['tcp', '80\n443', 'Allow Web HTTP/HTTPS'], openvpn: ['udp', '1194', 'Allow OpenVPN'], wireguard: ['udp', '51820', 'Allow WireGuard VPN'] }
  for (const [name, [protocol, ports, description]] of Object.entries(expected)) {
    const rule = presetRule(name, fo)
    assert.deepEqual([rule.action, rule.protocol, rule.ports, rule.source, rule.description], ['accept', protocol, ports, '0.0.0.0/0', description], name)
    assert.equal(rule.destination, '198.51.100.20\n172.26.8.20', `${name}: the server's own addresses, public first`)
    assert.equal(rule.destination, byLabel(addressChoicesFor(fo, [fo]), 'Server All Addresses').values.join('\n'), `${name}: the same as Server All Addresses`)
    assert.ok(!reaches(rule.destination, '198.51.100.21'), `${name} does not reach the failover address`)
    assert.equal(presetRule(name, undefined).destination, '0.0.0.0/0', `${name}: any address when the server's addresses are not known`)
  }
})
