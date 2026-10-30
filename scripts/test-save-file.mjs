// Tests for the part of lib/saveFile.ts that runs without a device: turning a file's bytes into the base64 the Android
// save plugin takes, and the saves taking turns (two exports must never swap their bytes). The plugin and the Save as
// dialog themselves can only be checked on a phone; the tests give the saver a fake plugin that behaves the way the
// real one and Capacitor do.
// node --experimental-strip-types --no-warnings --test scripts/test-save-file.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { blobToBase64, createFileSaver } from '../src/renderer/src/lib/saveFile.ts'

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

// --- Taking turns ---------------------------------------------------------------------------------------------------

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const until = async (condition, what) => {
  for (let i = 0; i < 500 && !condition(); i++) await sleep(2)
  assert.ok(condition(), `timed out waiting for ${what}`)
}
/** 'settled' if the promise resolved or rejected within a moment, else 'pending': a call that never answers must show. */
const state = (promise) => Promise.race([promise.then(() => 'settled', () => 'settled'), sleep(40).then(() => 'pending')])

/**
 * The plugin and Capacitor as they behave on the phone, with a Save as dialog that stays open until the test answers it.
 *  - `bound: false` is the plugin as it was reviewed: ONE staging buffer for the whole plugin, started over by a piece
 *    with `first`, which the next dialog's answer takes whatever it holds, and no limit on open dialogs.
 *  - `bound: true` is the plugin now: the bytes are kept under the id of their file, and a second dialog is refused
 *    while one is open.
 *  - Either way Capacitor gives the answer of ANY dialog to the call that opened the LAST one (Plugin.java,
 *    triggerActivityCallback: bridge.getSavedCall(lastPluginCallId)), and the file the person's answer creates is the
 *    one in the dialog they answered.
 */
function fakePlugin({ bound }) {
  let single = []
  const perId = new Map()
  const sent = [] // what the page sent, in order
  const files = new Map() // filename -> the bytes written
  const dialogs = [] // opened, oldest first
  let lastCall = null
  let open = 0
  const fake = {
    sent, files, dialogs, failNextStage: false,
    async stageBase64({ id, base64, first }) {
      sent.push({ method: 'stageBase64', id, first })
      if (fake.failNextStage) { fake.failNextStage = false; throw new Error('could not stage') }
      const piece = Buffer.from(base64, 'base64')
      if (bound) perId.set(id, [...(first ? [] : perId.get(id) ?? []), piece])
      else single = [...(first ? [] : single), piece]
    },
    saveText({ filename, text }) { sent.push({ method: 'saveText', filename }); return fake.open({ filename, text }) },
    saveStaged({ id, filename }) { sent.push({ method: 'saveStaged', id, filename }); return fake.open({ filename, id }) },
    open(call) {
      return new Promise((resolve, reject) => {
        if (bound && open > 0) return reject(new Error('Another Save as dialog is still open.'))
        open++
        const dialog = { ...call, resolve, reject }
        dialogs.push(dialog)
        lastCall = dialog
      })
    },
    /** The person answers a dialog: 'save', 'back' or 'fail' (the provider refuses the write). */
    answer(dialog, how) {
      open--
      const target = lastCall // not necessarily the call that opened `dialog`
      let bytes
      if (target.text !== undefined) bytes = Buffer.from(target.text)
      else {
        bytes = Buffer.concat(bound ? perId.get(target.id) ?? [] : single) // what the plugin holds for that call
        if (bound) perId.delete(target.id)
        else single = []
      }
      if (how === 'back') return target.resolve({ saved: false })
      if (how === 'fail') return target.reject(new Error('The file could not be written'))
      files.set(dialog.filename, bytes)
      target.resolve({ saved: true, name: dialog.filename })
    }
  }
  return fake
}

for (const bound of [false, true]) {
  const model = bound ? 'plugin now' : 'plugin as reviewed'
  const saverFor = (fake) => createFileSaver(fake, () => true)
  const png = (n) => new Blob([randomBytes(n)], { type: 'image/png' })
  const bytesOf = async (blob) => Buffer.from(await blob.arrayBuffer())

  test(`${model}: two overlapped saves each end with their own bytes under their own name`, async () => {
    const fake = fakePlugin({ bound })
    const { saveBlobFile } = saverFor(fake)
    const a = png(700 * 1024) // three pieces
    const b = png(5 * 1024)
    const pa = saveBlobFile('a.png', a)
    const pb = saveBlobFile('b.png', b)
    await until(() => fake.dialogs.length >= 1, "A's dialog")
    await sleep(30)
    assert.equal(fake.dialogs.length, 1, "B did not open its dialog while A's was open")
    assert.equal(new Set(fake.sent.filter((c) => c.method === 'stageBase64').map((c) => c.id)).size, 1, "B staged nothing while A's dialog was open")
    fake.answer(fake.dialogs[0], 'save')
    assert.deepEqual(await pa, { saved: true, name: 'a.png' })
    await until(() => fake.dialogs.length === 2, "B's dialog")
    fake.answer(fake.dialogs[1], 'save')
    assert.deepEqual(await pb, { saved: true, name: 'b.png' })
    assert.ok(fake.files.get('a.png').equals(await bytesOf(a)), 'a.png has the bytes of A')
    assert.ok(fake.files.get('b.png').equals(await bytesOf(b)), 'b.png has the bytes of B')
  })

  test(`${model}: save, back out, save: the second file has only its own bytes`, async () => {
    const fake = fakePlugin({ bound })
    const { saveBlobFile } = saverFor(fake)
    const a = png(300 * 1024)
    const b = png(4 * 1024)
    const c = png(2 * 1024)
    const [pa, pb, pc] = [saveBlobFile('a.png', a), saveBlobFile('b.png', b), saveBlobFile('c.png', c)]
    await until(() => fake.dialogs.length === 1, "A's dialog")
    fake.answer(fake.dialogs[0], 'back')
    assert.deepEqual(await pa, { saved: false, name: undefined })
    await until(() => fake.dialogs.length === 2, "B's dialog")
    fake.answer(fake.dialogs[1], 'save')
    assert.deepEqual(await pb, { saved: true, name: 'b.png' })
    await until(() => fake.dialogs.length === 3, "C's dialog")
    fake.answer(fake.dialogs[2], 'save')
    assert.deepEqual(await pc, { saved: true, name: 'c.png' })
    assert.equal(fake.files.has('a.png'), false, 'nothing was written for the one backed out of')
    assert.ok(fake.files.get('b.png').equals(await bytesOf(b)))
    assert.ok(fake.files.get('c.png').equals(await bytesOf(c)))
  })

  test(`${model}: a save that fails does not hold up the ones behind it`, async () => {
    const fake = fakePlugin({ bound })
    const { saveBlobFile, saveTextFile } = saverFor(fake)
    // A fails while staging, B's write is refused by the provider, C and D are fine.
    fake.failNextStage = true
    const pa = saveBlobFile('a.png', png(10 * 1024))
    const rejectedA = assert.rejects(pa, /could not stage/)
    const pb = saveTextFile('b.json', '{"b":1}')
    const rejectedB = assert.rejects(pb, /could not be written/)
    const c = png(8 * 1024)
    const pc = saveBlobFile('c.png', c)
    const pd = saveTextFile('d.json', '{"d":1}')
    await rejectedA
    await until(() => fake.dialogs.length === 1, "B's dialog")
    fake.answer(fake.dialogs[0], 'fail')
    await rejectedB
    await until(() => fake.dialogs.length === 2, "C's dialog")
    fake.answer(fake.dialogs[1], 'save')
    assert.deepEqual(await pc, { saved: true, name: 'c.png' })
    await until(() => fake.dialogs.length === 3, "D's dialog")
    fake.answer(fake.dialogs[2], 'save')
    assert.deepEqual(await pd, { saved: true, name: 'd.json' })
    assert.ok(fake.files.get('c.png').equals(await bytesOf(c)))
    assert.equal(fake.files.get('d.json').toString(), '{"d":1}')
  })

  test(`${model}: text, long text and images in any order each get their own turn and their own bytes`, async () => {
    const fake = fakePlugin({ bound })
    const { saveBlobFile, saveTextFile } = saverFor(fake)
    const image = png(40 * 1024)
    const long = 'x'.repeat(150_000) + ' é €' // over the limit for the one call that opens a dialog: goes as bytes
    const wanted = [
      ['t.json', () => saveTextFile('t.json', '{"short":true}'), Buffer.from('{"short":true}')],
      ['i.png', () => saveBlobFile('i.png', image), await bytesOf(image)],
      ['long.txt', () => saveTextFile('long.txt', long, 'text/plain'), Buffer.from(long)],
      ['u.svg', () => saveTextFile('u.svg', '<svg/>', 'image/svg+xml'), Buffer.from('<svg/>')]
    ]
    const promises = wanted.map(([, start]) => start())
    for (let n = 0; n < wanted.length; n++) {
      await until(() => fake.dialogs.length >= n + 1, `dialog ${n + 1}`)
      await sleep(5)
      assert.equal(fake.dialogs.length, n + 1, 'one dialog at a time')
      assert.equal(fake.dialogs[n].filename, wanted[n][0], 'in the order asked')
      fake.answer(fake.dialogs[n], 'save')
    }
    assert.deepEqual(await Promise.all(promises), wanted.map(([name]) => ({ saved: true, name })))
    for (const [name, , bytes] of wanted) assert.ok(fake.files.get(name).equals(bytes), `${name} has its own bytes`)
    assert.ok(fake.sent.some((c) => c.method === 'saveText' && c.filename === 't.json'), 'a short text goes in the one call, as before')
    assert.ok(!fake.sent.some((c) => c.method === 'saveText' && c.filename === 'long.txt'), 'a long text does not')
  })

  test(`${model}: every save asked for settles, whatever the answers`, async () => {
    const fake = fakePlugin({ bound })
    const { saveBlobFile, saveTextFile } = saverFor(fake)
    const answers = ['save', 'back', 'save', 'fail', 'save', 'back', 'save', 'save']
    const sources = answers.map((_, i) => (i % 2 ? randomBytes(1000 + i * 70_000) : Buffer.from(`{"n":${i}}`)))
    const promises = answers.map((_, i) => (i % 2 ? saveBlobFile(`f${i}.bin`, new Blob([sources[i]])) : saveTextFile(`f${i}.json`, sources[i].toString())))
    const outcomes = promises.map((p) => p.then((value) => ({ value }), (error) => ({ error })))
    for (let n = 0; n < answers.length; n++) {
      await until(() => fake.dialogs.length === n + 1, `dialog ${n + 1}`)
      fake.answer(fake.dialogs[n], answers[n])
    }
    const results = await Promise.all(outcomes)
    for (let n = 0; n < answers.length; n++) {
      const name = n % 2 ? `f${n}.bin` : `f${n}.json`
      if (answers[n] === 'save') {
        assert.deepEqual(results[n].value, { saved: true, name })
        assert.ok(fake.files.get(name).equals(sources[n]), `${name} has its own bytes`)
      } else if (answers[n] === 'back') {
        assert.equal(results[n].value.saved, false)
        assert.equal(fake.files.has(name), false)
      } else {
        assert.match(String(results[n].error), /could not be written/)
      }
    }
    assert.equal(await state(Promise.all(promises)), 'settled')
  })
}

test('the browser download is not held up, and never touches the plugin', async () => {
  const clicks = []
  const saved = { document: globalThis.document }
  globalThis.document = {
    body: { appendChild() {} },
    createElement: () => ({ click() { clicks.push(this.download) }, remove() {} })
  }
  try {
    const fake = fakePlugin({ bound: true })
    const { saveBlobFile, saveTextFile } = createFileSaver(fake, () => false)
    const first = saveTextFile('a.json', '{}')
    const second = saveBlobFile('b.png', new Blob([randomBytes(10)], { type: 'image/png' }))
    assert.deepEqual(clicks, ['a.json', 'b.png'], 'both downloads started at the call, in order')
    assert.deepEqual(await Promise.all([first, second]), [{ saved: null }, { saved: null }])
    assert.deepEqual(fake.sent, [])
  } finally {
    globalThis.document = saved.document
  }
})
