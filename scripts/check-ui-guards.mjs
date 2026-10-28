#!/usr/bin/env node
// Cheap source checks for the zoom regressions in #18, and for the Android Back
// button skipping a popup that closes on Escape. TypeScript is already
// installed for typechecking; its parser avoids matching comments or prose.
// These check ownership and wiring, not whether a rendered layout fits.
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const ZOOM_OWNER = 'src/main/zoom.ts'
const ZOOM_ROLES = new Set(['zoomIn', 'zoomOut', 'resetZoom'])
const BACK_FILE = 'src/renderer/src/lib/androidBack.ts'
const BACK_SELECTOR = 'DISMISSIBLE_SELECTOR'

/** The roles the Android Back button closes: each `[role="x"][data-dismissible="true"]` in the DISMISSIBLE_SELECTOR string. */
export function backRoles(source) {
  const file = ts.createSourceFile(BACK_FILE, source, ts.ScriptTarget.Latest, true)
  const roles = new Set()
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === BACK_SELECTOR && node.initializer && ts.isStringLiteralLike(node.initializer)) {
      for (const m of node.initializer.text.matchAll(/\[role="([\w-]+)"\]\[data-dismissible="true"\]/g)) roles.add(m[1])
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  return roles
}

export function checkUiSource(path, source, roles = backRoles(readFileSync(join(ROOT, BACK_FILE), 'utf8'))) {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true)
  const failures = []
  const wired = new Set()
  const fail = (node, message) => {
    const { line } = file.getLineAndCharacterOfPosition(node.getStart(file))
    failures.push(`${path}:${line + 1}: ${message}`)
  }
  const propertyName = node => node && (
    ts.isIdentifier(node) || ts.isStringLiteral(node) ? node.text : undefined
  )
  function visit(node) {
    if (ts.isCallExpression(node)) {
      const name = ts.isPropertyAccessExpression(node.expression)
        ? node.expression.name.text
        : ts.isElementAccessExpression(node.expression)
          ? propertyName(node.expression.argumentExpression)
          : propertyName(node.expression)
      if (['setZoomFactor', 'setZoomLevel'].includes(name) && path !== ZOOM_OWNER) {
        fail(node, `zoom writes belong in ${ZOOM_OWNER}, so every entry point uses the same bounds.`)
      }
      if (name === 'watchWindowShortcuts') {
        const options = node.arguments[1]
        const zoom = options && ts.isObjectLiteralExpression(options) && options.properties.find(
          p => ts.isPropertyAssignment(p) && propertyName(p.name) === 'zoom'
        )
        if (!zoom || zoom.initializer.kind !== ts.SyntaxKind.TrueKeyword) {
          fail(node, 'pass explicit { zoom: true, escToCloseWindow: false }; the toolkit otherwise blocks zoom shortcuts (#18).')
        }
      }
      if (name === 'installWindowZoom' || name === 'installZoomMenu') wired.add(name)
    }
    if (ts.isPropertyAssignment(node) && propertyName(node.name) === 'role' &&
        ts.isStringLiteral(node.initializer) && ZOOM_ROLES.has(node.initializer.text)) {
      fail(node, `built-in ${node.initializer.text} ignores custom click handlers and bypasses bounds; use the commands in ${ZOOM_OWNER}.`)
    }
    // A popup that says it closes on Escape is closed by Android's Back button, but only for a role that DISMISSIBLE_SELECTOR lists.
    if (ts.isJsxAttribute(node) && node.name.getText(file) === 'data-dismissible') {
      const role = node.parent.properties.find(p => ts.isJsxAttribute(p) && p.name.getText(file) === 'role')
      const value = role?.initializer && ts.isStringLiteral(role.initializer) ? role.initializer.text : undefined
      if (value === undefined) {
        fail(node, `give an element with data-dismissible a role written as a string, so the Back button's ${BACK_SELECTOR} can be checked against it.`)
      } else if (!roles.has(value)) {
        fail(node, `Android Back skips role="${value}": ${BACK_SELECTOR} in ${BACK_FILE} lists only ${[...roles].map(r => `"${r}"`).join(', ')}, so Back would leave the screen with this open.`)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  if (path === 'src/renderer/src/App.tsx' && !/\bDISMISSIBLE_SELECTOR\b/.test(source)) {
    failures.push(`${path}: the Back handler must find an open popup with ${BACK_SELECTOR} from ${BACK_FILE}.`)
  }
  if (path === 'src/main/index.ts') {
    for (const name of ['installWindowZoom', 'installZoomMenu']) {
      if (!wired.has(name)) failures.push(`${path}: keep ${name}() wired into startup; see AGENTS.md → Zoom and layout.`)
    }
  }
  return failures
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? walk(path) : /\.(tsx?|mts)$/.test(entry.name) && !entry.name.endsWith('.d.ts') ? [path] : []
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const failures = walk(join(ROOT, 'src')).flatMap(path =>
    checkUiSource(relative(ROOT, path).replace(/\\/g, '/'), readFileSync(path, 'utf8'))
  )
  if (failures.length) {
    console.error(`\nUI guard check failed:\n${failures.map(f => `  ✗ ${f}`).join('\n')}\n`)
    process.exitCode = 1
  } else {
    console.log('UI guards ok')
  }
}
