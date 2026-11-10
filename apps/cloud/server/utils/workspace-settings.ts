import { createError, getRouterParam } from 'h3'
import type { H3Event } from 'h3'
import { requirePlatformSession } from '../../../shared/platform/context'
import {
  platformDatabase,
  platformPortalOrigin,
} from '../../../shared/platform/runtime'

export async function workspaceSettingsContext(
  event: H3Event,
  mutation = false,
) {
  const config = useRuntimeConfig(event).platform
  platformPortalOrigin(event, config.portalOrigin, mutation)
  const session = await requirePlatformSession(event, config)
  const value = getRouterParam(event, 'workspaceId') ?? ''
  const workspaceId = Number(value)
  if (!/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(workspaceId))
    throw createError({ statusCode: 400 })
  return { db: platformDatabase(event), userId: session.userId, workspaceId }
}
