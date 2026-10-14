/**
 * What the Add a Cloud Server form does with its hostname field. Pure functions, so the form and the tests share them.
 *
 * What the reference says (openapi.json, CreateServerRequest): `name` is optional, and "If not provided, the server will be
 * created with a random name." So a blank field is sent as no `name` at all, not as an empty string.
 */

/** What the History entry calls a server that has no hostname yet. */
export const BLANK_HOSTNAME_TARGET = 'New server'

export interface HostnameFields {
  /** The hostname without the spaces around it; empty when the field was blank or held only spaces. */
  name: string
  blank: boolean
  /** The part of the create request that names the server: `{ name }`, or nothing at all for a blank hostname. */
  request: { name?: string }
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
