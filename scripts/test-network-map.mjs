// Tests for the Network Map card: its footer (the open ports and the addresses must not run into each other) and the
// exposure it shows (the ports the world can reach, and the SSH count in the header).
// node --experimental-strip-types --no-warnings --test scripts/test-network-map.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cardFooter as footer } from '../src/renderer/src/lib/mapFooter.ts'
// The map's exposure functions are exported from networkMap.ts, which imports a module Node cannot resolve; they live here.
import { exposes, exposureLabel } from '../src/renderer/src/lib/firewallMatrix.ts'

const NODE_W = 196 // networkMap.ts
const cardFooter = (label, pub, priv, width = NODE_W, measure) => footer(label, pub, priv, width, measure)

const PORT_W = 5.45
const ADDR_W = 5.75

test('a short label leaves both addresses on the card', () => {
  assert.deepEqual(cardFooter('22', '203.0.113.20', '10.21.0.100'), { exposure: '22', addresses: '203.0.113.20 · 10.21.0.100' })
})

test('a longer label drops the private address instead of running into it', () => {
  assert.equal(cardFooter('none', '203.0.113.20', '10.21.0.100').addresses, '203.0.113.20')
  const f = cardFooter('80 443 9090 +3', '203.0.113.20', '10.21.0.100')
  assert.equal(f.addresses, '203.0.113.20')
  assert.equal(f.exposure, '80 443 9090 +3')
})

test('whatever the label and addresses, the two halves fit side by side', () => {
  const labels = ['none', 'all', '?', '…', '22', '22 80 443 8080', '22 80 443 8080 +12', '1024-65535 2000-3000 4000-5000 6000-7000']
  const addresses = [[null, null], ['203.0.113.20', null], ['203.0.113.20', '10.21.0.100'], ['198.51.100.255', '10.255.255.255']]
  for (const label of labels) {
    for (const [pub, priv] of addresses) {
      const f = cardFooter(label, pub, priv)
      assert.ok(f.exposure.length * PORT_W + f.addresses.length * ADDR_W <= NODE_W - 24 - 8 + PORT_W, `${label} | ${pub} | ${priv}: ${JSON.stringify(f)}`)
      assert.ok(f.exposure.length > 0)
    }
  }
})

test('a label cut to fit ends with an ellipsis, and one that fits is left alone', () => {
  const f = cardFooter('1024-65535 2000-3000 4000-5000 6000-7000', '203.0.113.20', '10.21.0.100')
  assert.ok(f.exposure.endsWith('…'))
  assert.equal(cardFooter('22', '203.0.113.20', null).exposure, '22')
})

test('measuring with the real font decides, not the estimate', () => {
  // A narrow font (5 px a character) fits both addresses beside "none"; a wide one (7 px) does not.
  const narrow = (text) => text.length * 5
  const wide = (text) => text.length * 7
  assert.equal(cardFooter('none', '203.0.113.20', '10.21.0.100', NODE_W, narrow).addresses, '203.0.113.20 · 10.21.0.100')
  const f = cardFooter('80 443 9090 +3', '203.0.113.20', '10.21.0.100', NODE_W, wide)
  assert.ok(f.exposure.length * 7 + f.addresses.length * 7 <= NODE_W - 24 - 8 + 7)
})

// --- Exposure: what the card's footer and the header's SSH count say the world can reach -----------------------------

const PUBLIC = '203.0.113.20' // a server's public IPv4 (documentation range)
const VPC = '10.21.0.0/16'
const rule = (action, protocol, { ports, src = ['0.0.0.0/0'], dst = ['0.0.0.0/0'] } = {}) => ({
  action,
  protocol,
  source_addresses: src,
  destination_addresses: dst,
  ...(ports ? { destination_ports: ports } : {})
})
// The server's public addresses default to PUBLIC only when none are passed: an explicit undefined means "not known".
const label = (rules, ...publics) => exposureLabel(rules, publics.length ? publics[0] : [PUBLIC])

test('the label lists the ports a rule lets the world reach, in order, and says all or none', () => {
  assert.equal(label([rule('accept', 'tcp', { ports: ['443', '80', '22'] }), rule('drop', 'all')]), '22 80 443')
  assert.equal(label([rule('accept', 'all'), rule('drop', 'icmp')]), 'all')
  assert.equal(label([rule('accept', 'tcp', { ports: ['*'] }), rule('drop', 'all')]), 'all', 'a * port list is every port')
  assert.equal(label([rule('drop', 'all', { ports: ['*'] }), rule('accept', 'all')]), 'none')
  assert.equal(label([rule('drop', 'all', { ports: ['all'] }), rule('accept', 'all')]), 'none')
  assert.equal(label([rule('drop', 'all')]), 'none')
  assert.equal(label(null), '?', 'rules that could not be read')
  assert.equal(label([]), 'all', 'no rules filter nothing')
})

test('a long list is cut after four, and ranges are shown as ranges', () => {
  assert.equal(label([rule('accept', 'tcp', { ports: ['5000', '1000', '4000', '2000', '3000'] }), rule('drop', 'all')]), '1000 2000 3000 4000 +1')
  assert.equal(label([rule('accept', 'tcp', { ports: ['8000:9000', '22'] }), rule('drop', 'all')]), '22 8000:9000', 'a range as the API writes it')
  assert.equal(label([rule('accept', 'tcp', { ports: ['8000-9000', '22'] }), rule('drop', 'all')]), '22 8000:9000', 'a hyphen is read, and shown the API way')
  assert.equal(label([rule('accept', 'tcp', { ports: ['80', '81', '82'] }), rule('drop', 'all')]), '80:82', 'neighbouring ports are one range')
})

test('a rule for the VPC range does not put its ports on the card', () => {
  assert.equal(label([rule('accept', 'tcp', { dst: [VPC] }), rule('drop', 'all')]), 'none')
  assert.equal(label([rule('accept', 'tcp', { ports: ['22'], dst: ['10.21.0.100'] }), rule('drop', 'all')]), 'none')
  assert.equal(label([rule('accept', 'tcp', { ports: ['22'], dst: [VPC] }), rule('accept', 'tcp', { ports: ['443'], dst: [PUBLIC] }), rule('drop', 'all')]), '443')
  assert.equal(label([rule('accept', 'tcp', { ports: ['22'], dst: ['203.0.113.99'] }), rule('drop', 'all')]), 'none', 'a rule copied from another server')
})

test('a port dropped ahead of the rule that accepts it is not on the card', () => {
  assert.equal(label([rule('drop', 'tcp', { ports: ['22'] }), rule('accept', 'tcp', { ports: ['22', '80'] }), rule('drop', 'all')]), '80')
  assert.equal(label([rule('accept', 'tcp', { ports: ['22', '80'] }), rule('drop', 'tcp', { ports: ['22'] }), rule('drop', 'all')]), '22 80')
  assert.equal(label([rule('accept', 'tcp', { ports: ['22'], src: ['198.51.100.7'] }), rule('drop', 'tcp', { ports: ['22'] }), rule('drop', 'all')]), 'none', 'an allowlist is not the world')
})

test('only a port counts as reachable: ICMP does not, UDP does', () => {
  assert.equal(label([rule('accept', 'icmp'), rule('drop', 'all')]), 'none')
  assert.equal(label([rule('accept', 'udp', { ports: ['443'] }), rule('drop', 'all')]), '443')
  assert.equal(label([rule('accept', 'tcp', { ports: ['443'] }), rule('accept', 'udp', { ports: ['443'] }), rule('drop', 'all')]), '443')
})

test('each of the server\'s public addresses is read, and a server with none shows none', () => {
  const second = '203.0.113.21'
  const onlyFirst = [rule('accept', 'tcp', { ports: ['22'], dst: [PUBLIC] }), rule('drop', 'all')]
  assert.equal(label(onlyFirst, [PUBLIC, second]), '22')
  assert.equal(label(onlyFirst, [second]), 'none')
  assert.equal(label([rule('drop', 'tcp', { ports: ['22'], dst: [PUBLIC] }), rule('accept', 'tcp')], [PUBLIC, second]), 'all', 'the second address still answers on 22')
  assert.equal(label([rule('accept', 'all')], []), 'none', 'a VPC-only server')
  assert.equal(label([], []), 'none')
  assert.equal(label([rule('accept', 'tcp', { ports: ['22'], dst: [VPC] }), rule('drop', 'all')], undefined), 'none', 'addresses not known')
  assert.equal(label([rule('accept', 'tcp', { ports: ['22'] }), rule('drop', 'all')], undefined), '22')
})

test('the SSH count counts a server only if its own rules let the world reach port 22', () => {
  const vpcOnly = [rule('accept', 'tcp', { dst: [VPC] }), rule('drop', 'all')]
  assert.equal(exposes(vpcOnly, 22, [PUBLIC]), false, 'the case in #326')
  assert.equal(exposes([rule('accept', 'tcp', { ports: ['22'], dst: [PUBLIC] }), rule('drop', 'all')], 22, [PUBLIC]), true)
  assert.equal(exposes([rule('drop', 'tcp', { ports: ['22'] }), rule('accept', 'all')], 22, [PUBLIC]), false)
  assert.equal(exposes([rule('accept', 'tcp', { ports: ['22'] })], 22, []), false, 'no public address')
  assert.equal(exposes([rule('accept', 'tcp', { ports: ['2200:2300'] }), rule('drop', 'all')], 22, [PUBLIC]), false)
  assert.equal(exposes([rule('accept', 'tcp', { ports: ['20:30'] }), rule('drop', 'all')], 22, [PUBLIC]), true, 'a range accept opens the port, as it did live')
  assert.equal(exposes([rule('accept', 'tcp', { ports: ['2200:2300'] })], 22, [PUBLIC]), true, 'no final drop: 22 matches no rule and is permitted')
  assert.equal(exposes([], 22, [PUBLIC]), true)
  assert.equal(exposes(null, 22, [PUBLIC]), false)
})

test('a list with no final drop leaves the rest open, and the label says so', () => {
  assert.equal(label([rule('accept', 'tcp', { ports: ['80'] })]), 'all', 'every other port matches nothing, over TCP and UDP')
  assert.equal(label([rule('accept', 'tcp', { dst: ['10.21.0.0/16'] })]), 'all', 'the case in #327: the only accept is for the VPC range')
  assert.equal(label([rule('accept', 'tcp', { ports: ['22'], dst: ['203.0.113.20'] })], ['203.0.113.20', '203.0.113.21']), 'all')
  // Only TCP is dropped, so every UDP port is still open.
  assert.equal(label([rule('drop', 'tcp', { ports: ['22'] }), rule('drop', 'tcp', { ports: ['3389'] })]), 'all')
  assert.equal(exposes([rule('drop', 'tcp', { ports: ['22'] }), rule('drop', 'tcp', { ports: ['3389'] })], 3306, [PUBLIC]), true)
  assert.equal(exposes([rule('drop', 'tcp', { ports: ['22'] }), rule('drop', 'tcp', { ports: ['3389'] })], 22, [PUBLIC]), false)
})

test('when almost everything is open the label names what is closed', () => {
  assert.equal(label([rule('drop', 'all', { ports: ['3389', '22'] })]), 'all but 22 3389')
  assert.equal(label([rule('drop', 'all', { ports: ['22'] }), rule('accept', 'tcp', { ports: ['80'] })]), 'all but 22')
  assert.equal(label([rule('drop', 'all', { ports: ['8000:9000'] })]), 'all but 8000:9000')
  assert.equal(label([rule('drop', 'all', { ports: ['2', '4', '6', '8', '10'] })]), 'all but 2 4 6 8 +1', 'cut after four, like the open list')
  assert.equal(label([rule('drop', 'all', { ports: ['1', '3', '5', '7', '9', '11'] })]), '2 4 6 8 +2', 'as many closed spans as open ones shows the open list')
  // Whichever list is shorter is shown: one span open and one closed shows the open one.
  assert.equal(label([rule('accept', 'all', { ports: ['101:65535'] }), rule('drop', 'all')]), '101:65535')
  assert.equal(label([rule('drop', 'all', { ports: ['1:100'] })]), '101:65535')
  assert.equal(label([rule('drop', 'all', { ports: ['1:65535'] })]), 'none')
  assert.equal(label([rule('drop', 'all', { ports: ['0:1023'] })]), '1024:65535', 'mPanel\'s System ports')
  // The shorter list in spans, not in ports: two open ranges against one closed one name the closed one.
  assert.equal(label([rule('accept', 'all', { ports: ['1:1024', '49152:65535'] }), rule('drop', 'all')]), 'all but 1025:49151')
})
