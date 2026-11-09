import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { edgeAppSecretForOgDeployment } from '../scripts/og-image-deployment.mjs'

/** Parse deploy-saas.yml for structural secret-scoping assertions. */
function deploySaasWorkflow() {
  const require = createRequire(import.meta.url)
  const { parse } = createRequire(require.resolve('wrangler/package.json'))(
    'yaml',
  )
  return parse(
    readFileSync(
      new URL('../.github/workflows/deploy-saas.yml', import.meta.url),
      'utf8',
    ),
  )
}

test('Worker app secrets stay step-scoped and publication selects each entry secret', () => {
  const job = deploySaasWorkflow().jobs.deploy
  assert.equal(job.env?.CLOUD_APP_SECRET, undefined)
  assert.equal(job.env?.SITE_APP_SECRET, undefined)

  const scopes: string[] = []
  for (const step of job.steps)
    if (step.env?.CLOUD_APP_SECRET || step.env?.SITE_APP_SECRET) {
      assert.equal(step.env.CLOUD_APP_SECRET, '${{ secrets.CLOUD_APP_SECRET }}')
      assert.equal(step.env.SITE_APP_SECRET, '${{ secrets.SITE_APP_SECRET }}')
      scopes.push(step.name)
    }
  assert.deepEqual(scopes, [
    'Validate platform runtime configuration',
    'Publish approved Workers',
  ])

  const publish = job.steps.find(
    (step: { name?: string }) => step.name === 'Publish approved Workers',
  )
  assert.ok(publish?.run)
  assert.match(publish.run, /edgeAppSecretForOgDeployment/)
  assert.match(
    publish.run,
    /NUXT_APP_SECRET:\s*edgeAppSecretForOgDeployment\(process\.env\.ENTRY\)/,
  )
})

test('Worker signing uses each entry-specific application secret', () => {
  const env = {
    CLOUD_APP_SECRET: 'c'.repeat(32),
    SITE_APP_SECRET: 's'.repeat(32),
  }
  assert.equal(edgeAppSecretForOgDeployment('cloud', env), env.CLOUD_APP_SECRET)
  assert.equal(edgeAppSecretForOgDeployment('site', env), env.SITE_APP_SECRET)
})

test('missing or short Worker signing secrets fail without leaking values', () => {
  for (const entry of ['cloud', 'site']) {
    assert.throws(() => edgeAppSecretForOgDeployment(entry, {}), /APP_SECRET/)
    for (const value of ['private-short-key', 'x'.repeat(31)])
      assert.throws(
        () =>
          edgeAppSecretForOgDeployment(entry, {
            [entry.toUpperCase() + '_APP_SECRET']: value,
          }),
        (error: unknown) => {
          assert.ok(error instanceof Error)
          assert.match(error.message, /at least 32/)
          assert.ok(!error.message.includes(value))
          return true
        },
      )
  }
  assert.throws(() => edgeAppSecretForOgDeployment('invalid', {}), /entry/)
})
