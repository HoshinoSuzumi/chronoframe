import type { H3Event, EventHandlerRequest } from 'h3'
import type { StorageProvider } from '../services/storage'
import { getStorageManager } from '../plugins/storage'

export const useStorageProvider = (event: H3Event<EventHandlerRequest>) => {
  // 支持从 query、header、body 解析 provider，默认使用全局默认
  let requestedProvider: string | undefined
  try {
    const q = getQuery(event)
    requestedProvider = (q.provider as string | undefined)?.toLowerCase()
  } catch {
    /* empty */
  }

  if (!requestedProvider) {
    const header = getHeader(event, 'x-storage-provider')
    requestedProvider = header ? header.toLowerCase() : undefined
  }

  if (!requestedProvider) {
    try {
      // 仅在 JSON body 可读取时尝试
      // 注意：某些 PUT 上传接口读取原始流前不要提前 readBody
      const body: any = (event as any).parsedBody
      if (body && typeof body.provider === 'string') {
        requestedProvider = body.provider.toLowerCase()
      }
    } catch {
      /* empty */
    }
  }

  const manager = (event.context?.storage as any) || getStorageManager()
  const storageProvider = requestedProvider
    ? (manager.getProvider(requestedProvider) as StorageProvider)
    : (manager.getProvider() as StorageProvider)

  if (!storageProvider) {
    throw new Error('Storage provider not found')
  }
  return { storageProvider }
}
