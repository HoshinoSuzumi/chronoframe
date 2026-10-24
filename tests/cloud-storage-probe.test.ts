import assert from 'node:assert/strict'
import test from 'node:test'
import {
  probeStorageConnection,
  StorageConnectionError,
  type StorageProbeClient,
} from '../packages/storage/src/connection-probe.ts'
import { createCloudS3 } from '../packages/storage/src/s3-edge.ts'
function fixture(fail?: string) {
  const calls: string[] = []
  let data = new Uint8Array(0)
  const hit = (stage: string) => {
    calls.push(stage)
    if (stage === fail)
      throw new Error('provider-secret-and-signed-url-must-not-leak')
  }
  const client: StorageProbeClient = {
    async put(key, bytes) {
      assert.match(key, /^chronoframe\/connection-check\/[a-f0-9-]+$/)
      data = bytes
      hit('write')
    },
    async head() {
      hit('read')
      return { bytes: data.length }
    },
    async getProbe() {
      return data
    },
    async signGet() {
      hit('signed_read')
      return 'https://private.example/object?secret=not-public'
    },
    async multipart() {
      hit('multipart')
      return 'upload-id'
    },
    async recoverMultipart() {
      hit('recover')
      return ['upload-id']
    },
    async abort() {
      hit('abort')
    },
    async browserCors() {
      hit('cors')
      return true
    },
    async remove() {
      hit('cleanup')
    },
  }
  return { client, calls }
}
test('Connection probe checks object operations and returns only safe fixed failure codes', async () => {
  for (const stage of [
    'write',
    'read',
    'signed_read',
    'multipart',
    'cors',
    'cleanup',
  ]) {
    const f = fixture(stage)
    await assert.rejects(
      probeStorageConnection(
        f.client,
        'https://portal.example',
        async () => new Response('ok'),
      ),
      (error) => {
        assert(error instanceof StorageConnectionError)
        assert.equal(error.code, 'storage_' + stage + '_failed')
        assert(!JSON.stringify(error).includes('secret'))
        assert(!error.message.includes('private.example'))
        return true
      },
    )
    assert(f.calls.includes('cleanup'))
  }
  const f = fixture()
  await probeStorageConnection(
    f.client,
    'https://portal.example',
    async () => new Response('ok'),
  )
  assert.deepEqual(f.calls, [
    'write',
    'read',
    'signed_read',
    'multipart',
    'recover',
    'abort',
    'cors',
    'cleanup',
  ])
})
test('Probe detects truncated content and preserves the primary error when compensation fails', async () => {
  const short = fixture()
  short.client.getProbe = async () => new Uint8Array(31)
  await assert.rejects(
    probeStorageConnection(short.client, 'https://portal.example'),
    { code: 'storage_read_failed' },
  )
  const broken = fixture('recover')
  broken.client.remove = async () => {
    throw new Error('cleanup-secret')
  }
  await assert.rejects(
    probeStorageConnection(
      broken.client,
      'https://portal.example',
      async () => new Response('ok'),
    ),
    { code: 'storage_multipart_failed' },
  )
  assert(broken.calls.includes('abort'))
  const redirect = fixture()
  await assert.rejects(
    probeStorageConnection(
      redirect.client,
      'https://portal.example',
      async (_url, init) => {
        assert.equal(init?.redirect, 'manual')
        return new Response(null, { status: 302 })
      },
    ),
    { code: 'storage_signed_read_failed' },
  )
})
const config = {
  endpoint: 'https://s3.us-east-1.amazonaws.com',
  region: 'us-east-1',
  bucket: 'private-bucket',
  accessKeyId: 'test-access',
  secretAccessKey: 'test-secret',
}
test('Browser CORS checks do not require GetBucketCors or bucket administration', async () => {
  for (const failure of [
    '',
    'origin',
    'method',
    'header',
    'etag',
    'redirect',
  ]) {
    const methods: string[] = []
    const client = createCloudS3(config, {
      fetch: async (input, init) => {
        const url = new URL(
          input instanceof Request ? input.url : String(input),
        )
        assert(!url.searchParams.has('cors'))
        assert.equal(init?.redirect, 'manual')
        methods.push(init?.method ?? 'GET')
        if (failure === 'redirect')
          return new Response(null, {
            status: 302,
            headers: { location: 'https://internal.invalid' },
          })
        const headers: Record<string, string> = {
          'access-control-allow-origin':
            failure === 'origin'
              ? 'https://other.example'
              : 'https://portal.example',
          'access-control-allow-methods':
            failure === 'method' ? 'GET' : 'GET, PUT, HEAD',
          'access-control-allow-headers':
            failure === 'header' ? 'X-Other' : 'Content-Type',
          'access-control-expose-headers': failure === 'etag' ? 'Date' : 'ETag',
          etag: 'probe-etag',
        }
        return new Response(init?.method === 'OPTIONS' ? null : 'probe', {
          status: init?.method === 'OPTIONS' ? 204 : 200,
          headers,
        })
      },
    })
    assert.equal(
      await client.browserCors(
        'https://portal.example',
        'chronoframe/connection-check/test',
      ),
      !failure,
    )
    if (!failure)
      assert.deepEqual(methods, ['OPTIONS', 'OPTIONS', 'OPTIONS', 'GET'])
  }
})
