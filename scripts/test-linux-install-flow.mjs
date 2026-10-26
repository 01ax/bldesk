// Tests for the decisions behind a Linux package update (src/main/linuxInstallFlow.ts), without Electron: Restart, the last look
// at the feed, a release announced while the password prompt is open, cancel and Restart again, a session script that dies,
// the install at quit. Each guard in the module has a test that fails without it.
// node --experimental-strip-types --no-warnings --test scripts/test-linux-install-flow.mjs
//
// transition() is pure, so a small World around it carries out the effects the way updater.ts does, with simulated time (timers
// fire when advance() reaches them, no waiting), a fake feed (finishRecheck says the feed answered) and a fake session.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MISSING_DOWNLOAD_NOTICE, transition } from '../src/main/linuxInstallFlow.ts'

const IDLE = {
  status: 'idle',
  availableVersion: undefined,
  installPhase: undefined,
  installError: undefined,
  held: null,
  pending: null,
  session: null,
  rechecking: false,
  restartWhenReady: false
}
const pkg = (version) => ({ version, file: `/cache/BLDesk-${version}.deb`, sha512: `sha-${version}` })
const CANCELLED = 'The update was not installed: the prompt was closed.'
const POLL_MS = 250
const CLOSE_MS = 600
const RECHECK_MS = 6000

class World {
  constructor(initial = {}) {
    this.state = { ...IDLE, ...initial }
    this.now = 0
    this.timers = []
    this.effects = []
    this.logs = []
    this.autoDownload = true
    this.polling = false
    this.verdict = { authorised: false, ended: null } // what the session's output file says
    this.nextSession = 1
    this.sessionProblem = null
    this.fileExists = true
    this.recheckOpen = false
    this.rechecks = []
    this.checks = 0
    this.quits = 0
    this.removed = []
    this.notified = []
    this.records = []
    this.started = [] // the sessions that were started: { id, relaunch }
  }
  static ready(version = '1.0') {
    return new World({ status: 'ready', availableVersion: version, held: { version }, pending: pkg(version) })
  }
  get s() {
    return this.state
  }
  after(ms, fn) {
    this.timers.push({ at: this.now + ms, fn, order: this.timers.length })
  }
  advance(ms) {
    const end = this.now + ms
    for (;;) {
      const due = this.timers.filter((t) => t.at <= end).sort((a, b) => a.at - b.at || a.order - b.order)[0]
      if (!due) break
      this.timers.splice(this.timers.indexOf(due), 1)
      this.now = due.at
      due.fn()
    }
    this.now = end
  }
  send(event) {
    const queue = [event]
    while (queue.length) {
      const out = transition(this.state, queue.shift())
      this.state = out.state
      for (const effect of out.effects) {
        this.effects.push(effect)
        queue.push(...this.run(effect))
      }
    }
  }
  effectsOf(type) {
    return this.effects.filter((e) => e.type === type)
  }
  run(effect) {
    switch (effect.type) {
      case 'recheck': {
        this.rechecks.push(effect.heldVersion)
        this.recheckHeld = effect.heldVersion
        this.recheckOpen = true
        this.after(RECHECK_MS, () => this.finishRecheck()) // the feed was too slow: the same event, from the timeout
        return []
      }
      case 'check':
        this.checks++
        return []
      case 'start-session': {
        const id = this.nextSession++
        if (this.sessionProblem === null) this.started.push({ id, relaunch: effect.relaunch })
        this.verdict = { authorised: false, ended: null }
        return [{ type: 'session-started', id, relaunch: effect.relaunch, problem: this.sessionProblem }]
      }
      case 'start-polling': {
        this.polling = true
        const tick = () => {
          if (!this.polling) return
          this.send({ type: 'poll', authorised: this.verdict.authorised, ended: this.verdict.ended })
          this.after(POLL_MS, tick)
        }
        this.after(POLL_MS, tick)
        return []
      }
      case 'stop-polling':
        this.polling = false
        return []
      case 'schedule-close':
        this.after(CLOSE_MS, () => this.send({ type: 'close-timer', id: effect.id }))
        return []
      case 'quit-app':
        this.quits++
        return []
      case 'remove-file':
        this.removed.push(effect.file)
        return []
      case 'notify-ready':
        this.notified.push(effect.version)
        return []
      case 'auto-download':
        this.autoDownload = effect.on
        return []
      case 'record-result':
        this.records.push(effect.text)
        // the shell appends it to the output file, and the next read of the file finds the verdict
        this.verdict = { authorised: false, ended: { failure: 'The update was not installed: the installer stopped unexpectedly.', packageProblem: false, summary: 'failed (stopped)' } }
        return []
      case 'clear-session-files':
        return []
      case 'log':
        this.logs.push(effect.text)
        return []
      default:
        throw new Error(`the world does not know the effect ${effect.type}`)
    }
  }
  /** The feed answered (or the timeout fired). */
  finishRecheck() {
    if (!this.recheckOpen) return
    this.recheckOpen = false
    this.send({ type: 'recheck-done', heldVersion: this.recheckHeld, fileExists: this.fileExists })
  }
  accept() {
    this.verdict = { ...this.verdict, authorised: true }
  }
  cancel() {
    this.verdict = { authorised: false, ended: { failure: CANCELLED, packageProblem: false, summary: 'cancelled' } }
  }
  fail(failure, { packageProblem = false } = {}) {
    this.verdict = { authorised: this.verdict.authorised, ended: { failure, packageProblem, summary: 'failed' } }
  }
  installed() {
    this.verdict = { authorised: true, ended: { failure: null, packageProblem: false, summary: 'installed' } }
  }
  /** Restart, up to and including the password prompt being open. */
  restartToPrompt() {
    this.send({ type: 'restart' })
    this.finishRecheck()
  }
}

// ---- Restart while a check is running ------------------------------------------------------------------------------------

test('Restart looks at the feed first, and a second click during the look does nothing', () => {
  const w = World.ready('1.0')
  w.send({ type: 'restart' })
  assert.equal(w.s.status, 'installing')
  assert.equal(w.s.installPhase, 'checking')
  assert.deepEqual(w.effectsOf('recheck'), [{ type: 'recheck', heldVersion: '1.0' }])
  const before = w.effects.length
  w.send({ type: 'restart' })
  assert.equal(w.effects.length, before, 'a second look was started')
})

test('a check that was already running reports the same download again mid-look: Restart does not come back, the look goes on', () => {
  const w = World.ready('1.0')
  w.send({ type: 'restart' })
  w.send({ type: 'update-downloaded', ...pkg('1.0') })
  assert.equal(w.s.status, 'installing', 'the Restart button came back')
  assert.equal(w.s.installPhase, 'checking')
  assert.deepEqual(w.notified, [], 'announced again')
  w.finishRecheck()
  assert.equal(w.s.installPhase, 'authorising')
  assert.deepEqual(w.started, [{ id: 1, relaunch: true }])
})

test('when the feed has nothing newer the session starts: authorising, polling, downloads off', () => {
  const w = World.ready('1.0')
  w.restartToPrompt()
  assert.equal(w.s.status, 'installing')
  assert.equal(w.s.installPhase, 'authorising')
  assert.deepEqual(w.s.session, { id: 1, closing: false })
  assert.equal(w.polling, true)
  assert.equal(w.autoDownload, false)
})

test('Restart is ignored unless an update is ready', () => {
  for (const status of ['idle', 'checking', 'available', 'downloading', 'installing', 'error', 'check-failed', 'up-to-date']) {
    const w = new World({ status, held: { version: '1.0' }, pending: pkg('1.0') })
    w.send({ type: 'restart' })
    assert.equal(w.effects.length, 0, status)
    assert.equal(w.s.status, status)
  }
})

test('Restart is ignored while a session is running', () => {
  const w = World.ready('1.0')
  w.restartToPrompt()
  w.state = { ...w.state, status: 'ready' } // even if the state somehow said ready
  const before = w.effects.length
  w.send({ type: 'restart' })
  assert.equal(w.effects.length, before)
})

test('a second Restart while the look is still open is ignored even when a newer release has already made the update look ready', () => {
  const w = World.ready('1.0')
  w.send({ type: 'restart' })
  w.send({ type: 'update-available', version: '2.0' })
  w.send({ type: 'update-downloaded', ...pkg('2.0') }) // finished while the look is still open: status ready again, look not settled
  assert.equal(w.s.status, 'ready')
  assert.equal(w.s.rechecking, true)
  const before = w.effects.length
  w.send({ type: 'restart' })
  assert.equal(w.effects.length, before, 'a second look was started while the first was open')
})

// ---- a newer release found during the pre-install look -------------------------------------------------------------------

test('a newer release found during the look is installed once it has downloaded, without another click and without a notification', () => {
  const w = World.ready('1.0')
  w.send({ type: 'restart' })
  w.send({ type: 'update-available', version: '2.0' }) // the library deletes the old file and starts the download
  assert.equal(w.s.held, null)
  assert.equal(w.s.pending, null)
  w.finishRecheck()
  assert.equal(w.s.restartWhenReady, true)
  assert.equal(w.s.status, 'available')
  assert.equal(w.s.installPhase, undefined)
  assert.equal(w.started.length, 0, 'installed the old one')
  w.send({ type: 'update-downloaded', ...pkg('2.0') }) // the download finishes
  assert.equal(w.s.restartWhenReady, false)
  assert.deepEqual(w.rechecks, ['1.0', '2.0'], 'the newer one is looked at once more, as any Restart')
  w.finishRecheck()
  assert.deepEqual(w.started, [{ id: 1, relaunch: true }])
  assert.equal(w.s.pending.version, '2.0')
  assert.deepEqual(w.notified, [], 'announced a release the user was already installing')
})

test('a newer release that was already downloaded when the look ends installs at once, and no flag is left to install it later unasked', () => {
  const w = World.ready('1.0')
  w.send({ type: 'restart' })
  w.send({ type: 'update-available', version: '2.0' })
  w.send({ type: 'update-downloaded', ...pkg('2.0') }) // finished while the look was still going
  assert.deepEqual(w.notified, ['2.0'])
  w.finishRecheck()
  assert.equal(w.s.restartWhenReady, false, 'a flag was left set')
  assert.deepEqual(w.rechecks, ['1.0', '2.0'])
  w.finishRecheck()
  assert.deepEqual(w.started, [{ id: 1, relaunch: true }])
  assert.equal(w.s.pending.version, '2.0')
  // cancel, and the next check reports 2.0 again: it must not start an install by itself
  w.cancel()
  w.advance(POLL_MS)
  const before = w.effects.length
  w.send({ type: 'update-downloaded', ...pkg('2.0') })
  assert.equal(w.s.status, 'ready')
  assert.equal(w.effects.length, before, 'the repeat report started something')
})

test('a flag set for a newer release is cleared by a fresh Restart', () => {
  const w = World.ready('1.0')
  w.send({ type: 'restart' })
  w.send({ type: 'update-available', version: '2.0' })
  w.finishRecheck()
  assert.equal(w.s.restartWhenReady, true)
  // the download comes back ready for the user to choose Restart themselves
  w.state = { ...w.s, status: 'ready', held: { version: '2.0' }, pending: pkg('2.0'), restartWhenReady: true }
  w.send({ type: 'restart' })
  assert.equal(w.s.restartWhenReady, false)
})

test('a failed download of the newer release clears the flag, so nothing installs later by itself', () => {
  const w = World.ready('1.0')
  w.send({ type: 'restart' })
  w.send({ type: 'update-available', version: '2.0' })
  w.finishRecheck()
  assert.equal(w.s.restartWhenReady, true)
  w.send({ type: 'check-failed', unreachable: false })
  assert.equal(w.s.restartWhenReady, false)
  assert.equal(w.s.status, 'error')
})

test('the same release announced again while it is held changes nothing', () => {
  const w = World.ready('1.0')
  const before = w.s
  w.send({ type: 'update-available', version: '1.0' })
  assert.deepEqual(w.s, before)
})

test('a different release announced outside an install drops the waiting download, which the library deletes', () => {
  const w = World.ready('1.0')
  w.send({ type: 'update-available', version: '2.0' })
  assert.equal(w.s.held, null)
  assert.equal(w.s.pending, null)
  assert.equal(w.s.status, 'available')
  assert.equal(w.s.availableVersion, '2.0')
})

test('a download that has gone missing at the end of the look is fetched again, with a notice', () => {
  const w = World.ready('1.0')
  w.fileExists = false
  w.restartToPrompt()
  assert.equal(w.s.status, 'idle')
  assert.equal(w.s.installError, MISSING_DOWNLOAD_NOTICE)
  assert.equal(w.s.held, null)
  assert.equal(w.checks, 1)
  assert.equal(w.started.length, 0)
})

// ---- cancel, then Restart again ------------------------------------------------------------------------------------------

test('cancelling leaves the update ready with a notice, downloads back on, nothing left running', () => {
  const w = World.ready('1.0')
  w.restartToPrompt()
  w.cancel()
  w.advance(POLL_MS)
  assert.equal(w.s.status, 'ready')
  assert.equal(w.s.availableVersion, '1.0')
  assert.equal(w.s.installError, CANCELLED)
  assert.equal(w.s.installPhase, undefined)
  assert.equal(w.s.session, null)
  assert.equal(w.polling, false)
  assert.equal(w.autoDownload, true)
  assert.equal(w.quits, 0, 'BLDesk closed for a dismissed prompt')
})

test('Restart again after cancelling clears the notice and starts a new session', () => {
  const w = World.ready('1.0')
  w.restartToPrompt()
  w.cancel()
  w.advance(POLL_MS)
  w.send({ type: 'restart' })
  assert.equal(w.s.installError, undefined)
  w.finishRecheck()
  assert.deepEqual(w.started.map((s) => s.id), [1, 2])
  assert.equal(w.s.installPhase, 'authorising')
  assert.equal(w.polling, true)
})

test('a session that cannot be started leaves the update ready with the reason, and downloads stay on', () => {
  const w = World.ready('1.0')
  w.sessionProblem = "BLDesk can't install updates in this window."
  w.restartToPrompt()
  assert.equal(w.s.status, 'ready')
  assert.equal(w.s.installError, "BLDesk can't install updates in this window.")
  assert.equal(w.s.session, null)
  assert.equal(w.polling, false)
  assert.equal(w.autoDownload, true)
})

// ---- a release announced while the prompt is open ------------------------------------------------------------------------

test('a release announced while the prompt is open changes nothing, and the download is not replaced', () => {
  const w = World.ready('1.0')
  w.restartToPrompt()
  const before = w.s
  w.send({ type: 'update-available', version: '3.0' })
  assert.deepEqual(w.s, before)
  assert.equal(w.s.held.version, '1.0')
  assert.equal(w.s.pending.version, '1.0')
  assert.equal(w.autoDownload, false, 'the library was left free to download over the file')
  assert.ok(w.logs.some((l) => l.includes('3.0') && l.includes('left for the next check')))
})

test('once the prompt is cancelled, downloads are allowed again and the release is taken as any other', () => {
  const w = World.ready('1.0')
  w.restartToPrompt()
  w.cancel()
  w.advance(POLL_MS)
  assert.equal(w.autoDownload, true)
  w.send({ type: 'update-available', version: '3.0' })
  assert.equal(w.s.status, 'available')
  assert.equal(w.s.availableVersion, '3.0')
})

test('when the feed is too slow the install goes ahead, and a release it announces later is ignored', () => {
  const w = World.ready('1.0')
  w.send({ type: 'restart' })
  w.advance(RECHECK_MS) // the timeout stands in for the answer
  assert.equal(w.s.installPhase, 'authorising')
  assert.deepEqual(w.started, [{ id: 1, relaunch: true }])
  w.send({ type: 'update-available', version: '2.0' }) // the slow check finally answers
  assert.equal(w.s.held.version, '1.0')
  assert.equal(w.s.status, 'installing')
  w.finishRecheck() // nothing left to settle
  assert.equal(w.started.length, 1)
})

test('the late answer of a look that already timed out does not start a second session', () => {
  const w = World.ready('1.0')
  w.send({ type: 'restart' })
  w.advance(RECHECK_MS)
  const before = w.effects.length
  w.send({ type: 'recheck-done', heldVersion: '1.0', fileExists: true })
  assert.equal(w.effects.length, before)
})

test('a download repeated by a late check while the prompt is open does not bring Restart back', () => {
  const w = World.ready('1.0')
  w.restartToPrompt()
  w.send({ type: 'update-downloaded', ...pkg('1.0') })
  assert.equal(w.s.status, 'installing')
  assert.equal(w.s.installPhase, 'authorising')
  assert.deepEqual(w.notified, [])
})

// ---- the session script dying without a verdict --------------------------------------------------------------------------

test('a session script that dies without a verdict gets one written, and the status does not stay on installing', () => {
  const w = World.ready('1.0')
  w.restartToPrompt()
  w.send({ type: 'session-exited', id: 1, hadResult: false, how: 'SIGKILL' })
  assert.deepEqual(w.records, ['RESULT failed the installer stopped unexpectedly (SIGKILL)'])
  w.advance(POLL_MS)
  assert.equal(w.s.status, 'ready')
  assert.match(w.s.installError, /stopped unexpectedly/)
  assert.equal(w.s.session, null)
  assert.equal(w.polling, false)
})

test('a session script that exits after writing its verdict gets nothing written', () => {
  const w = World.ready('1.0')
  w.restartToPrompt()
  w.send({ type: 'session-exited', id: 1, hadResult: true, how: 'exit status 0' })
  assert.deepEqual(w.records, [])
})

test("an older session's exit is not written into a newer session's output", () => {
  const w = World.ready('1.0')
  w.restartToPrompt()
  w.cancel()
  w.advance(POLL_MS)
  w.restartToPrompt() // session 2
  w.send({ type: 'session-exited', id: 1, hadResult: false, how: 'SIGKILL' })
  assert.deepEqual(w.records, [])
})

test('an exit after the session has ended writes nothing', () => {
  const w = World.ready('1.0')
  w.restartToPrompt()
  w.cancel()
  w.advance(POLL_MS)
  w.send({ type: 'session-exited', id: 1, hadResult: false, how: 'SIGKILL' })
  assert.deepEqual(w.records, [])
})

// ---- the password accepted, closing, installed ---------------------------------------------------------------------------

test('once the password is accepted BLDesk is told to close once, however often the output is read, and then quits', () => {
  const w = World.ready('1.0')
  w.restartToPrompt()
  w.accept()
  w.advance(POLL_MS * 2) // two reads of an output that says authorised
  assert.equal(w.s.installPhase, 'installing')
  assert.equal(w.effectsOf('schedule-close').length, 1)
  assert.equal(w.quits, 0)
  w.advance(CLOSE_MS)
  assert.equal(w.quits, 1)
  w.advance(POLL_MS * 4)
  assert.equal(w.quits, 1)
})

test('a close timer for a session that was never told to close does not quit', () => {
  const w = World.ready('1.0')
  w.restartToPrompt() // the prompt is open; nobody has accepted
  w.send({ type: 'close-timer', id: 1 })
  assert.equal(w.quits, 0, 'BLDesk quit before any password was accepted')
})

test('a close timer for another session, or for a session that has ended, does not quit', () => {
  const w = World.ready('1.0')
  w.restartToPrompt()
  w.accept()
  w.advance(POLL_MS) // authorised: the close is scheduled
  w.send({ type: 'close-timer', id: 99 })
  assert.equal(w.quits, 0, 'a timer of another session quit BLDesk')
  w.fail('The update was not installed: apt-get could not install the package.') // it failed before the timer fired
  w.advance(POLL_MS)
  assert.equal(w.s.session, null)
  w.advance(CLOSE_MS)
  assert.equal(w.quits, 0, 'BLDesk quit for a session that had already ended')
})

test('an install that finishes while BLDesk is still open drops the package, so the quit does not offer it again', () => {
  const w = World.ready('1.0')
  w.restartToPrompt()
  w.installed()
  w.advance(POLL_MS)
  assert.equal(w.quits, 1)
  assert.equal(w.s.held, null)
  assert.equal(w.s.pending, null)
  const startsBefore = w.effectsOf('start-session').length
  w.send({ type: 'quit' })
  assert.equal(w.effectsOf('start-session').length, startsBefore, 'a second session was started for a package that is installed')
})

test('a failed install keeps the downloaded file and goes back to ready', () => {
  const w = World.ready('1.0')
  w.restartToPrompt()
  w.accept()
  w.fail('The update was not installed: apt-get could not install the package. Choose Restart to try again.')
  w.advance(POLL_MS)
  assert.deepEqual(w.removed, [])
  assert.equal(w.s.status, 'ready')
  assert.equal(w.s.held.version, '1.0')
  assert.equal(w.checks, 0)
})

test('a file the installer refused is deleted and fetched again, not offered again', () => {
  const w = World.ready('1.0')
  w.restartToPrompt()
  w.fail('The update was not installed: the downloaded package does not match its published checksum.', { packageProblem: true })
  w.advance(POLL_MS)
  assert.deepEqual(w.removed, ['/cache/BLDesk-1.0.deb'])
  assert.equal(w.s.held, null)
  assert.equal(w.s.pending, null)
  assert.equal(w.s.status, 'idle')
  assert.match(w.s.installError, /does not match/)
  assert.equal(w.checks, 1)
})

test('when another check took over the state while the prompt was open, the end of the session only reports', () => {
  const w = World.ready('1.0')
  w.restartToPrompt()
  w.state = { ...w.s, status: 'downloading' }
  w.cancel()
  w.advance(POLL_MS)
  assert.equal(w.s.status, 'downloading')
  assert.equal(w.s.installError, CANCELLED)
  assert.equal(w.checks, 0)
})

// ---- checks that fail, and the channel -----------------------------------------------------------------------------------

test('a failed check does not take away a waiting update, and does not interrupt an install', () => {
  const ready = World.ready('1.0')
  ready.state = { ...ready.s, status: 'checking' }
  ready.send({ type: 'check-failed', unreachable: true })
  assert.equal(ready.s.status, 'ready')

  const busy = World.ready('1.0')
  busy.restartToPrompt()
  const before = busy.s
  busy.send({ type: 'check-failed', unreachable: true })
  assert.deepEqual(busy.s, before, 'a failed check changed an install in progress')
})

test('a failed check with nothing waiting is reported by kind', () => {
  const w = new World({ status: 'checking' })
  w.send({ type: 'check-failed', unreachable: true })
  assert.equal(w.s.status, 'check-failed')
  w.send({ type: 'check-failed', unreachable: false })
  assert.equal(w.s.status, 'error')
})

test('changing the channel forgets everything about the waiting update, and a look that was under way is ignored', () => {
  const w = World.ready('1.0')
  w.send({ type: 'restart' })
  w.send({ type: 'update-available', version: '2.0' }) // sets nothing yet that the flag needs
  w.send({ type: 'channel-changed' })
  assert.deepEqual({ ...w.s }, { ...IDLE, status: 'idle' })
  const before = w.effects.length
  w.finishRecheck() // the look ends after the channel changed
  assert.equal(w.effects.length, before, 'a stale look went on')
  assert.equal(w.started.length, 0)
})

test('changing the channel clears a flag that would install a release on arrival', () => {
  const w = new World({ status: 'available', restartWhenReady: true })
  w.send({ type: 'channel-changed' })
  assert.equal(w.s.restartWhenReady, false)
})

// ---- the install at quit -------------------------------------------------------------------------------------------------

test('quitting with an update waiting starts one session, which BLDesk does not wait for, and not a second', () => {
  const w = World.ready('1.0')
  w.send({ type: 'quit' })
  assert.deepEqual(w.started, [{ id: 1, relaunch: false }])
  assert.equal(w.polling, false, 'the quit-time session is not polled: BLDesk is closing')
  assert.equal(w.autoDownload, false)
  assert.equal(w.s.status, 'ready', 'a quit changes no status the user sees')
  w.send({ type: 'quit' }) // the quit is announced twice when a window closing quits too
  assert.equal(w.effectsOf('start-session').length, 1)
})

test('quitting installs a waiting update even while a newer one downloads', () => {
  const w = new World({ status: 'downloading', held: { version: '1.0' }, pending: pkg('1.0') })
  w.send({ type: 'quit' })
  assert.deepEqual(w.started, [{ id: 1, relaunch: false }])
})

test('quitting with nothing waiting starts nothing', () => {
  for (const initial of [{}, { status: 'ready', held: { version: '1.0' }, pending: null }, { status: 'available' }]) {
    const w = new World(initial)
    w.send({ type: 'quit' })
    assert.equal(w.effects.length, 0)
  }
})

test('quitting while a Restart session is running starts nothing', () => {
  const w = World.ready('1.0')
  w.restartToPrompt()
  const before = w.effects.length
  w.send({ type: 'quit' })
  assert.equal(w.effects.length, before)
})

test('a quit-time session that could not be started is logged and changes nothing', () => {
  const w = World.ready('1.0')
  w.sessionProblem = 'The downloaded update is missing.'
  const before = w.s
  w.send({ type: 'quit' })
  assert.deepEqual(w.s, before)
  assert.ok(w.logs.some((l) => l.includes('not installed at quit')))
})

test('a quit-time session whose script dies gets its verdict written, for the next start to report', () => {
  const w = World.ready('1.0')
  w.send({ type: 'quit' })
  w.send({ type: 'session-exited', id: 1, hadResult: false, how: 'SIGTERM' })
  assert.deepEqual(w.records, ['RESULT failed the installer stopped unexpectedly (SIGTERM)'])
})
