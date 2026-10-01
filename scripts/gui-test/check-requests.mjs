#!/usr/bin/env node
// Checks every request body in a harness mock log against the request schema in openapi.json, so a field the app sends
// under the wrong name, or leaves out, shows up without reading the bodies by eye.
//
//   node scripts/gui-test/check-requests.mjs [<tmp>/bldesk-gui-test/NAME/mock.log]
//
// Needs `ajv`, which the build tools already install. Action requests (`POST /v2/servers/{id}/actions`) are checked
// against the schema their `type` names in the reference's discriminator mapping. Exits 1 when a body is invalid.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
let Ajv
try {
  Ajv = require('ajv')
} catch {
  console.error('This check needs ajv (npm install installs it with the build tools).')
  process.exit(2)
}
const spec = JSON.parse(readFileSync(fileURLToPath(new URL('../../openapi.json', import.meta.url)), 'utf8'))
// The reference is OpenAPI 3.0: drop `discriminator` (action requests are matched by hand below) and turn `nullable`
// without a `type` (a `$ref` that may be null) into "this or null", which is how JSON Schema says it.
const strip = (o) => {
  if (Array.isArray(o)) return o.map(strip)
  if (o && typeof o === 'object') {
    const out = Object.fromEntries(Object.entries(o).filter(([k]) => k !== 'discriminator').map(([k, v]) => [k, strip(v)]))
    if (out.nullable === true && out.type === undefined) {
      const { nullable, ...rest } = out
      return { anyOf: [rest, { type: 'null' }] }
    }
    return out
  }
  return o
}
const doc = strip(spec)
doc.$id = 'https://spec.local/api'
const ajv = new Ajv({ strict: false, allErrors: true })
for (const f of ['int32', 'int64', 'double', 'float', 'date-time', 'date', 'uri', 'password', 'byte', 'binary']) ajv.addFormat(f, true)
ajv.addSchema(doc, 'api')

const esc = (s) => s.replace(/~/g, '~0').replace(/\//g, '~1')
const pathRegexes = Object.keys(spec.paths).map((p) => ({ p, re: new RegExp('^' + p.replace(/\{[^}]+\}/g, '[^/]+') + '/?$') }))
const validators = new Map()
const validatorFor = (ref) => {
  if (!validators.has(ref)) validators.set(ref, ajv.compile({ $ref: `api#${ref}` }))
  return validators.get(ref)
}

const logFile = process.argv[2] ?? join(tmpdir(), 'bldesk-gui-test', 'default', 'mock.log')
const checked = new Map()
const problems = []
for (const line of readFileSync(logFile, 'utf8').split('\n')) {
  const m = /^\S+ (POST|PUT|PATCH) \S+?(\/v2\/[^ ?]*)(?:\?\S*)? (\{.*|\[.*)$/.exec(line)
  if (!m) continue
  const [, method, path, raw] = m
  let body
  try {
    body = JSON.parse(raw)
  } catch {
    continue
  }
  const hit = pathRegexes.find((x) => x.re.test(path))
  const op = hit && spec.paths[hit.p][method.toLowerCase()]
  const schema = op?.requestBody?.content?.['application/json']?.schema
  if (!hit || !schema) continue
  let ref = `/paths/${esc(hit.p)}/${method.toLowerCase()}/requestBody/content/application~1json/schema`
  let label = `${method} ${hit.p}`
  const mapping = spec.components.schemas.ServerAction?.discriminator?.mapping
  if (hit.p.endsWith('/actions') && method === 'POST' && body?.type) {
    const target = mapping?.[body.type]
    if (!target) {
      problems.push({ label: `${label} type=${body.type}`, errors: [`"${body.type}" is not an action in the reference`], body })
      continue
    }
    ref = target.replace(/^#/, '')
    label += ` type=${body.type}`
  }
  const key = `${label} ${raw}`
  if (checked.has(key)) continue
  const validate = validatorFor(ref)
  const ok = validate(body)
  checked.set(key, ok)
  if (!ok) problems.push({ label, errors: validate.errors.map((e) => `${e.instancePath || '(body)'} ${e.message}${e.params?.additionalProperty ? ` "${e.params.additionalProperty}"` : ''}${e.params?.missingProperty ? ` "${e.params.missingProperty}"` : ''}`), body })
}
console.log(`${checked.size} distinct request bodies checked against openapi.json; ${problems.length} invalid.`)
for (const p of problems) {
  console.log(`\n✗ ${p.label}`)
  for (const e of [...new Set(p.errors)].slice(0, 6)) console.log(`    ${e}`)
  console.log(`    ${JSON.stringify(p.body).slice(0, 200)}`)
}
process.exit(problems.length ? 1 : 0)
