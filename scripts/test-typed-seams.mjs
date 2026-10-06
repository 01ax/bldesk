// Tests for scripts/check-typed-seams.mjs: node --test scripts/test-typed-seams.mjs
//
// The guard is only worth having if it fails on the mistakes it exists for, so each test edits the real source in memory
// (never on disk) to put one of them back and expects the guard to name it. The edits are the ones #170's review listed,
// and `patch` refuses an edit that does not match exactly once, so a source change cannot turn a test into a pass.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkSeams } from './check-typed-seams.mjs'

const fails = (patches, mention) => {
  const problems = checkSeams({ patches })
  assert.ok(problems.length > 0, 'the guard should have failed')
  assert.ok(problems.some((p) => p.includes(mention)), `expected a problem mentioning "${mention}", got:\n${problems.join('\n')}`)
}

test('the tree as it is passes', () => {
  assert.deepEqual(checkSeams(), [])
})

test('an edit that changes nothing that matters still passes', () => {
  const patch = { file: 'components/firewall/FirewallMatrix.tsx', from: 'const now = new Map<number, FwRule[] | null>(', to: 'const now = new Map<number, FwRule[] | null>( /* same */ ' }
  assert.deepEqual(checkSeams({ patches: [patch] }), [])
})

test('handleAction taking any is caught', () => {
  fails([{ file: 'components/servers/ServerDetails.tsx', from: 'body: SubmittableActionBody,', to: 'body: any,' }], 'handleAction')
})

test("useServerActionMutation's parameter set back to any is caught", () => {
  fails([{ file: 'api/queries.ts', from: 'actionPayload: SubmittableActionBody }) => {', to: 'actionPayload: any }) => {' }], 'useServerActionMutation')
})

test("executeAction's payload set to any is caught", () => {
  fails([{ file: 'components/servers/ServerSettings.tsx', from: 'payload: ServerActionBody, req', to: 'payload: any, req' }], 'executeAction')
})

test('the firewall rules mutation taking any[] is caught', () => {
  fails([{ file: 'api/queries.ts', from: 'mutationFn: async (rules: FwRule[]) => {', to: 'mutationFn: async (rules: any[]) => {' }], 'useUpdateFirewallRulesMutation')
})

test('currentRules cast to any[] is caught', () => {
  fails([{ file: 'components/firewall/FirewallManager.tsx', from: 'const currentRules: FwRule[] = firewallQuery.data || []', to: 'const currentRules = (firewallQuery.data || []) as any[]' }], 'currentRules')
})

test("the matrix's reads typed as any[] is caught", () => {
  fails([{ file: 'components/firewall/FirewallMatrix.tsx', from: 'const now = new Map<number, FwRule[] | null>(', to: 'const now = new Map<number, any[] | null>(' }], '"now"')
})

test('a firewall body cast as never is caught at the POST, wherever it is', () => {
  fails([{ file: 'lib/templateJobs.ts', from: "firewall_rules: rules }", to: 'firewall_rules: rules as never }' }], 'lib/templateJobs.ts')
})

test('a firewall body of any[] is caught at the POST, wherever it is', () => {
  fails([{ file: 'components/firewall/FirewallMatrix.tsx', from: "firewall_rules: outgoing }", to: 'firewall_rules: outgoing as any[] }' }], 'components/firewall/FirewallMatrix.tsx')
})

test('a whole body cast as any is caught at the POST', () => {
  fails([{ file: 'components/firewall/FirewallMatrix.tsx', from: "body: { type: 'change_advanced_firewall_rules', firewall_rules: outgoing }", to: "body: { type: 'change_advanced_firewall_rules', firewall_rules: outgoing } as any" }], 'components/firewall/FirewallMatrix.tsx')
})

test('a seam that was renamed fails instead of passing quietly', () => {
  fails([{ file: 'components/servers/ServerDetails.tsx', from: 'const handleAction = async (', to: 'const handleActionRenamed = async (' }], 'not found')
})

test('an edit that matches nothing is refused, so a test cannot pass by doing nothing', () => {
  assert.throws(() => checkSeams({ patches: [{ file: 'api/queries.ts', from: 'this text is not in the file', to: 'x' }] }), /exactly once/)
})
