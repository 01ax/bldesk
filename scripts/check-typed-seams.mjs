#!/usr/bin/env node
/**
 * Guard for #170: the places where a server action body or a firewall rule enters or is built must stay typed against
 * the generated spec types. A type alias is not enough on its own: setting one function's parameter back to `any`, or
 * casting a body `as never`, still passes the typecheck, and every caller after it goes unchecked.
 *
 * Runs as part of `npm run typecheck`. Unlike the other guards it uses the TypeScript compiler (already a dev
 * dependency), because what it checks is a type, not text. It looks at two things:
 *
 *  1. SEAMS: named parameters and variables. Each must have exactly the type listed (not `any`, not `any[]`, not wider).
 *     A seam that cannot be found fails, so a rename cannot turn the check into a silent pass: update SEAMS with it.
 *  2. Every `client.POST('/v2/servers/{server_id}/actions', { body })` call, wherever it is: the body's type, or one of
 *     its fields, must not be `any` or `never` (what `as any` and `as never` produce).
 *
 * `checkSeams({ patches })` is also what scripts/test-typed-seams.mjs runs against edited copies of the real files, to
 * prove the guard fails on the mistakes it exists for.
 */
import ts from 'typescript'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { resolve, sep } from 'node:path'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SRC = resolve(ROOT, 'src/renderer/src')
const ACTIONS_PATH = '/v2/servers/{server_id}/actions'

/** `expect` is a type written against the imports in EXPECT_MODULE below. */
export const SEAMS = [
  { file: 'api/queries.ts', in: 'useServerActionMutation', param: 'actionPayload', expect: 'SubmittableActionBody' },
  { file: 'api/queries.ts', in: 'useServerActionWithHandoff', param: 'actionPayload', expect: 'ServerActionBody' },
  { file: 'api/queries.ts', in: 'useServerDiagnosticMutation', param: 'actionPayload', expect: 'ServerActionBody' },
  { file: 'api/queries.ts', in: 'useUpdateFirewallRulesMutation', param: 'rules', expect: 'FwRule[]' },
  { file: 'components/servers/ServerDetails.tsx', in: 'handleAction', param: 'body', expect: 'SubmittableActionBody' },
  { file: 'components/servers/ServerSettings.tsx', in: 'executeAction', param: 'payload', expect: 'ServerActionBody' },
  { file: 'components/firewall/FirewallManager.tsx', variable: 'currentRules', expect: 'FwRule[]' },
  { file: 'components/firewall/FirewallMatrix.tsx', variable: 'now', expect: 'Map<number, FwRule[] | null>' }
]

const EXPECT_MODULE = `
import type { ServerActionBody, SubmittableActionBody } from './api/queries'
import type { FwRule } from './lib/firewallMatrix'
${SEAMS.map((s, i) => `export type E${i} = ${s.expect}`).join('\n')}
`
const EXPECT_FILE = resolve(SRC, '__typed_seams_expected__.ts')

const norm = (p) => resolve(p).split(sep).join('/').toLowerCase()
const describeSeam = (s) => `${s.file}: ${s.in ? `parameter "${s.param}" of ${s.in}` : `variable "${s.variable}"`}`

/**
 * Why a type is too loose to protect anything, or null. Looks into unions, arrays, and one level of fields. A field whose
 * own value is `any` (an id read from an untyped list) is fine: its name is still checked, which is what #123 and #124
 * got wrong. A field that is `never`, or a list of `any`, is not: nothing inside it is checked.
 */
function looseness(checker, type, node, depth = 1, isField = false) {
  if (type.flags & ts.TypeFlags.Any) return isField ? null : 'any'
  if (type.flags & ts.TypeFlags.Never) return 'never'
  if (type.isUnion()) {
    for (const t of type.types) {
      const why = looseness(checker, t, node, depth, isField)
      if (why) return why
    }
    return null
  }
  if (checker.isArrayType(type)) {
    const [elem] = checker.getTypeArguments(type)
    const why = elem && looseness(checker, elem, node, depth)
    return why ? `${why}[]` : null
  }
  // Map<number, any[] | null> and the like: what it holds is what matters.
  if (type.flags & ts.TypeFlags.Object && type.objectFlags & ts.ObjectFlags.Reference) {
    for (const arg of checker.getTypeArguments(type)) {
      const why = looseness(checker, arg, node, depth)
      if (why) return `<${why}>`
    }
  }
  if (depth > 0 && type.flags & ts.TypeFlags.Object) {
    for (const prop of checker.getPropertiesOfType(type)) {
      const why = looseness(checker, checker.getTypeOfSymbolAtLocation(prop, node), node, depth - 1, true)
      if (why) return `${prop.name}: ${why}`
    }
  }
  return null
}

/** The declarations named `name` (a function, or a variable): the node to search for the parameter, or to read the type of. */
function findNamed(sf, name, kind) {
  const found = []
  const visit = (node) => {
    if (kind === 'fn' && ts.isFunctionDeclaration(node) && node.name?.text === name) found.push(node)
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) found.push(node)
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return found
}

function findParams(root, name) {
  const found = []
  const visit = (node) => {
    if (ts.isParameter(node) && ts.isIdentifier(node.name) && node.name.text === name) found.push(node)
    // A destructured parameter ({ serverId, actionPayload }: {...}) names its fields as binding elements.
    if (ts.isBindingElement(node) && ts.isIdentifier(node.name) && node.name.text === name && ts.isParameter(node.parent?.parent ?? node)) found.push(node)
    ts.forEachChild(node, visit)
  }
  visit(root)
  return found
}

/**
 * Check the seams and the action POST calls. `patches` are `{ file, from, to }` edits applied to the source text in
 * memory (never to disk), each of which must match exactly once so that a patch cannot quietly do nothing.
 */
export function checkSeams({ patches = [] } = {}) {
  const configPath = resolve(ROOT, 'tsconfig.web.json')
  const read = ts.readConfigFile(configPath, ts.sys.readFile)
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, ROOT, { composite: false, noEmit: true }, configPath)

  const virtual = new Map([[norm(EXPECT_FILE), EXPECT_MODULE]])
  for (const p of patches) {
    const path = resolve(SRC, p.file)
    const text = ts.sys.readFile(path)
    const parts = text.split(p.from)
    if (parts.length !== 2) throw new Error(`patch for ${p.file} must match exactly once, matched ${parts.length - 1} times: ${p.from}`)
    virtual.set(norm(path), parts.join(p.to))
  }

  const host = ts.createCompilerHost(parsed.options, true)
  const getSourceFile = host.getSourceFile.bind(host)
  const fileExists = host.fileExists.bind(host)
  const readFile = host.readFile.bind(host)
  host.getSourceFile = (name, lang, onError, create) => {
    const text = virtual.get(norm(name))
    return text === undefined ? getSourceFile(name, lang, onError, create) : ts.createSourceFile(name, text, lang, true)
  }
  host.fileExists = (name) => virtual.has(norm(name)) || fileExists(name)
  host.readFile = (name) => virtual.get(norm(name)) ?? readFile(name)

  const program = ts.createProgram([...parsed.fileNames, EXPECT_FILE], parsed.options, host)
  const checker = program.getTypeChecker()
  const problems = []

  const expectSf = program.getSourceFile(EXPECT_FILE)
  const expected = SEAMS.map((_, i) => {
    const sym = checker.getSymbolAtLocation(expectSf) && checker.getExportsOfModule(checker.getSymbolAtLocation(expectSf)).find((s) => s.name === `E${i}`)
    return sym ? checker.getDeclaredTypeOfSymbol(sym) : null
  })

  SEAMS.forEach((seam, i) => {
    const sf = program.getSourceFile(resolve(SRC, seam.file))
    if (!sf) return problems.push(`${describeSeam(seam)}: file not found. It moved or was renamed: update SEAMS in scripts/check-typed-seams.mjs.`)
    let nodes
    if (seam.variable) nodes = findNamed(sf, seam.variable, 'var')
    else nodes = findNamed(sf, seam.in, 'fn').flatMap((fn) => findParams(fn, seam.param))
    if (nodes.length === 0) return problems.push(`${describeSeam(seam)}: not found. It moved or was renamed: update SEAMS in scripts/check-typed-seams.mjs.`)
    if (!expected[i]) return problems.push(`${describeSeam(seam)}: the expected type "${seam.expect}" does not resolve.`)
    for (const node of nodes) {
      const actual = checker.getTypeAtLocation(node.name ?? node)
      const why = looseness(checker, actual, node, 0)
      const same = checker.isTypeAssignableTo(actual, expected[i]) && checker.isTypeAssignableTo(expected[i], actual)
      if (why || !same) problems.push(`${describeSeam(seam)}: is ${why ?? checker.typeToString(actual)}, not ${seam.expect}.`)
    }
  })

  for (const sf of program.getSourceFiles()) {
    if (sf.isDeclarationFile || !norm(sf.fileName).startsWith(norm(SRC) + '/')) continue
    const visit = (node) => {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'POST') {
        const [path, init] = node.arguments
        if (path && ts.isStringLiteralLike(path) && path.text === ACTIONS_PATH && init && ts.isObjectLiteralExpression(init)) {
          const body = init.properties.find((p) => p.name && ts.isIdentifier(p.name) && p.name.text === 'body')
          const bodyNode = body && (ts.isPropertyAssignment(body) ? body.initializer : body.name)
          const where = `${sf.fileName.slice(SRC.length + 1).split(sep).join('/')}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1}`
          if (!bodyNode) problems.push(`${where}: a POST to the actions endpoint with no body.`)
          else {
            const why = looseness(checker, checker.getTypeAtLocation(bodyNode), bodyNode, 1)
            if (why) problems.push(`${where}: the body of a POST to the actions endpoint is not checked against the spec (${why}).`)
          }
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(sf)
  }
  return problems
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const problems = checkSeams()
  if (problems.length) {
    console.error('Typed-seams guard failed (#170): a server action body or firewall rule is no longer checked against the spec types.\n')
    for (const p of problems) console.error(`  - ${p}`)
    process.exit(1)
  }
  console.log(`typed seams: ok (${SEAMS.length} seams, action POST bodies checked)`)
}
