// Tests for the updater's log file: the format of an entry, the size limit, and that writing can never fail loudly.
// node --experimental-strip-types --no-warnings --test scripts/test-updater-log.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { appendUpdaterLog, formatUpdaterLogLine, MAX_UPDATER_LOG_BYTES } from '../src/main/updaterLog.ts'

const at = new Date('2026-10-21T07:50:17.929Z')
function scratch(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'bldesk-updater-log-'))
  try {
    return fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('an entry is a UTC time, the level and the message', () => {
  assert.equal(formatUpdaterLogLine(at, 'info', ['Checking for update']), '2026-10-21T07:50:17.929Z info  Checking for update')
  assert.equal(formatUpdaterLogLine(at, 'error', ['Update check failed:', 'HTTP 500']), '2026-10-21T07:50:17.929Z error Update check failed: HTTP 500')
})

test('an Error keeps its stack and a multi-line message keeps its lines, indented so each entry still starts with a time', () => {
  const line = formatUpdaterLogLine(at, 'warn', [new Error('boom')])
  assert.match(line, /^2026-10-21T07:50:17\.929Z warn  Error: boom\n {6,}at /) // a stack trace is already indented, and the log adds to that
  assert.equal(formatUpdaterLogLine(at, 'info', ['a\nb\r\nc']), '2026-10-21T07:50:17.929Z info  a\n      b\n      c')
  for (const entry of formatUpdaterLogLine(at, 'warn', [new Error('boom')]).split('\n').slice(1)) assert.match(entry, /^ {6}/)
})

test('a very long message is cut and says how much was left out', () => {
  const line = formatUpdaterLogLine(at, 'info', ['x'.repeat(5000)])
  assert.ok(line.length < 4200)
  assert.match(line, /… \(1000 more characters\)$/)
})

test('entries are appended, and the file is private to its owner', () => {
  scratch((dir) => {
    const path = join(dir, 'updater.log')
    assert.equal(appendUpdaterLog(path, 'info', ['one'], at), true)
    assert.equal(appendUpdaterLog(path, 'info', ['two'], at), true)
    assert.deepEqual(readFileSync(path, 'utf8').trim().split('\n').map((l) => l.slice(-3)), ['one', 'two'])
    if (process.platform !== 'win32') assert.equal(statSync(path).mode & 0o077, 0, 'the log is readable by others')
  })
})

test('a file past the limit is moved to .1 before the next entry, and only one old file is kept', () => {
  scratch((dir) => {
    const path = join(dir, 'updater.log')
    writeFileSync(path, 'old '.repeat(100)) // 400 bytes
    assert.equal(appendUpdaterLog(path, 'info', ['fresh'], at, 300), true)
    assert.equal(readFileSync(`${path}.1`, 'utf8'), 'old '.repeat(100))
    assert.match(readFileSync(path, 'utf8'), /fresh\n$/)
    assert.ok(statSync(path).size < 100, 'the new file starts small')
    // a second rotation replaces .1 rather than adding .2
    writeFileSync(path, 'second '.repeat(60))
    appendUpdaterLog(path, 'info', ['again'], at, 300)
    assert.equal(readFileSync(`${path}.1`, 'utf8'), 'second '.repeat(60))
    assert.equal(existsSync(`${path}.2`), false)
  })
})

test('a file under the limit is not rotated', () => {
  scratch((dir) => {
    const path = join(dir, 'updater.log')
    for (let i = 0; i < 20; i++) appendUpdaterLog(path, 'info', [`line ${i}`], at)
    assert.equal(existsSync(`${path}.1`), false)
    assert.equal(readFileSync(path, 'utf8').trim().split('\n').length, 20)
    assert.ok(MAX_UPDATER_LOG_BYTES >= 256 * 1024, 'the limit is large enough to hold several updates')
  })
})

test('a folder that does not exist is created, and a path that cannot be written reports false instead of throwing', () => {
  scratch((dir) => {
    assert.equal(appendUpdaterLog(join(dir, 'a', 'b', 'updater.log'), 'info', ['x'], at), true)
    writeFileSync(join(dir, 'file'), 'not a folder')
    assert.equal(appendUpdaterLog(join(dir, 'file', 'updater.log'), 'info', ['x'], at), false)
  })
})
