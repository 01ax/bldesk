// Writes THIRD_PARTY_NOTICES.txt after the build. See scripts/notices.ts for what goes in it.
//
//   node --experimental-strip-types --no-warnings scripts/write-notices.mjs
//
// It reads out/bundled-modules.json, which electron.vite.config.ts writes during `electron-vite build`, so it only
// works after a build (`npm run build` does both). The file lands in out/renderer, which is what the desktop app's
// resources and the Android app's web assets are made from.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildNotices, productionFolders } from './notices.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const recordPath = join(root, 'out', 'bundled-modules.json')
const fail = (message) => {
  console.error(`write-notices: ${message}`)
  process.exit(1)
}

if (!existsSync(recordPath)) fail('out/bundled-modules.json is missing. Run `npm run build`, which records what the build bundled first.')
const record = JSON.parse(readFileSync(recordPath, 'utf8'))
for (const build of ['main', 'preload', 'renderer']) {
  if (!Array.isArray(record[build])) fail(`the ${build} build recorded nothing in out/bundled-modules.json; rebuild with \`npm run build\`.`)
}

const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'))
const folders = [...Object.values(record).flat(), ...productionFolders(lock)]
const { text, count, noFile, undeclared } = buildNotices(folders, root, readFileSync(join(root, 'LICENSE'), 'utf8'))
if (undeclared.length > 0) {
  fail(`no licence is declared by: ${undeclared.join(', ')}. A package that states no licence cannot be bundled or packaged until its terms are checked.`)
}
if (noFile.length > 0) {
  console.warn(`write-notices: ${noFile.join(', ')} declare a licence but ship no licence file; the notices say so.`)
}

const outDir = join(root, 'out', 'renderer')
mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'THIRD_PARTY_NOTICES.txt'), text)
console.log(`write-notices: ${count} packages, ${(text.length / 1024).toFixed(0)} KB -> out/renderer/THIRD_PARTY_NOTICES.txt`)
