import { getRequestWebStream } from 'h3'
import { readSiteBody } from '../../../../../../shared/platform/json'
import { definePlatformHandler } from '../../../../../../shared/platform/runtime'
import { publicSiteContext } from '../../../../../../shared/platform/context'
import { unlockVisitor } from '../../../../../../shared/platform/visitor'
export default definePlatformHandler(async (event) => {
  const context = await publicSiteContext(event)
  const body = await readSiteBody(getRequestWebStream(event))
  return unlockVisitor(
    event,
    context,
    Number(getRouterParam(event, 'albumId')),
    body?.password,
    useRuntimeConfig(event).platform.secret,
  )
})
