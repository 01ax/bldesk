// Structural guard for auto-updater: prevents regression of unsigned macOS
// auto-update support, Squirrel.Mac code signing traps, and quit handlers.
import ts from 'typescript'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { runInNewContext } from 'node:vm'

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

// 6. Test bash syntax of the script installMacUpdate writes out and runs. Its
// template is read from updater.ts, so the check cannot drift from what ships,
// and filled with stand-in values once for each forceRunAfter branch.
let scriptTemplate = null
const updaterAst = ts.createSourceFile(updaterFile, updaterContent, ts.ScriptTarget.Latest, true)
function findScriptTemplate(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(updaterAst) === 'scriptContent' && node.initializer && ts.isTemplateLiteral(node.initializer)) {
    scriptTemplate = node.initializer.getText(updaterAst)
  }
  ts.forEachChild(node, findScriptTemplate)
}
findScriptTemplate(updaterAst)
if (!scriptTemplate) {
  failures.push('updater.ts: installMacUpdate must build its script as "const scriptContent = `...`" so the guard can syntax-check the script that ships')
} else {
  for (const forceRunAfter of [true, false]) {
    try {
      const script = runInNewContext(scriptTemplate, {
        process: { pid: 99999 },
        zipPath: '/tmp/Update.zip',
        stagingDir: '/tmp/Staging',
        stagedApp: '/tmp/Staging/BLDesk.app',
        targetApp: '/tmp/Test.app',
        forceRunAfter
      })
      execFileSync('bash', ['-n'], { input: script, stdio: ['pipe', 'pipe', 'pipe'] })
    } catch (err) {
      failures.push(`installMacUpdate script (forceRunAfter=${forceRunAfter}) failed the bash syntax check, or could not be built (a new variable in its template needs a stand-in value in this guard): ${err.message}`)
    }
  }
}

if (failures.length > 0) {
  console.error('Updater guards failed:\n' + failures.map((f) => `  - ${f}`).join('\n'))
  process.exit(1)
}

console.log('Updater guards passed')
