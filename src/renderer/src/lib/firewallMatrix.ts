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

export interface FwRule {
  source_addresses: string[]
  destination_addresses: string[]
  destination_ports?: string[] | null
  protocol: string
  action: string
  description?: string | null
}

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

const WORLD = new Set(['0.0.0.0/0', '::/0', '0.0.0.0', '::', '*', 'any'])

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

function catchesAll(r: FwRule): boolean {
  const proto = (r.protocol || 'all').toLowerCase()
  return proto === 'all' && (!r.destination_ports || r.destination_ports.length === 0) && isWorld(r.source_addresses)
}

/**
 * Flags for one server's rule list. `accountAddresses` are every public IPv4
 * the account owns, so a /32 source that matches none of them is called out
 * as "not one of your servers" — it may well be an office address, hence
 * info rather than a warning.
 */
export function auditServer(rules: FwRule[] | null, accountAddresses: Set<string>): AuditFlag[] {
  const flags: AuditFlag[] = []
  if (!rules) return [{ code: 'unreadable', level: 'amber', text: 'Rules could not be read' }]
  if (rules.length === 0) {
    return [{ code: 'no-rules', level: 'amber', text: 'No firewall rules — everything inbound is allowed' }]
  }

  const worldAccepts = rules.filter((r) => (r.action || '').toLowerCase() !== 'drop' && isWorld(r.source_addresses))
  const tcpish = (r: FwRule) => ['tcp', 'all'].includes((r.protocol || 'all').toLowerCase())

  for (const [port, name] of ADMIN_PORTS) {
    if (worldAccepts.some((r) => tcpish(r) && portsInclude(r.destination_ports, port))) {
      flags.push({ code: port === 22 ? 'ssh-world' : 'admin-world', level: 'red', text: `${name} (${port}) open to the world` })
    }
  }
  for (const [port, name] of DB_PORTS) {
    if (worldAccepts.some((r) => tcpish(r) && portsInclude(r.destination_ports, port))) {
      flags.push({ code: 'db-world', level: 'amber', text: `${name} (${port}) open to the world` })
    }
  }

  // First-match: anything after a catch-all drop never runs.
  const catchAllIdx = rules.findIndex((r) => (r.action || '').toLowerCase() === 'drop' && catchesAll(r))
  if (catchAllIdx >= 0 && catchAllIdx < rules.length - 1) {
    const shadowed = rules.length - 1 - catchAllIdx
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
