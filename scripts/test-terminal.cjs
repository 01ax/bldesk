// Dependency-free runner (using the project's TypeScript compiler) for the
// shared argv, registry, and main IPC owner. No real processes or cloud access.
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve, dirname } = require('node:path')
const ts = require('typescript')
const root = resolve(__dirname, '..')
const cache = new Map()
const handlers = new Map(), sent = [], children = []
const renderer = { mainFrame: {}, isDestroyed: () => false, send: (...args) => sent.push(args) }
let sshPath = '/usr/bin/ssh'
const stubs = {
  electron: { ipcMain: { handle: (name, cb) => handlers.set(name, cb) } },
  'node-pty': { spawn: (exe, args, options) => {
    const p = { exe, args, options, writes: [], sizes: [], killed: false, disposed: 0,
      onData(cb) { this.data = cb; return { dispose: () => this.disposed++ } },
      onExit(cb) { this.exit = cb; return { dispose: () => this.disposed++ } },
      write(data) { this.writes.push(data) }, resize(cols, rows) { this.sizes.push([cols, rows]) },
      kill(signal) { this.killed = true; this.signal = signal; this.exit({ exitCode: 0, signal: 1 }) } }
    children.push(p); return p
  } },
  [resolve(root, 'src/main/terminal.ts')]: { findOnPath: () => sshPath }
}
function load(file) {
  if (stubs[file]) return stubs[file]
  if (cache.has(file)) return cache.get(file).exports
  const module = { exports: {} }; cache.set(file, module)
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('require', 'module', 'exports', code)((name) => {
    if (stubs[name]) return stubs[name]
    if (name.startsWith('.') || name.startsWith('@shared/')) {
      let path = name.startsWith('@shared/') ? resolve(root, 'src/shared', name.slice(8)) : resolve(dirname(file), name)
      if (!path.endsWith('.ts')) path += '.ts'
      return load(path)
    }
    return require(name)
  }, module, module.exports)
  return module.exports
}
const storage = new Map()
global.localStorage = { getItem: (k) => storage.get(k) || null, setItem: (k, v) => storage.set(k, v) }
const ssh = load(resolve(root, 'src/shared/ssh.ts'))
const commands = load(resolve(root, 'src/renderer/src/lib/commands.ts'))
const registry = load(resolve(root, 'src/renderer/src/lib/terminalSessions.ts'))
const owner = load(resolve(root, 'src/main/pty.ts'))
async function main() {
  const options = { host: '127.0.0.1', username: 'root', privateKeyPath: '/tmp/key with spaces', port: 2222, cols: 80, rows: 24 }
  const command = 'printf "%s\\n" "$(hostname)"; exit 7'
  assert.deepEqual(ssh.sshArgv(options, command), ['ssh', '-p', '2222', '-i', '/tmp/key with spaces', '-o', 'IdentitiesOnly=yes', 'root@127.0.0.1', command])
  assert.deepEqual(ssh.sshArgv({ host: 'localhost' }), ['ssh', 'root@localhost'])
  assert.ok(ssh.validateSshTarget({ host: '-oProxyCommand=bad' }))
  assert.equal(commands.parseCommand('ssh web --native').native, true)
  assert.equal(commands.parseCommand('ssh web --wrong').kind, 'incomplete')
  const fleet = [1, 2, 3, 4].map((id) => ({ id, name: `web-${id}`, status: id === 3 ? 'archive' : 'active', networks: { v4: id === 4 ? [] : [{ type: 'public', ip_address: `192.0.2.${id}` }] } }))
  const targets = registry.broadcastTargets('@prod,web-*,@missing,@empty', fleet, { 1: ['prod'] }, [{ name: 'empty', serverIds: [], pattern: '' }])
  assert.deepEqual(targets.eligible.map((s) => s.server.id), [1, 2])
  assert.equal(targets.skipped.length, 2)
  assert.deepEqual(targets.unmatched, ['@missing', '@empty'])
  registry.rememberOpenSessions([{ ...options, serverId: 1, serverName: 'Test', output: 'SECRET', remoteCommand: 'SECRET' }])
  assert.deepEqual(Object.keys(registry.recallOpenSessions()[0]).sort(), ['host', 'serverId', 'serverName', 'username'])
  assert.ok(![...storage.values()][0].includes('SECRET'))
  owner.registerPtyHandlers(() => ({ webContents: renderer, isDestroyed: () => false }))
  const event = { sender: renderer, senderFrame: renderer.mainFrame }
  for (const handler of handlers.values()) assert.throws(() => handler({ sender: {}, senderFrame: {} }), /restricted/)
  await assert.rejects(owner.open({ ...options, cols: 0 }), /dimensions/)
  await assert.rejects(owner.open({ ...options, host: 42 }), /Invalid SSH/)
  await assert.rejects(owner.open({ ...options, remoteCommand: 'x\0y' }), /NUL/)
  sshPath = null
  await assert.rejects(owner.open(options), /OpenSSH client not found/)
  sshPath = '/usr/bin/ssh'
  const { id } = await handlers.get('pty:open')(event, { ...options, remoteCommand: command })
  assert.equal(children[0].exe, '/usr/bin/ssh')
  assert.equal(children[0].args.at(-1), command)
  assert.equal(children[0].options.env.TERM, 'xterm-256color')
  handlers.get('pty:write')(event, id, 'password\r')
  handlers.get('pty:resize')(event, id, 100, 30)
  assert.deepEqual(children[0].writes, ['password\r'])
  assert.deepEqual(children[0].sizes, [[100, 30]])
  children[0].data('first'); children[0].data('second')
  assert.equal(sent.length, 0)
  await new Promise((r) => setTimeout(r, 25))
  assert.deepEqual(sent[0], ['pty:data', id, 'firstsecond'])
  children[0].data('last')
  children[0].exit({ exitCode: 7 })
  assert.deepEqual(sent.slice(-2), [['pty:data', id, 'last'], ['pty:exit', id, 7, undefined]])
  assert.equal(children[0].disposed, 2)
  assert.equal(owner.list().length, 0)
  await Promise.all(Array.from({ length: 32 }, () => owner.open(options)))
  await assert.rejects(owner.open(options), /32 SSH sessions/)
  owner.closeAll()
  assert.equal(owner.list().length, 0)
  assert.ok(children.slice(1).every((c) => c.killed))
  assert.ok(children.slice(1).every((c) => c.signal === (process.platform === 'win32' ? undefined : 'SIGHUP')))
  const associations = load(resolve(root, 'src/renderer/src/lib/sshKeyAssociations.ts'))
  const keys = ['a', 'b'].map((name) => ({ name, privateKeyPath: `/tmp/${name}`, publicKey: '' }))
  global.window = new EventTarget()
  assert.equal(associations.resolveKeyFor('profile-a', 1, keys), undefined, 'must not select first local key')
  associations.setKeyAssociation('profile-a', 1, '/tmp/a', 'learned', keys)
  associations.setKeyAssociation('profile-a', 2, '/tmp/b', 'manual', keys)
  assert.equal(associations.resolveKeyFor('profile-a', 2, keys), '/tmp/b')
  assert.equal(associations.resolveKeyFor('profile-a', 3, keys), '/tmp/a')
  assert.equal(associations.resolveKeyFor('profile-b', 1, keys), undefined)
  assert.equal(associations.keyAssociationSource('profile-a', 2), 'manual')
  assert.equal(associations.resolveKeyFor('profile-a', 2, keys.slice(0, 1)), '/tmp/a')
  associations.setKeyAssociation('profile-a', 3, '/tmp/a', 'manual', keys.slice(0, 1))
  assert.equal(associations.loadKeyAssociations('profile-a')[2], undefined, 'next write prunes stale paths')
  associations.setKeyAssociation('profile-a', 1, null, 'manual', [])
  assert.equal(associations.lastWorkingKey('profile-a'), undefined)
  storage.set('bldesk_ssh_keys_broken', '{bad json')
  assert.deepEqual(associations.loadKeyAssociations('broken'), {})

  const hostServer = { ...fleet[0], name: 'private-web', networks: { v4: [{ type: 'public', ip_address: '192.0.2.10' }] } }
  assert.equal(associations.resolveConnection('hosts', hostServer, keys).host, '192.0.2.10')
  associations.setDefaultSshAddress('hosts', 'name')
  assert.equal(associations.resolveConnection('hosts', hostServer, keys).origin.host, 'default-name')
  assert.equal(associations.resolveConnection('hosts', hostServer, keys).host, 'private-web')
  assert.equal(associations.resolveConnection('other', hostServer, keys).host, '192.0.2.10')
  associations.setServerConnectAddress('hosts', 1, { mode: 'public' })
  assert.equal(associations.resolveConnection('hosts', hostServer, keys).host, '192.0.2.10')
  associations.setServerConnectAddress('hosts', 1, { mode: 'name' })
  const fallback = associations.resolveConnection('hosts', { ...hostServer, name: 'invalid name' }, keys)
  assert.equal(fallback.host, '192.0.2.10'); assert.ok(fallback.warning)
  associations.setServerConnectAddress('hosts', 1, { mode: 'custom', host: 'web.tailnet.example' })
  associations.setKeyAssociation('hosts', 1, '/tmp/b', 'learned', keys)
  const combined = associations.resolveConnection('hosts', hostServer, keys)
  assert.equal(combined.host, 'web.tailnet.example'); assert.equal(combined.privateKeyPath, '/tmp/b')
  assert.deepEqual(combined.origin, { host: 'custom', key: 'associated' })
  associations.setDefaultSshAddress('hosts', 'public')
  assert.equal(associations.resolveConnection('hosts', hostServer, keys).host, 'web.tailnet.example')
  for (const host of ['', '-oProxyCommand=bad', 'name with spaces', 'root@host']) {
    associations.setServerConnectAddress('hosts', 1, { mode: 'custom', host })
    assert.ok(ssh.validateSshTarget(associations.resolveConnection('hosts', hostServer, keys)))
  }
  associations.setServerConnectAddress('hosts', 1, { mode: 'custom', host: 'private-only' })
  const privateServer = { ...hostServer, networks: { v4: [] } }
  assert.equal(registry.broadcastTargets('#1', [privateServer], {}, [], (s) => associations.resolveConnection('hosts', s, keys).host).eligible.length, 1)
  associations.setServerConnectAddress('hosts', 1, null)
  assert.equal(registry.broadcastTargets('#1', [privateServer], {}, [], (s) => associations.resolveConnection('hosts', s, keys).host).skipped[0].reason, 'invalid connect address')
  assert.equal(associations.resolveConnection('hosts', hostServer, keys).privateKeyPath, '/tmp/b', 'address writes preserve keys')

  let onExit, nextId = 0, earlyExit
  window.bldeskApi = { getLocalSshKeys: async () => keys, pty: {
    onData() {}, onExit(cb) { onExit = cb }, list: async () => [],
    open: async () => { const id = `renderer-${++nextId}`; if (earlyExit !== undefined) onExit(id, earlyExit); return { id } },
    close: async (id) => onExit(id, 0, 1)
  } }
  const realSetTimeout = global.setTimeout, realClearTimeout = global.clearTimeout
  let now = 0, timerId = 0
  const timers = new Map()
  global.setTimeout = (cb, delay) => { const id = ++timerId; timers.set(id, { cb, at: now + delay }); return id }
  global.clearTimeout = (id) => timers.delete(id)
  const advance = async (ms) => { now += ms; for (const [id, t] of timers) if (t.at <= now) { timers.delete(id); t.cb() }; await Promise.resolve() }
  const open = (serverId, profileId = 'learning') => registry.createTerminal({ ...options, privateKeyPath: '/tmp/b', serverId }, profileId)
  try {
    await open(1)
    await advance(9999)
    assert.equal(associations.loadKeyAssociations('learning')[1], undefined)
    await advance(1)
    assert.equal(associations.loadKeyAssociations('learning')[1], '/tmp/b')
    assert.equal(associations.lastWorkingKey('learning'), '/tmp/b')
    const failed = await open(2)
    await advance(3000); onExit(failed, 255)
    await advance(10000)
    assert.equal(associations.loadKeyAssociations('learning')[2], undefined)
    const short = await open(3, 'original-profile')
    onExit(short, 7); await Promise.resolve()
    assert.equal(associations.loadKeyAssociations('original-profile')[3], '/tmp/b')
    assert.equal(associations.loadKeyAssociations('learning')[3], undefined)
    const closed = await open(4)
    await registry.closeTerminal(closed); await advance(10000)
    assert.equal(associations.loadKeyAssociations('learning')[4], undefined)
    earlyExit = 0; await open(5); await Promise.resolve()
    assert.equal(associations.loadKeyAssociations('learning')[5], '/tmp/b', 'exit before open resolves still learns')
    earlyExit = 255; await open(6); await advance(10000)
    assert.equal(associations.loadKeyAssociations('learning')[6], undefined)
  } finally { global.setTimeout = realSetTimeout; global.clearTimeout = realClearTimeout }
  console.log('PASS: SSH argv, native syntax, target expansion, persistence whitelist, IPC ownership, validation, batching, exit ordering, resize, 32-session cap, cleanup')
}
main().catch((e) => { console.error(e); process.exitCode = 1 })
