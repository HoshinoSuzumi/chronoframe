import test from 'node:test'
import assert from 'node:assert/strict'
import { readSiteBody } from '../apps/cloud/server/utils/site-body.ts'
const encode = (value: string) => new TextEncoder().encode(value)
function chunks(values: Uint8Array[]) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const value of values) controller.enqueue(value)
      controller.close()
    },
  })
}

test('Site JSON body handles split UTF-8 and accepts the exact byte boundary', async () => {
  const value = encode(JSON.stringify({ name: '摄影集' }))
  assert.deepEqual(
    await readSiteBody(
      chunks([...value].map((byte) => new Uint8Array([byte]))),
    ),
    { name: '摄影集' },
  )
  const exact = encode(JSON.stringify({ name: 'a'.repeat(4085) }))
  assert.equal(exact.byteLength, 4096)
  assert.equal((await readSiteBody(chunks([exact]))).name, 'a'.repeat(4085))
  const over = encode(JSON.stringify({ name: 'a'.repeat(4086) }))
  assert.equal(over.byteLength, 4097)
  await assert.rejects(readSiteBody(chunks([over])), { statusCode: 400 })
})

test('Oversized unbounded streams are cancelled before the remaining body is read', async () => {
  let pulls = 0
  let cancelled = false
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        pulls++
        controller.enqueue(new Uint8Array(2048))
        if (pulls > 100) throw new Error('The oversized stream was drained')
      },
      cancel() {
        cancelled = true
      },
    },
    { highWaterMark: 0 },
  )
  await assert.rejects(readSiteBody(stream), { statusCode: 400 })
  assert.equal(pulls, 3)
  assert.equal(cancelled, true)
  assert.equal(stream.locked, false)
})

test('The body cap counts bytes, not characters, and rejects malformed/non-object JSON', async () => {
  const oversized = encode(JSON.stringify({ name: '摄'.repeat(1400) }))
  await assert.rejects(readSiteBody(chunks([oversized])), { statusCode: 400 })
  for (const value of ['', '{', 'null', 'false', '42', '"text"', '[]'])
    await assert.rejects(readSiteBody(chunks([encode(value)])), {
      statusCode: 400,
    })
  await assert.rejects(readSiteBody(chunks([new Uint8Array([0xff])])), {
    statusCode: 400,
  })
  await assert.rejects(readSiteBody(null), { statusCode: 400 })
})

/** Run the real H3 adapter with an original Worker request and no synthetic body. */
async function managementBody(
  event: unknown,
  h3Stream: () => ReadableStream<Uint8Array> | undefined,
) {
  const { readFile } = await import('node:fs/promises')
  const ts = await import('typescript')
  const source = (
    await readFile('apps/cloud/server/utils/site-management.ts', 'utf8')
  ).replace(/^import[\s\S]*?from ['"][^'"]+['"]\s*\n/gm, '')
  const code = ts.default.transpileModule(source, {
    compilerOptions: {
      module: ts.default.ModuleKind.CommonJS,
      target: ts.default.ScriptTarget.ES2022,
    },
  }).outputText
  const { createError } = await import('h3')
  return new Function(
    'exports',
    'getHeader',
    'getRequestWebStream',
    'readSiteBody',
    'createError',
    code + ';return exports.siteManagementBody',
  )(
    {},
    () => 'application/json',
    h3Stream,
    readSiteBody,
    createError,
  )(event)
}

test('DELETE JSON uses the original Worker body instead of waiting on an empty H3 stream', async () => {
  const request = new Request(
    'https://app.example.test/api/account/connections',
    { method: 'DELETE', body: JSON.stringify({ id: '5' }) },
  )
  const body = await managementBody(
    { method: 'DELETE', context: { cloudflare: { request } } },
    () => {
      throw Error('Dropped H3 body must not be read')
    },
  )
  assert.deepEqual(body, { id: '5' })
  await assert.rejects(
    managementBody(
      { method: 'DELETE', context: { cloudflare: { request } } },
      () => undefined,
    ),
    { statusCode: 400 },
  )
})

test('Buffered PATCH and Node DELETE requests retain the bounded H3 stream path', async () => {
  for (const method of ['PATCH', 'DELETE']) {
    const request =
      method === 'PATCH'
        ? new Request('https://app.example.test', { method, body: '{}' })
        : undefined
    if (request) await request.text()
    assert.deepEqual(
      await managementBody(
        { method, context: { cloudflare: { request } } },
        () => chunks([encode('{"id":"7"}')]),
      ),
      { id: '7' },
    )
  }
})
