import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { edgeAppSecretForOgDeployment } from '../scripts/og-image-deployment.mjs'

test('Worker app secrets are scoped to validation and publication, not dependency installation or builds', () => {
  const require = createRequire(import.meta.url)
  const { parse } = createRequire(require.resolve('wrangler/package.json'))(
    'yaml',
  )
  const workflow = parse(
    readFileSync(
      new URL('../.github/workflows/deploy-saas.yml', import.meta.url),
      'utf8',
    ),
  )
  const job = workflow.jobs.deploy
  assert.equal(job.env.CLOUD_APP_SECRET, undefined)
  assert.equal(job.env.SITE_APP_SECRET, undefined)
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
})

test('publication passes each Worker its own app secret through the Wrangler secrets file', () => {
  const require = createRequire(import.meta.url)
  const { parse } = createRequire(require.resolve('wrangler/package.json'))(
    'yaml',
  )
  const workflow = parse(
    readFileSync('.github/workflows/deploy-saas.yml', 'utf8'),
  )
  const publish = workflow.jobs.deploy.steps.find(
    (step: { name: string }) => step.name === 'Publish approved Workers',
  )
  const directory = mkdtempSync(join(tmpdir(), 'chronoframe-publish-secrets-'))
  const capture = join(directory, 'wrangler-calls.jsonl')
  try {
    // Run the actual publication shell, replacing only the external deploy command.
    writeFileSync(
      join(directory, 'pnpm'),
      `#!${process.execPath}
const fs = require('node:fs')
const args = process.argv.slice(2)
if (args[0] !== 'exec' || args[1] !== 'wrangler') throw new Error('Unexpected publication command')
const file = args[args.indexOf('--secrets-file') + 1]
fs.appendFileSync(process.env.CAPTURE, JSON.stringify({
  args, values: JSON.parse(fs.readFileSync(file, 'utf8')),
  mode: fs.statSync(file).mode & 0o777,
}) + '\\n')
`,
      { mode: 0o700 },
    )
    const env = {
      PATH: [
        directory,
        process.env.PATH,
        dirname(process.execPath),
        '/usr/bin',
        '/bin',
      ]
        .filter(Boolean)
        .join(':'),
      RUNNER_TEMP: directory,
      GITHUB_STEP_SUMMARY: join(directory, 'summary.md'),
      CAPTURE: capture,
      ENTRIES: 'cloud site',
      DEPLOY_ENVIRONMENT: 'production',
      SOURCE_COMMIT: 'fixture-commit',
      GITHUB_RUN_ID: '1',
      GITHUB_RUN_ATTEMPT: '1',
      CLOUDFLARE_API_TOKEN: 'fixture-token',
      CLOUDFLARE_ACCOUNT_ID: 'fixture-account',
      CLOUD_APP_SECRET: 'cloud-fixture-secret'.repeat(3),
      SITE_APP_SECRET: 'site-fixture-secret'.repeat(3),
      PLATFORM_PORTAL_ORIGIN: '',
      PLATFORM_EMAIL_FROM: '',
      CLOUD_PLATFORM_SECRET: '',
      SITE_PLATFORM_SECRET: '',
      PLATFORM_STORAGE_SECRET: '',
      PLATFORM_S3_ENDPOINT_HOSTS: '',
    }
    const result = spawnSync('bash', ['-c', publish.run], {
      env,
      encoding: 'utf8',
      timeout: 30_000,
    })
    assert.equal(result.status, 0, result.stderr)
    const calls = readFileSync(capture, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
    assert.equal(calls.length, 2)
    for (const [index, entry] of ['cloud', 'site'].entries()) {
      const call = calls[index]
      assert.equal(
        call.args[call.args.indexOf('--config') + 1],
        `apps/${entry}/.output/server/wrangler.json`,
      )
      assert.deepEqual(call.values, {
        NUXT_APP_SECRET:
          entry === 'cloud' ? env.CLOUD_APP_SECRET : env.SITE_APP_SECRET,
      })
      assert.equal(call.mode, 0o600)
    }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
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
