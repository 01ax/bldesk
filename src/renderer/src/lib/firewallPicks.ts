// What the magnifier beside a rule's source, destination and ports offers: ready-made values to fill the field with. It imports only
// other plain lib files, so Node runs it directly (scripts/test-firewall-picks.mjs). Nothing here talks to BinaryLane.

import type { components } from '@shared/api/schema'
import { publicAddressesOf } from './firewallMatrix.ts'
import { ANY_ADDRESS, isIpv4OrRange } from './firewallRules.ts'

type Server = components['schemas']['Server']
/** What is read of a server: its name, to label it, and its networks, for its addresses. */
export type PickServer = Pick<Server, 'id' | 'name' | 'networks' | 'failover_ips'>

/** One entry of a magnifier's menu: what it says, and the values it puts in the field (one to a line). */
export interface PickChoice {
  id: string
  label: string
  values: string[]
}

const unique = (values: string[]) => [...new Set(values)]

/** The private IPv4 addresses a server has: its private network and, in a VPC, its address there. `undefined` when its networks were not read. */
export function privateAddressesOf(server: Pick<Server, 'networks'>): string[] | undefined {
  const v4 = server.networks?.v4
  if (!v4) return undefined
  return unique(v4.filter((n) => n.type === 'private' && isIpv4OrRange(n.ip_address)).map((n) => n.ip_address))
}

/**
 * The choices for a source or destination on `server`'s firewall: other servers on the account first (each, then all their addresses
 * together, public ones, private ones), then this server's own addresses, then any address. A choice with no address behind it is left out,
 * such as the server's public addresses when it is only in a VPC.
 */
export function addressChoicesFor(server: PickServer | undefined, servers: readonly PickServer[]): PickChoice[] {
  const choices: PickChoice[] = []
  const add = (id: string, label: string, values: string[]) => {
    if (values.length > 0) choices.push({ id, label, values })
  }

  const others = servers.filter((s) => s.id !== server?.id)
  const eachPublic = others.map((s) => publicAddressesOf(s) ?? [])
  const eachPrivate = others.map((s) => privateAddressesOf(s) ?? [])
  add('others-all', 'My Other Addresses', unique(others.flatMap((_, i) => [...eachPublic[i], ...eachPrivate[i]])))
  add('others-public', 'My Other Public Addresses', unique(eachPublic.flat()))
  add('others-private', 'My Other Private Addresses', unique(eachPrivate.flat()))
  // A server is named with the address another server on its private network would use, and with its public one when it has none.
  others.forEach((s, i) => {
    const address = eachPrivate[i][0] ?? eachPublic[i][0]
    if (address) add(`server-${s.id}`, `Server: ${s.name} (${address})`, [address])
  })

  const own = server ? { public: publicAddressesOf(server) ?? [], private: privateAddressesOf(server) ?? [] } : { public: [], private: [] }
  add('this-public', 'Server Public Addresses', own.public)
  add('this-private', 'Server Private Addresses', own.private)
  add('this-all', 'Server All Addresses', unique([...own.public, ...own.private]))
  for (const a of unique([...own.public, ...own.private])) add(`this-${a}`, `Server Address: ${a}`, [a])

  add('any', 'Any address', [ANY_ADDRESS])
  return choices
}

/**
 * The choices for a rule's destination ports. A range is written `start:end`, both ends included, as BinaryLane writes it; the three
 * ranges are the IANA ones for system, user and dynamic ports.
 */
export const PORT_CHOICES: readonly PickChoice[] = [
  { id: 'http-https', label: '80,443 (HTTP+HTTPS)', values: ['80', '443'] },
  { id: 'http', label: '80 (HTTP)', values: ['80'] },
  { id: 'https', label: '443 (HTTPS)', values: ['443'] },
  { id: 'ssh', label: '22 (SSH)', values: ['22'] },
  { id: 'smtp', label: '25 (SMTP)', values: ['25'] },
  { id: 'rdp', label: '3389 (Remote Desktop)', values: ['3389'] },
  { id: 'system', label: 'System ports', values: ['0:1023'] },
  { id: 'user', label: 'User ports', values: ['1024:49151'] },
  { id: 'dynamic', label: 'Dynamic ports', values: ['49152:65535'] }
]
