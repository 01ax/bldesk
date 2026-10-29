// Tests for the part of lib/saveFile.ts that runs without a device: turning a file's bytes into the base64 the Android
// save plugin takes. (The plugin and the Save as dialog themselves can only be checked on a phone.)
// node --experimental-strip-types --no-warnings --test scripts/test-save-file.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { blobToBase64 } from '../src/renderer/src/lib/saveFile.ts'

const SLICE = 3 * 4096 // saveFile.ts

test('every byte value, and every length around a slice, encodes as base64 does', async () => {
  const all = Uint8Array.from({ length: 256 }, (_, i) => i)
  assert.equal(await blobToBase64(new Blob([all])), Buffer.from(all).toString('base64'))
  for (const n of [0, 1, 2, 3, 4, 5, SLICE - 1, SLICE, SLICE + 1, SLICE * 2 + 2]) {
    const bytes = randomBytes(n)
    assert.equal(await blobToBase64(new Blob([bytes])), bytes.toString('base64'), `${n} bytes`)
  }
})

test('an image-sized file is encoded whole, without overflowing the call stack, and decodes back to the same bytes', async () => {
  const bytes = randomBytes(8 * 1024 * 1024 + 1)
  const text = await blobToBase64(new Blob([bytes], { type: 'image/png' }))
  assert.equal(text.length, Math.ceil(bytes.length / 3) * 4)
  assert.ok(Buffer.from(text, 'base64').equals(bytes))
})

test('a PNG header survives the trip, so the file the plugin writes still starts as a PNG', async () => {
  const header = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13)
  const text = await blobToBase64(new Blob([header], { type: 'image/png' }))
  assert.deepEqual([...Buffer.from(text, 'base64')], [...header])
})
