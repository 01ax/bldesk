// What the magnifier beside a rule's source, destination and ports offers: ready-made values to fill the field with. It imports only
// other plain lib files, so Node runs it directly (scripts/test-firewall-picks.mjs). Nothing here talks to BinaryLane.

import type { components } from '@shared/api/schema'
import { publicAddressesOf } from './firewallMatrix.ts'
import { joinList, splitList } from './firewallDraft.ts'
import { ANY_ADDRESS, isIpv4OrRange } from './firewallRules.ts'

type Server = components['schemas']['Server']
/** What is read of a server: its name, to label it, and its networks, for its addresses. */
export type PickServer = Pick<Server, 'id' | 'name' | 'networks' | 'failover_ips'>

/** One entry of a magnifier's menu: what it says, and the values it adds to the field (one to a line). */
export interface PickChoice {
  id: string
  label: string
  values: string[]
}

const unique = (values: string[]) => [...new Set(values)]

/**
 * A choice from a magnifier's menu put into the cell `current`, one value to a line. As in mPanel, the choice is added after what the cell
 * already holds, and a value the cell already has is not added again. The exception is an address cell that holds only the any-address
 * (what a new rule starts with): adding to it would leave the rule matching every address, so the choice replaces it. `addresses` is false
 * for the ports, where there is no such value.
 */
export function withChoice(current: string, values: readonly string[], addresses: boolean): string {
  const held = splitList(current)
  const base = addresses && held.length === 1 && held[0] === ANY_ADDRESS ? [] : held
  return joinList([...base, ...values.filter((v) => !base.includes(v))])
}

/** The private IPv4 addresses a server has: its private network and, in a VPC, its address there. `undefined` when its networks were not read. */
export function privateAddressesOf(server: Pick<Server, 'networks'>): string[] | undefined {
  const v4 = server.networks?.v4
  if (!v4) return undefined
  return unique(v4.filter((n) => n.type === 'private' && isIpv4OrRange(n.ip_address)).map((n) => n.ip_address))
}

/** Every IPv4 address a server has, public ones first: what "Server All Addresses" puts in. None when it has none or its networks were not read. */
export function ownAddressesOf(server: PickServer | undefined): string[] {
  return server ? unique([...(publicAddressesOf(server) ?? []), ...(privateAddressesOf(server) ?? [])]) : []
}

/**
 * The choices for a source or destination on `server`'s firewall, in the order mPanel lists them: any address, then every other server on the
 * account (all their addresses, the public ones, the private ones), then each address of each other server on its own, then this server's own
 * addresses. The other servers are in plain character order by name, as mPanel has them (capitals before lower case), and a server's public
 * addresses come before its private ones. A choice with no address behind it is left out, such as the server's public addresses when it is
 * only in a VPC. mPanel also offers the address the person is on, "(Current IP)", straight after any address: that one is not here, because
 * neither the API nor the app knows it.
 */
export function addressChoicesFor(server: PickServer | undefined, servers: readonly PickServer[]): PickChoice[] {
  const choices: PickChoice[] = []
  const add = (id: string, label: string, values: string[]) => {
    if (values.length > 0) choices.push({ id, label, values })
  }

  const others = servers.filter((s) => s.id !== server?.id).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.id - b.id))
  const eachPublic = others.map((s) => publicAddressesOf(s) ?? [])
  const eachPrivate = others.map((s) => privateAddressesOf(s) ?? [])

  add('any', 'Any address', [ANY_ADDRESS])
  add('others-all', 'My Other Addresses', unique(others.flatMap((_, i) => [...eachPublic[i], ...eachPrivate[i]])))
  add('others-public', 'My Other Public Addresses', unique(eachPublic.flat()))
  add('others-private', 'My Other Private Addresses', unique(eachPrivate.flat()))
  others.forEach((s, i) => {
    for (const address of unique([...eachPublic[i], ...eachPrivate[i]])) add(`server-${s.id}-${address}`, `Server: ${s.name} (${address})`, [address])
  })

  const own = server ? { public: publicAddressesOf(server) ?? [], private: privateAddressesOf(server) ?? [] } : { public: [], private: [] }
  add('this-public', 'Server Public Addresses', own.public)
  add('this-private', 'Server Private Addresses', own.private)
  add('this-all', 'Server All Addresses', ownAddressesOf(server))
  for (const a of ownAddressesOf(server)) add(`this-${a}`, `Server Address: ${a}`, [a])
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
