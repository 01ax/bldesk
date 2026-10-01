// Tests for the firewall rules a write contains and where a new rule goes. The module has no imports, so Node runs the
// TypeScript directly: node --test scripts/test-firewall-rules.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ANY_ADDRESS, insertRule, isIpv4OrRange, readImportedRules, ruleCount, swallows, toRuleRequest } from '../src/renderer/src/lib/firewallRules.ts'

const rule = (action, protocol, ports, extra = {}) => ({ action, protocol, source_addresses: ['0.0.0.0/0'], destination_addresses: ['0.0.0.0/0'], ...(ports ? { destination_ports: ports } : {}), ...extra })

test('a rule count is singular for one', () => {
  assert.equal(ruleCount(0), '0 rules')
  assert.equal(ruleCount(1), '1 rule')
  assert.equal(ruleCount(2), '2 rules')
})

test('a rule is written with a destination, and one that has a destination is left alone', () => {
  const bare = { action: 'accept', protocol: 'tcp', source_addresses: ['192.0.2.1/32'], destination_ports: ['22'] }
  assert.deepEqual(toRuleRequest(bare).destination_addresses, [ANY_ADDRESS])
  assert.equal('destination_addresses' in bare, false, 'the original is not changed')
  const empty = toRuleRequest({ ...bare, destination_addresses: [] })
  assert.deepEqual(empty.destination_addresses, [ANY_ADDRESS])
  const named = { ...bare, destination_addresses: ['203.0.113.7'] }
  assert.equal(toRuleRequest(named), named)
})

test('an imported list is checked against the reference and each rule gets a destination', () => {
  const ok = readImportedRules([{ action: 'accept', protocol: 'tcp', source_addresses: ['0.0.0.0/0'], destination_ports: ['22'], description: 'ssh', extra: 'dropped' }])
  assert.equal(ok.error, undefined)
  assert.deepEqual(ok.rules, [{ action: 'accept', protocol: 'tcp', source_addresses: ['0.0.0.0/0'], destination_addresses: [ANY_ADDRESS], destination_ports: ['22'], description: 'ssh' }])
  assert.deepEqual(readImportedRules([]).rules, [])

  assert.match(readImportedRules({}).error, /JSON array/)
  assert.match(readImportedRules([1]).error, /^Rule 1 is not a rule object/)
  assert.match(readImportedRules([rule('accept', 'tcp', ['22']), { ...rule('allow', 'tcp') }]).error, /^Rule 2: "action"/)
  assert.match(readImportedRules([rule('accept', 'gre')]).error, /"protocol"/)
  assert.match(readImportedRules([{ action: 'accept', protocol: 'tcp' }]).error, /"source_addresses"/)
  assert.match(readImportedRules([{ action: 'accept', protocol: 'tcp', source_addresses: [] }]).error, /"source_addresses"/)
  assert.match(readImportedRules([rule('accept', 'tcp', [22])]).error, /"destination_ports"/)
  assert.match(readImportedRules([rule('accept', 'tcp', ['22'], { destination_addresses: 'x' })]).error, /"destination_addresses"/)
})

test('addresses are IPv4 or an IPv4 range', () => {
  for (const ok of ['0.0.0.0/0', '192.0.2.1', '203.0.113.0/24', '10.0.0.1/32']) assert.equal(isIpv4OrRange(ok), true, ok)
  for (const bad of ['', '::/0', '2001:db8::/32', '256.0.0.1', '10.0.0.0/33', '10.0.0', 'any', '10.0.0.1/']) assert.equal(isIpv4OrRange(bad), false, bad)
})

test('an imported rule with an address or description the API would refuse is named', () => {
  assert.match(readImportedRules([rule('accept', 'tcp', ['22'], { source_addresses: ['::/0'] })]).error, /^Rule 1: "source_addresses" must be IPv4/)
  assert.match(readImportedRules([rule('accept', 'tcp', ['22'], { source_addresses: [''] })]).error, /"source_addresses"/)
  assert.match(readImportedRules([rule('accept', 'tcp', ['22'], { destination_addresses: ['fe80::1'] })]).error, /"destination_addresses"/)
  assert.match(readImportedRules([rule('accept', 'tcp', [' '])]).error, /"destination_ports"/)
  assert.match(readImportedRules([rule('accept', 'tcp', ['22'], { description: 'x'.repeat(251) })]).error, /251 characters/)
  assert.equal(readImportedRules([rule('accept', 'tcp', ['22'], { description: 'x'.repeat(250) })].map((r) => r)).error, undefined)
})

test('a drop swallows a rule only when it covers its protocol, ports, sources and destinations', () => {
  const dropAll = rule('drop', 'all')
  assert.equal(swallows(dropAll, rule('accept', 'tcp', ['22'])), true)
  assert.equal(swallows(rule('accept', 'all'), rule('accept', 'tcp', ['22'])), false, 'an accept swallows nothing')
  assert.equal(swallows(rule('drop', 'icmp'), rule('accept', 'tcp', ['22'])), false, 'another protocol')
  assert.equal(swallows(rule('drop', 'tcp', ['23']), rule('accept', 'tcp', ['22'])), false, 'another port')
  assert.equal(swallows(rule('drop', 'tcp', ['22', '23']), rule('accept', 'tcp', ['22'])), true)
  assert.equal(swallows(rule('drop', 'all', null, { source_addresses: ['203.0.113.5/32'] }), rule('accept', 'tcp', ['22'])), false, 'a block on one address')
  assert.equal(swallows(dropAll, rule('accept', 'tcp', ['22'], { source_addresses: ['192.0.2.1/32'] })), true)
})

test('a new rule goes ahead of the first drop that would swallow it, and last when none would', () => {
  const web = rule('accept', 'tcp', ['443'])
  const ssh = rule('accept', 'tcp', ['22'])
  const dropAll = rule('drop', 'all')
  // The order that used to go wrong: Drop All first, then an accept.
  assert.deepEqual(insertRule([web], dropAll), [web, dropAll])
  assert.deepEqual(insertRule([web, dropAll], ssh), [web, ssh, dropAll])
  // A specific drop sits ahead of the catch-all as well, where it can match.
  const block = rule('drop', 'tcp', ['23'])
  assert.deepEqual(insertRule([web, dropAll], block), [web, block, dropAll])
  // No drop yet: the rule goes last.
  assert.deepEqual(insertRule([web], ssh), [web, ssh])
  assert.deepEqual(insertRule([], dropAll), [dropAll])
  // A block on one address stays in front of a new accept, so the block still applies.
  const blockIp = rule('drop', 'all', null, { source_addresses: ['203.0.113.5/32'] })
  assert.deepEqual(insertRule([blockIp], ssh), [blockIp, ssh])
  assert.deepEqual(insertRule([blockIp, dropAll], ssh), [blockIp, ssh, dropAll])
  // A drop of another protocol does not move an accept ahead of it.
  const dropIcmp = rule('drop', 'icmp')
  assert.deepEqual(insertRule([web, dropIcmp], ssh), [web, dropIcmp, ssh])
})
