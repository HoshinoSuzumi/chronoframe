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
