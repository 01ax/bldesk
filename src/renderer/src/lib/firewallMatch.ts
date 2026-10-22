import { components } from '@shared/api/schema'
// One implementation of BinaryLane's firewall semantics, shared with the fleet
// matrix and the network map, so the audit and this verdict never disagree.
import { destinationApplies, isWorld, portsInclude } from './firewallMatrix'
import { describeFirewallRule } from './diff'

type Rule = components['schemas']['AdvancedFirewallRule']

/**
 * Which firewall rule, if any, explains a port being unreachable.
 *
 * A timeout has several causes and only one of them is a BinaryLane rule. Saying
 * "check your firewall rules" for all of them sends people hunting for a rule
 * that may not exist, while the real cause is the guest's own firewall or the
 * path in between - the same wrong steer as blaming the firewall for a refusal.
 *
 * BinaryLane firewalls are stateless with no implicit deny: with no rules at all
 * nothing is filtered at their end, so an empty rule list is a positive signal
 * that the drop happened somewhere else.
 */
export type FirewallVerdict =
  | { kind: 'blocked'; rule: Rule; index: number }
  | { kind: 'no-matching-rule' }
  | { kind: 'no-rules' }
  | { kind: 'unknown' }

const matchesTcp = (rule: Rule): boolean => rule.protocol === 'tcp' || rule.protocol === 'all'

/**
 * Does this rule apply to traffic from anywhere?
 *
 * An `accept` scoped to particular sources says nothing about a probe coming
 * from this machine, so it must not be treated as shadowing a later drop. GS1 is
 * the live case: `accept all 3389` from three office addresses, then
 * `drop all 3389 from 0.0.0.0/0`. Reading the accept as "allowed" would report
 * the port as open to us when the drop is exactly what we hit.
 *
 * We do not know our own public address here, so the conservative reading is the
 * correct one: only a universal accept can shadow.
 */
const appliesToAnySource = (rule: Rule): boolean => isWorld(rule.source_addresses)

/**
 * The first dropping rule that would cover this TCP port.
 *
 * Order matters: these are evaluated in sequence, so an earlier `accept` for the
 * same port means a later `drop` never sees the packet. Reporting a drop that is
 * shadowed by an accept above it would point at the wrong line.
 *
 * So does the destination: a rule applies to traffic sent to an address it names.
 * A drop written for the VPC range does not stop a probe of the public address, and
 * pointing at it would send the reader to a rule that is not the cause. `destination`
 * is the address that was probed; undefined when that is not known.
 */
export function explainUnreachablePort(
  rules: Rule[] | undefined,
  port: number,
  destination: string | undefined
): FirewallVerdict {
  if (rules === undefined) return { kind: 'unknown' }
  if (rules.length === 0) return { kind: 'no-rules' }

  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i]
    if (!matchesTcp(rule) || !portsInclude(rule.destination_ports, port)) continue
    if (!destinationApplies(rule.destination_addresses, destination)) continue
    // Only a universal accept shadows a later drop; a source-scoped one may
    // not cover this machine.
    if (rule.action === 'accept') {
      if (appliesToAnySource(rule)) return { kind: 'no-matching-rule' }
      continue
    }
    if (rule.action === 'drop') return { kind: 'blocked', rule, index: i }
  }
  return { kind: 'no-matching-rule' }
}

/** One line describing a rule, for pointing at it in the UI — same wording as the matrix and History diffs. */
export function describeRule(rule: Rule): string {
  return describeFirewallRule(rule)
}
