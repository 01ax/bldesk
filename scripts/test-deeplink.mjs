// Tests for bldesk:// links and for restarting without the one that started the app:
// node --experimental-strip-types --no-warnings --test scripts/test-deeplink.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isDeepLinkUrl, parseDeepLink, restartArguments } from '../src/shared/deeplink.ts'

test('a restart keeps the flags and drops the link that started the app', () => {
  assert.deepEqual(restartArguments(['/opt/BLDesk/bldesk.bin', 'bldesk://server/42?account=Work', '--user-data-dir=/tmp/x']), ['--user-data-dir=/tmp/x'])
  assert.deepEqual(restartArguments(['/opt/BLDesk/bldesk.bin']), [])
  assert.deepEqual(restartArguments(['/opt/BLDesk/bldesk.bin', '--password-store=gnome-libsecret']), ['--password-store=gnome-libsecret'])
})

test('every form of a link is dropped, other arguments are not mistaken for one', () => {
  assert.deepEqual(restartArguments(['x', 'BLDESK://home', 'bldesk:tab/dns', '/home/me/bldesk:file', 'https://example.com']), ['/home/me/bldesk:file', 'https://example.com'])
  assert.equal(isDeepLinkUrl('bldesk://home'), true)
  assert.equal(isDeepLinkUrl('https://x'), false)
})

test('a link names its account', () => {
  assert.deepEqual(parseDeepLink('bldesk://server/42/backups?account=Work'), { kind: 'server', serverId: 42, subTab: 'backups', account: 'Work' })
})
