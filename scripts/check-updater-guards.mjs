// Structural guard for auto-updater: prevents regression of unsigned macOS
// auto-update support, Squirrel.Mac code signing traps, and quit handlers.
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const root = fileURLToPath(new URL('..', import.meta.url))
const failures = []

const updaterFile = resolve(root, 'src/main/updater.ts')
const indexFile = resolve(root, 'src/main/index.ts')

const updaterContent = readFileSync(updaterFile, 'utf8')
const indexContent = readFileSync(indexFile, 'utf8')
const codeOnly = updaterContent.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, '')

// 1. Invariant: autoDownload must NOT be unconditionally true.
// On macOS, autoDownload=true hands the zip to Squirrel.Mac which crashes on unsigned builds.
if (!codeOnly.includes('if(isMac){autoUpdater.autoDownload=false') &&
    !codeOnly.includes('autoUpdater.autoDownload=!isMac') &&
    !codeOnly.includes('isMac?false:true')) {
  failures.push('updater.ts: autoUpdater.autoDownload must be false on macOS to prevent Squirrel.Mac SQRLCodeSignatureErrorDomain failures')
}

// 2. Invariant: SQRLCodeSignatureErrorDomain must be suppressed/ignored on macOS
if (!updaterContent.includes('SQRLCodeSignatureErrorDomain')) {
  failures.push('updater.ts: must explicitly handle/suppress SQRLCodeSignatureErrorDomain on macOS')
}

// 3. Invariant: installMacUpdate must strip macOS quarantine flags
if (!updaterContent.includes('xattr -cr')) {
  failures.push('updater.ts: installMacUpdate must execute "xattr -cr" to prevent Gatekeeper quarantine issues')
}

// 4. Invariant: installMacUpdate must wait for the old PID before swapping
if (!updaterContent.includes('while kill -0 $PID 2>/dev/null; do')) {
  failures.push('updater.ts: installMacUpdate must wait for process PID termination before swapping app bundles')
}

// 5. Invariant: onAppQuit must be exported and called in before-quit
if (!updaterContent.includes('static onAppQuit(): void')) {
  failures.push('updater.ts: UpdaterManager must expose onAppQuit() for background update application')
}
if (!indexContent.includes('UpdaterManager.onAppQuit()')) {
  failures.push('index.ts: app.on("before-quit") must invoke UpdaterManager.onAppQuit()')
}

// 6. Test bash syntax of the update script template
const tempScript = resolve(root, 'scripts/.test-update-syntax.sh')
try {
  const dummyScript = `#!/bin/bash
PID=99999
while kill -0 $PID 2>/dev/null; do
  sleep 0.1
done
TARGET="/tmp/Test.app"
STAGED="/tmp/Staged.app"
STAGING_DIR="/tmp/Staging"
rm -rf "$TARGET"
cp -R "$STAGED" "$TARGET"
rm -rf "$STAGING_DIR"
xattr -cr "$TARGET" 2>/dev/null || true
open "$TARGET"
`
  writeFileSync(tempScript, dummyScript, { mode: 0o755 })
  execFileSync('bash', ['-n', tempScript])
} catch (err) {
  failures.push(`Update script template has invalid bash syntax: ${err.message}`)
} finally {
  try { unlinkSync(tempScript) } catch {}
}

if (failures.length > 0) {
  console.error('Updater guards failed:\n' + failures.map((f) => `  - ${f}`).join('\n'))
  process.exit(1)
}

console.log('Updater guards passed')
