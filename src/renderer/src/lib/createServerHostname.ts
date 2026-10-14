/**
 * What the Add a Cloud Server form does with its hostname field. Pure functions, so the form and the tests share them.
 *
 * What the reference says (openapi.json, CreateServerRequest): `name` is optional, and "If not provided, the server will be
 * created with a random name." So a blank field is sent as no `name` at all, not as an empty string.
 */

import type { components } from '@shared/api/schema'
import type { ChangeTarget } from './changelog'

/** What the History entry calls a server that has no hostname yet. */
export const BLANK_HOSTNAME_TARGET = 'New server'

/** The part of the reference's CreateServerRequest that names the server, so a wrong field name is a compile error. */
export type CreateRequestName = Pick<components['schemas']['CreateServerRequest'], 'name'>

/** The server BinaryLane returned for a create, as far as the form relies on it: the response can be missing, or lack either field. */
export interface CreatedServer {
  id?: number
  name?: string
}

export interface HostnameFields {
  /** The hostname without the spaces around it; empty when the field was blank or held only spaces. */
  name: string
  blank: boolean
  /** The part of the create request that names the server: `{ name }`, or nothing at all for a blank hostname. */
  request: CreateRequestName
  /** The server's name in the History entry. */
  historyTarget: string
  /** The row that tells the History entry's reader the hostname was left blank; none when one was typed. */
  changes: { label: string; to: string }[]
}

export function hostnameFields(raw: string): HostnameFields {
  const name = raw.trim()
  return {
    name,
    blank: !name,
    request: name ? { name } : {},
    historyTarget: name || BLANK_HOSTNAME_TARGET,
    changes: name ? [] : [{ label: 'Hostname', to: 'left blank, so BinaryLane names the server' }]
  }
}

/**
 * The cloud-init the create request carries, or undefined when it carries none: the image takes it, the box is ticked and
 * it holds something. The request and the note about a blank hostname both use this, so the note shows exactly when the
 * cloud-init is going to be sent.
 */
export function cloudInitToSend(imageAccepts: boolean, enabled: boolean, text: string): string | undefined {
  return imageAccepts && enabled && text.trim() ? text : undefined
}

/** The History entry's detail once BinaryLane has accepted the create. The name in brackets is only added when the hostname was blank. */
export function createdDetail(host: HostnameFields, created: CreatedServer | undefined): string {
  if (!created?.id) return 'BinaryLane accepted the request.'
  const named = host.blank && created.name ? ` (${created.name})` : ''
  return `BinaryLane accepted the request; server #${created.id}${named} is being built.`
}

/**
 * The History entry's target once the server exists, for a blank hostname: the server itself, by the name and id BinaryLane
 * gave it. Undefined means leave the target as recorded: a typed hostname is already right, and with no server id in the
 * response there is nothing better than the placeholder.
 */
export function createdTarget(host: HostnameFields, created: CreatedServer | undefined): ChangeTarget | undefined {
  if (!host.blank || !created?.id) return undefined
  return { kind: 'server', id: created.id, name: created.name || `#${created.id}` }
}

/** The name the form hands to `onCreated`: the typed hostname, else the name BinaryLane gave, else the id, and never an empty string. */
export function createdName(host: HostnameFields, created: CreatedServer | undefined): string {
  return host.name || created?.name || (created?.id ? `#${created.id}` : BLANK_HOSTNAME_TARGET)
}
