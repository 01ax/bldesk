#!/usr/bin/env node
// Sign in to the running test instance through the real API Token Vault dialog, using the run's random fictitious token.
//   node scripts/gui-test/signin.mjs [--name NAME]
import { connect, loadState } from './lib.mjs'

const i = process.argv.indexOf('--name')
const state = loadState(i > 0 ? process.argv[i + 1] : undefined)
const { browser, page } = await connect(state)
try {
  await page.getByPlaceholder('e.g. Production / Personal').waitFor({ timeout: 15000 })
  await page.getByPlaceholder('e.g. Production / Personal').fill('Atlas Demo (fictitious)')
  await page.getByPlaceholder('Paste API token secret...').fill(state.token)
  await page.getByRole('button', { name: /Save & Encrypt Token/ }).click()
  // On a system with no working keyring the dialog asks before saving the token unencrypted.
  const unencrypted = page.getByLabel(/Save this token without encryption/)
  if (await unencrypted.waitFor({ timeout: 2000 }).then(() => true, () => false)) {
    await unencrypted.check()
    await page.getByRole('button', { name: /Save & Encrypt Token|Save/ }).last().click()
  }
  await page.waitForFunction(() => /\d+ servers/.test(document.body.innerText), null, { timeout: 15000 })
  console.log('Signed in:', (await page.locator('main h1').first().innerText()).replace(/\n/g, ' '))
} finally {
  await browser.close()
}
