import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import createClient from 'openapi-fetch'
import { ApiError, apiFailure } from '../src/renderer/src/api/errors.ts'

// Execute the real hook's mutation against openapi-fetch, without rendering React or making a network request.
const source = readFileSync(new URL('../src/renderer/src/api/queries.ts', import.meta.url), 'utf8')
const file = ts.createSourceFile('queries.ts', source, ts.ScriptTarget.Latest, true)
const hook = file.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'useTakeBackupMutation')
assert.ok(hook, 'useTakeBackupMutation must still exist')
const compiled = ts.transpileModule(hook.getText(file), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText

function fixture(status, body, headers = {}) {
  const requests = [], invalidations = [], module = { exports: {} }
  const client = createClient({ baseUrl: 'https://backup-fixture.invalid', fetch: async request => {
    requests.push({ method: request.method, url: request.url, body: await request.json() })
    return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })
  } })
  runInNewContext(compiled, {
    module, exports: module.exports, apiFailure,
    useQueryClient: () => ({ invalidateQueries: key => invalidations.push(key) }),
    useMutation: options => options
  })
  return { mutation: module.exports.useTakeBackupMutation(client), requests, invalidations }
}

test('Take Backup rejects an empty HTTP failure instead of returning a successful undefined action', async () => {
  for (const status of [400, 403, 429]) {
    const { mutation, requests } = fixture(status)
    await assert.rejects(mutation.mutationFn({ serverId: 9003 }), error => {
      assert.ok(error instanceof ApiError)
      assert.equal(error.status, status)
      return true
    })
    assert.equal(requests.length, 1)
  }
})

test('an empty successful response remains successful without inventing an action', async () => {
  for (const [status, headers] of [[202, { 'content-length': '0' }], [204, {}]]) {
    const { mutation, requests } = fixture(status, undefined, headers)
    assert.equal(await mutation.mutationFn({ serverId: 9003 }), undefined)
    assert.equal(requests.length, 1)
  }
})

test('Take Backup preserves a quota reason that the summary already contains', async () => {
  const reason = 'Fixture temporary-backup allowance reached.'
  const message = `backup_type: ${reason}`
  const { mutation, requests } = fixture(400, { message, errors: { backup_type: [reason] } })
  await assert.rejects(mutation.mutationFn({ serverId: 9003 }), { name: 'ApiError', status: 400, message })
  assert.equal(requests.length, 1)
})

test('Take Backup preserves a field-level reason behind a generic summary', async () => {
  const { mutation, requests } = fixture(400, { message: 'Fixture validation failed.', errors: { backup_type: ['Fixture slot unavailable.'] } })
  await assert.rejects(mutation.mutationFn({ serverId: 9003 }), {
    name: 'ApiError', status: 400, message: 'Fixture validation failed. backup_type: Fixture slot unavailable.'
  })
  assert.equal(requests.length, 1)
})

test('a successful Take Backup returns the action and retains its request and invalidations', async () => {
  const action = { id: 51000, type: 'take_backup', status: 'in-progress' }
  const { mutation, requests, invalidations } = fixture(200, { action })
  assert.deepEqual(await mutation.mutationFn({ serverId: 9003, label: 'Fixture backup' }), action)
  assert.deepEqual(requests, [{ method: 'POST', url: 'https://backup-fixture.invalid/v2/servers/9003/actions',
    body: { type: 'take_backup', replacement_strategy: 'oldest', backup_type: 'temporary', label: 'Fixture backup' } }])
  mutation.onSuccess(action, { serverId: 9003 })
  assert.deepEqual(JSON.parse(JSON.stringify(invalidations)), [
    { queryKey: ['serverBackups', 9003] }, { queryKey: ['serverActions', 9003] }, { queryKey: ['servers'] }
  ])
})

test('a named replacement still sends the selected backup type and id', async () => {
  const action = { id: 51001, type: 'take_backup', status: 'in-progress' }
  const { mutation, requests } = fixture(200, { action })
  assert.deepEqual(await mutation.mutationFn({ serverId: 9003, backupType: 'temporary', replacementStrategy: 'specified', backupIdToReplace: 71001 }), action)
  assert.deepEqual(requests[0].body, {
    type: 'take_backup', replacement_strategy: 'specified', backup_type: 'temporary', backup_id_to_replace: 71001
  })
})
