// Tests for the reachability badge's verdict: which firewall rule, if any, explains a TCP port that timed out.
// firewallMatch.ts names its two imports with .ts extensions so Node can load it: node --test scripts/test-firewall-match.mjs
//
// A rule applies to traffic sent to an address it names (#326): a drop written for the VPC range does not stop a probe of
// the server's public address, and a probe of its private address is the one it does stop.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { describeRule, explainUnreachablePort } from '../src/renderer/src/lib/firewallMatch.ts'

const PUBLIC = '203.0.113.20' // the server's public IPv4 (documentation range)
const PRIVATE = '10.21.0.100' // the VPC address behind it
const VPC = '10.21.0.0/16'

const rule = (action, protocol, { ports, src = ['0.0.0.0/0'], dst = ['0.0.0.0/0'] } = {}) => ({
  action,
  protocol,
  source_addresses: src,
  destination_addresses: dst,
  ...(ports ? { destination_ports: ports } : {})
})
// "blocked by rule N" (1-based), or the kind of verdict.
const why = (rules, to, port = 22) => {
  const v = explainUnreachablePort(rules, port, to)
  return v.kind === 'blocked' ? `blocked by rule ${v.index + 1}` : v.kind
}

test('the rules not being known, and there being none, are not the same answer', () => {
  assert.equal(why(undefined, PUBLIC), 'unknown')
  assert.equal(why([], PUBLIC), 'no-rules')
})

test('a drop for any destination is the cause, as before', () => {
  assert.equal(why([rule('drop', 'tcp', { ports: ['22'] })], PUBLIC), 'blocked by rule 1')
  assert.equal(why([rule('drop', 'all')], PUBLIC), 'blocked by rule 1')
  assert.equal(why([rule('drop', 'tcp', { ports: ['22'] })], PRIVATE), 'blocked by rule 1')
})

test('a drop written for the VPC does not explain a timeout on the public address, and does explain one on the private address', () => {
  const dropVpc = [rule('drop', 'tcp', { ports: ['22'], dst: [VPC] })]
  assert.equal(why(dropVpc, PUBLIC), 'no-matching-rule')
  assert.equal(why(dropVpc, PRIVATE), 'blocked by rule 1')
})

test('a drop for the public address explains a timeout on it, not one on the private address', () => {
  const dropPublic = [rule('drop', 'tcp', { ports: ['22'], dst: [PUBLIC] })]
  assert.equal(why(dropPublic, PUBLIC), 'blocked by rule 1')
  assert.equal(why(dropPublic, PRIVATE), 'no-matching-rule')
})

test('the rule named is the one that applies, not an earlier one for another address', () => {
  const rules = [rule('drop', 'tcp', { ports: ['22'], dst: [VPC] }), rule('drop', 'tcp', { ports: ['22'], dst: [PUBLIC] })]
  assert.equal(why(rules, PUBLIC), 'blocked by rule 2')
  assert.equal(why(rules, PRIVATE), 'blocked by rule 1')
})

test('an accept for the VPC does not shadow a later drop for the public address', () => {
  const rules = [rule('accept', 'tcp', { dst: [VPC] }), rule('drop', 'tcp', { ports: ['22'] })]
  assert.equal(why(rules, PUBLIC), 'blocked by rule 2')
  assert.equal(why(rules, PRIVATE), 'no-matching-rule', 'on the private address the accept does come first')
})

test('an accept from anywhere to the address shadows a later drop; one for named sources does not', () => {
  const anywhere = [rule('accept', 'tcp', { ports: ['22'], dst: [PUBLIC] }), rule('drop', 'tcp', { ports: ['22'] })]
  assert.equal(why(anywhere, PUBLIC), 'no-matching-rule')
  const office = [rule('accept', 'tcp', { ports: ['22'], src: ['198.51.100.7'] }), rule('drop', 'tcp', { ports: ['22'] })]
  assert.equal(why(office, PUBLIC), 'blocked by rule 2', 'it may not cover this machine')
})

test('a destination range that holds the probed address applies, and one that does not does not', () => {
  assert.equal(why([rule('drop', 'tcp', { ports: ['22'], dst: ['203.0.113.0/24'] })], PUBLIC), 'blocked by rule 1')
  assert.equal(why([rule('drop', 'tcp', { ports: ['22'], dst: ['203.0.113.32/28'] })], PUBLIC), 'no-matching-rule')
  assert.equal(why([rule('drop', 'tcp', { ports: ['22'], dst: ['198.51.100.9', PUBLIC] })], PUBLIC), 'blocked by rule 1')
})

test('only a rule for TCP and the port in question can explain it', () => {
  assert.equal(why([rule('drop', 'udp', { ports: ['22'] })], PUBLIC), 'no-matching-rule')
  assert.equal(why([rule('drop', 'icmp')], PUBLIC), 'no-matching-rule')
  assert.equal(why([rule('drop', 'tcp', { ports: ['2222'] })], PUBLIC), 'no-matching-rule')
  assert.equal(why([rule('drop', 'tcp', { ports: ['20-30'] })], PUBLIC), 'blocked by rule 1')
  assert.equal(why([rule('drop', 'all')], PUBLIC, 3389), 'blocked by rule 1')
})

test('when the probed address is not known, a rule for private addresses only is not the cause', () => {
  assert.equal(why([rule('drop', 'tcp', { ports: ['22'], dst: [VPC] })], undefined), 'no-matching-rule')
  assert.equal(why([rule('drop', 'tcp', { ports: ['22'], dst: [PUBLIC] })], undefined), 'blocked by rule 1')
  assert.equal(why([rule('drop', 'tcp', { ports: ['22'] })], undefined), 'blocked by rule 1')
})

test('the blocked verdict carries the rule itself, for the one-line description', () => {
  const drop = rule('drop', 'tcp', { ports: ['22'], dst: [PUBLIC] })
  const v = explainUnreachablePort([rule('drop', 'tcp', { ports: ['22'], dst: [VPC] }), drop], 22, PUBLIC)
  assert.equal(v.kind, 'blocked')
  assert.equal(v.rule, drop)
  assert.match(describeRule(drop), /drop tcp 22/)
})
