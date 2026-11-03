import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { effectScope, ref } from 'vue'
import {
  createCloudUploadHarness,
  loadUploadCode,
} from './helpers/upload-runtime.ts'
import { canFallbackToSingleUpload } from '../packages/storage/src/multipart-fallback.ts'

const tick = () => new Promise<void>((resolve) => setImmediate(resolve))
const context = {
  siteId: 7,
  scope: 'site:7:user:1',
  userId: 1,
  name: 'Gallery',
  admin: true,
}

function xhrFixture(respond?: (xhr: FakeXHR) => void) {
  const requests: FakeXHR[] = []
  class FakeXHR {
    method = ''
    url = ''
    status = 0
    timeout = 0
    body?: Blob
    headers: Record<string, string> = {}
    etag: string | null = '"fixture"'
    aborted = false
    listeners: Record<string, ((event?: unknown) => void)[]> = {}
    progress?: (event: unknown) => void
    upload = {
      addEventListener: (_: string, callback: (event: unknown) => void) => {
        this.progress = callback
      },
    }
    open(method: string, url: string) {
      this.method = method
      this.url = url
    }
    setRequestHeader(key: string, value: string) {
      this.headers[key] = value
    }
    getResponseHeader() {
      return this.etag
    }
    addEventListener(event: string, callback: () => void) {
      ;(this.listeners[event] ??= []).push(callback)
    }
    emit(event: string) {
      for (const callback of this.listeners[event] ?? []) callback()
    }
    send(body?: Blob) {
      this.body = body
      requests.push(this)
      queueMicrotask(() => (respond ? respond(this) : this.succeed()))
    }
    succeed() {
      if (this.aborted) return
      this.progress?.({ lengthComputable: true, loaded: this.body?.size ?? 0 })
      this.status = 200
      this.emit('load')
    }
    abort() {
      this.aborted = true
      this.emit('abort')
    }
  }
  return { XMLHttpRequest: FakeXHR, requests }
}
type FakeXHR = ReturnType<typeof xhrFixture>['requests'][number]

function transport(globals: Record<string, unknown> = {}) {
  return loadUploadCode('packages/console/app/composables/useUpload.ts', {
    useNuxtApp: () => ({ $i18n: { t: (key: string) => key } }),
    $fetch: async () => {},
    ...globals,
  }).useUpload
}

test('both editions render the same upload controls and Cloud mounts its queue outside routed layouts', () => {
  for (const path of [
    'packages/console/app/pages/dashboard/photos.vue',
    'apps/cloud/app/components/CloudUploadDrawer.vue',
  ]) {
    const source = readFileSync(path, 'utf8')
    assert.match(source, /<PhotoUploadSlideover/)
    assert.doesNotMatch(source, /<UFileUpload|type="file"/)
  }
  const cloud = readFileSync('apps/cloud/app/app.vue', 'utf8')
  assert.match(cloud, /provideCloudUploads\(\)/)
  assert.match(cloud, /<\/NuxtLayout>\s*<CloudTransferPanel/)
  assert.doesNotMatch(
    readFileSync('apps/cloud/app/components/CloudSiteWorkspace.vue', 'utf8'),
    /CloudTransferPanel/,
  )
  assert.match(
    readFileSync('apps/cloud/app/components/CloudTransferPanel.vue', 'utf8'),
    /<UploadQueuePanel/,
  )
})

test('shared scheduler limits all batches to three files and discards cancelled waiting entries', async () => {
  const scope = effectScope()
  const module = loadUploadCode(
    'packages/console/app/composables/useUploadQueue.ts',
  )
  const queue = scope.run(() => module.useUploadQueue())!
  const started: string[] = []
  const releases: (() => void)[] = []
  const run = async (entry: { fileName: string }) => {
    started.push(entry.fileName)
    await new Promise<void>((resolve) => releases.push(resolve))
  }
  try {
    const first = queue.enqueue(
      [1, 2, 3, 4].map((n) => new File(['x'], `${n}.jpg`)),
      run,
    )
    const second = queue.enqueue([new File(['x'], '5.jpg')], run)
    await tick()
    assert.deepEqual(started, ['1.jpg', '2.jpg', '3.jpg'])
    const waiting = [...queue.uploadingFiles.value.values()].find(
      (item: any) => item.fileName === '4.jpg',
    ) as any
    queue.remove(waiting.fileId)
    releases.shift()!()
    await tick()
    assert.deepEqual(started, ['1.jpg', '2.jpg', '3.jpg', '5.jpg'])
    releases.forEach((release) => release())
    await Promise.all([first, second])
    assert.equal(queue.uploadingFiles.value.size, 4)
  } finally {
    scope.stop()
  }
})

test('shared multipart transport uploads concurrent parts, retries transient failures and finalizes ordered ETags', async () => {
  let failed = false
  const xhr = xhrFixture((request) => {
    if (request.url === 'part-2' && !failed) {
      failed = true
      request.status = 503
      request.emit('load')
    } else request.succeed()
  })
  const upload = transport(xhr)({ retryDelay: 0 })
  const states: string[] = []
  await upload.uploadFile(
    new File(['abcdefg'], 'photo.jpg'),
    {
      mode: 'multipart',
      url: '/complete',
      partSize: 2,
      partUrls: ['part-1', 'part-2', 'part-3', 'part-4'],
    },
    { onStatusChange: (status: string) => states.push(status) },
  )
  assert.deepEqual(
    xhr.requests.slice(0, 3).map((r) => r.url),
    ['part-1', 'part-2', 'part-3'],
  )
  assert.equal(xhr.requests.filter((r) => r.url === 'part-2').length, 2)
  const completion = xhr.requests.at(-1)!
  assert.equal(completion.method, 'POST')
  assert.deepEqual(
    JSON.parse(await completion.body!.text()).parts,
    [1, 2, 3, 4].map((partNumber) => ({ partNumber, etag: '"fixture"' })),
  )
  assert(states.includes('finalizing'))
  assert.equal(upload.uploadStatus.value.status, 'success')
  assert.equal(upload.uploadStatus.value.progress.percentage, 100)
})

test('server-verified resume skips only exact-size parts, accepts hidden ETags and preserves failed sessions', async () => {
  const xhr = xhrFixture((request) => {
    request.etag = null
    request.succeed()
  })
  const upload = transport(xhr)({
    multipart: {
      verifyPartsOnServer: true,
      uploadedParts: [
        { partNumber: 1, bytes: 2 },
        { partNumber: 2, bytes: 1 },
      ],
      preserveOnError: true,
    },
  })
  await upload.uploadFile(new File(['abcdef'], 'photo.jpg'), {
    mode: 'multipart',
    url: '/complete',
    partSize: 2,
    partUrls: ['part-1', 'part-2', 'part-3'],
  })
  assert.deepEqual(
    xhr.requests.map((r) => r.url),
    ['part-2', 'part-3', '/complete'],
  )
  assert.deepEqual(JSON.parse(await xhr.requests.at(-1)!.body!.text()), {})
  const failedXHR = xhrFixture((request) => {
    request.status = 403
    request.emit('load')
  })
  let cleanup = 0
  const failed = transport({
    ...failedXHR,
    $fetch: async () => {
      cleanup++
    },
  })({
    multipart: { verifyPartsOnServer: true, preserveOnError: true },
  })
  await assert.rejects(
    failed.uploadFile(new File(['xx'], 'photo.jpg'), {
      mode: 'multipart',
      url: '/complete',
      partSize: 2,
      partUrls: ['part'],
    }),
  )
  assert.equal(
    failedXHR.requests.length,
    1,
    'authorization errors are not retried',
  )
  assert.equal(cleanup, 0)
})

test('legacy chunks and sequential range plans retain their original completion protocols', async () => {
  for (const mode of ['chunks', 'range'] as const) {
    const xhr = xhrFixture()
    const upload = transport(xhr)()
    await upload.uploadFile(
      new File(['abcdef'], 'photo.jpg'),
      mode === 'chunks'
        ? { mode, url: '/chunks' }
        : { mode, url: '/range', partSize: 2 },
    )
    if (mode === 'chunks') {
      assert.deepEqual(
        xhr.requests.map((r) => [r.method, r.url]),
        [
          ['PUT', '/chunks?index=0'],
          ['POST', '/chunks'],
        ],
      )
    } else {
      assert.deepEqual(
        xhr.requests.map((r) => r.headers['Content-Range']),
        ['bytes 0-1/6', 'bytes 2-3/6', 'bytes 4-5/6'],
      )
      assert(xhr.requests.every((r) => r.method === 'PUT'))
    }
  }
})

test('Cloud upload continues after page disposal and Site navigation, then polls the original Site', async () => {
  let release!: () => void
  const reservation = new Promise<void>((resolve) => {
    release = resolve
  })
  const paths: string[] = []
  const xhr = xhrFixture()
  const currentSite = ref(7)
  const runtime = createCloudUploadHarness({
    ...xhr,
    formatBytes: (value: number) => String(value),
    $fetch: async (path: string) => {
      paths.push(path)
      if (path.endsWith('/uploads')) await reservation
      if (path.endsWith('/plan'))
        return {
          state: 'pending',
          mode: 'single',
          url: 'https://storage/photo',
          contentType: 'image/jpeg',
        }
      if (path.endsWith('/photos'))
        return {
          jobs: [...runtime.uploads.tracked.values()].map((item: any) => ({
            id: item.jobId,
            state: 'succeeded',
            photo_id: item.jobId,
            attempts: 1,
            error_code: null,
          })),
        }
      return {}
    },
  })
  try {
    runtime.mount()
    const page = effectScope()
    page.run(() =>
      runtime.uploads.enqueue(
        { ...context, siteId: currentSite.value },
        [new File(['photo'], 'one.jpg')],
        'original-storage',
        [3],
      ),
    )
    await tick()
    currentSite.value = 99
    page.stop()
    release()
    await runtime.flush()
    assert(paths.every((path) => path.startsWith('/api/sites/7/media/')))
    assert.equal(xhr.requests.length, 1)
    assert.equal(xhr.requests[0]!.aborted, false)
    const entry = [...runtime.uploads.uploadingFiles.value.values()][0] as any
    assert.equal(entry.status, 'processing')
    await runtime.poll()
    assert.equal(entry.status, 'completed')
  } finally {
    runtime.dispose()
  }
})

test('Live Photo companion and multipart photo share the transport and publish only after both finish', async () => {
  const xhr = xhrFixture()
  const runtime = createCloudUploadHarness({
    ...xhr,
    formatBytes: String,
    $fetch: async (path: string) =>
      path.endsWith('/plan')
        ? {
            state: 'pending',
            mode: 'multipart',
            partBytes: 2,
            urls: ['photo-1', 'photo-2'],
            videoUrl: 'video',
          }
        : {},
  })
  try {
    await runtime.uploads.enqueue(
      context,
      [new File(['abcd'], 'one.HEIC'), new File(['video'], 'ONE.MOV')],
      'storage',
      [],
    )
    assert.equal(xhr.requests[0]!.url, 'video')
    assert.deepEqual(
      xhr.requests.slice(1, 3).map((r) => r.url),
      ['photo-1', 'photo-2'],
    )
    assert.match(xhr.requests.at(-1)!.url, /\/complete$/)
    assert.equal(runtime.storage.size, 0)
    assert.equal(
      [...runtime.uploads.uploadingFiles.value.values()][0].status,
      'processing',
    )
  } finally {
    runtime.dispose()
  }
})

test('clearing an in-flight queue aborts requests, releases reservations and never starts waiting files', async () => {
  const xhr = xhrFixture(() => {})
  const cancellations: string[] = []
  const runtime = createCloudUploadHarness({
    ...xhr,
    formatBytes: String,
    $fetch: async (path: string) => {
      if (path.endsWith('/cancel')) cancellations.push(path)
      if (path.endsWith('/plan'))
        return { state: 'pending', mode: 'single', url: 'storage' }
      return {}
    },
  })
  try {
    runtime.uploads.enqueue(
      context,
      [1, 2, 3, 4].map((n) => new File(['x'], `${n}.jpg`)),
      'storage',
      [],
    )
    await tick()
    assert.equal(xhr.requests.length, 3)
    runtime.uploads.clearAll()
    await runtime.flush()
    assert(xhr.requests.every((request) => request.aborted))
    assert.equal(xhr.requests.length, 3)
    assert.equal(cancellations.length, 3)
    assert.equal(runtime.storage.size, 0)
    assert.equal(runtime.uploads.uploadingFiles.value.size, 0)
  } finally {
    runtime.dispose()
  }
})

test('account changes clear and abort upload state instead of exposing it to another user', async () => {
  const xhr = xhrFixture(() => {})
  const runtime = createCloudUploadHarness({
    ...xhr,
    formatBytes: String,
    console: { error: () => {} },
    $fetch: async (path: string) =>
      path.endsWith('/plan')
        ? { state: 'pending', mode: 'single', url: 'storage' }
        : {},
  })
  try {
    runtime.uploads.enqueue(
      context,
      [new File(['x'], 'one.jpg')],
      'storage',
      [],
    )
    await tick()
    runtime.user.value = 2
    await runtime.flush()
    assert.equal(xhr.requests[0]!.aborted, true)
    assert.equal(runtime.uploads.uploadingFiles.value.size, 0)
    assert.equal(runtime.storage.size, 0)
  } finally {
    runtime.dispose()
  }
})

test('shared floating queue tracks processing, retry and deletion without resurrecting dismissed successes', () => {
  const runtime = createCloudUploadHarness()
  const queue = runtime.uploads
  try {
    const job = {
      id: 'j',
      photo_id: 'photo',
      file_name: 'one.jpg',
      state: 'succeeded',
      attempts: 1,
      error_code: null,
    }
    queue.trackJobs(context, [job])
    assert.equal(queue.uploadingFiles.value.size, 0)
    queue.trackJobs(context, [{ ...job, state: 'queued' }])
    const entry = [...queue.uploadingFiles.value.values()][0]
    assert.equal(entry.status, 'processing')
    queue.trackJobs(context, [job])
    assert.equal(entry.status, 'completed')
    queue.clearCompleted()
    queue.trackJobs(context, [job])
    assert.equal(queue.uploadingFiles.value.size, 0)
    queue.trackJobs(context, [{ ...job, state: 'retry_wait' }])
    assert.equal(queue.uploadingFiles.value.size, 0)
    const other = { ...job, id: 'k', photo_id: 'photo-2' }
    queue.trackJobs(context, [{ ...other, state: 'retry_wait' }])
    assert.equal(queue.uploadingFiles.value.size, 1)
    queue.trackJobs(context, [
      { ...other, state: 'failed', error_code: 'processing_failed' },
    ])
    assert.equal([...queue.uploadingFiles.value.values()][0].status, 'error')
    queue.trackJobs(context, [])
    assert.equal(queue.uploadingFiles.value.size, 0)
  } finally {
    runtime.dispose()
  }
})

test('Self-hosted and edge use the same narrow multipart fallback policy', () => {
  for (const name of [
    'NotImplemented',
    'NotSupported',
    'UnsupportedOperation',
    'AccessDenied',
  ])
    assert.equal(canFallbackToSingleUpload({ name }), true)
  assert.equal(canFallbackToSingleUpload({ Code: 'NotImplemented' }), true)
  for (const status of [405, 501])
    assert.equal(
      canFallbackToSingleUpload({ $metadata: { httpStatusCode: status } }),
      true,
    )
  for (const error of [
    null,
    new Error('offline'),
    { name: 'SignatureDoesNotMatch' },
    { name: 'SlowDown' },
    { $metadata: { httpStatusCode: 503 } },
  ])
    assert.equal(canFallbackToSingleUpload(error), false)
  for (const path of [
    'packages/storage/src/providers/s3.ts',
    'apps/cloud/server/api/sites/[siteId]/media/[...operation].ts',
  ])
    assert.match(
      readFileSync(path, 'utf8'),
      /canFallbackToSingleUpload\(error\)/,
    )
})

test('Cloud plan falls back only before a multipart session exists and always releases its initialization lease', async () => {
  for (const failure of [
    { name: 'AccessDenied' },
    { name: 'AccessDenied', at: 'recover' },
    { name: 'NotImplemented' },
    { name: 'ServiceUnavailable', $metadata: { httpStatusCode: 503 } },
  ]) {
    let released = 0
    let signed = 0
    const raw = {
      prepare: () => ({
        bind: () => ({
          first: async () => ({ id: 'upload' }),
          run: async () => {
            released++
          },
        }),
      }),
    }
    const module = loadUploadCode(
      'apps/cloud/server/api/sites/[siteId]/media/[...operation].ts',
      {
        console: { warn: () => {} },
      },
      {
        '../../../../utils/cloud-upload-albums': {},
        '../../../../utils/cloud-live-attachment': {},
        '../../../../utils/cloud-photo-processing': {},
        '@chronoframe/platform/entitlements': {},
        '@chronoframe/platform/domains': {},
        '@chronoframe/contracts/domains': {},
        '@chronoframe/database/cloud-album-slugs': {},
        '../../../../utils/cloud-photo-delete': {},
        '../../../../utils/cloud-album-editor': {},
        h3: {
          getRouterParam: () => 'uploads/upload/plan',
          createError: (value: unknown) => value,
        },
        '../../../../../../shared/platform/runtime': {
          definePlatformHandler: (handler: unknown) => handler,
        },
        '../../../../utils/site-management': {
          siteManagementBody: async () => ({}),
        },
        '@chronoframe/core': {},
        '../../../../../../shared/platform/crypto': {},
        '@chronoframe/storage/s3-edge': { canFallbackToSingleUpload },
        '../../../../utils/cloud-media': {
          cloudMedia: async () => ({
            siteId: 7,
            userId: 1,
            raw,
            repository: {
              upload: async () => ({
                state: 'pending',
                expires_at: Date.now() + 60000,
                expected_bytes: 20 * 1048576,
                object_key: 'source.jpg',
                connection_id: 'storage',
                provider_upload_id: null,
              }),
            },
            sql: async () => [
              { content_type: 'image/jpeg', connection_revision: 1 },
            ],
            storage: async () => ({
              s3: {
                recoverMultipart: async () => {
                  if (failure.at === 'recover') throw failure
                  return []
                },
                multipart: async () => {
                  throw failure
                },
                signPut: async () => {
                  signed++
                  return 'https://storage/put'
                },
              },
            }),
          }),
        },
      },
    )

    if (failure.name === 'ServiceUnavailable' || failure.at === 'recover') {
      await assert.rejects(module.default({ method: 'POST' }))
      assert.equal(signed, 0)
    } else {
      const plan = await module.default({ method: 'POST' })
      assert.equal(plan.mode, 'single')
      assert.equal(plan.contentType, 'image/jpeg')
      assert.equal(signed, 1)
    }
    assert.equal(released, 1)
  }
})

test('navigation during album preflight still hands the selected batch to the original Site queue', async () => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const requests: string[] = []
  const fetcher = async (path: string) => {
    requests.push(path)
    if (path.endsWith('/albums')) {
      await gate
      return { albums: [{ id: 3 }] }
    }
    if (path.endsWith('/plan')) return { state: 'completed' }
    return {}
  }
  const runtime = createCloudUploadHarness({ $fetch: fetcher })
  const entry = ref({ ...context, audience: 'portal' })
  let unmount = () => {}
  const pageScope = effectScope()
  const module = loadUploadCode(
    'apps/cloud/app/composables/useCloudSiteMedia.ts',
    {
      useI18n: () => ({ t: (key: string) => key }),
      useEntryContext: () => entry,
      useState: () => runtime.user,
      onMounted: () => {},
      onBeforeUnmount: (fn: () => void) => {
        unmount = fn
      },
      $fetch: fetcher,
      localStorage: { getItem: () => null },
    },
    {
      '@chronoframe/contracts/storage-diagnostics': {
        STORAGE_CONNECTION_MESSAGES: {},
      },
      './useCloudUploads': {
        ...runtime.module,
        useCloudUploads: () => runtime.uploads,
      },
    },
  )
  try {
    const media = pageScope.run(() =>
      module.useCloudMediaWorkspace({ siteId: 7, role: 'admin' }),
    )!
    media.connectionId.value = 'original'
    media.allowance.value = {
      byosLimits: { byos: 1, fileBytes: 100 },
      limits: { fileBytes: 100 },
    }
    media.selectedAlbumIds.value = [3]
    const pending = media.upload([new File(['photo'], 'one.jpg')])
    entry.value = { ...entry.value, siteId: 99, scope: 'different-site' }
    unmount()
    pageScope.stop()
    release()
    assert.equal((await pending).queued, true)
    await runtime.flush()
    assert(requests.every((path) => path.startsWith('/api/sites/7/media/')))
    assert.equal(
      [...runtime.uploads.uploadingFiles.value.values()][0].status,
      'processing',
    )
  } finally {
    pageScope.stop()
    runtime.dispose()
  }
})

test('concurrent duplicate selections do not race the same Cloud reservation', async () => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let reservations = 0
  const runtime = createCloudUploadHarness({
    $fetch: async (path: string) => {
      if (path.endsWith('/uploads')) {
        reservations++
        await gate
      }
      return path.endsWith('/plan') ? { state: 'completed' } : {}
    },
  })
  try {
    const file = new File(['x'], 'same.jpg')
    runtime.uploads.enqueue(context, [file, file], 'storage', [])
    await tick()
    assert.equal(reservations, 1)
    assert(
      [...runtime.uploads.uploadingFiles.value.values()].some(
        (item) => item.status === 'blocked',
      ),
    )
    release()
    await runtime.flush()
  } finally {
    runtime.dispose()
  }
})

test('retrying one processing job keeps other jobs in the same Site queue', () => {
  const runtime = createCloudUploadHarness()
  try {
    const failed = {
      id: 'failed-job',
      photo_id: 'photo-1',
      state: 'failed',
      attempts: 1,
      error_code: 'processing_failed',
    }
    runtime.uploads.trackJobs(context, [
      failed,
      { ...failed, id: 'other-job', photo_id: 'photo-2', state: 'running' },
    ])
    runtime.uploads.trackJobs(
      context,
      [{ ...failed, state: 'queued', error_code: null }],
      { partial: true },
    )
    assert.equal(runtime.uploads.uploadingFiles.value.size, 2)
    assert(
      [...runtime.uploads.uploadingFiles.value.values()].every(
        (item) => item.status === 'processing',
      ),
    )
  } finally {
    runtime.dispose()
  }
})

test('reselecting an interrupted upload resumes its reservation and every matching queue row reaches completion', async () => {
  let fail = true
  const xhr = xhrFixture((request) => {
    if (fail) {
      request.status = 403
      request.emit('load')
    } else request.succeed()
  })
  const ids: string[] = []
  const runtime = createCloudUploadHarness({
    ...xhr,
    formatBytes: String,
    $fetch: async (
      path: string,
      options?: { body?: { requestId?: string } },
    ) => {
      if (options?.body?.requestId) ids.push(options.body.requestId)
      return path.endsWith('/plan')
        ? { state: 'pending', mode: 'multipart', partBytes: 2, urls: ['part'] }
        : {}
    },
  })
  try {
    const file = new File(['xx'], 'resume.jpg')
    await runtime.uploads.enqueue(context, [file], 'storage', [])
    assert.equal(runtime.storage.size, 1)
    fail = false
    await runtime.uploads.enqueue(context, [file], 'storage', [])
    assert.equal(ids.length, 2)
    assert.equal(ids[0], ids[1])
    runtime.uploads.trackJobs(context, [
      {
        id: ids[0],
        photo_id: ids[0],
        state: 'succeeded',
        attempts: 1,
        error_code: null,
      },
    ])
    assert(
      [...runtime.uploads.uploadingFiles.value.values()].every(
        (item) => item.status === 'completed',
      ),
    )
  } finally {
    runtime.dispose()
  }
})
