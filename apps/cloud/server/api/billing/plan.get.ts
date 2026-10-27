import { workspaceBilling } from '../../../../../packages/platform/src/billing'
import {
  definePlatformHandler,
  platformDatabase,
} from '../../../../shared/platform/runtime'
import { requirePlatformSession } from '../../../../shared/platform/context'
import { getQuery, createError, setResponseHeader } from 'h3'
export default definePlatformHandler(async (event) => {
  const user = await requirePlatformSession(
      event,
      useRuntimeConfig(event).platform,
    ),
    id = Number(getQuery(event).workspaceId)
  if (!Number.isSafeInteger(id) || id < 1)
    throw createError({ statusCode: 400 })
  setResponseHeader(event, 'Cache-Control', 'no-store')
  return workspaceBilling(platformDatabase(event), user.userId, id)
})
