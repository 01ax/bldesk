#!/usr/bin/env node
// Start the mock BinaryLane API and BLDesk against it, in a fresh isolated data directory. See README.md.
//
//   node scripts/gui-test/launch.mjs [--name NAME] [--mock-port 8443] [--cdp-port 9333] [--bin PATH] [--mock-only] [--http]
//   node scripts/gui-test/launch.mjs --name NAME --stop
//
// Nothing here can reach the real BinaryLane API: the app's hostnames resolve to the mock and every other host fails to
// resolve. The token is random and only the mock accepts it. Your own BLDesk settings and vault are never touched.
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createConnection } from 'node:net'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { stateDir } from './lib.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '../..')
const HOSTS = ['api.binarylane.com.au', 'uai.adamhomenet.com', 'github.com', 'api.github.com']

const args = {}
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i]
  if (!a.startsWith('--')) continue
  const next = process.argv[i + 1]
  args[a.slice(2)] = next && !next.startsWith('--') ? (i++, next) : true
}
const name = String(args.name || 'default')
const mockPort = Number(args['mock-port'] || 8443)
const cdpPort = Number(args['cdp-port'] || 9333)
const dir = stateDir(name)
const statePath = join(dir, 'state.json')

const kill = (pid) => {
  if (!pid) return
  try {
    if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' })
    else process.kill(pid)
  } catch { /* already gone */ }
}
const readState = () => { try { return JSON.parse(readFileSync(statePath, 'utf8')) } catch { return null } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const portOpen = (port) => new Promise((ok) => {
  const s = createConnection({ port, host: '127.0.0.1' }, () => { s.destroy(); ok(true) })
  s.on('error', () => ok(false))
})
async function waitFor(check, what, ms = 20000) {
  const end = Date.now() + ms
  while (Date.now() < end) { if (await check()) return; await sleep(250) }
  throw new Error(`Timed out waiting for ${what}. See the logs in ${dir}`)
}

const previous = readState()
if (previous) { kill(previous.appPid); kill(previous.mockPid) }
if (args.stop) {
  console.log(previous ? `Stopped "${name}".` : `Nothing recorded for "${name}".`)
  process.exit(0)
}

function findOpenssl() {
  if (process.env.OPENSSL) return process.env.OPENSSL
  const candidates = ['openssl', 'C:\\Program Files\\Git\\usr\\bin\\openssl.exe', 'C:\\Program Files\\Git\\mingw64\\bin\\openssl.exe']
  for (const c of candidates) {
    try { execFileSync(c, ['version'], { stdio: 'ignore' }); return c } catch { /* next */ }
  }
  throw new Error('OpenSSL is needed once per run to make a throwaway certificate for the mock. Install it, or set OPENSSL to its path (Git for Windows includes one).')
}

rmSync(dir, { recursive: true, force: true })
mkdirSync(dir, { recursive: true })
const userData = join(dir, 'userdata')
const token = randomBytes(32).toString('hex')
writeFileSync(join(dir, 'token.txt'), token, { mode: 0o600 })

const cert = join(dir, 'cert.pem')
const key = join(dir, 'key.pem')
if (!args.http) {
  execFileSync(findOpenssl(), ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '7',
    '-subj', '/CN=api.binarylane.com.au', '-addext', `subjectAltName=${HOSTS.map((h) => `DNS:${h}`).join(',')}`], { stdio: 'ignore' })
}

const mockLog = join(dir, 'mock.log')
const mockOut = openSync(join(dir, 'mock.out'), 'w')
const mock = spawn(process.execPath, [join(HERE, 'mock.mjs')], {
  detached: true,
  stdio: ['ignore', mockOut, mockOut],
  env: { ...process.env, PORT: String(mockPort), MOCK_TOKEN: token, CERT: cert, KEY: key, LOG: mockLog, ...(args.http ? { HTTP: '1' } : {}) }
})
mock.unref()
await waitFor(() => portOpen(mockPort), `the mock on port ${mockPort}`)

let appPid = null
if (!args['mock-only']) {
  const electron = join(ROOT, 'node_modules', 'electron', 'dist',
    process.platform === 'win32' ? 'electron.exe' : process.platform === 'darwin' ? 'Electron.app/Contents/MacOS/Electron' : 'electron')
  const bin = args.bin ? String(args.bin) : electron
  if (!args.bin && !existsSync(join(ROOT, 'out', 'main', 'index.js'))) throw new Error('No build found. Run "npm run build" first, or pass --bin with the path to an installed BLDesk.')
  const rules = [...HOSTS.map((h) => `MAP ${h} 127.0.0.1:${mockPort}`), 'MAP * ~NOTFOUND', 'EXCLUDE 127.0.0.1'].join(',')
  const flags = [`--user-data-dir=${userData}`, `--remote-debugging-port=${cdpPort}`, `--host-resolver-rules=${rules}`, '--ignore-certificate-errors']
  // Without a working keyring BLDesk offers to save the token unencrypted, which is what the sign-in script ticks.
  if (process.platform === 'linux') flags.push('--password-store=basic')
  const appOut = openSync(join(dir, 'app.log'), 'w')
  const app = spawn(bin, [...(args.bin ? [] : [ROOT]), ...flags], { detached: true, stdio: ['ignore', appOut, appOut], cwd: ROOT })
  app.unref()
  appPid = app.pid
  await waitFor(async () => { try { return (await fetch(`http://127.0.0.1:${cdpPort}/json/version`)).ok } catch { return false } }, `the app's debugging port ${cdpPort}`)
}

writeFileSync(statePath, JSON.stringify({ name, dir, userData, mockPort, cdpPort, http: !!args.http, mockPid: mock.pid, appPid, mockLog }, null, 2))
console.log(`Mock API: ${args.http ? 'http' : 'https'}://127.0.0.1:${mockPort}  (log: ${mockLog})`)
if (appPid) console.log(`App: pid ${appPid}, debugging port ${cdpPort}. Next: node scripts/gui-test/signin.mjs${name === 'default' ? '' : ` --name ${name}`}`)
console.log(`Stop with: node scripts/gui-test/launch.mjs --name ${name} --stop`)
