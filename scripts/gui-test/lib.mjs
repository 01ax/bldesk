// Shared helpers for driving BLDesk over CDP with Playwright. See README.md.
import { readFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export const stateDir = (name) => join(tmpdir(), 'bldesk-gui-test', name)

export function loadState(name = process.env.BLDESK_GUI_TEST_NAME || 'default') {
  try {
    const state = JSON.parse(readFileSync(join(stateDir(name), 'state.json'), 'utf8'))
    return { ...state, token: readFileSync(join(state.dir, 'token.txt'), 'utf8').trim() }
  } catch {
    throw new Error(`No running test instance called "${name}". Start one with: node scripts/gui-test/launch.mjs --name ${name}`)
  }
}

// Playwright is not an application dependency. Point BLDESK_PLAYWRIGHT_MODULE at its entry module
// (for example /path/to/node_modules/playwright-core/index.mjs), or install playwright-core somewhere Node can resolve it.
export async function playwright() {
  const path = process.env.BLDESK_PLAYWRIGHT_MODULE
  if (path) return import(pathToFileURL(path).href)
  for (const name of ['playwright-core', 'playwright']) {
    try { return await import(name) } catch { /* try the next one */ }
  }
  throw new Error('Playwright not found. Set BLDESK_PLAYWRIGHT_MODULE to the absolute path of playwright-core/index.mjs.')
}

// Connect to the running app. `problems` collects console errors and warnings and page exceptions.
export async function connect(state = loadState()) {
  const { chromium } = await playwright()
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${state.cdpPort}`)
  const ctx = browser.contexts()[0]
  const page = ctx.pages().find((p) => p.url().startsWith('file://') || p.url().includes('index.html')) || ctx.pages()[0]
  const problems = []
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) problems.push(`console.${m.type()}: ${m.text().slice(0, 300)}`) })
  page.on('pageerror', (e) => problems.push(`pageerror: ${String(e).slice(0, 300)}`))
  return { browser, ctx, page, problems, state }
}

export async function shot(page, state, name) {
  const dir = join(state.dir, 'shots')
  mkdirSync(dir, { recursive: true })
  const path = join(dir, `${name}.png`)
  await page.screenshot({ path })
  return path
}

// Electron has no window-resize command over CDP, so emulate the viewport. At a 1280px window, 80% zoom is about
// 1600 css px, 125% about 1024 and 150% about 853.
export async function setViewport(page, width, height) {
  await page.setViewportSize({ width, height })
  await page.waitForTimeout(500)
  return page.evaluate(() => [innerWidth, innerHeight])
}

// Programmatic layout checks, run inside the page. It cannot tell a clipped element from one inside a legitimately
// scrollable container, so confirm anything it reports with a screenshot.
export const layoutReport = (page) => page.evaluate(() => {
  const out = []
  const vw = document.documentElement.clientWidth
  if (document.documentElement.scrollWidth > vw + 1) out.push(`page scrolls horizontally: scrollWidth ${document.documentElement.scrollWidth} > ${vw}`)
  const text = document.body.innerText || ''
  for (const bad of ['undefined', 'NaN', '[object Object]', 'null']) {
    if (new RegExp(`(^|[^A-Za-z])${bad.replace(/[[\]]/g, '\\$&')}([^A-Za-z]|$)`).test(text)) out.push(`text contains "${bad}"`)
  }
  const found = []
  document.querySelectorAll('button,a,th,td,label,h1,h2,h3,span,div,p,input,select').forEach((el) => {
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height) return
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.display === 'none') return
    const label = (el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 40)
    if (r.right > vw + 2 && r.left < vw) found.push(`${el.tagName.toLowerCase()} "${label}" extends past the right edge (${Math.round(r.right)} > ${vw})`)
    if (el.children.length === 0 && el.scrollWidth > el.clientWidth + 2 && cs.overflowX === 'visible' && cs.textOverflow !== 'ellipsis' && el.clientWidth > 0 && label) {
      found.push(`${el.tagName.toLowerCase()} "${label}" text overflows its box (${el.scrollWidth} > ${el.clientWidth})`)
    }
  })
  out.push(...[...new Set(found)].slice(0, 15))
  const broken = [...document.images].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src.slice(0, 60))
  if (broken.length) out.push('broken images: ' + broken.join(', '))
  return out
})
