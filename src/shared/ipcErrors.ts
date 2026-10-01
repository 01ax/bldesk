// No imports, so it can be tested on its own (scripts/test-api-errors.mjs).

/**
 * Electron prefixes the message of an error thrown by a main-process handler with
 * "Error invoking remote method '<channel>': Error: ". Customers don't need the channel name or the wrapper.
 */
export function cleanIpcError(message: string): string {
  return message.replace(/^Error invoking remote method '[^']*':\s*(?:[A-Za-z]*Error:\s*)?/, '') || message
}
