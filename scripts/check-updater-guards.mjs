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
        shQuote: (word) => `'${word}'`,
        forceRunAfter
      })
      execFileSync('bash', ['-n'], { input: script, stdio: ['pipe', 'pipe', 'pipe'] })
    } catch (err) {
      failures.push(`installMacUpdate script (forceRunAfter=${forceRunAfter}) failed the bash syntax check, or could not be built (a new variable in its template needs a stand-in value in this guard): ${err.message}`)
    }
  }
  failures.push(...installOrderProblems(scriptTemplate))
}

// 7. The installed app may only be swapped out by renaming, once the new bundle has unzipped and been copied next to
// it: unzip's exit status must be acted on, and no recursive rm may name the installed app, directly or through a
// variable set to it. Plain-text checks on the script template, with its bash comments removed. They cannot follow
// the script's logic, so these still pass: an exit status that is captured and tested wrongly, a removal through a
// path built another way (a subfolder of the app, `$(...)`, `find -delete`), a rename of the app to a folder that is
// deleted later, or a copy over the installed app.
function installOrderProblems(template) {
  const problems = []
  const lines = template.split('\n').map((l) => l.replace(/(^|\s)#.*$/, ''))
  const appRefs = new Set(['${targetApp}', '${shQuote(targetApp)}'])
  for (const l of lines) {
    const alias = l.match(/^\s*([A-Za-z_]\w*)=(?:(["']?)\$\{targetApp\}\2|\$\{shQuote\(targetApp\)\})\s*$/)
    if (alias) appRefs.add('$' + alias[1])
  }
  const lead = new Set(['if', 'elif', 'then', 'else', 'do', 'while', 'until', '!', '{', '(', 'command', 'exec'])
  const commands = (line) =>
    line.split(/&&|\|\||[;|]/).map((seg) => {
      const words = seg.trim().split(/\s+/).filter(Boolean)
      const tested = []
      while (words.length && lead.has(words[0])) tested.push(words.shift())
      return { words, tested }
    })
  let unzipChecked = false
  lines.forEach((line, i) => {
    for (const { words, tested } of commands(line)) {
      const name = (words[0] || '').split('/').pop()
      if (name === 'rm') {
        const opts = []
        const operands = []
        for (const w of words.slice(1)) (w.startsWith('-') && !operands.length ? opts : operands).push(w)
        const recursive = opts.some((o) => o === '--recursive' || (/^-[^-]/.test(o) && /[rR]/.test(o)))
        const names = operands.map((o) => o.replace(/^(["'])(.*)\1$/, '$2').replace(/\/+$/, ''))
        if (recursive && names.some((n) => appRefs.has(n))) {
          problems.push(`updater.ts: the installMacUpdate script removes the installed app ("${line.trim()}"); copy the new bundle next to it and swap the two by renaming instead`)
        }
      }
      if (name === 'unzip') {
        const next = lines.slice(i + 1).find((l) => l.trim())
        const captured = next && next.match(/^\s*([A-Za-z_]\w*)=\$\?\s*$/)
        const usedLater = captured && lines.slice(i + 2).some((l) => new RegExp(`\\$${captured[1]}\\b`).test(l))
        if (tested.some((t) => ['if', 'elif', 'while', 'until', '!'].includes(t)) || /&&|\|\|/.test(line) || usedLater) unzipChecked = true
      }
    }
  })
  if (!unzipChecked) {
    problems.push('updater.ts: the installMacUpdate script must act on unzip\'s exit status (in an if, with && or ||, or saved with VAR=$? on the next line and tested) before it replaces the installed app')
  }
  return problems
}

// 8. Installing a Linux package update. The library's own install (`pkexec /bin/bash -c 'dpkg -i <file>'`) froze the
// window for about ten seconds, asked for permission to run a shell, and installed a file from a folder the user can write
// to. BLDesk's own helper replaces it, and these checks keep the pieces that make it safe in place and in agreement. Like
// check 7 they read the text of the scripts, so they cannot follow the logic: the behaviour is in
// scripts/test-linux-update-scripts.mjs.
const linuxDir = resolve(root, 'linux')
const helperText = readFileSync(resolve(linuxDir, 'update/install-update.sh'), 'utf8')
const sessionText = readFileSync(resolve(linuxDir, 'update/update-session.sh'), 'utf8')
const policyText = readFileSync(resolve(linuxDir, 'com.termau.bldesk.policy'), 'utf8')
const afterInstallText = readFileSync(resolve(linuxDir, 'after-install.sh'), 'utf8')
const linuxInstallText = readFileSync(resolve(root, 'src/main/linuxInstall.ts'), 'utf8')
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
const shellCode = (text) => text.split('\n').map((l) => l.replace(/(^|\s)#.*$/, '')).join('\n')

for (const [name, text, shell] of [
  ['linux/update/install-update.sh', helperText, ['sh', 'dash']],
  ['linux/update/update-session.sh', sessionText, ['sh', 'dash']],
  ['linux/after-install.sh', afterInstallText, ['bash']]
]) {
  for (const sh of shell) {
    try {
      execFileSync(sh, ['-n'], { input: text, stdio: ['pipe', 'pipe', 'pipe'] })
    } catch (err) {
      if (err.code !== 'ENOENT') failures.push(`${name} failed the ${sh} syntax check: ${String(err.stderr || err.message).trim()}`)
    }
  }
}

const helperCode = shellCode(helperText)
if (!/\bset -eu\b/.test(helperCode)) failures.push('install-update.sh: must run under `set -eu`')
if (/\bdpkg\s+-i\b|\bbash\s+-c\b|\bsh\s+-c\b|\beval\b/.test(helperCode)) {
  failures.push('install-update.sh: runs as root, so it must not run a shell command string, eval, or `dpkg -i` (apt-get installs, and resolves dependencies)')
}
const at = (re) => helperCode.search(re)
const order = [
  ['the copy, read as the user, into the root-only folder', /"\$SETPRIV" --reuid="\$PKEXEC_UID"[^\n]*head -c[^\n]*"\$PACKAGE" > "\$COPY"/],
  ['the checksum comparison', /"\$ACTUAL" = "\$WANT"/],
  ['the package-name check', /Package 2>\/dev\/null\)" = bldesk/],
  ['opening the checked copy to apt-get', /chmod 755 "\$WORK"/],
  ['say AUTHORIZED', /say AUTHORIZED/],
  ['the wait for BLDesk to exit', /kill -0 "\$APP_PID"/],
  ['the install', /"\$APT_GET" install/]
]
let previous = -1
for (const [label, re] of order) {
  const index = at(re)
  if (index < 0) failures.push(`install-update.sh: ${label} is missing`)
  else if (index < previous) failures.push(`install-update.sh: ${label} is out of order: the file is copied, then checked, then authorised, then BLDesk is waited for, then installed`)
  else previous = index
}
// The package path is chosen by whoever runs the helper and can be swapped at any moment: root must never open it.
if (/\bcat\b[^\n]*"\$PACKAGE"|<\s*"\$PACKAGE"|\bcp\b[^\n]*"\$PACKAGE"|\bsha512sum\b[^\n]*"\$PACKAGE"/.test(helperCode)) {
  failures.push('install-update.sh: must not open the package path as root (read it through "$SETPRIV" as the user, into the root-only copy)')
}
if (!/sha512sum/.test(helperCode)) failures.push('install-update.sh: must check the package against its SHA-512 checksum')

// Where the helper ends up must be where the policy names it: the app's folder (APP_DIR in after-install.sh), then
// resources/linux, which is where build.linux.extraResources (checked below) and updateScriptPaths put it. The session
// script finds the helper beside itself.
const appDir = afterInstallText.match(/^APP_DIR='([^']+)'$/m)?.[1]
const policyPath = policyText.match(/org\.freedesktop\.policykit\.exec\.path">([^<]+)</)?.[1]
if (!appDir) failures.push('after-install.sh: APP_DIR was not found, so the helper\'s installed path cannot be checked against the policy')
if (!policyPath) failures.push('com.termau.bldesk.policy: the exec.path annotation was not found')
if (appDir && policyPath && policyPath !== `${appDir}/resources/linux/install-update.sh`) {
  failures.push(`com.termau.bldesk.policy names ${policyPath}, but the package installs the helper at ${appDir}/resources/linux/install-update.sh`)
}
if (!/^HELPER=\$\{0%\/\*\}\/install-update\.sh$/m.test(sessionText)) {
  failures.push('update-session.sh: HELPER must be `${0%/*}/install-update.sh`, the helper beside the script')
}
if (!/helper: posix\.join\(resourcesPath, 'linux', 'install-update\.sh'\)/.test(linuxInstallText) || !/session: posix\.join\(resourcesPath, 'linux', 'update-session\.sh'\)/.test(linuxInstallText)) {
  failures.push('linuxInstall.ts: updateScriptPaths must name resources/linux/install-update.sh and update-session.sh, where the package puts them')
}
const privileged = shellCode(sessionText).split('\n').filter((l) => /^\s*pkexec\b/.test(l))
if (privileged.length !== 1 || !/pkexec --disable-internal-agent "\$HELPER"/.test(privileged[0])) {
  failures.push('update-session.sh: its one pkexec call must run "$HELPER" and nothing else')
}
const sessionCode = shellCode(sessionText)
if (!/command -v pkexec(?![\w-])/.test(sessionCode) || !/RESULT unavailable/.test(sessionCode) || sessionCode.search(/command -v pkexec(?![\w-])/) > sessionCode.search(/^\s*pkexec\b/m)) {
  failures.push('update-session.sh: must check that pkexec, apt-get and dpkg-deb exist, and report `RESULT unavailable`, before it calls pkexec')
}
const untrustedCall = sessionCode.search(/^if untrusted;/m)
if (!/^untrusted\(\)/m.test(sessionCode) || !/RESULT untrusted/.test(sessionCode) || untrustedCall < 0 || untrustedCall > sessionCode.search(/^\s*pkexec\b/m)) {
  failures.push('update-session.sh: must check that the helper and the folders above it belong to root and cannot be written by others (`RESULT untrusted`) before it calls pkexec')
}
if (!/<allow_active>auth_admin<\/allow_active>/.test(policyText) || /<allow_(any|inactive|active)>(yes|auth_self)</.test(policyText)) {
  failures.push('com.termau.bldesk.policy: installing an update must need an administrator\'s password (auth_admin), never yes or auth_self')
}

// The package ships all of it, to the paths the scripts use.
const linuxBuild = packageJson.build?.linux?.extraResources ?? []
if (!linuxBuild.some((r) => r.from === 'linux/update' && r.to === 'linux')) {
  failures.push('package.json: build.linux.extraResources must copy linux/update to the resources folder\'s linux/ (the helper\'s path)')
}
if (!(packageJson.build?.deb?.fpm ?? []).includes('linux/com.termau.bldesk.policy=/usr/share/polkit-1/actions/com.termau.bldesk.policy')) {
  failures.push('package.json: build.deb.fpm must install linux/com.termau.bldesk.policy to /usr/share/polkit-1/actions/')
}
if (!/chmod go-w "\$APP_DIR" "\$APP_DIR\/resources" "\$APP_DIR\/resources\/linux"/.test(afterInstallText)) {
  failures.push('after-install.sh: the app folder, its resources folder and linux/ (what root runs, and the folders on the way to it) must not be writable by group or others')
}
if (!/chmod 0755 "\$APP_DIR\/resources\/linux"/.test(afterInstallText) || !/chmod 0644 \/usr\/share\/polkit-1\/actions\/com\.termau\.bldesk\.policy/.test(afterInstallText)) {
  failures.push('after-install.sh: must make the helper and its folder writable by root alone (0755) and the policy 0644, whatever umask the package was built under')
}

// updater.ts: a Linux package never reaches the library's blocking install.
if (!codeOnly.includes('autoUpdater.autoInstallOnAppQuit=!isLinuxPackage')) {
  failures.push('updater.ts: autoInstallOnAppQuit must be off for a Linux package (`= !isLinuxPackage`), or quitting installs through the library\'s blocking pkexec flow')
}
const linuxBranch = codeOnly.search(/if\(isLinuxPackage\)\{(?:void)?this\.installLinuxPackage\(\);?return\}/)
if (linuxBranch < 0 || linuxBranch > codeOnly.indexOf('quitAndInstall(')) {
  failures.push('updater.ts: install() must hand a Linux package to installLinuxPackage() before it reaches autoUpdater.quitAndInstall')
}

// Restart looks at the feed once more before it asks for the password (see installLinuxPackage).
if (!/installLinuxPackage\(\):Promise<void>\{[\s\S]*?this\.checkNow\(\)[\s\S]*?this\.startLinuxSession\(true\)/.test(codeOnly)) {
  failures.push('updater.ts: installLinuxPackage() must call checkNow() (the last look at the feed) before startLinuxSession(true)')
}

if (failures.length > 0) {
  console.error('Updater guards failed:\n' + failures.map((f) => `  - ${f}`).join('\n'))
  process.exit(1)
}

console.log('Updater guards passed')
