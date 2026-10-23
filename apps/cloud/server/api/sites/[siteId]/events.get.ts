import { definePlatformHandler } from '../../../../../shared/platform/runtime'
import {
  portalSiteContext,
  siteContextDTO,
} from '../../../../../shared/platform/context'
/** Each reconnect rechecks live membership; never hold a stale authorized stream open. */
export default definePlatformHandler(async (event) => {
  const context = await siteContextDTO(
    event,
    await portalSiteContext(event, useRuntimeConfig(event).platform),
  )
  setResponseHeader(event, 'Content-Type', 'text/event-stream')
  setResponseHeader(event, 'X-Accel-Buffering', 'no')
  return `retry: 15000\nevent: context\ndata: ${JSON.stringify(context)}\n\n`
})
