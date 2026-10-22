import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CoreError,
  createMultipartCompleter,
  completeLocalUpload,
  type MultipartSession,
} from '@chronoframe/core'

const code = (status: number) => (error: unknown) =>
  error instanceof CoreError && error.statusCode === status
const parts = [
  { partNumber: 1, etag: 'one' },
  { partNumber: 2, etag: 'two' },
]

test('multipart completion enforces ownership, ordered parts and a single reserved completion', async () => {
  let completed = 0
  const session: MultipartSession = {
    owner: 'owner',
    key: 'p.jpg',
    busy: false,
    cancelled: false,
    completed: false,
    touched: 0,
    setup: {
      partUrls: ['one', 'two'],
      complete: async () => {
        completed++
      },
    },
  }
  const complete = createMultipartCompleter({
    sessions: { get: () => session, abort: async () => {} },
    now: () => 1000,
    event() {},
  })
  await assert.rejects(
    complete('id', 'stranger', async () => parts),
    code(404),
  )
  for (const invalid of [
    undefined,
    [],
    parts.slice(0, 1),
    [parts[0], parts[0]],
    [...parts].reverse(),
    [{ partNumber: 1, etag: '' }, parts[1]],
  ]) {
    await assert.rejects(
      complete('id', 'owner', async () => invalid),
      code(400),
    )
    assert.equal(session.busy, false)
  }
  let release!: (value: unknown) => void
  const inFlight = complete(
    'id',
    'owner',
    () =>
      new Promise((resolve) => {
        release = resolve
      }),
  )
  assert.equal(session.busy, true)
  await assert.rejects(
    complete('id', 'owner', async () => parts),
    code(409),
  )
  release(parts)
  assert.deepEqual(await inFlight, { ok: true, key: 'p.jpg' })
  await complete('id', 'owner', async () => {
    throw new Error('must not read repeated body')
  })
  assert.equal(completed, 1)
})

test('cancellation while reading completion data aborts without publishing', async () => {
  let aborted = 0
  let published = 0
  const session: MultipartSession = {
    owner: 'owner',
    key: 'p',
    busy: false,
    cancelled: false,
    completed: false,
    touched: 0,
    setup: {
      partUrls: ['one', 'two'],
      complete: async () => {
        published++
      },
    },
  }
  const complete = createMultipartCompleter({
    sessions: {
      get: () => session,
      abort: async () => {
        aborted++
      },
    },
    now: Date.now,
    event() {},
  })
  await assert.rejects(
    complete('id', 'owner', async () => {
      session.cancelled = true
      return parts
    }),
    code(410),
  )
  assert.equal(published, 0)
  assert.equal(aborted, 1)
  assert.equal(session.busy, false)
})

test('Local completion validates byte count, only marks successful publication, and tolerates cleanup failure', async () => {
  let published = 0
  let marked = false
  const input = {
    completed: false,
    cancelled: false,
    key: 'p',
    size: 9,
    partSize: 5,
    receivedParts: 2,
    fileSize: async () => 9,
    publish: async () => {
      published++
    },
    markCompleted: () => {
      marked = true
    },
    cleanup: async () => {
      throw new Error('cleanup failure')
    },
  }
  await assert.rejects(
    completeLocalUpload({ ...input, receivedParts: 1 }),
    code(400),
  )
  await assert.rejects(
    completeLocalUpload({ ...input, fileSize: async () => 8 }),
    code(400),
  )
  await assert.rejects(
    completeLocalUpload({
      ...input,
      publish: async () => {
        throw new Error('write failure')
      },
    }),
  )
  assert.equal(marked, false)
  await completeLocalUpload(input)
  assert.equal(marked, true)
  assert.equal(published, 1)
})
