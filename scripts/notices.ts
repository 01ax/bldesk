// Third-party licence notices for the shipped app.
//
// MIT, ISC, BSD and similar licences ask that their text travels with the code. The renderer bundle, and any package
// the main process bundles, have their licence comments stripped by the build, so the build collects the text of every
// package that ends up in a bundle, plus every production dependency that is packaged as a loose module, into one
// THIRD_PARTY_NOTICES.txt. electron.vite.config.ts records what each build bundled (`recordBundledModules`);
// scripts/write-notices.mjs turns that record into the file. No relative imports, so Node and the test
// (scripts/test-notices.mjs) can load it on its own.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const NODE_MODULES = '/node_modules/'

/**
 * The package folder a bundled module id belongs to, relative to `root` with forward slashes (for example
 * `node_modules/react` or `node_modules/@tanstack/react-query`), or null for source that is not in a package. Ids may
 * carry a `\0` prefix or a `?query` suffix (plugins' virtual modules) and, on Windows, backslashes.
 */
export function packageFolderOf(id: string, root: string): string | null {
  const clean = id.replace(/^\0/, '').split('?')[0].replace(/\\/g, '/')
  const at = clean.lastIndexOf(NODE_MODULES)
  if (at < 0) return null
  const rest = clean.slice(at + NODE_MODULES.length).split('/')
  const name = rest[0].startsWith('@') ? `${rest[0]}/${rest[1]}` : rest[0]
  if (!name || name.endsWith('/undefined')) return null
  const folder = `${clean.slice(0, at + NODE_MODULES.length)}${name}`
  const base = root.replace(/\\/g, '/').replace(/\/+$/, '')
  // Windows drive letters differ in case between tools; other paths are compared exactly.
  const fold = /^[A-Za-z]:/.test(base) ? (t: string) => t.toLowerCase() : (t: string) => t
  return fold(folder).startsWith(`${fold(base)}/`) ? folder.slice(base.length + 1) : null
}

const LICENCE_FILE = /^(licen[cs]e|copying|notice|unlicense)(\.[a-z0-9-]+)?$/i

/** The licence and notice files at the top of a package folder, sorted by name. */
export function licenceFilesIn(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true })
    .filter((e) => e.isFile() && LICENCE_FILE.test(e.name))
    .map((e) => e.name)
    .sort()
}

function licenceName(pkg: any): string {
  if (typeof pkg.license === 'string') return pkg.license
  if (pkg.license && typeof pkg.license.type === 'string') return pkg.license.type
  if (Array.isArray(pkg.licenses)) return pkg.licenses.map((l: any) => l.type).filter(Boolean).join(' OR ')
  return 'not stated'
}

function sourceOf(pkg: any): string {
  const repo = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url
  return (pkg.homepage || repo || '').replace(/^git\+/, '').replace(/\.git$/, '')
}

/** Production packages the lockfile lists, as folders relative to the repository root (loose modules in the app). */
export function productionFolders(lock: { packages?: Record<string, any> }): string[] {
  return Object.entries(lock.packages || {})
    .filter(([path, info]) => path.startsWith('node_modules/') && !info.dev && !info.devOptional && !info.link)
    .map(([path]) => path)
}

/**
 * The notices text for `folders` (relative to `root`). Returns { text, count, noFile, undeclared }. `noFile` names
 * packages that declare a licence but ship no licence file, which get an entry saying so (there is no text to copy);
 * `undeclared` names packages that state no licence at all, which the build refuses. A folder that is not installed
 * (an optional package for another platform) is skipped.
 */
export function buildNotices(
  folders: string[],
  root: string,
  ownLicence: string
): { text: string; count: number; noFile: string[]; undeclared: string[] } {
  const sections: string[] = []
  const noFile: string[] = []
  const undeclared: string[] = []
  const seen = new Set<string>()
  for (const folder of [...new Set(folders)].sort()) {
    const dir = join(root, folder)
    if (!existsSync(join(dir, 'package.json'))) continue
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    const id = `${pkg.name}@${pkg.version}`
    if (seen.has(id)) continue
    seen.add(id)
    const licence = licenceName(pkg)
    const source = sourceOf(pkg)
    const head = `${id}\nLicense: ${licence}${source ? `\nSource: ${source}` : ''}`
    const files = licenceFilesIn(dir)
    if (files.length === 0) {
      if (licence === 'not stated') {
        undeclared.push(id)
        continue
      }
      noFile.push(id)
      const author = typeof pkg.author === 'string' ? pkg.author : pkg.author?.name
      sections.push(
        `${head}${author ? `\nAuthor: ${author}` : ''}\n\nThis package declares the licence above in its package.json and ships no licence file, so there is no copyright line or licence text to reproduce here.`
      )
      continue
    }
    const body = files.map((f) => readFileSync(join(dir, f), 'utf8').replace(/\r\n/g, '\n').trim()).join('\n\n')
    sections.push(`${head}\n\n${body}`)
  }
  const rule = '='.repeat(78)
  const intro = [
    'BLDesk is released under the MIT licence (see LICENSE):',
    '',
    ownLicence.replace(/\r\n/g, '\n').trim(),
    '',
    rule,
    'BLDesk includes the third-party software below, each under its own licence. This file is generated by the build',
    '(scripts/write-notices.mjs) from the packages that are bundled into the app or packaged with it.',
    rule
  ].join('\n')
  return { text: `${intro}\n\n${sections.join(`\n\n${rule}\n\n`)}\n`, count: sections.length, noFile, undeclared }
}
