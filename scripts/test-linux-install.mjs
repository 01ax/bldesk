// Tests for the parts of a Linux package update that need no Electron: reading what the install session reports, the
// checks on what it is handed, and the checksum lookup.
// node --experimental-strip-types --no-warnings --test scripts/test-linux-install.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CANCELLED_MESSAGE,
  describeFailure,
  installInputProblem,
  leftoverNotice,
  listedChecksum,
  parseSessionOutput,
  sessionArguments,
  updateScriptPaths
} from '../src/main/linuxInstall.ts'

test('nothing yet: not authorised, no result', () => {
  assert.deepEqual(parseSessionOutput(''), { authorised: false, result: null })
})

test('AUTHORIZED is seen, and the session is still running', () => {
  assert.deepEqual(parseSessionOutput('AUTHORIZED\n'), { authorised: true, result: null })
})

test('a line that is not finished is not read: half of AUTHORIZED, or half of a failure message', () => {
  assert.deepEqual(parseSessionOutput('AUTHORIZ'), { authorised: false, result: null })
  assert.deepEqual(parseSessionOutput('AUTHORIZED'), { authorised: false, result: null })
  assert.deepEqual(parseSessionOutput('AUTHORIZED\nRESULT failed apt-get could'), { authorised: true, result: null })
})

test('each result', () => {
  assert.deepEqual(parseSessionOutput('AUTHORIZED\nINSTALLED\nRESULT installed\n').result, { outcome: 'installed' })
  assert.deepEqual(parseSessionOutput('RESULT cancelled\n').result, { outcome: 'cancelled' })
  assert.deepEqual(parseSessionOutput('AUTHORIZED\nFAILED apt-get could not install the package\nRESULT failed apt-get could not install the package\n').result, {
    outcome: 'failed',
    why: 'apt-get could not install the package'
  })
})

test('INSTALLED alone is not the end: only the session script\'s RESULT line is', () => {
  assert.equal(parseSessionOutput('AUTHORIZED\nINSTALLED\n').result, null)
})

test('a failure with no reason has an empty one', () => {
  assert.deepEqual(parseSessionOutput('RESULT failed\n').result, { outcome: 'failed', why: '' })
})

test('lines that merely contain the words do not count', () => {
  const r = parseSessionOutput('xAUTHORIZED\n AUTHORIZED\nsaw RESULT installed\nRESULT installedish\nRESULT cancelledx\n')
  assert.equal(r.authorised, false)
  assert.equal(r.result, null)
})

test('the last result wins', () => {
  assert.deepEqual(parseSessionOutput('RESULT cancelled\nRESULT installed\n').result, { outcome: 'installed' })
})

test('messages: none for an install or a session still running, one for each way it can fail', () => {
  assert.equal(describeFailure(null), null)
  assert.equal(describeFailure({ outcome: 'installed' }), null)
  assert.equal(describeFailure({ outcome: 'cancelled' }), CANCELLED_MESSAGE)
  assert.match(describeFailure({ outcome: 'failed', why: 'the package is not owned by the user' }), /^The update was not installed: the package is not owned by the user\./)
  assert.match(describeFailure({ outcome: 'failed', why: '' }), /the installer failed/)
  for (const result of [{ outcome: 'cancelled' }, { outcome: 'failed', why: 'x' }]) assert.match(describeFailure(result), /Choose Restart to try again\.$/)
})

test('what a session left behind while BLDesk was closed is a notice only if it did not install', () => {
  assert.equal(leftoverNotice('AUTHORIZED\nINSTALLED\nRESULT installed\n'), null)
  assert.equal(leftoverNotice('AUTHORIZED\n'), null)
  assert.equal(leftoverNotice(''), null)
  assert.equal(leftoverNotice('RESULT cancelled\n'), CANCELLED_MESSAGE)
})

const SHA = 'a'.repeat(86) + '=='

test('a checksum is passed on only when it is base64 and the file is an absolute path', () => {
  assert.equal(installInputProblem('/home/u/.cache/bldesk-updater/pending/BLDesk.deb', SHA), null)
  assert.match(installInputProblem(undefined, SHA), /doesn't know where/)
  assert.match(installInputProblem('relative.deb', SHA), /unusable file name/)
  assert.match(installInputProblem('/tmp/a\nb.deb', SHA), /unusable file name/)
  assert.match(installInputProblem('/tmp/a.deb', undefined), /doesn't list a checksum/)
  assert.match(installInputProblem('/tmp/a.deb', ''), /doesn't list a checksum/)
  assert.match(installInputProblem('/tmp/a.deb', 'not base64!'), /doesn't list a checksum/)
  assert.match(installInputProblem('/tmp/a.deb', '$(reboot)'), /doesn't list a checksum/)
})

test('the session script is given its arguments in order, and the restart command after them, or none to stay closed', () => {
  const base = { logPath: '/u/updater.log', outPath: '/u/session.out', appPid: 4242, packagePath: '/u/a b.deb', sha512: SHA }
  assert.deepEqual(sessionArguments({ ...base, relaunch: ['/opt/BLDesk/bldesk.bin', '--flag'] }), [
    '/u/updater.log', '/u/session.out', '4242', '/u/a b.deb', SHA, '1', '/opt/BLDesk/bldesk.bin', '--flag'
  ])
  assert.deepEqual(sessionArguments({ ...base, relaunch: null }), ['/u/updater.log', '/u/session.out', '4242', '/u/a b.deb', SHA, '0'])
})

test('the scripts are looked for in the app\'s resources folder, side by side', () => {
  assert.deepEqual(updateScriptPaths('/opt/BLDesk/resources'), {
    helper: '/opt/BLDesk/resources/linux/install-update.sh',
    session: '/opt/BLDesk/resources/linux/update-session.sh'
  })
})

const FILES = [
  { url: 'BLDesk-1.0.62-beta.31-linux-x86_64.AppImage', sha512: 'appimage-sum' },
  { url: 'BLDesk-1.0.62-beta.31-linux-amd64.deb', sha512: 'deb-sum' }
]

test('the checksum is the one listed for the file that was downloaded, not for another file in the release', () => {
  assert.equal(listedChecksum(FILES, '/home/u/.cache/bldesk-updater/pending/BLDesk-1.0.62-beta.31-linux-amd64.deb'), 'deb-sum')
  assert.equal(listedChecksum(FILES, '/x/BLDesk-1.0.62-beta.31-linux-x86_64.AppImage'), 'appimage-sum')
})

test('a package the library already held under another name gets the checksum of the release\'s one .deb', () => {
  assert.equal(listedChecksum(FILES, '/c/BLDesk-1.0.62-beta.31-linux-amd64.deb'.replace('beta.31', 'beta.30')), 'deb-sum')
  // not for a file that is not a .deb, and not when the release lists a .deb for each of two architectures
  assert.equal(listedChecksum(FILES, '/c/other.AppImage'), undefined)
  const TWO = [...FILES, { url: 'BLDesk-1.0.62-beta.31-linux-arm64.deb', sha512: 'arm-sum' }]
  assert.equal(listedChecksum(TWO, '/c/BLDesk-1.0.62-beta.30-linux-amd64.deb'), undefined)
  assert.equal(listedChecksum(TWO, '/c/BLDesk-1.0.62-beta.31-linux-arm64.deb'), 'arm-sum')
})

test('the checksum lookup copes with a full URL, a URL-encoded name, and nothing to find', () => {
  assert.equal(
    listedChecksum([{ url: 'https://github.com/termau/bldesk/releases/download/v1/BLDesk%20test.deb', sha512: 's' }], '/c/BLDesk test.deb'),
    's'
  )
  assert.equal(listedChecksum([{ url: 'a.AppImage', sha512: 'x' }, { url: 'b.deb', sha512: 'y' }, { url: 'c.deb', sha512: 'z' }], '/c/other.deb'), undefined)
  assert.equal(listedChecksum(FILES, undefined), undefined)
  assert.equal(listedChecksum(undefined, '/c/a.deb'), undefined)
  assert.equal(listedChecksum([{ url: 'a.deb' }], '/c/a.deb'), undefined)
})
