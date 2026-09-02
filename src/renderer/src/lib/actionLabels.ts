/**
 * Human-readable names for BinaryLane action types.
 *
 * The API's action `type` is a snake_case identifier (`power_cycle`,
 * `enable_rescue_mode`). That is fine in a confirm dialog the user has just
 * opened deliberately, but a toast reporting an outcome minutes later is prose,
 * and "power_cycle" is not.
 *
 * Title-casing the identifier handles almost every type correctly, so the map
 * below covers only the words that rule gets wrong — acronyms.
 */
const ACRONYMS: Record<string, string> = {
  ipv4: 'IPv4',
  ipv6: 'IPv6',
  vpc: 'VPC',
  ssh: 'SSH',
  dns: 'DNS',
  ip: 'IP',
  os: 'OS',
  id: 'ID',
  cpu: 'CPU',
  url: 'URL'
}

export function describeActionType(type: string): string {
  if (!type) return 'Server action'
  return type
    .split('_')
    .map((word) => ACRONYMS[word.toLowerCase()] ?? word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/** One honest sentence per power action, for the confirm dialog. */
export function powerActionSummary(type: string): string {
  switch (type) {
    case 'reboot':
      return 'Asks the OS to restart cleanly (ACPI). The server is back within a minute or two if the OS cooperates.'
    case 'shutdown':
      return 'Sends an ACPI shutdown signal. The OS decides whether to honour it — BinaryLane reports the signal delivered, not the server off.'
    case 'power_off':
      return 'Cuts power at the hypervisor. Equivalent to pulling the plug: anything unsaved in the guest is lost.'
    case 'power_cycle':
      return 'Cuts power at the hypervisor and starts the server again. Equivalent to pulling the plug and reconnecting it.'
    case 'power_on':
      return 'Starts the server.'
    default:
      return `Submits "${describeActionType(type)}" to BinaryLane.`
  }
}
