/**
 * The decisions behind a Linux package update, without Electron: what Restart, the last look at the feed, the install
 * session, a quit and the update library's events each do to the updater's state.
 *
 * updater.ts gathers the facts (the library's events, the session's output file, timers), calls transition(), applies
 * the new state and carries out the effects it returns. Time comes in only as events ('close-timer', a 'recheck-done'
 * that was really a timeout), so a test moves it by sending them. Nothing here reads a file or starts a process.
 *
 * Only Linux packages use this: Windows, macOS and the AppImage have their own install and do not come through here.
 */
import type { UpdaterStatus } from '../shared/ipc-types'

export type InstallPhase = 'checking' | 'authorising' | 'installing'

/** The downloaded package and the checksum its release lists for it. */
export interface PendingPackage {
  version: string
  file: string
  sha512: string | undefined
}

export interface FlowState {
  status: UpdaterStatus
  availableVersion: string | undefined
  installPhase: InstallPhase | undefined
  installError: string | undefined
  /** The downloaded update that is waiting for a restart. */
  held: { version: string } | null
  pending: PendingPackage | null
  /** An install session is running: the prompt is open, or it is installing (or, at quit, waiting for the password). */
  session: { id: number; closing: boolean } | null
  /** Restart's last look at the feed is under way. */
  rechecking: boolean
  /** That look found a newer release: install it once it has downloaded, without another click. */
  restartWhenReady: boolean
}

export type FlowEvent =
  /** Restart to update was chosen. */
  | { type: 'restart' }
  /** The last look at the feed is over: it answered, or the six seconds ran out. `heldVersion` is what was held when it began. */
  | { type: 'recheck-done'; heldVersion: string | undefined; fileExists: boolean }
  /** The session script was started (`problem` is why not) for a Restart (`relaunch`) or for a quit. */
  | { type: 'session-started'; id: number; relaunch: boolean; problem: string | null }
  | { type: 'update-available'; version: string }
  | { type: 'update-downloaded'; version: string; file: string; sha512: string | undefined }
  /** A check failed; `unreachable` is whether the feed could not be read at all. */
  | { type: 'check-failed'; unreachable: boolean }
  /** The session's output file was read: whether the password was accepted, and how it ended (null while it has not). */
  | { type: 'poll'; authorised: boolean; ended: null | { failure: string | null; packageProblem: boolean; summary: string } }
  /** The moment BLDesk was told to close has come. */
  | { type: 'close-timer'; id: number }
  /** The session script exited; `hadResult` is whether it had written its verdict. */
  | { type: 'session-exited'; id: number; hadResult: boolean; how: string }
  /** BLDesk is about to quit. */
  | { type: 'quit' }
  | { type: 'channel-changed' }

export type FlowEffect =
  /** Look at the feed (and give up waiting after six seconds); answer with 'recheck-done'. */
  | { type: 'recheck'; heldVersion: string | undefined }
  /** An ordinary check. */
  | { type: 'check' }
  /** Start the session script; answer with 'session-started'. */
  | { type: 'start-session'; relaunch: boolean }
  | { type: 'start-polling' }
  | { type: 'stop-polling' }
  | { type: 'schedule-close'; id: number }
  | { type: 'quit-app' }
  | { type: 'remove-file'; file: string }
  | { type: 'notify-ready'; version: string }
  /** Whether the update library may download by itself. */
  | { type: 'auto-download'; on: boolean }
  /** Write the session's verdict, for a script that died without one. */
  | { type: 'record-result'; text: string }
  | { type: 'clear-session-files' }
  | { type: 'log'; level: 'info' | 'warn' | 'error'; text: string }

export interface FlowResult {
  state: FlowState
  effects: FlowEffect[]
}

export const MISSING_DOWNLOAD_NOTICE = 'The downloaded update has gone missing, so BLDesk is downloading it again.'

const unchanged = (state: FlowState): FlowResult => ({ state, effects: [] })
const info = (text: string): FlowEffect => ({ type: 'log', level: 'info', text })

export function transition(state: FlowState, event: FlowEvent): FlowResult {
  switch (event.type) {
    case 'restart':
      return restart(state)

    case 'recheck-done': {
      // Stale: the channel was changed (or the state was reset) while the feed was being read.
      if (!state.rechecking) return unchanged(state)
      const s: FlowState = { ...state, rechecking: false }
      if (s.held?.version !== event.heldVersion) {
        // A newer release was found: the library replaced the download (and deleted the old file). Install the newer one as
        // soon as it has downloaded. If it is already here (or finished while the check ran) there is nothing to wait for, and a
        // flag left set would install it at some later check without being asked.
        const note = info(`A newer version, ${s.availableVersion}, was published after ${event.heldVersion} was downloaded; it will be installed once it has downloaded.`)
        const superseded: FlowState = { ...s, installPhase: undefined }
        if (superseded.status === 'ready') {
          const again = restart(superseded)
          return { state: again.state, effects: [note, ...again.effects] }
        }
        return { state: { ...superseded, restartWhenReady: true }, effects: [note] }
      }
      if (!s.pending || !event.fileExists) {
        // Deleted from under us (cache cleaned, or a newer download started): nothing to install, so fetch it again.
        return {
          state: { ...s, held: null, pending: null, status: 'idle', availableVersion: undefined, installPhase: undefined, installError: MISSING_DOWNLOAD_NOTICE },
          effects: [{ type: 'check' }]
        }
      }
      return { state: s, effects: [{ type: 'start-session', relaunch: true }] }
    }

    case 'session-started': {
      if (event.problem !== null) {
        if (!event.relaunch) return { state, effects: [{ type: 'log', level: 'warn', text: `The waiting update was not installed at quit: ${event.problem}` }] }
        return {
          state: { ...state, status: 'ready', installPhase: undefined, installError: event.problem },
          effects: [{ type: 'log', level: 'error', text: `Could not start the update installer: ${event.problem}` }]
        }
      }
      // A release a check that is still running turns up must not be downloaded over the file about to be installed.
      const session = { id: event.id, closing: false }
      if (!event.relaunch) return { state: { ...state, session }, effects: [{ type: 'auto-download', on: false }] }
      return {
        state: { ...state, session, status: 'installing', installPhase: 'authorising', installError: undefined },
        effects: [{ type: 'auto-download', on: false }, { type: 'start-polling' }]
      }
    }

    case 'update-available': {
      // An install is under way. A newer release found now, by a check that was still running, must not take the state or the
      // download that is about to be installed: the next check has it.
      if (state.session) {
        return { state, effects: [info(`Version ${event.version} was announced while an update is being installed; it is left for the next check.`)] }
      }
      // The version already downloaded again: nothing to do, and the Restart button stays.
      if (state.held?.version === event.version) return unchanged(state)
      // A different version: the library deletes the downloaded installer when a download of another version starts, and
      // again when it fails, so the waiting update cannot be installed any more and must not be offered.
      return { state: { ...state, held: null, pending: null, status: 'available', availableVersion: event.version }, effects: [] }
    }

    case 'update-downloaded': {
      // The library reports a download it already holds again on every check: say "is ready" once.
      const repeat = state.held?.version === event.version
      const pending: PendingPackage = { version: event.version, file: event.file, sha512: event.sha512 }
      // A check that was already running when Restart was chosen reports the waiting download again: it must not bring the
      // Restart button back while the password prompt is open.
      const marked: FlowState =
        state.status === 'installing'
          ? { ...state, pending, held: { version: event.version } }
          : { ...state, pending, held: { version: event.version }, status: 'ready', availableVersion: event.version }
      if (marked.restartWhenReady) {
        // The user chose Restart and a newer release turned up first: this is the one to install, without another click.
        const again = restart({ ...marked, restartWhenReady: false })
        return again
      }
      return { state: marked, effects: repeat ? [] : [{ type: 'notify-ready', version: event.version }] }
    }

    case 'check-failed': {
      if (state.held) {
        // A downloaded update is still waiting: a failed check does not take it away, or interrupt its install.
        if (state.status === 'installing') return unchanged(state)
        return { state: { ...state, status: 'ready', availableVersion: state.held.version }, effects: [] }
      }
      return {
        state: { ...state, restartWhenReady: false, status: event.unreachable ? 'check-failed' : 'error', availableVersion: undefined },
        effects: []
      }
    }

    case 'poll': {
      const session = state.session
      if (!session) return unchanged(state)
      let s = state
      const effects: FlowEffect[] = []
      if (event.authorised && !session.closing) {
        s = { ...s, session: { ...session, closing: true }, installPhase: 'installing' }
        effects.push(info('Update authorised; closing BLDesk so the installer can replace it.'), { type: 'schedule-close', id: session.id })
      }
      const ended = event.ended
      if (!ended) return { state: s, effects }
      s = { ...s, session: null }
      effects.push(
        { type: 'stop-polling' },
        { type: 'auto-download', on: true },
        { type: 'clear-session-files' },
        { type: 'log', level: ended.failure ? 'warn' : 'info', text: `Update session ended: ${ended.summary}.` }
      )
      if (!ended.failure) {
        // Installed while this process is still up (the helper waits a minute for it to exit, and then goes ahead): nothing is
        // left to install, so the quit that follows must not offer the same package again.
        effects.push({ type: 'quit-app' })
        return { state: { ...s, held: null, pending: null }, effects }
      }
      // A file the installer refused (wrong checksum, not a regular file...) is refused every time: drop it, so the next
      // check downloads it again, instead of leaving Restart to offer the same file.
      if (ended.packageProblem) {
        if (s.pending) effects.push({ type: 'remove-file', file: s.pending.file })
        s = { ...s, held: null, pending: null }
      }
      // A newer check took over the state while the prompt was open: only say what happened.
      if (s.status !== 'installing') return { state: { ...s, installPhase: undefined, installError: ended.failure }, effects }
      if (s.held) {
        return { state: { ...s, status: 'ready', availableVersion: s.held.version, installPhase: undefined, installError: ended.failure }, effects }
      }
      return {
        state: { ...s, status: 'idle', availableVersion: undefined, installPhase: undefined, installError: ended.failure },
        effects: [...effects, { type: 'check' }]
      }
    }

    case 'close-timer':
      // Only the session that asked for it, and only if it is still waiting to close.
      if (state.session && state.session.id === event.id && state.session.closing) return { state, effects: [{ type: 'quit-app' }] }
      return unchanged(state)

    case 'session-exited':
      // The script died without a verdict (killed, logged out, could not write its output): without one the state would stay
      // on "installing" for good. Only the current session's: an older one must not write into a newer one's output.
      if (!state.session || state.session.id !== event.id || event.hadResult) return unchanged(state)
      return {
        state,
        effects: [{ type: 'record-result', text: `RESULT failed the installer stopped unexpectedly (${event.how})` }]
      }

    case 'quit':
      // Quitting with an update waiting installs it, the prompt opening while BLDesk closes. Once started it is not started
      // again: the quit can be announced twice (a window closing quits too).
      if (!state.session && (state.status === 'ready' || state.held) && state.pending) {
        return { state, effects: [{ type: 'start-session', relaunch: false }] }
      }
      return unchanged(state)

    case 'channel-changed':
      return {
        state: {
          ...state,
          held: null,
          pending: null,
          restartWhenReady: false,
          rechecking: false,
          installPhase: undefined,
          installError: undefined,
          status: 'idle',
          availableVersion: undefined
        },
        effects: []
      }
  }
}

/** Restart: look at the feed once more first, because the download can be hours old. */
function restart(state: FlowState): FlowResult {
  if (state.status !== 'ready' || state.session || state.rechecking) return unchanged(state)
  return {
    state: { ...state, restartWhenReady: false, rechecking: true, status: 'installing', installPhase: 'checking', installError: undefined },
    effects: [{ type: 'recheck', heldVersion: state.held?.version }]
  }
}
