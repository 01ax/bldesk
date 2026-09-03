import { components } from '@shared/api/schema'

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

/** Does a port spec - "22", "20-25", "*", null - cover this port? */
export function portSpecCovers(spec: string | null | undefined, port: number): boolean {
  if (spec === null || spec === undefined) return true // null/empty means all ports
  const s = String(spec).trim()
  if (s === '' || s === '*') return true
  const range = s.match(/^([0-9]{1,5})\s*[-:]\s*([0-9]{1,5})$/)
  if (range) {
    const lo = Number(range[1])
    const hi = Number(range[2])
    return port >= Math.min(lo, hi) && port <= Math.max(lo, hi)
  }
  return Number(s) === port
}

const matchesPort = (rule: Rule, port: number): boolean => {
  const ports = rule.destination_ports
  if (!ports || ports.length === 0) return true // empty means all ports
  return ports.some((p) => portSpecCovers(p, port))
}

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
const appliesToAnySource = (rule: Rule): boolean => {
  const src = rule.source_addresses
  if (!src || src.length === 0) return true
  return src.some((a) => a === '0.0.0.0/0' || a === '::/0' || a === '*')
}

/**
 * The first dropping rule that would cover this TCP port.
 *
 * Order matters: these are evaluated in sequence, so an earlier `accept` for the
 * same port means a later `drop` never sees the packet. Reporting a drop that is
 * shadowed by an accept above it would point at the wrong line.
 */
export function explainUnreachablePort(
  rules: Rule[] | undefined,
  port: number
): FirewallVerdict {
  if (rules === undefined) return { kind: 'unknown' }
  if (rules.length === 0) return { kind: 'no-rules' }

  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i]
    if (!matchesTcp(rule) || !matchesPort(rule, port)) continue
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

/** One line describing a rule, for pointing at it in the UI. */
export function describeRule(rule: Rule): string {
  const ports = rule.destination_ports?.length ? rule.destination_ports.join(', ') : 'all ports'
  const from = rule.source_addresses?.length ? rule.source_addresses.join(', ') : 'any source'
  return `${rule.action} ${rule.protocol} ${ports} from ${from}`
}
