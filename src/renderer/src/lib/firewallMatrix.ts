/**
 * Fleet-wide firewall matrix (FEATURES.md #2): pure helpers that turn
 * per-server rule lists into a servers × rules grid, plus the audit that
 * answers "which of my boxes still has SSH open to the world?".
 *
 * BinaryLane's advanced firewall is first-match: rules are evaluated in
 * order and the first one that matches decides. `change_advanced_firewall_rules`
 * replaces the whole list, which is why every write in the UI goes through a
 * diff first.
 */

import type { components } from '@shared/api/schema'

/** A firewall rule as BinaryLane's reference defines it. A rule that is read and a rule that is written have the same fields. */
export type FwRule = components['schemas']['AdvancedFirewallRule']

export type CellState = 'accept' | 'drop' | 'mixed'

export interface MatrixColumn {
  /** Stable key: protocol + ports + source, independent of action and description. */
  sig: string
  protocol: string
  ports: string
  source: string
  /** Servers that have a rule with this signature. */
  count: number
  /** Most common description for the signature, for the header tooltip. */
  description?: string
}

export interface Matrix {
  columns: MatrixColumn[]
  /** serverId → (sig → state) */
  cells: Map<number, Map<string, CellState>>
}

// Any address is 0.0.0.0/0 and nothing else. The API refuses `*`, `any`, `::/0` and `::` as an address (a 400), and a
// bare `0.0.0.0` is the one address 0.0.0.0, which no host has: a drop for it closed nothing when checked live.
const WORLD = new Set(['0.0.0.0/0'])

export function isWorld(addresses: string[] | null | undefined): boolean {
  if (!addresses || addresses.length === 0) return true // BinaryLane treats an empty source as any
  return addresses.some((a) => WORLD.has(a.trim().toLowerCase()))
}

function normPorts(ports: string[] | null | undefined): string {
  if (!ports || ports.length === 0) return '*'
  return [...ports].map((p) => p.trim()).filter(Boolean).sort((a, b) => Number(a.split('-')[0]) - Number(b.split('-')[0])).join(',')
}

function normAddrs(addrs: string[] | null | undefined): string {
  if (!addrs || addrs.length === 0) return 'any'
  const list = addrs.map((a) => a.trim().toLowerCase()).filter(Boolean)
  if (list.some((a) => WORLD.has(a))) return 'any'
  return [...new Set(list)].sort().join(',')
}

/** protocol + ports + source; action and description deliberately excluded. */
export function ruleSignature(r: FwRule): string {
  return `${(r.protocol || 'all').toLowerCase()} ${normPorts(r.destination_ports)} ← ${normAddrs(r.source_addresses)}`
}

export function parseSignature(sig: string): { protocol: string; ports: string; source: string } {
  const m = /^(\S+) (\S+) ← (.+)$/.exec(sig)
  return m ? { protocol: m[1], ports: m[2], source: m[3] } : { protocol: sig, ports: '', source: '' }
}

/** Does a port list (e.g. ["22", "8000-9000"] or none = all) include `port`? */
export function portsInclude(ports: string[] | null | undefined, port: number): boolean {
  if (!ports || ports.length === 0) return true
  for (const p of ports) {
    const s = p.trim()
    if (!s) continue
    if (s === '*' || s.toLowerCase() === 'all') return true
    const range = s.split('-').map((x) => Number(x.trim()))
    if (range.length === 2 && !range.some(Number.isNaN)) {
      if (port >= range[0] && port <= range[1]) return true
    } else if (Number(s) === port) {
      return true
    }
  }
  return false
}

// ---------------------------------------------------------------------------
// Exposure: what can the internet reach on this server?
// ---------------------------------------------------------------------------
//
// BinaryLane checks each packet against the rules in order and the first match decides, and traffic that matches no
// rule is permitted. A rule's destination is the address the packet was sent to. Traffic from the internet is sent to
// the server's public address, so a rule whose destination is only the VPC range or a private address never applies
// to it, and neither does one written for another server's address. This was checked on live servers (#326): with
// "accept TCP to the VPC range, then drop everything", nothing answered from the internet while a VPC neighbour could
// still connect; with the accept alone, or with only a drop of SSH after it, every other port answered; a rule that
// dropped SSH on one of a server's two public addresses left it open on the other; and a list that only accepted SSH
// for one of the two addresses left every port open on both. Each public address is therefore read on its own, and a
// port that no applicable rule decides is open.
//
// Limits: "the world" is a rule whose sources include 0.0.0.0/0 (see isWorld), not a wide range such as 0.0.0.0/1;
// and only IPv4 is read, because the external firewall does not filter IPv6 at all.

type Server = components['schemas']['Server']

/**
 * The public IPv4 addresses a server answers on: its public networks and any failover IPs. `undefined` when its
 * networks were not read. `[]` is a server with no public IPv4 at all, such as one that is only a VPC member: no rule
 * can expose that over IPv4. Only IPv4 addresses are kept, because the external firewall does not read anything else.
 */
export function publicAddressesOf(server: Pick<Server, 'networks' | 'failover_ips'>): string[] | undefined {
  const v4 = server.networks?.v4
  if (!v4) return undefined
  const addresses = v4.filter((n) => n.type === 'public').map((n) => n.ip_address)
  return [...new Set([...addresses, ...(server.failover_ips ?? [])].filter((a) => a && ipv4(a) !== null))]
}

function ipv4(text: string): number | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(text.trim())
  if (!m || m.slice(1).some((octet) => Number(octet) > 255)) return null
  return ((Number(m[1]) * 256 + Number(m[2])) * 256 + Number(m[3])) * 256 + Number(m[4])
}

/** An IPv4 address or CIDR range as its first and last address, or null when it is neither. */
function ipv4Range(entry: string): [number, number] | null {
  const [base, bits, extra] = entry.trim().split('/')
  const at = ipv4(base)
  const length = bits === undefined ? 32 : bits.trim() === '' ? NaN : Number(bits)
  if (at === null || extra !== undefined || !Number.isInteger(length) || length < 0 || length > 32) return null
  const size = 2 ** (32 - length)
  const first = Math.floor(at / size) * size
  return [first, first + size - 1]
}

const isAnyAddress = (a: string) => WORLD.has(a.trim().toLowerCase())
const entriesOf = (list: string[] | null | undefined) => (list ?? []).map((a) => a.trim()).filter(Boolean)
/** Does this list name every address, as an empty list or an any-address does? */
const namesEveryAddress = (list: string[] | null | undefined) => {
  const entries = entriesOf(list)
  return entries.length === 0 || entries.some(isAnyAddress)
}

/** Private and local IPv4 space: a rule written only for these cannot name a public address. */
const LOCAL_BLOCKS = ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '127.0.0.0/8', '169.254.0.0/16'].map((b) => ipv4Range(b)!)
const insideLocal = ([first, last]: [number, number]) => LOCAL_BLOCKS.some(([lo, hi]) => lo <= first && last <= hi)

/**
 * Could a rule that lists these destinations apply to traffic sent to the IPv4 address `to`? An empty list is any, as
 * it is for sources. `to` undefined is a public address we were not told, so a rule applies unless every destination
 * it lists is private or local, or is not an IPv4 address at all.
 */
export function destinationApplies(list: string[] | null | undefined, to: string | undefined): boolean {
  if (namesEveryAddress(list)) return true
  const entries = entriesOf(list)
  if (to === undefined) {
    return entries.some((a) => {
      const range = ipv4Range(a)
      return range !== null && !insideLocal(range)
    })
  }
  const at = ipv4(to)
  if (at === null) return false
  return entries.some((a) => {
    const range = ipv4Range(a)
    return range !== null && range[0] <= at && at <= range[1]
  })
}

/** Does every address `inner` names fall inside `outer`? An empty or any-address list is everything. */
function destinationsCover(outer: string[] | null | undefined, inner: string[] | null | undefined): boolean {
  if (namesEveryAddress(outer)) return true
  if (namesEveryAddress(inner)) return false
  const wide = entriesOf(outer)
  const narrow = entriesOf(inner)
  const ranges = wide.map(ipv4Range)
  return narrow.every((a) => {
    const r = ipv4Range(a)
    return r !== null && ranges.some((w) => w !== null && w[0] <= r[0] && r[1] <= w[1])
  })
}

/** Ports as inclusive spans. The ports of a rule are 1 to 65535. */
type Span = [number, number]
const ALL_PORTS: Span = [1, 65535]

function portSpans(ports: string[] | null | undefined): Span[] {
  if (!ports || ports.length === 0) return [ALL_PORTS]
  const spans: Span[] = []
  for (const raw of ports) {
    const s = raw.trim().toLowerCase()
    if (!s) continue
    if (s === '*' || s === 'all') return [ALL_PORTS]
    const m = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(s)
    if (!m) continue
    const lo = Number(m[1])
    const hi = m[2] === undefined ? lo : Number(m[2])
    const first = Math.max(lo, ALL_PORTS[0])
    const last = Math.min(hi, ALL_PORTS[1])
    if (first <= last) spans.push([first, last])
  }
  return spans
}

function intersect(a: Span[], b: Span[]): Span[] {
  const out: Span[] = []
  for (const [alo, ahi] of a) {
    for (const [blo, bhi] of b) {
      const lo = Math.max(alo, blo)
      const hi = Math.min(ahi, bhi)
      if (lo <= hi) out.push([lo, hi])
    }
  }
  return out
}

function subtract(from: Span[], cut: Span[]): Span[] {
  let rest = from
  for (const [clo, chi] of cut) {
    const next: Span[] = []
    for (const [lo, hi] of rest) {
      if (chi < lo || clo > hi) {
        next.push([lo, hi])
        continue
      }
      if (lo < clo) next.push([lo, clo - 1])
      if (hi > chi) next.push([chi + 1, hi])
    }
    rest = next
  }
  return rest
}

/** Sorted, with overlapping and neighbouring spans joined. */
function joined(spans: Span[]): Span[] {
  const out: Span[] = []
  for (const [lo, hi] of [...spans].sort((a, b) => a[0] - b[0])) {
    const last = out[out.length - 1]
    if (last && lo <= last[1] + 1) last[1] = Math.max(last[1], hi)
    else out.push([lo, hi])
  }
  return out
}

/**
 * The ports a host on the internet reaches on `to` over one protocol, reading the rules first to last. A port that no
 * rule decides is open: BinaryLane permits traffic that matches no rule, so a list without a final drop leaves it so.
 */
function reachablePorts(rules: FwRule[], protocol: 'tcp' | 'udp', to: string | undefined): Span[] {
  let open: Span[] = []
  let undecided: Span[] = [ALL_PORTS]
  for (const r of rules) {
    if (undecided.length === 0) break
    const proto = (r.protocol || 'all').toLowerCase()
    if (proto !== 'all' && proto !== protocol) continue
    if (!isWorld(r.source_addresses) || !destinationApplies(r.destination_addresses, to)) continue
    const drops = (r.action || '').toLowerCase() === 'drop'
    // Without a known address a rule that only might name it can open a port but never close one.
    if (drops && to === undefined && !namesEveryAddress(r.destination_addresses)) continue
    const decided = intersect(undecided, portSpans(r.destination_ports))
    if (!drops) open = open.concat(decided)
    undecided = subtract(undecided, decided)
  }
  return joined(open.concat(undecided))
}

/**
 * The ports reachable from the internet on any of the server's public addresses, over any of `protocols`. A server with
 * no public address has none.
 */
function worldPorts(rules: FwRule[], publicAddresses: readonly string[] | undefined, protocols: Array<'tcp' | 'udp'>): Span[] {
  const targets = publicAddresses === undefined ? [undefined] : publicAddresses
  return joined(targets.flatMap((to) => protocols.flatMap((p) => reachablePorts(rules, p, to))))
}

const spansInclude = (spans: Span[], port: number) => spans.some(([lo, hi]) => lo <= port && port <= hi)

/** Does the world reach TCP `port` on this server? `publicAddresses` is from publicAddressesOf. */
export function exposes(rules: FwRule[] | null, port: number, publicAddresses: readonly string[] | undefined): boolean {
  if (rules === null) return false
  return spansInclude(worldPorts(rules, publicAddresses, ['tcp']), port)
}

/**
 * "22 80 443" / "all" / "all but 22 3389" / "none" from a server's rule list; null rules = unreadable. Whichever of the
 * open ports and the closed ones is the shorter list is the one shown.
 */
export function exposureLabel(rules: FwRule[] | null, publicAddresses: readonly string[] | undefined): string {
  if (rules === null) return '?'
  const open = worldPorts(rules, publicAddresses, ['tcp', 'udp'])
  if (open.length === 0) return 'none'
  const closed = subtract([ALL_PORTS], open)
  if (closed.length === 0) return 'all'
  const named = (spans: Span[]) => spans.map(([lo, hi]) => (lo === hi ? `${lo}` : `${lo}-${hi}`))
  const exceptions = closed.length < open.length
  const list = named(exceptions ? closed : open)
  const shown = list.slice(0, 4).join(' ')
  const text = list.length > 4 ? `${shown} +${list.length - 4}` : shown
  return exceptions ? `all but ${text}` : text
}

export function buildMatrix(rulesByServer: Map<number, FwRule[] | null>): Matrix {
  const counts = new Map<string, { count: number; descriptions: Map<string, number> }>()
  const cells = new Map<number, Map<string, CellState>>()

  for (const [serverId, rules] of rulesByServer) {
    const row = new Map<string, CellState>()
    cells.set(serverId, row)
    if (!rules) continue
    const seenHere = new Set<string>()
    for (const r of rules) {
      const sig = ruleSignature(r)
      const action = (r.action || '').toLowerCase() === 'drop' ? 'drop' : 'accept'
      const prev = row.get(sig)
      row.set(sig, prev && prev !== action ? 'mixed' : (prev ?? action))
      if (!seenHere.has(sig)) {
        seenHere.add(sig)
        const c = counts.get(sig) ?? { count: 0, descriptions: new Map() }
        c.count++
        const d = r.description?.trim()
        if (d) c.descriptions.set(d, (c.descriptions.get(d) ?? 0) + 1)
        counts.set(sig, c)
      }
    }
  }

  const columns: MatrixColumn[] = [...counts.entries()]
    .map(([sig, c]) => {
      const { protocol, ports, source } = parseSignature(sig)
      const description = [...c.descriptions.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
      return { sig, protocol, ports, source, count: c.count, description }
    })
    // Most widely shared first, then by protocol/port so related columns sit together.
    .sort((a, b) => b.count - a.count || a.protocol.localeCompare(b.protocol) || a.ports.localeCompare(b.ports, undefined, { numeric: true }))

  return { columns, cells }
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export type AuditCode = 'no-rules' | 'unreadable' | 'ssh-world' | 'admin-world' | 'db-world' | 'shadowed' | 'unknown-address'
export type AuditLevel = 'red' | 'amber' | 'info'

export interface AuditFlag {
  code: AuditCode
  level: AuditLevel
  text: string
}

const ADMIN_PORTS: Array<[number, string]> = [
  [22, 'SSH'],
  [3389, 'RDP'],
  [5900, 'VNC'],
  [2375, 'Docker API'],
  [2376, 'Docker API (TLS)']
]
const DB_PORTS: Array<[number, string]> = [
  [3306, 'MySQL'],
  [5432, 'PostgreSQL'],
  [6379, 'Redis'],
  [27017, 'MongoDB'],
  [9200, 'Elasticsearch'],
  [11211, 'memcached']
]

function isPrivateOrLocal(addr: string): boolean {
  const a = addr.split('/')[0]
  return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|127\.|169\.254\.|fc|fd|fe80|::1$)/i.test(a)
}

/** Every protocol, every port and every source. What it covers of the destinations is `destinationsCover`'s question. */
function catchesAll(r: FwRule): boolean {
  const proto = (r.protocol || 'all').toLowerCase()
  return proto === 'all' && (!r.destination_ports || r.destination_ports.length === 0) && isWorld(r.source_addresses)
}

/**
 * Flags for one server's rule list. `accountAddresses` are every public IPv4
 * the account owns, so a /32 source that matches none of them is called out
 * as "not one of your servers" — it may well be an office address, hence
 * info rather than a warning. `publicAddresses` are this server's own (see
 * publicAddressesOf): a port is open to the world unless the first rule that
 * applies to it, on each of them, drops it.
 */
export function auditServer(rules: FwRule[] | null, accountAddresses: Set<string>, publicAddresses: readonly string[] | undefined): AuditFlag[] {
  const flags: AuditFlag[] = []
  if (!rules) return [{ code: 'unreadable', level: 'amber', text: 'Rules could not be read' }]
  if (rules.length === 0) {
    return [{ code: 'no-rules', level: 'amber', text: 'No firewall rules — everything inbound is allowed' }]
  }

  const reachable = worldPorts(rules, publicAddresses, ['tcp'])

  for (const [port, name] of ADMIN_PORTS) {
    if (spansInclude(reachable, port)) {
      flags.push({ code: port === 22 ? 'ssh-world' : 'admin-world', level: 'red', text: `${name} (${port}) open to the world` })
    }
  }
  for (const [port, name] of DB_PORTS) {
    if (spansInclude(reachable, port)) {
      flags.push({ code: 'db-world', level: 'amber', text: `${name} (${port}) open to the world` })
    }
  }

  // First-match: a rule after a catch-all drop that covers its destinations never runs. A drop that is only for the
  // VPC range, or only for one address, is a catch-all for just that traffic.
  const catchAllDrops: FwRule[] = []
  let shadowed = 0
  for (const r of rules) {
    if (catchAllDrops.some((drop) => destinationsCover(drop.destination_addresses, r.destination_addresses))) shadowed++
    else if ((r.action || '').toLowerCase() === 'drop' && catchesAll(r)) catchAllDrops.push(r)
  }
  if (shadowed > 0) {
    flags.push({ code: 'shadowed', level: 'amber', text: `${shadowed} rule${shadowed === 1 ? '' : 's'} after a catch-all drop never match` })
  }

  const unknown = new Set<string>()
  for (const r of rules) {
    for (const a of r.source_addresses ?? []) {
      const t = a.trim()
      if (!t || WORLD.has(t.toLowerCase()) || isPrivateOrLocal(t)) continue
      const host = t.split('/')[0]
      const single = !t.includes('/') || t.endsWith('/32') || t.endsWith('/128')
      if (single && !accountAddresses.has(host)) unknown.add(host)
    }
  }
  if (unknown.size > 0) {
    const list = [...unknown]
    flags.push({
      code: 'unknown-address',
      level: 'info',
      text: `Allows ${list.length === 1 ? list[0] : `${list.length} addresses`} that ${list.length === 1 ? 'is' : 'are'} not one of your servers`
    })
  }

  return flags
}

export function worstLevel(flags: AuditFlag[]): AuditLevel | null {
  if (flags.some((f) => f.level === 'red')) return 'red'
  if (flags.some((f) => f.level === 'amber')) return 'amber'
  if (flags.length) return 'info'
  return null
}
