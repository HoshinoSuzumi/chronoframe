import { createError, getHeader, getRequestWebStream } from 'h3'
import type { H3Event } from 'h3'
import { readSiteBody } from './site-body'
import { requirePlatformSession } from '../../../shared/platform/context'
import {
  platformDatabase,
  platformPortalOrigin,
} from '../../../shared/platform/runtime'
import { createD1Provisioning } from '../../../../packages/platform/src/index'

export async function siteManagement(event: H3Event, mutation = false) {
  const config = useRuntimeConfig(event).platform
  platformPortalOrigin(event, config.portalOrigin, mutation)
  const session = await requirePlatformSession(event, config)
  return {
    userId: session.userId,
    store: createD1Provisioning(
      platformDatabase(event),
      useRuntimeConfig(event).public.siteBaseDomain,
    ),
  }
}
export async function siteManagementBody(event: H3Event, limit = 4096) {
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 131072 ||
    !getHeader(event, 'content-type')?.startsWith('application/json') ||
    Number(getHeader(event, 'content-length')) > limit
  )
    throw createError({ statusCode: 400 })
  // Nitro buffers POST/PUT/PATCH, but does not forward DELETE bodies to H3.
  // Read the original Worker stream while it is still available; otherwise use H3.
  const request = event.context.cloudflare?.request as Request | undefined
  if (request && event.method === 'DELETE') {
    if (request.bodyUsed) throw createError({ statusCode: 400 })
    return readSiteBody(request.body, limit)
  }
  return readSiteBody(getRequestWebStream(event), limit)
}
