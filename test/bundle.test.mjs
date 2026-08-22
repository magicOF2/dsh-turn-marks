import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'

const root = new URL('..', import.meta.url)
const packageJson = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'))

test('declares a web DSH bundle whose patch exists', () => {
  assert.equal(packageJson.dsh?.bundle?.patch, './cordis.patch.yml')
  assert.equal(packageJson.dsh?.client?.platform, 'web')
  assert.ok(existsSync(new URL(packageJson.dsh.bundle.patch, root)))
})

test('client bundle registers the documented plugin contract', async () => {
  let registered
  globalThis.window = { __ModuleLoader__: { load: (bundle) => { registered = bundle } } }
  await import(new URL(`lib/client.js?test=${Date.now()}`, root))
  assert.equal(registered.id, 'dsh-turn-marks')
  const plugin = registered.factory((name) => {
    if (name === 'react') return {}
    throw new Error(`unexpected dependency: ${name}`)
  })
  assert.equal(typeof plugin.apply, 'function')
  assert.deepEqual(plugin.inject, ['slots'])
})
