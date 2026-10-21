import assert from 'node:assert/strict'
import { test } from 'node:test'
import { generateContributors } from './changelog-contributors.mjs'

test('resolves commit authors, retries unlinked commits, and deduplicates accounts', async () => {
  const commits = [
    { sha: '1', name: 'Developer', email: 'old@example.com' },
    { sha: '2', name: 'Developer', email: 'old@example.com' },
    { sha: '3', name: 'Other name', email: 'new@example.com' },
  ]
  const calls = []
  const output = await generateContributors(
    commits,
    async (sha) => {
      calls.push(sha)
      return {
        author: sha === '1' ? null : { login: 'developer' },
        committer: { login: 'web-flow' },
      }
    },
    assert.fail,
  )
  assert.deepEqual(calls, ['1', '2', '3'])
  assert.equal(output, '\n\n### ❤️ Contributors\n\n- Developer (@developer)\n')
})

test('handles noreply addresses, bots, and unlinked authors without exposing emails', async () => {
  const warnings = []
  const output = await generateContributors(
    [
      { sha: '1', name: 'Alice', email: '123+alice@users.noreply.github.com' },
      { sha: '2', name: 'Bob', email: 'bob@users.noreply.github.com' },
      { sha: '3', name: 'Unknown', email: 'private@example.com' },
      { sha: '4', name: 'dependabot[bot]', email: 'bot@example.com' },
    ],
    async (sha) => {
      assert.equal(sha, '3')
      return { author: null, committer: { login: 'someone-else' } }
    },
    (message) => warnings.push(message),
  )
  assert.match(output, /Alice \(@alice\)/)
  assert.match(output, /Bob \(@bob\)/)
  assert.match(output, /- Unknown\n/)
  assert.doesNotMatch(output, /private@example|someone-else|dependabot/)
  assert.equal(warnings.length, 1)
})

test('fails visibly on API errors instead of silently losing mentions', async () => {
  await assert.rejects(
    generateContributors(
      [{ sha: '1', name: 'Alice', email: 'alice@example.com' }],
      async () => {
        throw new Error('rate limit')
      },
      assert.fail,
    ),
    /rate limit/,
  )
  assert.equal(await generateContributors([], assert.fail, assert.fail), '')
})
