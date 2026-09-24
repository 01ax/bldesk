import { spawn } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { GenerateSshKeyPairResult } from '../shared/ipc-types'
import { validateKeyName } from '../shared/sshKeyNames'

/**
 * Generate an Ed25519 key pair in ~/.ssh with the system's ssh-keygen (#100).
 *
 * The private key is written by ssh-keygen with its own permissions and is never
 * opened here: only the `.pub` is read back, so "BLDesk never reads private key
 * contents" stays true.
 *
 * Nothing is ever overwritten. A name that exists on disk (private or `.pub`) or
 * in `takenNames` (the account's key names, which BinaryLane requires to be
 * unique) moves on to a dated name, then a numbered one. As a last line of
 * defence ssh-keygen gets no stdin, so a file that appears between the check and
 * the call makes its "Overwrite (y/n)?" prompt read end-of-file and give up.
 */

function stamp(now: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}`
}

/** The name the pair will get: the first of name, name-<stamp>, name-<stamp>-2 ... that is free. */
export function resolveKeyName(sshDir: string, requested: string, takenNames: string[], now = new Date()): string {
  const taken = new Set(takenNames)
  const free = (n: string) => !taken.has(n) && !existsSync(join(sshDir, n)) && !existsSync(join(sshDir, `${n}.pub`))
  const base = requested || `bldesk-${stamp(now)}`
  if (free(base)) return base
  const dated = requested ? `${base}-${stamp(now)}` : base
  if (dated !== base && free(dated)) return dated
  for (let i = 2; i < 1000; i++) if (free(`${dated}-${i}`)) return `${dated}-${i}`
  throw new Error('No free key name was found.')
}

function ensureSshDir(sshDir: string): void {
  if (existsSync(sshDir)) return
  mkdirSync(sshDir, { recursive: true, mode: 0o700 })
  // mkdir's mode is filtered by the umask; OpenSSH wants exactly 0700. Windows
  // has no mode bits: the folder inherits the user profile's ACL (the user,
  // SYSTEM and Administrators), which OpenSSH for Windows accepts, and
  // ssh-keygen sets the private key's own ACL.
  if (process.platform !== 'win32') chmodSync(sshDir, 0o700)
}

function runKeygen(keygen: string, privateKeyPath: string, comment: string): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(keygen, ['-q', '-t', 'ed25519', '-N', '', '-C', comment, '-f', privateKeyPath], {
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe']
    })
    let stderr = ''
    child.stderr?.on('data', (d) => { stderr += String(d) })
    const timer = setTimeout(() => child.kill(), 30_000)
    child.on('error', (err) => { clearTimeout(timer); resolve({ code: null, stderr: err.message }) })
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, stderr: stderr.trim() }) })
  })
}

export async function generateKeyPair(
  sshDir: string,
  request: { name: string; takenNames: string[] },
  keygen: string | null
): Promise<GenerateSshKeyPairResult> {
  const requested = request.name.trim()
  const invalid = validateKeyName(requested)
  if (invalid) return { ok: false, code: 'invalid-name', message: invalid }
  if (!keygen) {
    return { ok: false, code: 'no-ssh-keygen', message: 'ssh-keygen was not found. Install the OpenSSH client, then try again.' }
  }
  try {
    ensureSshDir(sshDir)
  } catch (err) {
    return { ok: false, code: 'failed', message: `Could not create ${sshDir}: ${(err as Error).message}` }
  }
  const name = resolveKeyName(sshDir, requested, request.takenNames)
  const privateKeyPath = join(sshDir, name)
  const run = await runKeygen(keygen, privateKeyPath, name)
  const publicPath = `${privateKeyPath}.pub`
  if (run.code !== 0 || !existsSync(privateKeyPath) || !existsSync(publicPath)) {
    return { ok: false, code: 'failed', message: run.stderr || `ssh-keygen exited with code ${run.code}.` }
  }
  return { ok: true, name, publicKey: readFileSync(publicPath, 'utf8').trim(), privateKeyPath }
}
