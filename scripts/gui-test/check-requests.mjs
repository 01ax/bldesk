#!/usr/bin/env node
// Checks every request body in a harness mock log against the request schema in openapi.json, so a field the app sends
// under the wrong name, or leaves out, shows up without reading the bodies by eye.
//
//   node scripts/gui-test/check-requests.mjs [<tmp>/bldesk-gui-test/NAME/mock.log]
//
// Needs `ajv`, which the build tools already install. Action requests (`POST /v2/servers/{id}/actions`) are checked
// against the schema their `type` names in the reference's discriminator mapping. Exits 1 when a body is invalid.
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { esc, pathRegexes, spec, validatorFor } from './spec.mjs'

const logFile = process.argv[2] ?? join(tmpdir(), 'bldesk-gui-test', 'default', 'mock.log')
const checked = new Map()
const problems = []
let unreadable = 0
for (const line of readFileSync(logFile, 'utf8').split('\n')) {
  const m = /^\S+ (POST|PUT|PATCH) \S+?(\/v2\/[^ ?]*)(?:\?\S*)? (\{.*|\[.*)$/.exec(line)
  if (!m) continue
  const [, method, path, raw] = m
  let body
  try {
    body = JSON.parse(raw)
  } catch {
    // A line cut short (an older mock logged only the first 300 characters) cannot be checked: say so, do not skip it quietly.
    unreadable++
    continue
  }
  const hit = pathRegexes.find((x) => x.re.test(path) && spec.paths[x.p][method.toLowerCase()])
  const op = hit && spec.paths[hit.p][method.toLowerCase()]
  const schema = op?.requestBody?.content?.['application/json']?.schema
  if (!hit || !schema) continue
  let ref = `/paths/${esc(hit.p)}/${method.toLowerCase()}/requestBody/content/application~1json/schema`
  let label = `${method} ${hit.p}`
  const mapping = spec.components.schemas.ServerAction?.discriminator?.mapping
  if (hit.p.endsWith('/actions') && method === 'POST' && body?.type) {
    const target = typeof body.type === 'string' && Object.hasOwn(mapping ?? {}, body.type) ? mapping[body.type] : undefined
    if (!target) {
      const unknownKey = `${label} type=${body.type} ${raw}`
      if (!checked.has(unknownKey)) {
        checked.set(unknownKey, false)
        problems.push({ label: `${label} type=${body.type}`, errors: [`"${body.type}" is not an action in the reference`], body })
      }
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
if (unreadable) console.log(`${unreadable} logged request line${unreadable === 1 ? '' : 's'} could not be read as JSON (cut short) and were not checked.`)
for (const p of problems) {
  console.log(`\n✗ ${p.label}`)
  for (const e of [...new Set(p.errors)].slice(0, 6)) console.log(`    ${e}`)
  console.log(`    ${JSON.stringify(p.body).slice(0, 200)}`)
}
process.exit(problems.length || unreadable ? 1 : 0)
