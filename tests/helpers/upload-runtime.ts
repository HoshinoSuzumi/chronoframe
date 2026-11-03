import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import * as vue from 'vue'
import * as statuses from '../../packages/gallery/shared/utils/upload-status.ts'
import { UPLOAD_CHUNK_SIZE } from '../../packages/contracts/src/upload.ts'

export function loadUploadCode(
  file: string,
  globals: Record<string, unknown> = {},
  imports: Record<string, unknown> = {},
  suffix = '',
) {
  const exports: Record<string, any> = {}
  const source = readFileSync(file, 'utf8')
  const script = file.endsWith('.vue')
    ? source.split('<script setup lang="ts">')[1]!.split('</script>')[0]!
    : source
  vm.runInNewContext(
    ts
      .transpileModule(script + suffix, {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      })
      .outputText.replaceAll('import.meta.client', 'true'),
    {
      exports,
      ...vue,
      File,
      Blob,
      AbortController,
      crypto,
      performance,
      console,
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      queueMicrotask,
      ...globals,
      require: (name: string) => {
        if (name === 'vue') return vue
        if (name === '@chronoframe/gallery/shared/utils/upload-status')
          return statuses
        if (name === '@chronoframe/gallery/shared/utils/upload')
          return { UPLOAD_CHUNK_SIZE }
        assert.ok(name in imports, `Missing test import: ${name}`)
        return imports[name]
      },
    },
  )
  return exports
}

export function createCloudUploadHarness(globals: Record<string, any> = {}) {
  const scope = vue.effectScope()
  const user = globals.user ?? vue.ref<number | null>(1)
  const storage = new Map<string, string>()
  const mounts: (() => void)[] = []
  const unmounts: (() => void)[] = []
  const intervals: (() => Promise<void>)[] = []
  const base = {
    useState: () => user,
    useI18n: () => ({ t: (key: string) => key }),
    useNuxtApp: () => ({
      $i18n: { t: (key: string) => key },
      runWithContext: (fn: () => unknown) => fn(),
    }),
    localStorage: {
      getItem: (key: string) => storage.get(key),
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
    document: { visibilityState: 'visible' },
    ...globals,
    onMounted: (fn: () => void) => mounts.push(fn),
    onBeforeUnmount: (fn: () => void) => unmounts.push(fn),
    setInterval: (fn: () => Promise<void>) => {
      intervals.push(fn)
      return intervals.length
    },
    clearInterval: () => {},
  }
  const transport = loadUploadCode(
    'packages/console/app/composables/useUpload.ts',
    {
      ...base,
      setInterval,
      clearInterval,
    },
  )
  const queue = loadUploadCode(
    'packages/console/app/composables/useUploadQueue.ts',
  )
  const module = loadUploadCode(
    'apps/cloud/app/composables/useCloudUploads.ts',
    base,
    {
      '#console/composables/useUpload': transport,
      '#console/composables/useUploadQueue': queue,
    },
    '\nexport { createCloudUploads }',
  )
  const uploads = scope.run(() => module.createCloudUploads())!
  const pending: Promise<unknown>[] = []
  const enqueue = uploads.enqueue
  uploads.enqueue = (...args: unknown[]) => {
    const result = enqueue(...args)
    pending.push(result)
    return result
  }
  return {
    uploads,
    module,
    user,
    storage,
    scope,
    transport,
    flush: () => Promise.all(pending),
    mount: () => mounts.forEach((fn) => fn()),
    poll: () => Promise.all(intervals.map((fn) => fn())),
    dispose: () => {
      unmounts.forEach((fn) => fn())
      scope.stop()
    },
  }
}
