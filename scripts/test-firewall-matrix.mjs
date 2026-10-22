// Tests for the fleet audit: which servers have SSH, RDP or a database open to the world, read from their firewall rules.
// The module has no runtime imports, so Node runs the TypeScript directly: node --test scripts/test-firewall-matrix.mjs
//
// The rule lists are the ones tried on live servers for #326 and #327. BinaryLane checks a packet against the rules in
// order, the first match decides, and traffic that matches no rule is permitted. A rule's destination is the address the
// packet was sent to: from the internet that is the server's public address, never the private address a VPC server's
// public address is translated to.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { auditServer, destinationApplies, exposes, publicAddressesOf, worstLevel } from '../src/renderer/src/lib/firewallMatrix.ts'

const PUBLIC = '203.0.113.20' // the server's public IPv4 (documentation range)
const PRIVATE = '10.21.0.100' // what a VPC server's public address is translated to
const VPC = '10.21.0.0/16'
const OFFICE = '198.51.100.7'

const rule = (action, protocol, { ports, src = ['0.0.0.0/0'], dst = ['0.0.0.0/0'] } = {}) => ({
  action,
  protocol,
  source_addresses: src,
  destination_addresses: dst,
  ...(ports ? { destination_ports: ports } : {})
})
// The server's public addresses default to PUBLIC only when none are passed: an explicit undefined means "not known".
const codes = (rules, ...publics) => auditServer(rules, new Set(), publics.length ? publics[0] : [PUBLIC]).map((f) => f.code)
const worldFlags = (rules, ...publics) => codes(rules, ...publics).filter((c) => c.endsWith('-world'))
const sshOpen = (rules, ...publics) => codes(rules, ...publics).includes('ssh-world')

test('SSH, RDP and a database are flagged when a rule lets the world in', () => {
  const flags = auditServer([rule('accept', 'tcp', { ports: ['22', '3389', '5432'] }), rule('drop', 'all')], new Set(), [PUBLIC])
  assert.deepEqual(
    flags.map((f) => [f.code, f.level, f.text]),
    [
      ['ssh-world', 'red', 'SSH (22) open to the world'],
      ['admin-world', 'red', 'RDP (3389) open to the world'],
      ['db-world', 'amber', 'PostgreSQL (5432) open to the world']
    ]
  )
  assert.equal(worstLevel(flags), 'red')
})

test('a rule for another protocol does not open a TCP port', () => {
  assert.deepEqual(worldFlags([rule('accept', 'udp', { ports: ['22'] }), rule('drop', 'all')]), [])
  assert.deepEqual(worldFlags([rule('accept', 'icmp'), rule('drop', 'all')]), [])
  assert.deepEqual(worldFlags([rule('accept', 'all', { ports: ['22'] }), rule('drop', 'all')]), ['ssh-world'])
})

// --- Destination: #326 ------------------------------------------------------

test('"Allow all TCP to VPC" does not open the public address when the list ends in a drop', () => {
  const allowVpc = rule('accept', 'tcp', { dst: [VPC] })
  assert.deepEqual(worldFlags([allowVpc, rule('drop', 'all')]), [])
  assert.deepEqual(worldFlags([rule('drop', 'all'), allowVpc]), [])
  assert.equal(exposes([allowVpc, rule('drop', 'all')], 22, [PUBLIC]), false)
})

test('"Allow all TCP to VPC" does not close the public address either: without a final drop the rest is open', () => {
  const allowVpc = rule('accept', 'tcp', { dst: [VPC] })
  // Live: the accept alone left every port answering from the internet.
  assert.equal(sshOpen([allowVpc]), true)
  assert.equal(worldFlags([allowVpc]).length, 11, 'SSH, the four other admin ports and the six databases')
  // Live: dropping SSH after (or before) it closed SSH and nothing else, so the databases are still open.
  for (const list of [[allowVpc, rule('drop', 'tcp', { ports: ['22'] })], [rule('drop', 'tcp', { ports: ['22'] }), allowVpc]]) {
    assert.equal(sshOpen(list), false)
    assert.ok(codes(list).includes('db-world'), 'the databases fall through to the permit')
    assert.ok(codes(list).includes('admin-world'))
  }
})

test('traffic that matches no rule is permitted, so a list with no final drop leaves the rest open', () => {
  // Live: a list that only drops SSH and RDP left every other port answering.
  const onlyDrops = auditServer([rule('drop', 'tcp', { ports: ['22'] }), rule('drop', 'tcp', { ports: ['3389'] })], new Set(), [PUBLIC]).map((f) => f.text)
  assert.ok(!onlyDrops.includes('SSH (22) open to the world') && !onlyDrops.includes('RDP (3389) open to the world'))
  assert.ok(onlyDrops.includes('VNC (5900) open to the world'))
  assert.ok(onlyDrops.includes('MySQL (3306) open to the world'))
  // Live: a list that only accepts the web ports left SSH answering as well.
  assert.equal(sshOpen([rule('accept', 'tcp', { ports: ['80', '443'] })]), true)
  assert.equal(sshOpen([rule('accept', 'tcp', { ports: ['80', '443'] }), rule('drop', 'all')]), false)
  assert.equal(sshOpen([rule('accept', 'tcp', { ports: ['22'], dst: [PRIVATE] })]), true, 'a rule for another address decides nothing here')
})

test('a rule whose destinations are all private, local or another server does not apply to the public address', () => {
  for (const dst of [[VPC], [PRIVATE], ['10.0.0.0/8'], ['172.16.0.0/12'], ['192.168.0.0/16'], ['127.0.0.1'], ['10.21.0.5', '10.21.0.6'], ['198.51.100.200']]) {
    assert.deepEqual(worldFlags([rule('accept', 'tcp', { ports: ['22'], dst }), rule('drop', 'all')]), [], dst.join(','))
  }
})

test('a rule that names the public address, or a range holding it, does open it', () => {
  for (const dst of [[PUBLIC], ['203.0.113.0/24'], ['0.0.0.0/0'], [VPC, PUBLIC], []]) {
    assert.deepEqual(worldFlags([rule('accept', 'tcp', { ports: ['22'], dst }), rule('drop', 'all')]), ['ssh-world'], JSON.stringify(dst))
  }
})

test('a drop for the public address closes it; a drop for the VPC does not', () => {
  const open = rule('accept', 'tcp', { ports: ['22'] })
  assert.equal(sshOpen([rule('drop', 'tcp', { ports: ['22'], dst: [PUBLIC] }), open]), false)
  assert.equal(sshOpen([rule('drop', 'tcp', { ports: ['22'], dst: [VPC] }), open]), true)
})

test('with two public addresses, a rule for one leaves the other as the rest of the list says', () => {
  const second = '203.0.113.21'
  const publics = [PUBLIC, second]
  // Live: dropping SSH on the first address left the second one answering.
  const dropFirst = [rule('drop', 'tcp', { ports: ['22'], dst: [PUBLIC] }), rule('accept', 'all')]
  assert.equal(sshOpen(dropFirst, publics), true)
  assert.equal(sshOpen(dropFirst, [PUBLIC]), false)
  assert.equal(sshOpen(dropFirst, [second]), true)
  // Live: opening SSH on one address only, then dropping everything.
  assert.deepEqual(worldFlags([rule('accept', 'tcp', { ports: ['22'], dst: [PUBLIC] }), rule('drop', 'all')], publics), ['ssh-world'])
  assert.deepEqual(worldFlags([rule('accept', 'tcp', { ports: ['22'], dst: [PUBLIC] }), rule('drop', 'all')], [second]), [])
  // Live: the same accept with no final drop. The other address matches no rule and is permitted on every port.
  const acceptFirst = [rule('accept', 'tcp', { ports: ['22'], dst: [PUBLIC] })]
  assert.equal(sshOpen(acceptFirst, publics), true)
  assert.equal(sshOpen(acceptFirst, [second]), true)
  assert.equal(worldFlags(acceptFirst, [second]).length, 11)
})

// --- Order: the first match decides ------------------------------------------

test('the first rule that matches decides, whichever way round the pair is', () => {
  const accept = rule('accept', 'tcp', { ports: ['22'] })
  const drop = rule('drop', 'tcp', { ports: ['22'] })
  assert.equal(sshOpen([accept, drop]), true)
  assert.equal(sshOpen([drop, accept]), false)
  assert.equal(sshOpen([drop, rule('accept', 'all')]), false, 'a drop of SSH ahead of an accept-all')
  assert.ok(codes([drop, rule('accept', 'all')]).includes('admin-world'), 'which still leaves the ports it does not name open')
  assert.deepEqual(worldFlags([rule('drop', 'all'), accept]), [], 'a catch-all drop ahead of the accept')
})

test('a rule for the VPC ahead of a drop of public SSH does not rescue it', () => {
  assert.equal(sshOpen([rule('accept', 'tcp', { ports: ['22'], dst: [VPC] }), rule('drop', 'tcp', { ports: ['22'] })]), false)
})

test('SSH allowed from named addresses is closed to the world only if a drop follows; allowed from anywhere it is open', () => {
  const office = rule('accept', 'tcp', { ports: ['22'], src: [OFFICE] })
  assert.equal(sshOpen([office, rule('drop', 'tcp', { ports: ['22'] })]), false)
  assert.equal(sshOpen([office, rule('drop', 'all')]), false)
  assert.equal(sshOpen([office]), true, 'an allowlist with nothing after it closes nothing: the world matches no rule and is permitted')
  assert.equal(sshOpen([office, rule('accept', 'tcp', { ports: ['22'] })]), true)
  assert.equal(sshOpen([rule('drop', 'all', { src: ['192.0.2.9'] }), rule('accept', 'tcp', { ports: ['22'] })]), true, 'a drop for one address is not a drop for everyone')
})

// --- A server with no public IPv4 --------------------------------------------

test('a server with no public IPv4 has nothing open to the world, whatever its rules say', () => {
  const wide = [rule('accept', 'all'), rule('drop', 'icmp')]
  assert.deepEqual(worldFlags(wide, []), [])
  assert.equal(exposes(wide, 22, []), false)
  assert.deepEqual(worldFlags([rule('accept', 'tcp', { ports: ['22'] })], []), [])
})

test('with no rules the server is unfiltered, which is a warning, and open to the world only if it has a public address', () => {
  assert.deepEqual(codes([], []), ['no-rules'])
  assert.deepEqual(codes([], [PUBLIC]), ['no-rules'])
  assert.equal(exposes([], 22, [PUBLIC]), true)
  assert.equal(exposes([], 22, []), false)
})

test('when the server\'s addresses are not known, only a rule that is all private cannot apply', () => {
  assert.deepEqual(worldFlags([rule('accept', 'tcp', { ports: ['22'], dst: [VPC] }), rule('drop', 'all')], undefined), [])
  assert.deepEqual(worldFlags([rule('accept', 'tcp', { ports: ['22'], dst: [PUBLIC] }), rule('drop', 'all')], undefined), ['ssh-world'])
  assert.deepEqual(worldFlags([rule('accept', 'tcp', { ports: ['22'] }), rule('drop', 'all')], undefined), ['ssh-world'])
  assert.equal(exposes([], 22, undefined), true)
})

test('unreadable rules are flagged as unreadable and expose nothing', () => {
  assert.deepEqual(codes(null), ['unreadable'])
  assert.equal(exposes(null, 22, [PUBLIC]), false)
})

// --- Shadowed rules ----------------------------------------------------------

test('rules after a catch-all drop are called out', () => {
  assert.deepEqual(codes([rule('drop', 'all'), rule('accept', 'tcp', { ports: ['80'] }), rule('accept', 'tcp', { ports: ['443'] })]), ['shadowed'])
  const [flag] = auditServer([rule('drop', 'all'), rule('accept', 'tcp', { ports: ['80'] })], new Set(), [PUBLIC])
  assert.equal(flag.text, '1 rule after a catch-all drop never match')
  assert.equal(auditServer([rule('drop', 'all'), rule('accept', 'tcp'), rule('accept', 'udp')], new Set(), [PUBLIC])[0].text, '2 rules after a catch-all drop never match')
  assert.deepEqual(codes([rule('accept', 'tcp', { ports: ['80'] }), rule('drop', 'all')]), [], 'a drop at the end shadows nothing')
})

test('a drop for the VPC alone, or one address alone, is not a catch-all for everything', () => {
  const web = rule('accept', 'tcp', { ports: ['80'], dst: [PUBLIC] })
  assert.ok(!codes([rule('drop', 'all', { dst: [VPC] }), web]).includes('shadowed'), 'a drop for the VPC does not shadow a rule for the public address')
  assert.deepEqual(codes([rule('drop', 'all', { dst: [PUBLIC] }), rule('accept', 'tcp', { ports: ['80'], dst: ['203.0.113.99'] })]), [])
  assert.deepEqual(codes([rule('drop', 'all', { dst: [PUBLIC] }), web]), ['shadowed'], 'it does shadow a rule for that address')
  assert.deepEqual(codes([rule('drop', 'all', { dst: ['203.0.113.0/24'] }), web]), ['shadowed'], 'and one inside the range it drops')
  assert.deepEqual(codes([rule('drop', 'all', { dst: [PUBLIC] }), rule('accept', 'tcp', { ports: ['80'] })]), [], 'but not one for any address')
})

// --- Addresses ---------------------------------------------------------------

test('the public addresses of a server are its public networks and failover IPs', () => {
  const net = (ip_address, type) => ({ ip_address, type })
  assert.deepEqual(publicAddressesOf({ networks: { v4: [net(PUBLIC, 'public'), net(PRIVATE, 'private')] }, failover_ips: [] }), [PUBLIC])
  assert.deepEqual(publicAddressesOf({ networks: { v4: [net(PUBLIC, 'public'), net('203.0.113.21', 'public')] }, failover_ips: ['203.0.113.30', PUBLIC] }), [PUBLIC, '203.0.113.21', '203.0.113.30'])
  assert.deepEqual(publicAddressesOf({ networks: { v4: [net(PRIVATE, 'private')] }, failover_ips: [] }), [], 'a server that is only in a VPC has none')
  assert.equal(publicAddressesOf({ networks: undefined, failover_ips: [] }), undefined, 'networks that were not read are not "none"')
  assert.deepEqual(publicAddressesOf({ networks: { v4: [net(PUBLIC, 'public')] } }), [PUBLIC], 'a server record without failover_ips')
  assert.deepEqual(publicAddressesOf({ networks: { v4: [net(PUBLIC, 'public')] }, failover_ips: ['2001:db8::5', 'not-an-address', ''] }), [PUBLIC], 'only IPv4 is read')
})

test('a destination list applies to an address it names or contains', () => {
  assert.equal(destinationApplies(['10.0.0.0/8'], '10.255.255.255'), true)
  assert.equal(destinationApplies(['10.0.0.0/8'], '11.0.0.0'), false)
  assert.equal(destinationApplies(['203.0.113.20/32'], PUBLIC), true)
  assert.equal(destinationApplies(['203.0.113.21'], PUBLIC), false)
  assert.equal(destinationApplies(['203.0.113.16/28'], PUBLIC), true)
  assert.equal(destinationApplies(['203.0.113.32/28'], PUBLIC), false)
  assert.equal(destinationApplies(['0.0.0.0/0'], PUBLIC), true)
  assert.equal(destinationApplies(['any'], PUBLIC), true)
  assert.equal(destinationApplies([], PUBLIC), true, 'an empty list is any, as it is for sources')
  assert.equal(destinationApplies(null, PUBLIC), true)
  assert.equal(destinationApplies(['not-an-address', '10.0.0.0/33', '10.0.0.0/', '1.2.3'], PUBLIC), false, 'an entry that is not an IPv4 address or range names nothing')
  assert.equal(destinationApplies(['fd00::/8'], PUBLIC), false, 'the external firewall does not read IPv6')
  assert.equal(destinationApplies([VPC, PUBLIC], PUBLIC), true)
})
