// Tests for how a discovered key is named from its public key's file: node --test scripts/test-ssh-key-names.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { keyNameFromPublicFile } from '../src/shared/sshKeyNames.ts'

test('the name is the file name without its .pub suffix, and only the suffix', () => {
  assert.equal(keyNameFromPublicFile('id_ed25519.pub'), 'id_ed25519')
  assert.equal(keyNameFromPublicFile('my.pubkey.pub'), 'my.pubkey')
  assert.equal(keyNameFromPublicFile('work.pub.pub'), 'work.pub')
  assert.equal(keyNameFromPublicFile('a.pub-backup.pub'), 'a.pub-backup')
})

test('a file that is not a public key, or has no name, gives none', () => {
  assert.equal(keyNameFromPublicFile('id_ed25519'), null)
  assert.equal(keyNameFromPublicFile('.pub'), null)
  assert.equal(keyNameFromPublicFile('known_hosts'), null)
})
