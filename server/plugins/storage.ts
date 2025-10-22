import path from 'node:path'
import type { StorageConfig } from '../services/storage'
import { StorageManager } from '../services/storage'
import { logger } from '../utils/logger'

// 全局 storageManager 实例，可以在非请求上下文中使用
let globalStorageManager: StorageManager

export function getStorageManager(): StorageManager {
  if (!globalStorageManager) {
    throw new Error('Storage manager not initialized')
  }
  return globalStorageManager
}

export default nitroPlugin(async (nitroApp) => {
  const config = useRuntimeConfig()

  const storageConfiguration: Record<'s3' | 'local' | 'openlist', StorageConfig> = {
    s3: {
      provider: 's3',
      bucket: config.provider.s3.bucket,
      region: config.provider.s3.region,
      endpoint: config.provider.s3.endpoint,
      prefix: config.provider.s3.prefix,
      cdnUrl: config.provider.s3.cdnUrl,
      accessKeyId: config.provider.s3.accessKeyId,
      secretAccessKey: config.provider.s3.secretAccessKey,
      forcePathStyle: config.provider.s3.forcePathStyle,
    },
    local: {
      provider: 'local',
      basePath:
        config.provider.local.localPath ||
        path.resolve(process.cwd(), 'data', 'storage'),
      baseUrl: config.provider.local.baseUrl || '/storage',
      prefix: config.provider.local.prefix || 'photos/',
    },
    openlist: {
      provider: 'openlist',
      baseUrl: config.provider.openlist?.baseUrl || '',
      rootPath: config.provider.openlist?.rootPath || '',
      token: config.provider.openlist?.token || '',
      endpoints: {
        upload: config.provider.openlist?.endpoints?.upload ?? '/api/fs/put',
        download: config.provider.openlist?.endpoints?.download ?? '',
        list: config.provider.openlist?.endpoints?.list ?? '',
        delete: config.provider.openlist?.endpoints?.delete ?? '/api/fs/remove',
        meta: config.provider.openlist?.endpoints?.meta ?? '/api/fs/get',
      },
      pathField: config.provider.openlist?.pathField || 'path',
      cdnUrl:
        config.provider.openlist?.cdnUrl ||
        (config.provider.openlist?.baseUrl
          ? `${config.provider.openlist.baseUrl.replace(/\/$/, '')}/d`
          : undefined),
    },
  }

  const selectedProvider =
    (config.STORAGE_PROVIDER as 's3' | 'local' | 'openlist') || 'local'
  const storageManager = new StorageManager(
    storageConfiguration[selectedProvider],
    logger.storage,
  )

  if (selectedProvider === 'openlist') {
    const openlistConfig = storageConfiguration.openlist as any
    if (!openlistConfig.baseUrl) {
      logger.storage.error('OpenList baseUrl is not configured. Please set provider.openlist.baseUrl in runtimeConfig or corresponding .env variables.')
    }
    if (!openlistConfig.rootPath) {
      logger.storage.error('OpenList rootPath is not configured. Please set provider.openlist.rootPath in runtimeConfig or corresponding .env variables.')
    }
    if (!openlistConfig.token) {
      logger.storage.error('OpenList token is not configured. Please set provider.openlist.token in runtimeConfig or NUXT_PROVIDER_OPENLIST_TOKEN in .env file.')
    }
  }

  // 设置全局实例
  globalStorageManager = storageManager

  nitroApp.hooks.hook('request', (event) => {
    event.context.storage = storageManager
  })

  // 本地存储路径校验与创建
  if (selectedProvider === 'local') {
    const localBase = (storageConfiguration.local as any).basePath as string
    try {
      if (!path.isAbsolute(localBase)) {
        logger.storage.warn(`LOCAL basePath is not absolute: ${localBase}`)
      }
      await import('node:fs').then(async (m) => {
        const fs = m.promises as typeof import('node:fs').promises
        await fs.mkdir(localBase, { recursive: true })
      })
      logger.storage.success(`Local storage ready at: ${localBase}`)
    } catch (err) {
      logger.storage.error('Failed to prepare local storage directory', err)
    }
  }
})
