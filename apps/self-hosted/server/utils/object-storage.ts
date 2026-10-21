import { DEFAULT_SITE, siteCacheKey } from '@chronoframe/core'
import { createSiteRepository } from '@chronoframe/database'
import { StorageManager, type StorageProvider } from '../services/storage'
import { useDB } from './db'
import { logger } from './logger'

const versions = new Map<string, StorageProvider>()

/** Resolve immutable connection revisions, rather than silently reading the currently active provider. */
export async function storageForReference(
  reference: { storageConnectionId: number | null; storageRevision: number },
  fallback: StorageProvider | (() => StorageProvider),
): Promise<StorageProvider> {
  // Bound jobs can resume before the active storage manager has initialized.
  if (reference.storageConnectionId === null)
    return typeof fallback === 'function' ? fallback() : fallback
  const key = siteCacheKey(
    DEFAULT_SITE,
    `${reference.storageConnectionId}:${reference.storageRevision}`,
  )
  const cached = versions.get(key)
  if (cached) return cached
  const config = await createSiteRepository(
    useDB(),
    DEFAULT_SITE,
  ).storageVersion(reference.storageConnectionId, reference.storageRevision)
  if (!config)
    throw createError({
      statusCode: 404,
      statusMessage: 'Storage connection version not found',
    })
  const provider = new StorageManager(config, logger.storage).getProvider()
  versions.set(key, provider)
  return provider
}

export async function storageForPhoto(id: string, fallback: StorageProvider) {
  const reference = await createSiteRepository(
    useDB(),
    DEFAULT_SITE,
  ).photoReference(id)
  if (!reference)
    throw createError({ statusCode: 404, statusMessage: 'Photo not found' })
  return storageForReference(reference, fallback)
}
