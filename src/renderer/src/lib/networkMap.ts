import type { AuditLevel, FwRule } from './firewallMatrix'
import { isWorld, portsInclude } from './firewallMatrix'

/**
 * Network map (FEATURES.md #10): a deterministic, schematic layout of the
 * account — not a force-directed graph. Traffic reads left to right:
 *
 *   internet rail → load balancers → servers, grouped by region and VPC
 *
 * Layout is pure and stable, so the same fleet always draws the same picture
 * (screenshots stay comparable, and nothing jiggles on refresh). Every number
 * here is in "world" pixels; the view applies pan/zoom on top.
 */

export interface MapServer {
  id: number
  name: string
  status: string
  power: 'on' | 'off' | 'unknown'
  region: string
  regionSlug: string
  vpcId: number | null
  publicIp?: string
  privateIp?: string
  /** Ports the world can reach, as a short label: "22 80 443", "all", "none". */
  exposure: string
  exposureLevel: AuditLevel | null
  flags: string[]
}

export interface MapLb {
  id: number
  name: string
  ip: string
  status: string
  protocols: string[]
  serverIds: number[]
  region: string
}

export interface MapVpc {
  id: number
  name: string
  cidr: string
}

export type NodeKind = 'server' | 'lb' | 'internet'

export interface LayoutNode {
  id: string
  kind: NodeKind
  x: number
  y: number
  w: number
  h: number
  server?: MapServer
  lb?: MapLb
}

export interface LayoutGroup {
  id: string
  kind: 'region' | 'vpc' | 'novpc'
  label: string
  sub?: string
  x: number
  y: number
  w: number
  h: number
  vpcId?: number | null
}

export interface LayoutEdge {
  id: string
  from: string
  to: string
  kind: 'lb' | 'public'
  label?: string
  level?: AuditLevel | null
  /** Drawn only when its node is selected or "show public edges" is on. */
  onDemand: boolean
  path: string
  /** Label anchor. */
  lx: number
  ly: number
}

export interface Layout {
  nodes: LayoutNode[]
  groups: LayoutGroup[]
  edges: LayoutEdge[]
  width: number
  height: number
  nodeById: Map<string, LayoutNode>
}

// Geometry — tuned for 12px/11px text at zoom 1.
export const NODE_W = 196
export const NODE_H = 46
const NODE_GAP = 10
const ROWS_PER_COLUMN = 6
const VPC_PAD = 16
const VPC_HEADER = 28
const VPC_GAP = 24
const REGION_HEADER = 30
const REGION_GAP = 36
const RAIL_X = 32
const RAIL_W = 44
const LB_X = 132
export const LB_W = 176
export const LB_H = 54
const VPC_X_WITH_LB = 372
const MARGIN = 32

export const serverNodeId = (id: number) => `s${id}`
export const lbNodeId = (id: number) => `lb${id}`
export const INTERNET_ID = 'internet'

/** "22 80 443" / "all" / "none" from a server's rule list; null rules = unreadable. */
export function exposureLabel(rules: FwRule[] | null): string {
  if (rules === null) return '?'
  if (rules.length === 0) return 'all'
  const worldAccepts = rules.filter((r) => (r.action || '').toLowerCase() !== 'drop' && isWorld(r.source_addresses))
  if (worldAccepts.length === 0) return 'none'
  if (worldAccepts.some((r) => !r.destination_ports || r.destination_ports.length === 0 || r.destination_ports.some((p) => p === '*' || p.toLowerCase() === 'all'))) {
    return 'all'
  }
  const ports = new Set<string>()
  for (const r of worldAccepts) for (const p of r.destination_ports ?? []) ports.add(p.trim())
  const list = [...ports].sort((a, b) => Number(a.split('-')[0]) - Number(b.split('-')[0]))
  const shown = list.slice(0, 4).join(' ')
  return list.length > 4 ? `${shown} +${list.length - 4}` : shown
}

/** Does the world reach `port` on this server? */
export function exposes(rules: FwRule[] | null, port: number): boolean {
  if (rules === null) return false
  if (rules.length === 0) return true
  return rules.some(
    (r) =>
      (r.action || '').toLowerCase() !== 'drop' &&
      isWorld(r.source_addresses) &&
      ['tcp', 'all'].includes((r.protocol || 'all').toLowerCase()) &&
      portsInclude(r.destination_ports, port)
  )
}

function bezier(x1: number, y1: number, x2: number, y2: number): string {
  const dx = Math.max(40, (x2 - x1) * 0.5)
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`
}

export function layoutTopology(servers: MapServer[], vpcs: MapVpc[], lbs: MapLb[]): Layout {
  // No load balancers → no column for them; the VPC boxes move left.
  const VPC_X = lbs.length > 0 ? VPC_X_WITH_LB : LB_X
  const nodes: LayoutNode[] = []
  const groups: LayoutGroup[] = []
  const edges: LayoutEdge[] = []
  const nodeById = new Map<string, LayoutNode>()
  const vpcById = new Map(vpcs.map((v) => [v.id, v]))

  // --- Group: region → vpc (null last) → servers, all in stable name order.
  const byRegion = new Map<string, MapServer[]>()
  for (const s of [...servers].sort((a, b) => a.name.localeCompare(b.name))) {
    const list = byRegion.get(s.region) ?? []
    list.push(s)
    byRegion.set(s.region, list)
  }
  const regions = [...byRegion.keys()].sort()

  let y = MARGIN
  let maxRight = VPC_X
  for (const region of regions) {
    const regionServers = byRegion.get(region)!
    const byVpc = new Map<number | null, MapServer[]>()
    for (const s of regionServers) {
      const list = byVpc.get(s.vpcId) ?? []
      list.push(s)
      byVpc.set(s.vpcId, list)
    }
    const vpcKeys = [...byVpc.keys()].sort((a, b) => {
      if (a === null) return 1
      if (b === null) return -1
      return (vpcById.get(a)?.name ?? '').localeCompare(vpcById.get(b)?.name ?? '')
    })

    const regionTop = y
    y += REGION_HEADER
    let x = VPC_X
    let rowBottom = y

    for (const key of vpcKeys) {
      const members = byVpc.get(key)!
      const cols = Math.ceil(members.length / ROWS_PER_COLUMN)
      const rows = Math.min(members.length, ROWS_PER_COLUMN)
      const boxW = VPC_PAD * 2 + cols * NODE_W + (cols - 1) * NODE_GAP
      const boxH = VPC_HEADER + VPC_PAD + rows * NODE_H + (rows - 1) * NODE_GAP + VPC_PAD
      const vpc = key === null ? null : vpcById.get(key)
      groups.push({
        id: key === null ? `novpc-${region}` : `vpc-${key}`,
        kind: key === null ? 'novpc' : 'vpc',
        label: key === null ? 'No VPC' : (vpc?.name ?? `VPC #${key}`),
        sub: key === null ? 'public network only' : (vpc?.cidr ?? undefined),
        x,
        y,
        w: boxW,
        h: boxH,
        vpcId: key
      })
      members.forEach((s, i) => {
        const col = Math.floor(i / ROWS_PER_COLUMN)
        const row = i % ROWS_PER_COLUMN
        const node: LayoutNode = {
          id: serverNodeId(s.id),
          kind: 'server',
          x: x + VPC_PAD + col * (NODE_W + NODE_GAP),
          y: y + VPC_HEADER + VPC_PAD + row * (NODE_H + NODE_GAP),
          w: NODE_W,
          h: NODE_H,
          server: s
        }
        nodes.push(node)
        nodeById.set(node.id, node)
      })
      x += boxW + VPC_GAP
      rowBottom = Math.max(rowBottom, y + boxH)
    }
    maxRight = Math.max(maxRight, x - VPC_GAP)
    groups.push({ id: `region-${region}`, kind: 'region', label: region, x: VPC_X - 12, y: regionTop, w: 0, h: rowBottom - regionTop })
    y = rowBottom + REGION_GAP
  }

  const height = Math.max(y - REGION_GAP + MARGIN, 320)

  // --- Load balancers: at the mean y of their members, pushed apart to avoid overlap.
  const placed: LayoutNode[] = []
  for (const lb of [...lbs].sort((a, b) => a.name.localeCompare(b.name))) {
    const ys = lb.serverIds.map((id) => nodeById.get(serverNodeId(id))).filter(Boolean).map((n) => n!.y + n!.h / 2)
    let cy = ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : MARGIN + REGION_HEADER + LB_H / 2
    const node: LayoutNode = { id: lbNodeId(lb.id), kind: 'lb', x: LB_X, y: cy - LB_H / 2, w: LB_W, h: LB_H, lb }
    placed.push(node)
  }
  placed.sort((a, b) => a.y - b.y)
  for (let i = 1; i < placed.length; i++) {
    const prev = placed[i - 1]
    if (placed[i].y < prev.y + prev.h + NODE_GAP) placed[i].y = prev.y + prev.h + NODE_GAP
  }
  for (const n of placed) {
    nodes.push(n)
    nodeById.set(n.id, n)
  }

  // --- Internet rail
  const rail: LayoutNode = { id: INTERNET_ID, kind: 'internet', x: RAIL_X, y: MARGIN, w: RAIL_W, h: height - MARGIN * 2 }
  nodes.push(rail)
  nodeById.set(rail.id, rail)

  // --- Edges
  for (const n of placed) {
    const lb = n.lb!
    edges.push({
      id: `e-${INTERNET_ID}-${n.id}`,
      from: INTERNET_ID,
      to: n.id,
      kind: 'public',
      label: lb.protocols.join(' ') || undefined,
      level: null,
      onDemand: false,
      path: bezier(rail.x + rail.w, n.y + n.h / 2, n.x, n.y + n.h / 2),
      lx: (rail.x + rail.w + n.x) / 2,
      ly: n.y + n.h / 2 - 6
    })
    for (const sid of lb.serverIds) {
      const t = nodeById.get(serverNodeId(sid))
      if (!t) continue
      edges.push({
        id: `e-${n.id}-${t.id}`,
        from: n.id,
        to: t.id,
        kind: 'lb',
        onDemand: false,
        path: bezier(n.x + n.w, n.y + n.h / 2, t.x, t.y + t.h / 2),
        lx: (n.x + n.w + t.x) / 2,
        ly: (n.y + n.h / 2 + t.y + t.h / 2) / 2
      })
    }
  }
  for (const n of nodes) {
    if (n.kind !== 'server' || !n.server?.publicIp) continue
    edges.push({
      id: `e-${INTERNET_ID}-${n.id}`,
      from: INTERNET_ID,
      to: n.id,
      kind: 'public',
      label: n.server.exposure,
      level: n.server.exposureLevel,
      onDemand: true,
      path: bezier(rail.x + rail.w, n.y + n.h / 2, n.x, n.y + n.h / 2),
      lx: (rail.x + rail.w + n.x) / 2,
      ly: n.y + n.h / 2 - 6
    })
  }

  return { nodes, groups, edges, width: maxRight + MARGIN, height, nodeById }
}

/** Fit a world of `w`×`h` into a viewport, centred, with padding. */
export function fitTransform(w: number, h: number, vw: number, vh: number, pad = 24): { x: number; y: number; k: number } {
  const k = Math.min((vw - pad * 2) / Math.max(w, 1), (vh - pad * 2) / Math.max(h, 1), 1.6)
  return { k, x: (vw - w * k) / 2, y: (vh - h * k) / 2 }
}
