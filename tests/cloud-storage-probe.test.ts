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
    async parts(_key, uploadId) {
      hit('parts:' + uploadId)
      return []
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
        assert.equal(
          error.code,
          'storage_' +
            (stage === 'multipart' ? 'multipart_create' : stage) +
            '_failed',
        )
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
    'parts:upload-id',
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
    { code: 'storage_multipart_list_failed' },
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

test('Multipart diagnostics identify each operation and redact arbitrary provider fields', async () => {
  for (const [method, step] of [
    ['multipart', 'create'],
    ['recoverMultipart', 'list'],
    ['abort', 'abort'],
  ] as const) {
    const f = fixture()
    f.client[method] = async () => {
      throw Object.assign(new Error('secret signed URL'), {
        name: 'AccessDenied',
        $metadata: { httpStatusCode: 403, requestId: 'secret' },
        response: 'secret',
      })
    }
    await assert.rejects(
      probeStorageConnection(
        f.client,
        'https://portal.example',
        async () => new Response('ok'),
      ),
      (error) => {
        assert(error instanceof StorageConnectionError)
        assert.equal(error.code, `storage_multipart_${step}_failed`)
        assert.equal(error.providerCode, 'AccessDenied')
        assert.equal(error.providerStatus, 403)
        assert(!JSON.stringify(error).includes('secret'))
        return true
      },
    )
    assert(f.calls.includes('cleanup'))
  }
  const unknown = new StorageConnectionError('multipart_create', {
    name: 'https://secret.example',
    $metadata: { httpStatusCode: 'secret' },
  })
  assert.equal(unknown.providerCode, undefined)
  assert.equal(unknown.providerStatus, undefined)
  const both = fixture('recover')
  both.client.abort = async () => {
    throw new Error('abort also failed')
  }
  await assert.rejects(
    probeStorageConnection(
      both.client,
      'https://portal.example',
      async () => new Response('ok'),
    ),
    {
      code: 'storage_multipart_list_failed',
    },
  )
  const absent = fixture()
  absent.client.recoverMultipart = async () => []
  await assert.rejects(
    probeStorageConnection(
      absent.client,
      'https://portal.example',
      async () => new Response('ok'),
    ),
    {
      code: 'storage_multipart_list_failed',
    },
  )
  assert(absent.calls.includes('abort'))
})

test('Multipart recovery matches URL-encoded keys and follows exact pagination markers', async () => {
  const key = 'chronoframe/connection-check/a%2Fb space+测试'
  const requests: URL[] = []
  const xml = (s: string) =>
    new Response(s, { headers: { 'content-type': 'application/xml' } })
  const client = createCloudS3(config, {
    fetch: async (input) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      requests.push(url)
      assert.equal(url.searchParams.get('prefix'), key)
      assert.equal(url.searchParams.get('encoding-type'), 'url')
      if (requests.length === 1)
        return xml(
          `<ListMultipartUploadsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><EncodingType>url</EncodingType><IsTruncated>true</IsTruncated><NextKeyMarker>${encodeURIComponent(key)}</NextKeyMarker><NextUploadIdMarker>cursor-id</NextUploadIdMarker><Upload><Key>${encodeURIComponent(key + '-other')}</Key><UploadId>foreign</UploadId></Upload></ListMultipartUploadsResult>`,
        )
      assert.equal(url.searchParams.get('key-marker'), key)
      assert.equal(url.searchParams.get('upload-id-marker'), 'cursor-id')
      return xml(
        `<ListMultipartUploadsResult><EncodingType>url</EncodingType><IsTruncated>false</IsTruncated><Upload><Key>${encodeURIComponent(key)}</Key><UploadId>expected</UploadId></Upload><Upload><Key>${encodeURIComponent(key + '-other')}</Key><UploadId>foreign</UploadId></Upload></ListMultipartUploadsResult>`,
      )
    },
  })
  assert.deepEqual(await client.recoverMultipart(key), ['expected'])
  assert.equal(requests.length, 2)
})

test('Multipart recovery preserves literal percent keys and rejects incomplete or looping listings', async () => {
  const key = 'test/literal%2Fname'
  const make = (body: string) =>
    createCloudS3(config, {
      fetch: async () =>
        new Response(body, { headers: { 'content-type': 'application/xml' } }),
    })
  assert.deepEqual(
    await make(
      `<ListMultipartUploadsResult><Upload><Key>${key}</Key><UploadId>literal</UploadId></Upload></ListMultipartUploadsResult>`,
    ).recoverMultipart(key),
    ['literal'],
  )
  assert.deepEqual(
    await make(
      '<ListMultipartUploadsResult><EncodingType>url</EncodingType><Upload><Key>test%2Fliteral%252Fname</Key><UploadId>encoded</UploadId></Upload></ListMultipartUploadsResult>',
    ).recoverMultipart(key),
    ['encoded'],
  )
  await assert.rejects(
    make(
      '<ListMultipartUploadsResult><EncodingType>url</EncodingType><Upload><Key>test%ZZ</Key><UploadId>bad</UploadId></Upload></ListMultipartUploadsResult>',
    ).recoverMultipart(key),
  )
  await assert.rejects(
    make(
      '<ListMultipartUploadsResult><IsTruncated>true</IsTruncated></ListMultipartUploadsResult>',
    ).recoverMultipart(key),
    /Missing multipart pagination marker/,
  )
  await assert.rejects(
    make(
      '<ListMultipartUploadsResult><IsTruncated>true</IsTruncated><NextKeyMarker>same</NextKeyMarker><NextUploadIdMarker>same</NextUploadIdMarker></ListMultipartUploadsResult>',
    ).recoverMultipart(key),
    /Repeated multipart pagination marker/,
  )
  let calls = 0
  const many = createCloudS3(config, {
    fetch: async () =>
      new Response(
        `<ListMultipartUploadsResult><IsTruncated>true</IsTruncated><NextKeyMarker>key-${++calls}</NextKeyMarker></ListMultipartUploadsResult>`,
        { headers: { 'content-type': 'application/xml' } },
      ),
  })
  await assert.rejects(
    many.recoverMultipart(key),
    /Multipart pagination limit exceeded/,
  )
  assert.equal(calls, 20)
})

test('Connection probe accepts different usable opaque multipart IDs returned by create and list', async () => {
  const f = fixture(),
    checked: string[] = []
  f.client.recoverMultipart = async () => ['listed-opaque-token']
  f.client.parts = async (_key, id) => {
    checked.push(id)
    assert(['upload-id', 'listed-opaque-token'].includes(id))
    return []
  }
  await probeStorageConnection(
    f.client,
    'https://portal.example',
    async () => new Response('ok'),
  )
  assert.deepEqual(checked, ['upload-id', 'listed-opaque-token'])
  assert(f.calls.includes('abort'))
  assert(f.calls.includes('cors'))
  assert(f.calls.includes('cleanup'))
})

test('Opaque multipart ID validation rejects unusable, missing and nonempty probes and still cleans up', async () => {
  for (const invalid of ['listed', 'created', 'missing', 'nonempty']) {
    const f = fixture()
    f.client.recoverMultipart = async () =>
      invalid === 'missing' ? [] : ['listed-token']
    f.client.parts = async (_key, handle) => {
      if (invalid === 'nonempty') return [{}]
      if (
        (invalid === 'listed' && handle === 'listed-token') ||
        (invalid === 'created' && handle === 'upload-id')
      )
        throw Object.assign(new Error('provider secret must not leak'), {
          name: 'NoSuchUpload',
          $metadata: { httpStatusCode: 404 },
        })
      return []
    }
    await assert.rejects(
      probeStorageConnection(
        f.client,
        'https://portal.example',
        async () => new Response('ok'),
      ),
      (error) => {
        assert(error instanceof StorageConnectionError)
        assert.equal(error.code, 'storage_multipart_list_failed')
        assert(!JSON.stringify(error).includes('secret'))
        return true
      },
    )
    assert(f.calls.includes('abort'))
    assert(f.calls.includes('cleanup'))
    assert(!f.calls.includes('cors'))
  }
})
