import type { components } from '@shared/api/schema'
import { resolveConnection, availableSshKeys } from './sshKeyAssociations'
import { openSsh } from './openSsh'

/** Resolve server preferences before handing final options to the launcher. */
export async function openServerSsh(server: components['schemas']['Server'], profileId?: string, native = false) {
  const account = profileId ?? (await window.bldeskApi.getActiveProfile())?.id
  const keys = await availableSshKeys(account)
  return openSsh({ ...resolveConnection(account, server, keys), profileId: account, serverId: server.id, serverName: server.name }, native)
}
