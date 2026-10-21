import { isDeepStrictEqual } from 'node:util'
import { and, desc, eq } from 'drizzle-orm'
import { DEFAULT_SITE } from '@chronoframe/core'
import { reserveResource } from '@chronoframe/database'
import type { StorageProvider } from '@chronoframe/storage'
import { useDB, tables } from './db'
import { generateSafePhotoId } from './file-utils'
import { storageForReference } from './object-storage'

const references = new WeakMap<
  StorageProvider,
  { storageConnectionId: number; storageRevision: number }
>()
function referenceForProvider(provider: StorageProvider) {
  const cached = references.get(provider)
  if (cached) return cached
  const db = useDB()
  const selected = db
    .select({ value: tables.settings.value })
    .from(tables.settings)
    .where(
      and(
        eq(tables.settings.siteId, DEFAULT_SITE.id),
        eq(tables.settings.namespace, 'storage'),
        eq(tables.settings.key, 'provider'),
      ),
    )
    .get()
  const current = selected?.value
    ? db
        .select()
        .from(tables.settings_storage_providers)
        .where(
          and(
            eq(tables.settings_storage_providers.siteId, DEFAULT_SITE.id),
            eq(tables.settings_storage_providers.id, Number(selected.value)),
          ),
        )
        .get()
    : undefined
  let reference:
    | { storageConnectionId: number; storageRevision: number }
    | undefined
  if (current && isDeepStrictEqual(current.config, provider.config))
    reference = {
      storageConnectionId: current.id,
      storageRevision: current.revision,
    }
  else {
    const history = db
      .select()
      .from(tables.storageConnectionVersions)
      .where(eq(tables.storageConnectionVersions.siteId, DEFAULT_SITE.id))
      .orderBy(
        desc(tables.storageConnectionVersions.connectionId),
        desc(tables.storageConnectionVersions.revision),
      )
      .all()
      .find((row) => isDeepStrictEqual(row.config, provider.config))
    if (history)
      reference = {
        storageConnectionId: history.connectionId,
        storageRevision: history.revision,
      }
  }
  if (!reference) throw new Error('Upload storage connection is not registered')
  references.set(provider, reference)
  return reference
}
function idForKey(key: string) {
  return (
    useDB()
      .select({ id: tables.photos.id })
      .from(tables.photos)
      .where(
        and(
          eq(tables.photos.siteId, DEFAULT_SITE.id),
          eq(tables.photos.storageKey, key),
        ),
      )
      .get()?.id ?? generateSafePhotoId(key)
  )
}
/** Invalidate the prior generation before a managed upload can replace its source. */
export function reserveUploadSource(key: string, provider: StorageProvider) {
  // Companion videos share the image identifier but must not replace its generation.
  if (/\.(?:mov|mp4)$/i.test(key)) return
  return reserveResource(useDB(), DEFAULT_SITE, idForKey(key), {
    ...referenceForProvider(provider),
    storageKey: key,
  })
}

/** Keep an issued Local upload on its original connection when settings change. */
export async function providerForUpload(
  key: string,
  fallback: StorageProvider,
) {
  const reference = useDB()
    .select()
    .from(tables.resourceVersions)
    .where(
      and(
        eq(tables.resourceVersions.siteId, DEFAULT_SITE.id),
        eq(tables.resourceVersions.resourceId, idForKey(key)),
        eq(tables.resourceVersions.storageKey, key),
      ),
    )
    .get()
  return reference ? storageForReference(reference, fallback) : fallback
}

/** Completion callbacks reserve a new generation immediately before publishing bytes. */
export function sourceAwareUploadStorage(
  provider: StorageProvider,
): StorageProvider {
  return new Proxy(provider, {
    get(target, property) {
      if (property === 'create')
        return (...args: Parameters<StorageProvider['create']>) => {
          reserveUploadSource(args[0], provider)
          return target.create(...args)
        }
      if (property === 'createFromFile')
        return (...args: Parameters<StorageProvider['createFromFile']>) => {
          reserveUploadSource(args[0], provider)
          return target.createFromFile(...args)
        }
      if (property === 'prepareDirectUpload' && target.prepareDirectUpload)
        return async (
          ...args: Parameters<
            NonNullable<StorageProvider['prepareDirectUpload']>
          >
        ) => {
          const plan = await target.prepareDirectUpload!(...args)
          if (plan?.mode === 'multipart')
            return {
              ...plan,
              complete: async (parts: Parameters<typeof plan.complete>[0]) => {
                reserveUploadSource(args[0], provider)
                await plan.complete(parts)
              },
            }
          return plan
        }
      const value = Reflect.get(target, property, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}
