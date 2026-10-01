// The public reference as JSON Schema validators, shared by check-requests.mjs (what the app sends) and mock.test.mjs
// (what the mock answers). Needs `ajv`, which the build tools already install.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
let Ajv
try {
  Ajv = require('ajv')
} catch {
  console.error('This check needs ajv (npm install installs it with the build tools).')
  process.exit(2)
}
export const spec = JSON.parse(readFileSync(fileURLToPath(new URL('../../openapi.json', import.meta.url)), 'utf8'))
// The reference is OpenAPI 3.0: drop `discriminator` (action requests are matched by hand) and turn `nullable`
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

export const esc = (s) => s.replace(/~/g, '~0').replace(/\//g, '~1')
export const pathRegexes = Object.keys(spec.paths).map((p) => ({ p, re: new RegExp('^' + p.replace(/\{[^}]+\}/g, '[^/]+') + '/?$') }))
const validators = new Map()
/** A validator for the schema at a JSON pointer in the reference, e.g. `/components/schemas/Server`. */
export const validatorFor = (ref) => {
  if (!validators.has(ref)) validators.set(ref, ajv.compile({ $ref: `api#${ref}` }))
  return validators.get(ref)
}
