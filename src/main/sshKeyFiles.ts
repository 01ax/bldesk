import { statSync } from 'fs'
import { basename, isAbsolute } from 'path'
import type { LocalSshKey } from '../shared/ipc-types'

/** Metadata only: never open or read a selected private-key file. */
export function existingKeyFiles(paths: unknown): LocalSshKey[] {
  if (!Array.isArray(paths) || paths.length > 10000 || paths.some((p) => typeof p !== 'string' || p.length > 32768 || !isAbsolute(p) || /[\x00-\x1f\x7f]/.test(p))) {
    throw new Error('Invalid SSH key paths.')
  }
  return [...new Set(paths as string[])].flatMap((privateKeyPath) => {
    try {
      return statSync(privateKeyPath).isFile() ? [{ name: basename(privateKeyPath), privateKeyPath, publicKey: '' }] : []
    } catch { return [] }
  })
}
