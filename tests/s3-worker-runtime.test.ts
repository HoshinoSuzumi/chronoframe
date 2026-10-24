import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
const require = createRequire(import.meta.url)
const wrangler = createRequire(require.resolve('wrangler/package.json'))
const { Miniflare, convertV4MiniflareOptions } = wrangler('miniflare')
const { build } = wrangler('esbuild')
test('S3 browser distribution parses multipart/CORS XML in real workerd without DOMParser or Node loaders', async () => {
  execFileSync(process.execPath, ['packages/storage/scripts/build-edge.mjs'], {
    stdio: 'pipe',
  })
  const sdk = await readFile('packages/storage/dist/s3-edge.mjs', 'utf8')
  assert(!/\bDOMParser\b|node:fs/.test(sdk))
  const bundle = await build({
    stdin: {
      resolveDir: process.cwd(),
      contents: `import {createCloudS3} from '@chronoframe/storage/s3-edge';export default {async fetch(){const s=createCloudS3({endpoint:'https://s3.us-east-1.amazonaws.com',region:'us-east-1',bucket:'test-bucket',accessKeyId:'test-access',secretAccessKey:'test-secret'});const id=await s.multipart('test/file','image/jpeg');const recover=await s.recoverMultipart('test/file');const parts=await s.parts('test/file',id);const listedParts=await s.parts('test/file',recover[0]);const cors=await s.cors('https://app.chronoframe.art');const grant=await s.signPart('test/file',id,1,32);await s.abort('test/file',id);return Response.json({id,recover,parts,listedParts,cors,signed:new URL(grant).searchParams.get('X-Amz-Algorithm')})}}`,
    },
    bundle: true,
    platform: 'browser',
    format: 'esm',
    write: false,
  })
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      compatibilityDate: '2026-10-22',
      script: bundle.outputFiles[0].text,
      outboundService: async (request: Request) => {
        const u = new URL(request.url)
        const xml = (body: string) =>
          new Response(body, { headers: { 'content-type': 'application/xml' } })
        if (request.method === 'POST')
          return xml(
            '<InitiateMultipartUploadResult><UploadId>test-upload</UploadId></InitiateMultipartUploadResult>',
          )
        if (request.method === 'DELETE')
          return new Response(null, { status: 204 })
        if (u.searchParams.has('uploads')) {
          assert.equal(u.searchParams.get('encoding-type'), 'url')
          if (!u.searchParams.has('key-marker'))
            return xml(
              '<ListMultipartUploadsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><EncodingType>url</EncodingType><IsTruncated>true</IsTruncated><NextKeyMarker>test%2Ffile</NextKeyMarker><NextUploadIdMarker>marker</NextUploadIdMarker><Upload><Key>test%2Ffile-other</Key><UploadId>foreign-upload</UploadId></Upload></ListMultipartUploadsResult>',
            )
          assert.equal(u.searchParams.get('key-marker'), 'test/file')
          assert.equal(u.searchParams.get('upload-id-marker'), 'marker')
          return xml(
            '<ListMultipartUploadsResult><EncodingType>url</EncodingType><IsTruncated>false</IsTruncated><Upload><Key>test%2Ffile</Key><UploadId>listed-opaque-token</UploadId></Upload></ListMultipartUploadsResult>',
          )
        }
        if (u.searchParams.has('uploadId')) {
          assert(
            ['test-upload', 'listed-opaque-token'].includes(
              u.searchParams.get('uploadId')!,
            ),
          )
          return xml(
            '<ListPartsResult><Part><PartNumber>1</PartNumber><ETag>test-etag</ETag><Size>32</Size></Part></ListPartsResult>',
          )
        }
        if (u.searchParams.has('cors'))
          return xml(
            '<CORSConfiguration><CORSRule><AllowedOrigin>https://app.chronoframe.art</AllowedOrigin><AllowedMethod>GET</AllowedMethod><AllowedMethod>PUT</AllowedMethod><AllowedMethod>HEAD</AllowedMethod><AllowedHeader>*</AllowedHeader><ExposeHeader>ETag</ExposeHeader></CORSRule></CORSConfiguration>',
          )
        return new Response(null, { status: 404 })
      },
    }),
  )
  try {
    const response = await mf.dispatchFetch('https://test/')
    assert.equal(response.status, 200, await response.clone().text())
    assert.deepEqual(await response.json(), {
      id: 'test-upload',
      recover: ['listed-opaque-token'],
      parts: [{ partNumber: 1, etag: 'test-etag', bytes: 32 }],
      listedParts: [{ partNumber: 1, etag: 'test-etag', bytes: 32 }],
      cors: true,
      signed: 'AWS4-HMAC-SHA256',
    })
  } finally {
    await mf.dispose()
  }
})
