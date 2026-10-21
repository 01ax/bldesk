// Tests for the two scripts that install a downloaded Linux package update:
//   linux/update/install-update.sh  runs as root (through pkexec): checks the download, waits for BLDesk to close, installs
//   linux/update/update-session.sh  runs as the user: pkexec, then reports the result and opens BLDesk again
// node --experimental-strip-types --no-warnings --test scripts/test-linux-update-scripts.mjs
//
// Neither is run for real: apt-get, dpkg-deb and pkexec are replaced by programs that record what they were given. The
// helper's tool paths and temporary folder are pointed into a scratch folder, and PKEXEC_UID is set as pkexec would. The
// ownership check needs the test's own user id, so it passes for files this test creates and fails for a different id.
// INSTALL_UPDATE and UPDATE_SESSION override the script paths, for checking that the tests catch a broken script.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// The scripts need GNU coreutils, /proc and polkit, so there is nothing to run on another system.
if (process.platform !== 'linux') {
  console.log('skipped: the Linux update scripts are only tested on Linux')
  process.exit(0)
}

const helperPath = process.env.INSTALL_UPDATE ?? new URL('../linux/update/install-update.sh', import.meta.url).pathname
const sessionPath = process.env.UPDATE_SESSION ?? new URL('../linux/update/update-session.sh', import.meta.url).pathname
const helperSource = readFileSync(helperPath, 'utf8')
const sessionSource = readFileSync(sessionPath, 'utf8')
const myUid = String(process.getuid())

const PACKAGE_BYTES = Buffer.from('not really a deb, but its checksum is real')
const sha512 = (bytes) => createHash('sha512').update(bytes).digest('base64')

/** A scratch folder with fake apt-get / dpkg-deb, the helper rewritten to use them, and a package to install. */
function sandbox({ packageName = 'BLDesk-1.0.99-linux-amd64.deb', debPackageField = 'bldesk', aptStatus = 0 } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'bldesk-install-update-'))
  mkdirSync(join(dir, 'scratch'))
  mkdirSync(join(dir, 'downloads'))
  const log = join(dir, 'calls.log')
  // apt-get records its arguments, and what it was handed (the copy's checksum, mode and owner, whether the folder is
  // readable by others), then prints something on both streams so the helper's standard output can be checked for leaks.
  writeFileSync(
    join(dir, 'apt-get'),
    `#!/bin/sh
printf 'apt-get %s\\n' "$*" >> "${log}"
copy=$(printf '%s\\n' "$@" | grep '\\.deb$' | tail -n 1)
printf 'copy-sha512 %s\\n' "$(sha512sum "$copy" | cut -d' ' -f1)" >> "${log}"
printf 'copy-mode %s dir-mode %s\\n' "$(stat -c %a "$copy")" "$(stat -c %a "$(dirname "$copy")")" >> "${log}"
printf 'copy-dir %s\\n' "$(dirname "$copy")" >> "${log}"
printf 'frontend %s\\n' "$DEBIAN_FRONTEND" >> "${log}"
printf 'app-alive-at-install %s\\n' "$(kill -0 "$(cat "${dir}/app.pid" 2>/dev/null)" 2>/dev/null && echo yes || echo no)" >> "${log}"
echo "apt says hello on stdout"
echo "apt says hello on stderr" >&2
exit ${aptStatus}
`
  )
  writeFileSync(join(dir, 'dpkg-deb'), `#!/bin/sh\nprintf 'dpkg-deb %s\\n' "$*" >> "${log}"\nprintf '%s\\n' "${debPackageField}"\n`)
  chmodSync(join(dir, 'apt-get'), 0o755)
  chmodSync(join(dir, 'dpkg-deb'), 0o755)
  const script = helperSource
    .replace('APT_GET=/usr/bin/apt-get', `APT_GET=${join(dir, 'apt-get')}`)
    .replace('DPKG_DEB=/usr/bin/dpkg-deb', `DPKG_DEB=${join(dir, 'dpkg-deb')}`)
    .replace('SCRATCH=/var/tmp/bldesk-update.XXXXXX', `SCRATCH=${join(dir, 'scratch')}/bldesk-update.XXXXXX`)
  assert.notEqual(script, helperSource, 'the helper has none of the substitution points the tests rely on')
  writeFileSync(join(dir, 'install-update.sh'), script, { mode: 0o755 })
  const pkg = join(dir, 'downloads', packageName)
  writeFileSync(pkg, PACKAGE_BYTES)
  return { dir, log, pkg, helper: join(dir, 'install-update.sh'), cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

const calls = (box) => (existsSync(box.log) ? readFileSync(box.log, 'utf8').trim().split('\n') : [])

/** Run the helper, as pkexec would, and report its exit status, standard output lines and standard error. */
function runHelper(box, args, env = {}) {
  const r = spawnSync('sh', [box.helper, ...args], {
    env: { PATH: '/usr/bin:/bin', PKEXEC_UID: myUid, ...env },
    encoding: 'utf8'
  })
  return { status: r.status, out: r.stdout.trim().split('\n').filter(Boolean), err: r.stderr }
}

/** What a package name or checksum would create in the working directory if the shell ever ran it. */
const MARKER = join(process.cwd(), 'bldesk-pwned-marker')

const GOOD = (box) => ['999999999', box.pkg, sha512(PACKAGE_BYTES)]

test('a good package is authorised, then installed, and nothing but the protocol is on standard output', () => {
  const box = sandbox()
  try {
    // 999999999 is not a process, so the wait for BLDesk to close ends at once.
    const r = runHelper(box, GOOD(box))
    assert.equal(r.status, 0, r.err)
    assert.deepEqual(r.out, ['AUTHORIZED', 'INSTALLED'], 'apt-get output must go to standard error')
    assert.match(r.err, /apt says hello on stdout/)
    const c = calls(box)
    assert.ok(c.some((l) => /^apt-get install -y .*\/bldesk\.deb$/.test(l)), c.join('\n'))
    assert.ok(c.includes('frontend noninteractive'))
  } finally {
    box.cleanup()
  }
})

test('apt-get installs a copy that only root can change, which is the file that was checked', () => {
  const box = sandbox()
  try {
    runHelper(box, GOOD(box))
    const c = calls(box)
    const copyMode = c.find((l) => l.startsWith('copy-mode '))
    assert.equal(copyMode, 'copy-mode 644 dir-mode 755')
    assert.equal(c.find((l) => l.startsWith('copy-sha512 ')), `copy-sha512 ${createHash('sha512').update(PACKAGE_BYTES).digest('hex')}`)
    const copyDir = c.find((l) => l.startsWith('copy-dir ')).slice('copy-dir '.length)
    assert.notEqual(copyDir, join(box.dir, 'downloads'), 'installed from the folder the user can write to')
    assert.ok(copyDir.startsWith(join(box.dir, 'scratch', 'bldesk-update.')), copyDir)
    assert.equal(existsSync(copyDir), false, 'the copy was left behind')
  } finally {
    box.cleanup()
  }
})

test('the checksum is checked before BLDesk is told to close, so a bad file never makes it quit', () => {
  const box = sandbox()
  try {
    const r = runHelper(box, ['999999999', box.pkg, sha512(Buffer.from('some other file'))])
    assert.notEqual(r.status, 0)
    assert.equal(r.out.length, 1)
    assert.match(r.out[0], /^FAILED .*checksum/)
    assert.deepEqual(calls(box).filter((l) => l.startsWith('apt-get')), [], 'apt-get ran')
  } finally {
    box.cleanup()
  }
})

test('a file swapped for another after the check is not what gets installed', () => {
  // The helper copies first and checks the copy. Here the original is replaced as soon as AUTHORIZED is printed, while the
  // helper is still waiting for the app to exit: apt-get must still be handed the bytes that were checked.
  const box = sandbox()
  try {
    const app = spawn('sleep', ['1'], { stdio: 'ignore' })
    writeFileSync(join(box.dir, 'app.pid'), String(app.pid))
    const helper = spawn('sh', [box.helper, String(app.pid), box.pkg, sha512(PACKAGE_BYTES)], {
      env: { PATH: '/usr/bin:/bin', PKEXEC_UID: myUid },
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let out = ''
    helper.stdout.on('data', (d) => (out += d))
    return new Promise((resolve, reject) => {
      const poll = setInterval(() => {
        if (out.includes('AUTHORIZED')) {
          writeFileSync(box.pkg, 'a different file, swapped in after the check')
          clearInterval(poll)
        }
      }, 20)
      helper.on('close', (code) => {
        clearInterval(poll)
        try {
          assert.equal(code, 0)
          assert.equal(calls(box).find((l) => l.startsWith('copy-sha512 ')), `copy-sha512 ${createHash('sha512').update(PACKAGE_BYTES).digest('hex')}`)
          resolve()
        } catch (err) {
          reject(err)
        } finally {
          box.cleanup()
        }
      })
    })
  } catch (err) {
    box.cleanup()
    throw err
  }
})

test('it waits for BLDesk to exit before installing, and says it is authorised while that is still running', async () => {
  const box = sandbox()
  try {
    const app = spawn('sleep', ['1.5'], { stdio: 'ignore' })
    writeFileSync(join(box.dir, 'app.pid'), String(app.pid))
    const started = Date.now()
    const result = await new Promise((resolve) => {
      const helper = spawn('sh', [box.helper, String(app.pid), box.pkg, sha512(PACKAGE_BYTES)], {
        env: { PATH: '/usr/bin:/bin', PKEXEC_UID: myUid },
        stdio: ['ignore', 'pipe', 'pipe']
      })
      let out = ''
      let authorisedAfter = null
      helper.stdout.on('data', (d) => {
        out += d
        if (authorisedAfter === null && out.includes('AUTHORIZED')) authorisedAfter = Date.now() - started
      })
      helper.on('close', (code) => resolve({ code, out, authorisedAfter, total: Date.now() - started }))
    })
    assert.equal(result.code, 0)
    assert.ok(result.authorisedAfter < 800, `AUTHORIZED came after ${result.authorisedAfter} ms: it should not wait for the app`)
    assert.ok(result.total >= 1400, `installed after ${result.total} ms, before the app (1500 ms) had exited`)
    assert.ok(calls(box).includes('app-alive-at-install no'), 'apt-get ran while BLDesk was still running')
  } finally {
    box.cleanup()
  }
})

test('an app that never exits does not hold the update up forever', { timeout: 20000 }, async () => {
  const box = sandbox()
  try {
    // The wait is 300 x 0.2 s = 60 s; shorten it for the test by rewriting the bound, and check the bound is there.
    assert.match(helperSource, /\[ "\$i" -lt 300 \]/, 'the wait bound changed: update this test')
    const script = readFileSync(box.helper, 'utf8').replace('-lt 300', '-lt 5')
    writeFileSync(box.helper, script)
    const app = spawn('sleep', ['30'], { stdio: 'ignore' })
    try {
      const r = runHelper(box, [String(app.pid), box.pkg, sha512(PACKAGE_BYTES)])
      assert.equal(r.status, 0, r.err)
      assert.deepEqual(r.out, ['AUTHORIZED', 'INSTALLED'])
    } finally {
      app.kill()
    }
  } finally {
    box.cleanup()
  }
})

test('a symbolic link in place of the package is refused', () => {
  const box = sandbox()
  try {
    const link = join(box.dir, 'downloads', 'link.deb')
    symlinkSync(box.pkg, link)
    const r = runHelper(box, ['999999999', link, sha512(PACKAGE_BYTES)])
    assert.notEqual(r.status, 0)
    assert.match(r.out[0], /^FAILED .*regular file/)
    assert.deepEqual(calls(box).filter((l) => l.startsWith('apt-get')), [])
  } finally {
    box.cleanup()
  }
})

test('a file owned by someone other than the user who asked for the update is refused', () => {
  const box = sandbox()
  try {
    const r = runHelper(box, GOOD(box), { PKEXEC_UID: String(Number(myUid) + 1) })
    assert.notEqual(r.status, 0)
    assert.match(r.out[0], /^FAILED .*not owned by the user/)
    assert.deepEqual(calls(box).filter((l) => l.startsWith('apt-get')), [])
  } finally {
    box.cleanup()
  }
})

test('it only runs through pkexec', () => {
  const box = sandbox()
  try {
    const r = spawnSync('sh', [box.helper, ...GOOD(box)], { env: { PATH: '/usr/bin:/bin' }, encoding: 'utf8' })
    assert.notEqual(r.status, 0)
    assert.match(r.stdout, /^FAILED .*pkexec/)
  } finally {
    box.cleanup()
  }
})

for (const [label, args] of [
  ['too few arguments', (box) => ['1', box.pkg]],
  ['too many arguments', (box) => [...GOOD(box), 'extra']],
  ['a process id that is not a number', (box) => ['12; reboot', box.pkg, sha512(PACKAGE_BYTES)]],
  ['an empty process id', (box) => ['', box.pkg, sha512(PACKAGE_BYTES)]],
  ['a checksum that is not base64', (box) => ['1', box.pkg, 'abc$(touch bldesk-pwned-marker)']],
  ['an empty checksum', (box) => ['1', box.pkg, '']],
  ['a relative package path', () => ['1', 'bldesk.deb', sha512(PACKAGE_BYTES)]],
  ['a package that does not exist', (box) => ['1', join(box.dir, 'downloads', 'missing.deb'), sha512(PACKAGE_BYTES)]],
  ['a package path with a newline in it', (box) => ['1', `${box.pkg}\n/etc/passwd`, sha512(PACKAGE_BYTES)]]
]) {
  test(`refused, with a FAILED line and nothing installed: ${label}`, () => {
    const box = sandbox()
    try {
      const r = runHelper(box, args(box))
      assert.notEqual(r.status, 0)
      assert.equal(r.out.length, 1, r.out.join('|'))
      assert.match(r.out[0], /^FAILED \S/)
      assert.deepEqual(calls(box).filter((l) => l.startsWith('apt-get')), [])
      assert.equal(existsSync(MARKER), false)
    } finally {
      box.cleanup()
    }
  })
}

test('a package that is not BLDesk is refused even with a matching checksum', () => {
  const box = sandbox({ debPackageField: 'something-else' })
  try {
    const r = runHelper(box, GOOD(box))
    assert.notEqual(r.status, 0)
    assert.equal(r.out.length, 1)
    assert.match(r.out[0], /^FAILED .*not the BLDesk package/)
    assert.deepEqual(calls(box).filter((l) => l.startsWith('apt-get')), [])
  } finally {
    box.cleanup()
  }
})

test('a package with an awkward file name is installed as it is, and not run as a command', () => {
  const box = sandbox({ packageName: `a b'c"d$(touch bldesk-pwned-marker)\`x\`;.deb` })
  try {
    const r = runHelper(box, GOOD(box))
    assert.equal(r.status, 0, r.err)
    assert.deepEqual(r.out, ['AUTHORIZED', 'INSTALLED'])
    assert.equal(existsSync(MARKER), false, 'the file name was run as a command')
  } finally {
    box.cleanup()
  }
})

test('a failed apt-get is reported, exits non-zero, and still removes its copy', () => {
  const box = sandbox({ aptStatus: 100 })
  try {
    const r = runHelper(box, GOOD(box))
    assert.notEqual(r.status, 0)
    assert.deepEqual(r.out, ['AUTHORIZED', 'FAILED apt-get could not install the package'])
    assert.deepEqual(readdirSync(join(box.dir, 'scratch')), [], 'the scratch folder was left behind')
  } finally {
    box.cleanup()
  }
})

test('a refused package leaves no scratch folder behind either', () => {
  const box = sandbox()
  try {
    runHelper(box, ['999999999', box.pkg, sha512(Buffer.from('other'))])
    assert.deepEqual(readdirSync(join(box.dir, 'scratch')), [])
  } finally {
    box.cleanup()
  }
})

test('the scratch folder is created for root alone while the package is copied into it', () => {
  // The copy is made under umask 077 and the folder opened to others only after, so the file is never readable early.
  assert.match(helperSource, /^umask 077$/m)
  const copyAt = helperSource.indexOf('cat -- "$PACKAGE" > "$COPY"')
  const chmodAt = helperSource.indexOf('chmod 755 "$WORK"')
  assert.ok(copyAt > 0 && chmodAt > copyAt, 'the copy must be made before the folder is opened')
})

// ---------------------------------------------------------------------------------------------------------------------
// update-session.sh, with a fake pkexec in place of the real one.

/** A scratch folder with a fake pkexec that behaves as `pkexec` says, and the session script beside where its helper would be. */
function sessionBox({ helperLines = [], pkexecStatus = 0, transform = (text) => text, pathDirs = null } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'bldesk-update-session-'))
  mkdirSync(join(dir, 'bin'))
  const calls = join(dir, 'pkexec-calls.log')
  writeFileSync(
    join(dir, 'bin', 'pkexec'),
    `#!/bin/sh
printf '%s\\n' "$*" >> "${calls}"
${helperLines.map((l) => `echo ${JSON.stringify(l)}`).join('\n')}
echo "pkexec noise on stderr" >&2
exit ${pkexecStatus}
`
  )
  chmodSync(join(dir, 'bin', 'pkexec'), 0o755)
  writeFileSync(join(dir, 'update-session.sh'), transform(sessionSource), { mode: 0o755 })
  // What the relaunch runs: records that it ran, with its arguments.
  writeFileSync(join(dir, 'relaunch.sh'), `#!/bin/sh\nprintf '%s\\n' "$*" >> "${join(dir, 'relaunch.log')}"\n`, { mode: 0o755 })
  return {
    dir,
    out: join(dir, 'session.out'),
    log: join(dir, 'updater.log'),
    pkexecCalls: () => (existsSync(calls) ? readFileSync(calls, 'utf8').trim().split('\n') : []),
    relaunched: () => (existsSync(join(dir, 'relaunch.log')) ? readFileSync(join(dir, 'relaunch.log'), 'utf8').trim() : null),
    run(appPid, relaunch, extra = ['--flag', 'two words']) {
      const r = spawnSync(
        '/bin/sh', // by full path: a test may give the script a PATH without sh on it
        [join(dir, 'update-session.sh'), this.log, this.out, String(appPid), '/home/u/.cache/a b.deb', 'c2hhNTEy', relaunch, join(dir, 'relaunch.sh'), ...extra],
        { env: { PATH: pathDirs ? pathDirs(dir) : `${join(dir, 'bin')}:/usr/bin:/bin` }, encoding: 'utf8' }
      )
      return { status: r.status, stderr: r.stderr }
    },
    cleanup: () => rmSync(dir, { recursive: true, force: true })
  }
}

const DEAD_PID = 999999999
const outLines = (box) => readFileSync(box.out, 'utf8').trim().split('\n')

test('session: an install is reported as installed and BLDesk is opened again, with its own arguments', () => {
  const box = sessionBox({ helperLines: ['AUTHORIZED', 'INSTALLED'] })
  try {
    box.run(DEAD_PID, '1')
    assert.deepEqual(outLines(box), ['AUTHORIZED', 'INSTALLED', 'RESULT installed'])
    assert.equal(box.relaunched(), '--flag two words')
    assert.deepEqual(box.pkexecCalls(), [`--disable-internal-agent ${box.dir}/install-update.sh ${DEAD_PID} /home/u/.cache/a b.deb c2hhNTEy`])
    assert.match(readFileSync(box.log, 'utf8'), /\d{4}-\d\d-\d\dT[\d:.]+Z update session: RESULT installed/)
  } finally {
    box.cleanup()
  }
})

for (const status of [126, 127]) {
  test(`session: pkexec exit ${status} is a cancelled prompt, and BLDesk is not opened a second time`, () => {
    const box = sessionBox({ pkexecStatus: status })
    try {
      // The app that started the session is still running: it never closed, so nothing is opened.
      const app = spawn('sleep', ['5'], { stdio: 'ignore' })
      try {
        box.run(app.pid, '1')
      } finally {
        app.kill()
      }
      assert.deepEqual(outLines(box), ['RESULT cancelled'])
      assert.equal(box.relaunched(), null)
    } finally {
      box.cleanup()
    }
  })
}

test('session: a cancelled install after BLDesk has already closed opens it again, so the user is not left without it', () => {
  const box = sessionBox({ pkexecStatus: 126 })
  try {
    box.run(DEAD_PID, '1')
    assert.deepEqual(outLines(box), ['RESULT cancelled'])
    assert.equal(box.relaunched(), '--flag two words')
  } finally {
    box.cleanup()
  }
})

test('session: a failure carries the helper\'s reason through', () => {
  const box = sessionBox({ helperLines: ['AUTHORIZED', 'FAILED apt-get could not install the package'], pkexecStatus: 1 })
  try {
    box.run(DEAD_PID, '0')
    assert.deepEqual(outLines(box), ['AUTHORIZED', 'FAILED apt-get could not install the package', 'RESULT failed apt-get could not install the package'])
  } finally {
    box.cleanup()
  }
})

test('session: a failure with no reason still says what happened', () => {
  const box = sessionBox({ pkexecStatus: 3 })
  try {
    box.run(DEAD_PID, '0')
    assert.deepEqual(outLines(box), ['RESULT failed the update did not install (exit status 3)'])
  } finally {
    box.cleanup()
  }
})

test('session: exit 0 without INSTALLED is not an install', () => {
  const box = sessionBox({ helperLines: ['AUTHORIZED'], pkexecStatus: 0 })
  try {
    box.run(DEAD_PID, '0')
    assert.match(outLines(box).at(-1), /^RESULT failed /)
  } finally {
    box.cleanup()
  }
})

test('session: an install at quit (RELAUNCH=0) never opens BLDesk', () => {
  const box = sessionBox({ helperLines: ['AUTHORIZED', 'INSTALLED'] })
  try {
    box.run(DEAD_PID, '0')
    assert.deepEqual(outLines(box), ['AUTHORIZED', 'INSTALLED', 'RESULT installed'])
    assert.equal(box.relaunched(), null)
  } finally {
    box.cleanup()
  }
})

test('session: nothing is opened while the old BLDesk is still running, even after an install', () => {
  const box = sessionBox({ helperLines: ['AUTHORIZED', 'INSTALLED'] })
  try {
    const app = spawn('sleep', ['5'], { stdio: 'ignore' })
    try {
      box.run(app.pid, '1')
    } finally {
      app.kill()
    }
    assert.equal(box.relaunched(), null)
  } finally {
    box.cleanup()
  }
})

test('session: pkexec\'s standard error goes to the log, not to the output file BLDesk reads', () => {
  const box = sessionBox({ helperLines: ['AUTHORIZED', 'INSTALLED'] })
  try {
    box.run(DEAD_PID, '0')
    assert.ok(!readFileSync(box.out, 'utf8').includes('noise'))
    assert.match(readFileSync(box.log, 'utf8'), /pkexec noise on stderr/)
  } finally {
    box.cleanup()
  }
})

test('session: it is a script for the user, run by sh, with no way to run anything as root but the helper', () => {
  assert.doesNotMatch(sessionSource, /\bsudo\b|\bsu\b -/, 'the session must not escalate itself')
  const privileged = sessionSource.split('\n').filter((l) => /^\s*pkexec /.test(l))
  assert.equal(privileged.length, 1)
  assert.match(privileged[0], /pkexec --disable-internal-agent "\$HELPER" /)
})

/** A PATH that has the few tools the wrapper itself uses but no pkexec, as on a Plasma install without the pkexec package. */
function pathWithoutPkexec(dir) {
  const bin = join(dir, 'bare')
  mkdirSync(bin, { recursive: true })
  for (const tool of ['date', 'grep', 'sed', 'tail']) symlinkSync(`/usr/bin/${tool}`, join(bin, tool))
  return bin
}

test('session: a system with no pkexec is told so before any prompt, and it is not called a cancelled prompt', () => {
  const box = sessionBox({ pathDirs: pathWithoutPkexec })
  try {
    const app = spawn('sleep', ['5'], { stdio: 'ignore' })
    try {
      box.run(app.pid, '1')
    } finally {
      app.kill()
    }
    assert.deepEqual(outLines(box), ['RESULT unavailable pkexec (part of polkit)'])
    assert.equal(box.pkexecCalls().length, 0)
    assert.equal(box.relaunched(), null)
    assert.match(readFileSync(box.log, 'utf8'), /RESULT unavailable pkexec \(part of polkit\)/)
  } finally {
    box.cleanup()
  }
})

test('session: a missing apt-get or dpkg-deb is reported by name, with pkexec never called', () => {
  const box = sessionBox({
    transform: (text) => text.replace('APT_GET=/usr/bin/apt-get', 'APT_GET=/nonexistent/apt-get').replace('DPKG_DEB=/usr/bin/dpkg-deb', 'DPKG_DEB=/nonexistent/dpkg-deb')
  })
  try {
    box.run(DEAD_PID, '0')
    assert.deepEqual(outLines(box), ['RESULT unavailable apt-get, dpkg-deb'])
    assert.equal(box.pkexecCalls().length, 0)
  } finally {
    box.cleanup()
  }
})

test('session: everything missing is listed in one line', () => {
  const box = sessionBox({
    pathDirs: pathWithoutPkexec,
    transform: (text) => text.replace('APT_GET=/usr/bin/apt-get', 'APT_GET=/nonexistent/apt-get').replace('DPKG_DEB=/usr/bin/dpkg-deb', 'DPKG_DEB=/nonexistent/dpkg-deb')
  })
  try {
    box.run(DEAD_PID, '0')
    assert.deepEqual(outLines(box), ['RESULT unavailable pkexec (part of polkit), apt-get, dpkg-deb'])
  } finally {
    box.cleanup()
  }
})

