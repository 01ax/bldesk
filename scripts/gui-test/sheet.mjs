#!/usr/bin/env node
// Build one contact sheet from several screenshots, with filename captions, so a single look covers many shots.
//   node scripts/gui-test/sheet.mjs OUT.png [--cols N] a.png b.png ...
import { readFileSync } from 'node:fs'
import { playwright } from './lib.mjs'

const a = process.argv.slice(2)
let cols = 2
const ci = a.indexOf('--cols')
if (ci >= 0) { cols = Number(a[ci + 1]); a.splice(ci, 2) }
const [out, ...files] = a
if (!out || !files.length) { console.error('usage: sheet.mjs OUT.png [--cols N] a.png b.png ...'); process.exit(1) }
const w = Math.floor(1800 / cols)
const figures = files.map((f) => `<figure style="margin:0"><figcaption style="color:#ee6;font:12px monospace;padding:2px 4px">${f.split(/[\\/]/).pop()}</figcaption><img style="width:${w}px;display:block" src="data:image/png;base64,${readFileSync(f).toString('base64')}"></figure>`)
const { chromium } = await playwright()
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1800, height: 800 } })
await page.setContent(`<body style="margin:0;background:#111;display:grid;grid-template-columns:repeat(${cols},${w}px)">${figures.join('')}</body>`)
await page.waitForLoadState('load')
await page.waitForTimeout(300)
await page.screenshot({ path: out, fullPage: true })
await browser.close()
console.log('Wrote', out)
