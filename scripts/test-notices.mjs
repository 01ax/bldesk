// Third-party notices: which package a bundled module belongs to, what the notices text holds, and that the build and
// packaging are wired to produce and require it. Runs on its own (no build needed): node --test scripts/test-notices.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildNotices, licenceFilesIn, packageFolderOf, productionFolders } from './notices.ts'

const repo = fileURLToPath(new URL('..', import.meta.url))

test('a module id maps to its package folder, whatever the path style', () => {
  const root = '/home/u/bldesk'
  assert.equal(packageFolderOf('/home/u/bldesk/node_modules/react/index.js', root), 'node_modules/react')
  assert.equal(packageFolderOf('/home/u/bldesk/node_modules/@tanstack/react-query/build/modern/index.js', root), 'node_modules/@tanstack/react-query')
  assert.equal(packageFolderOf('/home/u/bldesk/node_modules/a/node_modules/b/lib/x.js', root), 'node_modules/a/node_modules/b')
  // A plugin's virtual module: a \0 prefix and a query.
  assert.equal(packageFolderOf('\0/home/u/bldesk/node_modules/react/index.js?commonjs-module', root), 'node_modules/react')
  // Source files, and packages outside the repository, are not third-party notices.
  assert.equal(packageFolderOf('/home/u/bldesk/src/renderer/src/App.tsx', root), null)
  assert.equal(packageFolderOf('/elsewhere/node_modules/react/index.js', root), null)
  assert.equal(packageFolderOf('/home/u/bldesk/node_modules/', root), null)
  // Windows: backslashes, and a drive letter whose case differs between tools.
  assert.equal(packageFolderOf('C:\\Users\\u\\bldesk\\node_modules\\@scope\\pkg\\a.js', 'C:\\Users\\u\\bldesk'), 'node_modules/@scope/pkg')
  assert.equal(packageFolderOf('c:/Users/u/bldesk/node_modules/react/index.js', 'C:\\Users\\u\\bldesk\\'), 'node_modules/react')
})

test('production folders skip development-only and linked packages', () => {
  const lock = {
    packages: {
      '': { name: 'bldesk' },
      'node_modules/yaml': {},
      'node_modules/vite': { dev: true },
      'node_modules/both': { devOptional: true },
      'node_modules/linked': { link: true },
      'node_modules/a/node_modules/b': {}
    }
  }
  assert.deepEqual(productionFolders(lock), ['node_modules/yaml', 'node_modules/a/node_modules/b'])
})

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'bldesk-notices-'))
  const add = (folder, pkg, files = {}) => {
    const dir = join(root, folder)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg))
    for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text)
  }
  return { root, add }
}

test('the notices hold each package once, with its own text, in a fixed order', () => {
  const { root, add } = fixture()
  try {
    add('node_modules/zeta', { name: 'zeta', version: '1.0.0', license: 'MIT', homepage: 'https://example.test/zeta' }, { LICENSE: 'Copyright zeta\r\nPermission is granted.\r\n' })
    add('node_modules/alpha', { name: 'alpha', version: '2.0.0', license: 'ISC', repository: { url: 'git+https://example.test/alpha.git' } }, { 'LICENSE.md': 'ISC text', NOTICE: 'Notice text', 'readme.md': 'not a licence' })
    add('node_modules/x/node_modules/alpha', { name: 'alpha', version: '2.0.0', license: 'ISC' }, { LICENSE: 'duplicate' })
    add('node_modules/bare', { name: 'bare', version: '0.1.0', license: 'MIT', author: 'A. Author' })
    const folders = ['node_modules/zeta', 'node_modules/alpha', 'node_modules/x/node_modules/alpha', 'node_modules/bare', 'node_modules/not-installed']
    const out = buildNotices(folders, root, 'MIT License\r\n\r\nCopyright (c) 2026 owner\r\n')
    assert.equal(out.count, 3)
    assert.deepEqual(out.noFile, ['bare@0.1.0'])
    assert.deepEqual(out.undeclared, [])
    assert.ok(out.text.startsWith('BLDesk is released under the MIT licence (see LICENSE):\n\nMIT License\n\nCopyright (c) 2026 owner\n'))
    assert.ok(!out.text.includes('\r'), 'line endings are normalised')
    assert.ok(out.text.includes('alpha@2.0.0\nLicense: ISC\nSource: https://example.test/alpha\n\nISC text\n\nNotice text'))
    assert.ok(out.text.includes('zeta@1.0.0\nLicense: MIT\nSource: https://example.test/zeta\n\nCopyright zeta\nPermission is granted.'))
    assert.ok(out.text.includes('bare@0.1.0\nLicense: MIT\nAuthor: A. Author\n\nThis package declares the licence above'))
    assert.ok(!out.text.includes('duplicate') && !out.text.includes('not a licence'))
    assert.ok(out.text.indexOf('alpha@2.0.0') < out.text.indexOf('bare@0.1.0') && out.text.indexOf('bare@0.1.0') < out.text.indexOf('zeta@1.0.0'))
    const packages = (text) => text.slice(text.indexOf('alpha@2.0.0'))
    assert.equal(packages(buildNotices([...folders].reverse(), root, 'MIT License').text), packages(out.text), 'the order does not depend on the input order')
    assert.deepEqual(licenceFilesIn(join(root, 'node_modules/alpha')), ['LICENSE.md', 'NOTICE'])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a package that states no licence is reported, not shipped', () => {
  const { root, add } = fixture()
  try {
    add('node_modules/mystery', { name: 'mystery', version: '9.9.9' })
    const out = buildNotices(['node_modules/mystery'], root, 'MIT License')
    assert.deepEqual(out.undeclared, ['mystery@9.9.9'])
    assert.equal(out.count, 0)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('the build records what it bundles, writes the notices, and packaging requires them', () => {
  const read = (path) => readFileSync(join(repo, path), 'utf8')
  const pkg = JSON.parse(read('package.json'))
  assert.match(pkg.scripts.build, /electron-vite build && node .*scripts\/write-notices\.mjs/, 'npm run build writes the notices after the build')
  const resources = pkg.build.extraResources.map((r) => `${r.from} -> ${r.to}`)
  assert.ok(resources.includes('out/renderer/THIRD_PARTY_NOTICES.txt -> THIRD_PARTY_NOTICES.txt'), 'the notices are packaged beside the app')
  assert.ok(resources.includes('LICENSE -> LICENSE'), 'the licence is packaged beside the app')
  const config = read('electron.vite.config.ts')
  for (const build of ['main', 'preload', 'renderer']) assert.ok(config.includes(`recordBundledModules('${build}')`), `the ${build} build records its modules`)
  const afterPack = read('scripts/after-pack.cjs')
  assert.ok(afterPack.includes('THIRD_PARTY_NOTICES.txt') && afterPack.includes("'LICENSE'"), 'afterPack refuses a package without the notices and the licence')
  assert.match(read('LICENSE'), /^MIT License\n\nCopyright \(c\) 2026 /, 'the repository has its own licence file')
})
