import { createError, getHeader, getRequestWebStream, getRouterParam } from 'h3'
import { receiveDodoEvent } from '../../../../../../packages/platform/src/dodo-payments'
import {
  definePlatformHandler,
  platformDatabase,
} from '../../../../../shared/platform/runtime'
export default definePlatformHandler(async (event) => {
  const profileId = getRouterParam(event, 'profileId')
  if (!profileId || !/^[a-z][a-z0-9_-]{0,63}$/.test(profileId))
    throw createError({ statusCode: 404 })
  const db = platformDatabase(event)
  const profile = await db
    .prepare(
      "SELECT environment FROM platform_payment_providers WHERE id=? AND provider='dodo'",
    )
    .bind(profileId)
    .first<any>()
  if (!profile) throw createError({ statusCode: 404 })
  const environment = profile.environment as 'test' | 'live'
  const stream = getRequestWebStream(event)
  if (!stream) throw createError({ statusCode: 400 })
  const reader = stream.getReader(),
    chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 65536) {
        await reader.cancel()
        throw createError({ statusCode: 413 })
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const body = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return receiveDodoEvent(
    platformDatabase(event),
    useRuntimeConfig(event).platform.storageSecret,
    environment,
    body,
    {
      'webhook-id': getHeader(event, 'webhook-id') ?? '',
      'webhook-timestamp': getHeader(event, 'webhook-timestamp') ?? '',
      'webhook-signature': getHeader(event, 'webhook-signature') ?? '',
    },
    undefined,
    undefined,
    profileId,
  )
})
