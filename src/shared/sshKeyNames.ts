/**
 * Names for generated SSH key pairs (#100). The name is both the file in ~/.ssh
 * and the key's name on the account, so it has to be a safe filename everywhere.
 */

/** Same on every platform's filesystem, and a sane account key name. */
const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/

/** Files OpenSSH itself reads from ~/.ssh; a key by these names would break SSH. */
const RESERVED = new Set(['config', 'known_hosts', 'known_hosts.old', 'authorized_keys', 'authorized_keys2', 'environment', 'rc'])

/** Why a requested name cannot be used, or null. An empty name is fine: one is generated. */
export function validateKeyName(name: string): string | null {
  if (!name) return null
  if (!NAME_PATTERN.test(name)) return 'Use letters, numbers, dots, dashes and underscores only, starting with a letter or number.'
  if (name.endsWith('.pub') || RESERVED.has(name.toLowerCase())) return `"${name}" is a file OpenSSH uses. Choose another name.`
  return null
}
