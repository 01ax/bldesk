// Tests for the AppleScript that opens iTerm2: the command must reach the user's shell with every argument intact.
// node --experimental-strip-types --no-warnings --test scripts/test-terminal-launchers.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { iterm2Script, keepOpenScript, shQuote } from '../src/shared/ssh.ts'

/** What iTerm2 is given: the first AppleScript string after `command`, decoded the way AppleScript decodes it. */
function commandIterm2Runs(script) {
  const literal = /command "((?:[^"\\]|\\.)*)"/.exec(script)
  assert.ok(literal, 'the script has a command string')
  return literal[1].replace(/\\(["\\])/g, '$1')
}

/** Run a command the way iTerm2 does (through a shell), with the session shell replaced by one that exits. */
const run = (command) => execFileSync('/bin/sh', ['-c', command], { env: { PATH: process.env.PATH, SHELL: '/bin/true' } }).toString()

const awkward = ['a b', "it's", 'q"uote', '$HOME', 'back\\slash', 'semi;colon', '`tick`']

test('the command iTerm2 runs gets every argument exactly as given', () => {
  const argv = ['/usr/bin/printf', '[%s]', ...awkward]
  const out = run(commandIterm2Runs(iterm2Script(argv)))
  assert.equal(out, awkward.map((a) => `[${a}]`).join(''))
})

test('the tab and the window branches run the same command', () => {
  const script = iterm2Script(['/usr/bin/printf', '%s', 'x'])
  const commands = [...script.matchAll(/command "((?:[^"\\]|\\.)*)"/g)].map((m) => m[1])
  assert.equal(commands.length, 2)
  assert.equal(commands[0], commands[1])
})

test('keeping the window open still quotes every word', () => {
  assert.equal(keepOpenScript(['ssh', 'a b']).startsWith(`${shQuote('ssh')} ${shQuote('a b')}; `), true)
})
