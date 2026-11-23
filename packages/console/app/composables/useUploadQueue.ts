import { onScopeDispose, ref } from 'vue'
import type { UploadingFile } from '@chronoframe/gallery/shared/types/uploading-file'
import {
  UploadQueueStatus,
  isClearableUploadStatus,
} from '@chronoframe/gallery/shared/utils/upload-status'

function createFileId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()

  // Self-hosted instances can be opened over plain HTTP on a local network.
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6]! & 0x0f) | 0x40
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-')
}

/** The owner chooses the lifetime: a Self-hosted page or the Cloud application. */
export function useUploadQueue() {
  const uploadingFiles = ref(new Map<string, UploadingFile>())
  const pending: Array<{
    entry: UploadingFile
    run: (entry: UploadingFile, signal: AbortSignal) => Promise<void>
    controller: AbortController
    resolve: () => void
  }> = []
  const controllers = new Map<string, AbortController>()
  let active = 0
  let disposed = false

  const notify = () => {
    uploadingFiles.value = new Map(uploadingFiles.value)
  }
  function drain() {
    while (!disposed && active < 3 && pending.length) {
      const task = pending.shift()!
      if (task.controller.signal.aborted) {
        controllers.delete(task.entry.fileId)
        task.resolve()
        continue
      }
      active++
      void Promise.resolve()
        .then(() => {
          task.controller.signal.throwIfAborted()
          return task.run(task.entry, task.controller.signal)
        })
        .catch((error: unknown) => {
          task.entry.status = UploadQueueStatus.Error
          task.entry.error =
            error instanceof Error ? error.message : String(error)
          task.entry.canAbort = false
          notify()
        })
        .finally(() => {
          controllers.delete(task.entry.fileId)
          active--
          task.resolve()
          drain()
        })
    }
  }
  function enqueue(
    files: File[],
    run: (entry: UploadingFile, signal: AbortSignal) => Promise<void>,
  ) {
    if (disposed) throw new Error('Upload queue is disposed')
    const tasks = files.map((file) => {
      const controller = new AbortController()
      const entry: UploadingFile = {
        file,
        fileName: file.name,
        fileId: createFileId(),
        status: UploadQueueStatus.Waiting,
        canAbort: false,
        abortUpload: () => controller.abort(),
      }
      controllers.set(entry.fileId, controller)
      uploadingFiles.value.set(entry.fileId, entry)
      return new Promise<void>((resolve) => {
        pending.push({ entry, run, controller, resolve })
      })
    })
    notify()
    // Let the drawer close and render all waiting entries before starting I/O.
    queueMicrotask(drain)
    return Promise.all(tasks)
  }
  function remove(fileId: string) {
    controllers.get(fileId)?.abort()
    uploadingFiles.value.get(fileId)?.abortUpload?.()
    uploadingFiles.value.delete(fileId)
    notify()
  }
  function clearCompleted() {
    for (const [id, entry] of uploadingFiles.value)
      if (isClearableUploadStatus(entry.status)) remove(id)
  }
  function clearAll() {
    for (const id of uploadingFiles.value.keys()) remove(id)
  }
  onScopeDispose(() => {
    disposed = true
    clearAll()
    for (const task of pending.splice(0)) task.resolve()
  })
  return { uploadingFiles, enqueue, remove, clearCompleted, clearAll, notify }
}
