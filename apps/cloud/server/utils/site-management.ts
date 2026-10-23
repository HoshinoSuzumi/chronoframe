import { createError, getHeader, readBody } from 'h3'
import type { H3Event } from 'h3'
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
    store: createD1Provisioning(platformDatabase(event)),
  }
}
export async function siteManagementBody(event: H3Event) {
  if (
    !getHeader(event, 'content-type')?.startsWith('application/json') ||
    Number(getHeader(event, 'content-length')) > 4096
  )
    throw createError({ statusCode: 400 })
  const body: unknown = await readBody(event)
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    JSON.stringify(body).length > 4096
  )
    throw createError({ statusCode: 400 })
  return body as Record<string, unknown>
}
