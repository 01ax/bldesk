import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const patch = '@capacitor+android+8.5.2.patch'
const relative = 'node_modules/@capacitor/android'
const files = ['CapacitorHttpUrlConnection.java', 'HttpRequestHandler.java'].map(name => `capacitor/src/main/java/com/getcapacitor/plugin/util/${name}`)
const cli = join(root, 'node_modules/patch-package/index.js')
const read = path => readFileSync(path, 'utf8').replace(/\r\n/g, '\n')
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'bh196-'))
  const temporaryRoot = resolve(tmpdir()) + sep
  assert.ok(resolve(dir).startsWith(temporaryRoot))
  t.after(() => { assert.ok(resolve(dir).startsWith(temporaryRoot)); rmSync(dir, { recursive: true, force: true }) })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'native-http-patch-fixture', version: '1.0.0', devDependencies: { '@capacitor/android': '8.5.2' } }))
  mkdirSync(join(dir, 'patches'))
  copyFileSync(join(root, 'patches', patch), join(dir, 'patches', patch))
  mkdirSync(join(dir, relative), { recursive: true })
  copyFileSync(join(root, relative, 'package.json'), join(dir, relative, 'package.json'))
  for (const file of files) {
    const destination = join(dir, relative, file)
    mkdirSync(dirname(destination), { recursive: true })
    copyFileSync(join(root, relative, file), destination)
  }
  const apply = (...args) => spawnSync(process.execPath, [cli, '--error-on-fail', ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, CI: 'true' } })
  const reverse = apply('--reverse')
  assert.equal(reverse.status, 0, reverse.stdout + reverse.stderr)
  return { dir, apply, contents: () => files.map(file => read(join(dir, relative, file))) }
}

test('the pinned native patch is mandatory before native dependency setup', () => {
  const pkg = JSON.parse(read(join(root, 'package.json')))
  assert.equal(pkg.devDependencies['@capacitor/android'], '8.5.2')
  assert.equal(pkg.devDependencies['patch-package'], '8.0.1')
  assert.equal(pkg.scripts.postinstall, 'patch-package --error-on-fail && electron-builder install-app-deps')
  const diff = read(join(root, 'patches', patch))
  assert.equal((diff.match(/^diff --git /gm) || []).length, 2)
  const [body, request] = files.map(file => read(join(root, relative, file)))
  assert.match(body, /byte\[\] bytes = body\.getBytes\(StandardCharsets\.UTF_8\);[\s\S]*setFixedLengthStreamingMode\(bytes\.length\);[\s\S]*getOutputStream\(\)[\s\S]*os\.write\(bytes\)/)
  assert.match(request, /setRequestBody\(call, data, dataType\);\s*} else \{\s*connection\.getHttpConnection\(\)\.setFixedLengthStreamingMode\(0\)/)
})

test('the dependency patch reapplies to clean sources and is idempotent', t => {
  const { apply, contents } = fixture(t)
  const before = contents()
  assert.ok(!before[0].includes('setFixedLengthStreamingMode(bytes.length)'))
  const result = apply()
  assert.equal(result.status, 0, result.stdout + result.stderr)
  const patched = files.map(file => read(join(root, relative, file)))
  assert.deepEqual(contents(), patched)
  assert.equal(apply().status, 0)
  assert.deepEqual(contents(), patched)
})

test('an incompatible dependency source fails the patch instead of silently building without it', t => {
  const { dir, apply, contents } = fixture(t)
  writeFileSync(join(dir, relative, files[0]), 'package fixture;\nclass IncompatibleSource {}\n')
  const before = contents()
  const result = apply()
  assert.notEqual(result.status, 0)
  assert.deepEqual(contents(), before)
})
