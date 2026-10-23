// Tests for linux/after-remove.sh, the script the .deb runs when the package is removed or upgraded: what it takes away
// must depend on what dpkg is doing. On an upgrade dpkg runs it from the OLD version, and the new version's
// after-install.sh puts the AppArmor profile back at the end of the install, so removing the profile there leaves
// BLDesk without one for as long as the install takes.
// node --experimental-strip-types --no-warnings --test scripts/test-linux-package-scripts.mjs
//
// The script is read from linux/, its absolute paths are pointed into a scratch folder, and apparmor_parser,
// update-alternatives and update-desktop-database are replaced by programs that record their arguments. readlink and rm
// are the real ones.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// release.yml runs the whole typecheck on Windows and macOS runners too; these run bash with Linux paths and symlinks.
const linuxOnly = process.platform === 'linux' ? {} : { skip: 'runs the Linux package scripts, which need Linux' }

const scriptPath = process.env.AFTER_REMOVE ?? fileURLToPath(new URL('../linux/after-remove.sh', import.meta.url))
const script = readFileSync(scriptPath, 'utf8')

/** Run the script as dpkg would with `action`, in a fresh sandbox, and report what it did. */
function run(action) {
  const dir = mkdtempSync(join(tmpdir(), 'bldesk-after-remove-'))
  try {
    for (const sub of ['etc/apparmor.d', 'usr/bin', 'usr/share/applications', 'shims']) mkdirSync(join(dir, sub), { recursive: true })
    writeFileSync(join(dir, 'etc/apparmor.d/bldesk'), 'profile bldesk {}\n')
    symlinkSync('/opt/BLDesk/bldesk', join(dir, 'usr/bin/bldesk')) // the link after-install.sh makes (dangling here, which readlink does not mind)
    for (const cmd of ['apparmor_parser', 'update-alternatives', 'update-desktop-database']) {
      writeFileSync(join(dir, 'shims', cmd), `#!/bin/sh\nprintf '%s\\n' "${cmd} $*" >> "${dir}/calls.log"\n`)
      chmodSync(join(dir, 'shims', cmd), 0o755)
    }
    const sandboxed = script
      .replaceAll('/etc/apparmor.d/bldesk', join(dir, 'etc/apparmor.d/bldesk'))
      .replaceAll('/usr/bin/bldesk', join(dir, 'usr/bin/bldesk'))
      .replaceAll('/usr/share/applications', join(dir, 'usr/share/applications'))
    let status = 0
    try {
      execFileSync('bash', ['-s', action, '1.0.99'], { input: sandboxed, env: { PATH: `${join(dir, 'shims')}:/usr/bin:/bin` }, stdio: ['pipe', 'pipe', 'pipe'] })
    } catch (err) {
      status = err.status
    }
    const calls = existsSync(join(dir, 'calls.log')) ? readFileSync(join(dir, 'calls.log'), 'utf8').trim().split('\n') : []
    return {
      status,
      calls: calls.map((c) => c.replace(dir, '')),
      profile: existsSync(join(dir, 'etc/apparmor.d/bldesk')),
      link: (() => { try { return lstatSync(join(dir, 'usr/bin/bldesk')).isSymbolicLink() } catch { return false } })()
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('an upgrade leaves the AppArmor profile and the /usr/bin link alone', linuxOnly, () => {
  const r = run('upgrade')
  assert.equal(r.status, 0)
  assert.equal(r.profile, true, 'the profile was deleted during the upgrade')
  assert.equal(r.link, true)
  assert.deepEqual(r.calls.filter((c) => c.startsWith('apparmor_parser')), [], 'the profile was unloaded during the upgrade')
  assert.deepEqual(r.calls.filter((c) => c.startsWith('update-alternatives')), [])
})

for (const action of ['failed-upgrade', 'abort-install', 'abort-upgrade', 'disappear']) {
  test(`${action} does not take the profile away either`, linuxOnly, () => {
    const r = run(action)
    assert.equal(r.status, 0)
    assert.equal(r.profile, true)
    assert.deepEqual(r.calls.filter((c) => c.startsWith('apparmor_parser')), [])
  })
}

for (const action of ['remove', 'purge']) {
  test(`${action} unloads and deletes the profile, and takes the /usr/bin link away`, linuxOnly, () => {
    const r = run(action)
    assert.equal(r.status, 0)
    assert.equal(r.profile, false)
    assert.equal(r.link, false)
    assert.deepEqual(r.calls.filter((c) => c.startsWith('apparmor_parser')), ['apparmor_parser -R /etc/apparmor.d/bldesk'])
    assert.deepEqual(r.calls.filter((c) => c.startsWith('update-alternatives')), ['update-alternatives --remove bldesk /opt/BLDesk/bldesk'])
  })
}

test('the desktop database is refreshed whatever dpkg is doing', linuxOnly, () => {
  for (const action of ['upgrade', 'remove', 'purge']) {
    assert.ok(run(action).calls.some((c) => c.startsWith('update-desktop-database')), action)
  }
})

test('after-install.sh rebuilds the MIME database only if the package ships a MIME file', () => {
  // update-mime-database rebuilds the whole database (about six seconds, on every install and upgrade). dpkg's own trigger
  // on /usr/share/mime/packages does it for a package that ships a file there, so the script has no reason to.
  const afterInstall = readFileSync(process.env.AFTER_INSTALL ?? fileURLToPath(new URL('../linux/after-install.sh', import.meta.url)), 'utf8')
  const code = afterInstall.split('\n').filter((line) => !/^\s*#/.test(line)).join('\n')
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  const shipsMimeFile = JSON.stringify(manifest.build?.deb ?? {}).includes('/usr/share/mime/')
  assert.equal(/update-mime-database/.test(code), shipsMimeFile)
})

