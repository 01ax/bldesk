// Real Electron + OpenSSH + node-pty against a disposable loopback SSH protocol
// fixture. No production account, SSH config, known_hosts, agent or cloud access.
// The server implements a small deterministic command set, NOT a VPS shell.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import ssh2 from 'ssh2'
const { Server, utils } = ssh2
const require = createRequire(import.meta.url)
const pw = await import(process.env.BLDESK_PLAYWRIGHT_MODULE || 'playwright')
const electron = pw._electron || pw.default?._electron
const root = resolve(import.meta.dirname, '..')
const dir = mkdtempSync(join(tmpdir(), 'bldesk-terminal-smoke-'))
const key = join(dir, 'identity')
execFileSync('/usr/bin/ssh-keygen', ['-t', 'ed25519', '-N', '', '-f', key, '-q'])
const publicKey = utils.parseKey(readFileSync(`${key}.pub`))
const secondKey = join(dir, 'identity-second')
execFileSync('/usr/bin/ssh-keygen', ['-t', 'ed25519', '-N', '', '-f', secondKey, '-q'])
const secondPublicKey = utils.parseKey(readFileSync(`${secondKey}.pub`))
const clients = new Set()
const report = { connections: 0, authenticated: 0, passwords: 0, commands: [], sizes: [], output: dir }
const makeFixture = (identity, acceptedKey) => new Server({ hostKeys: [readFileSync(identity)] }, (client) => {
  report.connections++
  clients.add(client)
  client.on('error', () => {}).on('close', () => clients.delete(client))
  client.on('authentication', (ctx) => {
    if (ctx.username === 'password' && ctx.method === 'password' && ctx.password === 'smoke-password') { report.passwords++; ctx.accept(); return }
    if (ctx.username !== 'password' && ctx.method === 'publickey' && ctx.key.data.equals(acceptedKey.getPublicSSH()) && (!ctx.signature || acceptedKey.verify(ctx.blob, ctx.signature) === true)) { ctx.accept(); return }
    ctx.reject(ctx.username === 'password' ? ['password'] : ['publickey'])
  }).on('ready', () => {
    report.authenticated++
    client.on('session', (accept) => {
      const session = accept()
      let rows = 24, cols = 80
      session.on('pty', (accept, _reject, info) => { rows = info.rows; cols = info.cols; report.sizes.push([rows, cols]); accept() })
      session.on('window-change', (accept, _reject, info) => { rows = info.rows; cols = info.cols; report.sizes.push([rows, cols]); accept?.() })
      session.on('exec', (accept, _reject, info) => {
        report.commands.push(info.command)
        const stream = accept()
        // Delay enough to exercise parallel startup; preserve real SSH exit status.
        setTimeout(() => { stream.write(`fixture-${report.commands.length}\n`); stream.exit(info.command === 'exit 7' ? 7 : 0); stream.end() }, 350)
      })
      session.on('shell', (accept) => {
        const stream = accept(); stream.write('BLDesk disposable SSH fixture\r\nfixture$ ')
        let line = ''
        stream.on('data', (data) => {
          for (const ch of data.toString()) {
            if (ch === '\r' || ch === '\n') {
              stream.write('\r\n'); report.commands.push(line)
              if (line === 'uname -a') stream.write(execFileSync('/usr/bin/uname', ['-a']).toString().replaceAll('\n', '\r\n'))
              else if (line === 'stty size') stream.write(`${rows} ${cols}\r\n`)
              else if (line === 'exit') { stream.exit(0); stream.end(); return }
              else if (line) stream.write(`marker:${line}\r\n`)
              line = ''; stream.write('fixture$ ')
            } else if (ch === '\u007f') line = line.slice(0, -1)
            else { line += ch; stream.write(ch) }
          }
        })
      })
    })
  })
})
const fixture = makeFixture(key, publicKey)
const secondFixture = makeFixture(secondKey, secondPublicKey)
await new Promise((r) => fixture.listen(0, '127.0.0.1', r))
const port = fixture.address().port
await new Promise((resolve, reject) => { secondFixture.once('error', reject); secondFixture.listen(0, '127.0.0.1', resolve) })
const secondPort = secondFixture.address().port
const config = join(dir, 'ssh-config')
writeFileSync(config, `Host *\n  HostName 127.0.0.1\n  Port ${port}\n  IdentityFile ${key}\n  IdentitiesOnly yes\n  IdentityAgent none\n  UserKnownHostsFile ${join(dir, 'known_hosts')}\n  GlobalKnownHostsFile /dev/null\n  StrictHostKeyChecking ask\n  ForwardAgent no\n  ClearAllForwardings yes\n  ConnectTimeout 5\n`)
const bin = join(dir, 'bin'); mkdirSync(bin)
writeFileSync(join(bin, 'ssh'), `#!/bin/sh\nexec /usr/bin/ssh -F '${config}' "$@"\n`, { mode: 0o755 })
const userData = join(dir, 'userData'); mkdirSync(userData)
const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, BLDESK_TEST_USER_DATA: userData, BLDESK_TEST_KEY: key }
let app, page
const errors = []
const deep = (url) => page.evaluate((url) => window.dispatchEvent(new CustomEvent('bldesk:local-deep-link', { detail: url })), url)
async function launch() {
  app = await electron.launch({ executablePath: process.env.BLDESK_TEST_ELECTRON || require('electron'), args: [join(root, 'scripts/showcase/launcher.cjs')], env, timeout: 30000 })
  page = await app.firstWindow(); page.setDefaultTimeout(15000)
  page.on('pageerror', (e) => errors.push(e.stack || e.message))
  await page.getByText('edge-web-syd-01', { exact: true }).first().waitFor()
  await deep('bldesk://tab/terminal')
}
async function textContains(text) { await page.waitForFunction((text) => [...document.querySelectorAll('.xterm-rows')].some((e) => e.textContent.includes(text)), text) }
async function send(id, text) { await page.evaluate(([id, text]) => window.bldeskApi.pty.write(id, text), [id, text]) }
async function current() { return page.evaluate(() => window.bldeskApi.pty.list()) }
async function reachable(locator, label) {
  await locator.scrollIntoViewIfNeeded()
  const box = await locator.boundingBox()
  const viewport = page.viewportSize() || await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))
  assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height, `${label} is not reachable: ${JSON.stringify({ box, viewport })}`)
}
async function until(predicate) {
  const deadline = Date.now() + 15000
  while (!(await predicate())) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for async SSH/History condition')
    await new Promise((r) => setTimeout(r, 100))
  }
}
async function answerHostKey(id) {
  await page.waitForFunction(() => [...document.querySelectorAll('.xterm-rows')].some((e) => /Are you sure|fixture\$/.test(e.textContent)))
  const prompt = await page.locator('.xterm-rows').allTextContents()
  if (prompt.some((s) => s.includes('Are you sure'))) await send(id, 'yes\r')
}
try {
  await launch()
  await page.getByLabel('SSH host', { exact: true }).fill('192.0.2.20')
  await page.getByLabel('SSH port', { exact: true }).fill(String(port))
  await page.getByLabel('SSH key', { exact: true }).selectOption(key)
  await page.getByRole('button', { name: 'Connect in BLDesk', exact: true }).click()
  await page.getByRole('tab', { name: /edge-web-syd-01.*live/ }).waitFor()
  let id = (await current())[0].id
  await answerHostKey(id)
  await textContains('fixture$')
  await send(id, 'uname -a\r'); await textContains('Darwin')
  await send(id, 'needle-scrollback\r'); await textContains('marker:needle-scrollback')
  await deep('bldesk://tab/servers'); assert.equal((await current()).length, 1)
  await deep('bldesk://tab/terminal'); await textContains('marker:needle-scrollback')
  await page.locator('.xterm-helper-textarea').first().focus()
  await page.keyboard.press('Meta+f')
  await page.getByLabel('Find in terminal').fill('needle-scrollback')
  await page.getByRole('button', { name: 'Find next', exact: true }).click()
  assert.equal(await page.getByText('No match', { exact: true }).count(), 0)
  await page.getByLabel('Close terminal search').click()
  // Actual native zoom, not CSS scaling. Keep screenshot evidence outside repo.
  for (const [width, height] of [[1024, 680], [1280, 840]]) for (const zoom of [0.8, 1, 1.25, 1.5]) {
    await app.evaluate(({ BrowserWindow }, { width, height, zoom }) => { const w = BrowserWindow.getAllWindows()[0]; w.setSize(width, height); w.webContents.setZoomFactor(zoom) }, { width, height, zoom })
    await page.waitForTimeout(250)
    await send(id, 'stty size\r')
    await reachable(page.getByRole('tab', { name: /edge-web-syd-01/ }), 'session tab')
    const terminalNav = page.getByRole('button', { name: 'Embedded SSH', exact: true })
    if (!(await terminalNav.isVisible())) await page.getByTitle('Open Navigation Menu').click()
    await reachable(terminalNav, 'terminal navigation')
    // Selecting the current tab also closes the compact drawer.
    if (await page.getByTitle('Open Navigation Menu').isVisible()) await terminalNav.click()
    await page.getByLabel('New SSH session').click()
    await reachable(page.getByRole('button', { name: 'Open in native terminal', exact: true }), 'connect-bar native action')
    await page.getByLabel('New SSH session').click()
    await page.locator('.xterm-helper-textarea').first().focus()
    await page.keyboard.press('Meta+f')
    await reachable(page.getByLabel('Find in terminal'), 'terminal find bar')
    await page.getByLabel('Close terminal search').click()
    const box = await page.locator('[data-testid="terminal-view"] .xterm-screen').first().boundingBox()
    assert.ok(box && box.width > 100 && box.height > 50, JSON.stringify({ width, height, zoom, box }))
    await page.screenshot({ path: join(dir, `terminal-${width}-${height}-${zoom}.png`) })
  }
  assert.ok(new Set(report.sizes.map(String)).size > 3, 'SSH window-change must track native resize/zoom')
  await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.setSize(1280, 840); w.webContents.setZoomFactor(1) })
  await page.getByLabel('Close SSH edge-web-syd-01', { exact: true }).click()
  await until(async () => (await current()).length === 0)
  // Password path: deliberately select a user for which the fixture rejects keys.
  await page.getByLabel('New SSH session').click()
  await page.getByLabel('SSH user', { exact: true }).fill('password')
  await page.getByRole('button', { name: 'Connect in BLDesk', exact: true }).click()
  id = (await current())[0].id
  await textContains('password:')
  await send(id, 'smoke-password\r'); await textContains('fixture$')
  assert.equal(report.passwords, 1)
  await page.getByLabel('Close SSH edge-web-syd-01', { exact: true }).click()
  await page.getByLabel('New SSH session').click()
  await page.getByLabel('SSH user', { exact: true }).fill('root')
  // Native override is stubbed, never opens the user's terminal.
  await page.getByRole('button', { name: 'Open in native terminal', exact: true }).click()
  assert.equal(await app.evaluate(() => global.showcase.nativeLaunches.length), 1)
  await page.getByRole('button', { name: 'Broadcast', exact: true }).click()
  await page.getByLabel('Broadcast targets').fill('#8100,#8101')
  await page.getByLabel('Broadcast command').fill('hostname')
  // The new destructive dialog remains operable throughout the supported
  // native zoom/viewport matrix; cancel each dry run so nothing executes.
  for (const [width, height] of [[1024, 680], [1280, 840]]) for (const zoom of [0.8, 1.25, 1.5]) {
    await app.evaluate(({ BrowserWindow }, { width, height, zoom }) => { const w = BrowserWindow.getAllWindows()[0]; w.setSize(width, height); w.webContents.setZoomFactor(zoom) }, { width, height, zoom })
    await page.getByRole('button', { name: 'Run broadcast', exact: true }).click()
    await reachable(page.getByRole('button', { name: /Run on all targets/ }), 'broadcast confirm action')
    await reachable(page.getByRole('button', { name: /Cancel/ }), 'broadcast cancel action')
    await page.getByRole('button', { name: /Cancel/ }).click()
  }
  await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.setSize(1280, 840); w.webContents.setZoomFactor(1) })
  const sixTargets = '#8100,#8101,#8102,#8103,#8104,#8105'
  await page.getByLabel('Broadcast targets').fill(sixTargets)
  await page.getByRole('button', { name: 'Run broadcast', exact: true }).click()
  const typedConfirm = page.getByRole('dialog').locator('input')
  assert.equal(await page.getByRole('button', { name: /Run on all targets/ }).isDisabled(), true)
  await typedConfirm.fill(sixTargets)
  assert.equal(await page.getByRole('button', { name: /Run on all targets/ }).isEnabled(), true)
  await page.getByRole('button', { name: /Cancel/ }).click()
  await page.getByLabel('Broadcast targets').fill('#8100,#8101')
  await page.getByRole('button', { name: 'Run broadcast', exact: true }).click()
  await page.getByRole('dialog').waitFor()
  await page.getByRole('button', { name: /Run on all targets/ }).click()
  await until(() => page.evaluate(async () => (await window.bldeskApi.changelogList('showcase-demo')).some((e) => e.label === 'Broadcast SSH command' && e.outcome === 'completed')))
  assert.equal(await page.getByText('exit 0', { exact: true }).count(), 2)
  assert.equal(report.commands.filter((c) => c === 'hostname').length, 2)
  const history = await page.evaluate(() => window.bldeskApi.changelogList('showcase-demo'))
  assert.ok(history[0].summary.includes('hostname'))
  assert.ok(!JSON.stringify(history).includes('fixture-'))
  await page.getByRole('button', { name: 'Close broadcast', exact: true }).click()
  // Two tabs, full app restart, no auto-connect.
  await page.getByRole('button', { name: 'Connect in BLDesk', exact: true }).click()
  await textContains('fixture$')
  await page.getByLabel('New SSH session').click()
  await page.getByLabel('SSH host', { exact: true }).fill('192.0.2.21')
  await page.getByRole('button', { name: 'Connect in BLDesk', exact: true }).click()
  await until(async () => (await current()).length === 2)
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('bldesk_terminal_tabs_v1')))
  assert.equal(stored.length, 2)
  assert.deepEqual(Object.keys(stored[0]).sort(), ['host', 'serverId', 'serverName', 'username'])
  await app.close(); app = undefined
  const before = report.connections
  await launch()
  await page.getByLabel('Reopen SSH sessions').waitFor()
  assert.equal(await page.getByRole('button', { name: 'Reopen 2 sessions' }).count(), 1)
  await page.waitForTimeout(500)
  assert.equal(report.connections, before)
  assert.equal((await current()).length, 0)
  await page.getByRole('button', { name: 'Dismiss', exact: true }).click()
  // Same real OpenSSH client and production IPC, two loopback hosts accepting
  // different generated keys. The second key is present locally throughout the
  // positive and negative cases; only the associations differ.
  // macOS exposes only 127.0.0.1 by default. Route the second documentation
  // address to a second port; leave identity arguments entirely untouched.
  writeFileSync(join(bin, 'ssh'), `#!/bin/sh\nfor arg do\n  if [ "$arg" = 'root@192.0.2.21' ]; then\n    exec /usr/bin/ssh -p ${secondPort} -F '${config}' "$@"\n  fi\ndone\nexec /usr/bin/ssh -F '${config}' "$@"\n`, { mode: 0o755 })
  writeFileSync(join(dir, 'known_hosts'), `[127.0.0.1]:${port} ${readFileSync(`${key}.pub`, 'utf8')}[127.0.0.1]:${secondPort} ${readFileSync(`${secondKey}.pub`, 'utf8')}`)
  await app.evaluate(({ ipcMain }, paths) => {
    ipcMain.removeHandler('vault:getLocalSshKeys')
    ipcMain.handle('vault:getLocalSshKeys', () => paths.map((privateKeyPath, i) => ({ name: `Loopback key ${i + 1}`, privateKeyPath, publicKey: '' })))
  }, [key, secondKey])
  for (const [serverId, path] of [[8100, key], [8101, secondKey]]) {
    await deep(`bldesk://server/${serverId}/remote-access`)
    await page.getByLabel('Key for this server', { exact: true }).selectOption(path)
    await page.getByText('Set by hand', { exact: true }).waitFor()
    for (const [width, height] of [[1024, 680], [1280, 840]]) for (const zoom of [0.8, 1.25, 1.5]) {
      await app.evaluate(({ BrowserWindow }, { width, height, zoom }) => { const w = BrowserWindow.getAllWindows()[0]; w.setSize(width, height); w.webContents.setZoomFactor(zoom) }, { width, height, zoom })
      await reachable(page.getByLabel('Key for this server', { exact: true }), 'per-server key selector')
      await reachable(page.getByLabel('Connect to', { exact: true }), 'per-server address selector')
    }
  }
  await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.setSize(1280, 840); w.webContents.setZoomFactor(1) })
  // Associations survive a full Electron restart, not just a React rerender.
  await app.close(); app = undefined
  await launch()
  await app.evaluate(({ ipcMain }, paths) => {
    ipcMain.removeHandler('vault:getLocalSshKeys')
    ipcMain.handle('vault:getLocalSshKeys', () => paths.map((privateKeyPath, i) => ({ name: `Loopback key ${i + 1}`, privateKeyPath, publicKey: '' })))
  }, [key, secondKey])
  await page.getByLabel('SSH server', { exact: true }).selectOption('8101')
  await until(async () => (await page.getByLabel('SSH key', { exact: true }).inputValue()) === secondKey)
  assert.ok((await page.getByLabel('SSH key', { exact: true }).locator('..').innerText()).includes('Key (associated)'))
  await page.getByLabel('SSH port', { exact: true }).fill(String(port))
  await page.getByRole('button', { name: 'Broadcast', exact: true }).click()
  await page.getByLabel('Broadcast targets').fill('#8100,#8101')
  await page.getByLabel('Broadcast command').fill('hostname')
  await page.getByRole('cell', { name: 'Loopback key 1', exact: true }).waitFor()
  await page.getByRole('cell', { name: 'Loopback key 2', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Run broadcast', exact: true }).click()
  await page.getByRole('button', { name: /Run on all targets/ }).click()
  await until(async () => await page.getByText('exit 0', { exact: true }).count() === 2)
  await until(() => page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem('bldesk_ssh_keys_showcase-demo') || '{}')
    return stored.sources?.[8100] === 'learned' && stored.sources?.[8101] === 'learned'
  }))
  // Clear associations AND last-working fallback, but leave both keys available.
  await page.getByRole('button', { name: 'Close broadcast', exact: true }).click()
  await page.evaluate(() => { localStorage.removeItem('bldesk_ssh_keys_showcase-demo'); window.dispatchEvent(new Event('bldesk:ssh-key-associations')) })
  await page.getByRole('button', { name: 'Broadcast', exact: true }).click()
  await page.getByLabel('Broadcast targets').fill('#8100,#8101')
  await page.getByLabel('Broadcast command').fill('hostname')
  assert.equal(await page.getByRole('cell', { name: 'ssh default', exact: true }).count(), 2)
  await page.getByRole('button', { name: 'Run broadcast', exact: true }).click()
  await page.getByRole('button', { name: /Run on all targets/ }).click()
  await page.getByText('exit 255', { exact: true }).waitFor()
  await page.getByText('exit 0', { exact: true }).waitFor()
  report.twoKeyBroadcast = 'associated: 0/0; cleared with both keys present: 0/255'
  await page.getByRole('button', { name: 'Close broadcast', exact: true }).click()
  // Address proof independent of the key test: keep the same accepted key for
  // both targets. Only the alias maps to the reachable loopback interface.
  writeFileSync(join(bin, 'ssh'), `#!/bin/sh\nexec /usr/bin/ssh -F '${config}' "$@"\n`, { mode: 0o755 })
  writeFileSync(config, `Host private-web\n  HostName 127.0.0.1\nHost 192.0.2.21\n  HostName 127.0.0.2\n${readFileSync(config, 'utf8')}`)
  await deep('bldesk://server/8101/remote-access')
  await page.getByLabel('Connect to', { exact: true }).selectOption('custom')
  await page.getByLabel('Custom SSH host', { exact: true }).fill('private-web')
  for (const [width, height] of [[1024, 680], [1280, 840]]) for (const zoom of [0.8, 1.25, 1.5]) {
    await app.evaluate(({ BrowserWindow }, { width, height, zoom }) => { const w = BrowserWindow.getAllWindows()[0]; w.setSize(width, height); w.webContents.setZoomFactor(zoom) }, { width, height, zoom })
    await reachable(page.getByLabel('Custom SSH host', { exact: true }), 'custom address input')
  }
  await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.setSize(1280, 840); w.webContents.setZoomFactor(1) })
  await app.close(); app = undefined
  await launch()
  await page.getByLabel('Default SSH address', { exact: true }).selectOption('name')
  await page.getByLabel('SSH server', { exact: true }).selectOption('8100')
  await until(async () => await page.getByLabel('SSH host', { exact: true }).inputValue() === 'edge-web-syd-01')
  await page.getByLabel('Default SSH address', { exact: true }).selectOption('public')
  await page.getByLabel('SSH server', { exact: true }).selectOption('8101')
  await until(async () => await page.getByLabel('SSH host', { exact: true }).inputValue() === 'private-web')
  // Inspect native handoffs without opening the user's terminal. Both the deep
  // link (also used by tray) and row button must resolve the persisted alias.
  await page.getByLabel('Prefer native terminal', { exact: true }).check()
  await deep('bldesk://ssh/8101')
  await until(() => app.evaluate(() => global.showcase.nativeLaunches?.length === 1))
  assert.equal(await app.evaluate(() => global.showcase.nativeLaunches[0].host), 'private-web')
  await deep('bldesk://tab/servers')
  await page.getByRole('button', { name: 'All Servers', exact: true }).click()
  await page.getByRole('row').filter({ hasText: 'api-syd-01' }).getByTitle('Open SSH', { exact: true }).click()
  await until(() => app.evaluate(() => global.showcase.nativeLaunches?.length === 2))
  assert.equal(await app.evaluate(() => global.showcase.nativeLaunches[1].host), 'private-web')
  await deep('bldesk://tab/terminal')
  await page.getByLabel('Prefer native terminal', { exact: true }).uncheck()
  await page.getByLabel('SSH port', { exact: true }).fill(String(port))
  for (const overridden of [true, false]) {
    if (!overridden) {
      await deep('bldesk://server/8101/remote-access')
      await page.getByLabel('Connect to', { exact: true }).selectOption('')
      await deep('bldesk://tab/terminal')
    }
    await page.getByRole('button', { name: 'Broadcast', exact: true }).click()
    await page.getByLabel('Broadcast targets').fill('#8100,#8101')
    await page.getByLabel('Broadcast command').fill('hostname')
    await page.getByRole('cell', { name: overridden ? 'private-web' : '192.0.2.21', exact: true }).waitFor()
    await page.getByRole('button', { name: 'Run broadcast', exact: true }).click()
    await page.getByRole('button', { name: /Run on all targets/ }).click()
    if (overridden) await until(async () => await page.getByText('exit 0', { exact: true }).count() === 2)
    else { await page.getByText('exit 255', { exact: true }).waitFor(); await page.getByText('exit 0', { exact: true }).waitFor() }
    await page.getByRole('button', { name: 'Close broadcast', exact: true }).click()
  }
  report.hostOverride = 'custom alias: 0/0; cleared with identities unchanged: 0/255'
  assert.deepEqual(errors, [])
  console.log('PASS', JSON.stringify(report))
} catch (error) {
  console.error('FAIL', JSON.stringify(report), errors)
  if (page && !page.isClosed()) {
    console.error(await page.locator('[data-testid="terminal-view"]').innerText())
    await page.screenshot({ path: join(dir, 'failure.png') })
  }
  throw error
} finally {
  if (app) await app.close()
  for (const client of clients) client.end()
  await Promise.all([new Promise((r) => fixture.close(r)), new Promise((r) => secondFixture.close(r))])
}
