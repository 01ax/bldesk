import { join } from 'path'

/**
 * The parts of installing a Linux package update that need no Electron: what the privileged helper reports, the checks on
 * what it is given, and the words for each outcome. updater.ts starts the session and reads its output; the scripts
 * themselves are linux/update/install-update.sh (root, through pkexec) and linux/update/update-session.sh (the user's).
 */

/**
 * The two scripts, which the package puts next to each other in the app's resources folder. For the .deb that is
 * /opt/BLDesk/resources/linux/, the path the polkit action in linux/com.termau.bldesk.policy names: from anywhere else the
 * helper still runs, but the password prompt is pkexec's generic one.
 */
export function updateScriptPaths(resourcesPath: string): { helper: string; session: string } {
  return { helper: join(resourcesPath, 'linux', 'install-update.sh'), session: join(resourcesPath, 'linux', 'update-session.sh') }
}

/** The largest package install-update.sh accepts, in bytes. BLDesk's is about 100 MB. */
export const MAX_PACKAGE_BYTES = 500 * 1024 * 1024

export const CANCELLED_MESSAGE =
  'The update was not installed: the password prompt was closed, or the password was not accepted. Choose Restart to try again.'

export type SessionOutcome = { outcome: 'installed' } | { outcome: 'cancelled' } | { outcome: 'failed'; why: string }

export interface SessionProgress {
  /** The password was accepted and the package checked out, so BLDesk may close. */
  authorised: boolean
  /** The session's last word, or null while it is still running. */
  result: SessionOutcome | null
}

/**
 * Reads the session's output file. Only whole lines count: the file is read while it is being written, and a line cut
 * short must not be taken for a shorter message.
 */
export function parseSessionOutput(text: string): SessionProgress {
  const lines = text.split('\n')
  lines.pop() // after the last newline: empty, or an unfinished line
  let authorised = false
  let result: SessionOutcome | null = null
  for (const line of lines) {
    if (line === 'AUTHORIZED') authorised = true
    else if (line === 'RESULT installed') result = { outcome: 'installed' }
    else if (line === 'RESULT cancelled') result = { outcome: 'cancelled' }
    else if (line.startsWith('RESULT failed')) result = { outcome: 'failed', why: line.slice('RESULT failed'.length).trim() }
  }
  return { authorised, result }
}

/** The message for an unsuccessful session, or null when it installed (or has not finished). */
export function describeFailure(result: SessionOutcome | null): string | null {
  if (!result || result.outcome === 'installed') return null
  if (result.outcome === 'cancelled') return CANCELLED_MESSAGE
  return `The update was not installed: ${result.why || 'the installer failed'}. Choose Restart to try again.`
}

/**
 * The SHA-512 (base64) the release's feed lists for the downloaded file. electron-updater names the file after the
 * entry's URL, decoded, so that is what the two are matched on. It can also hand back a file it already holds under
 * another name, when its checksum is the one listed for this release; then the checksum is the release's only .deb entry's,
 * and with more than one (one per architecture) there is no telling which, so none is returned.
 */
export function listedChecksum(
  files: ReadonlyArray<{ url: string; sha512?: string }> | undefined,
  downloadedFile: string | undefined
): string | undefined {
  const name = downloadedFile?.split('/').pop()
  if (!name) return undefined
  const debs: Array<{ sha512?: string }> = []
  for (const file of files ?? []) {
    let path = file.url
    try {
      path = decodeURIComponent(new URL(file.url, 'https://feed.invalid/').pathname)
    } catch {
      /* a URL that does not parse is compared as written */
    }
    if (path.split('/').pop() === name) return file.sha512
    if (/\.deb$/i.test(path)) debs.push(file)
  }
  return debs.length === 1 && /\.deb$/i.test(name) ? debs[0].sha512 : undefined
}

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/

/** Why this package and checksum could not be handed to the installer, or null when they can. */
export function installInputProblem(packagePath: string | undefined, sha512: string | undefined): string | null {
  if (!packagePath) return "BLDesk doesn't know where the downloaded update is."
  if (!packagePath.startsWith('/') || packagePath.includes('\n')) return 'The downloaded update has an unusable file name.'
  if (!sha512 || !BASE64.test(sha512)) return "The release doesn't list a checksum for the update, so it can't be checked before it is installed."
  return null
}

/** The arguments update-session.sh takes; see the top of that script. */
export function sessionArguments(opts: {
  logPath: string
  outPath: string
  appPid: number
  packagePath: string
  sha512: string
  /** The command to run once BLDesk has closed, or null to leave it closed. */
  relaunch: string[] | null
}): string[] {
  const { relaunch } = opts
  return [
    opts.logPath,
    opts.outPath,
    String(opts.appPid),
    opts.packagePath,
    opts.sha512,
    relaunch ? '1' : '0',
    ...(relaunch ?? [])
  ]
}

/** What to tell the user about a session that finished while BLDesk was closed, once it starts again. */
export function leftoverNotice(text: string): string | null {
  return describeFailure(parseSessionOutput(text).result)
}
