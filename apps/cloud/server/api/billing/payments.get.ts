import { paymentStatus } from '../../../../../packages/platform/src/payments'
import {
  definePlatformHandler,
  platformDatabase,
} from '../../../../shared/platform/runtime'
import { requirePlatformSession } from '../../../../shared/platform/context'
import { getQuery, setResponseHeader } from 'h3'
export default definePlatformHandler(async (event) => {
  const user = await requirePlatformSession(
    event,
    useRuntimeConfig(event).platform,
  )
  setResponseHeader(event, 'Cache-Control', 'no-store')
  return paymentStatus(
    platformDatabase(event),
    user.userId,
    Number(getQuery(event).workspaceId),
  )
})
