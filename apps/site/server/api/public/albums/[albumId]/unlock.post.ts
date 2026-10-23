import { definePlatformHandler } from '../../../../../../platform.runtime'
import { publicSiteContext } from '../../../../../../platform-context'
import { unlockVisitor } from '../../../../../../platform-visitor'
export default definePlatformHandler(async (event) => {
  const context = await publicSiteContext(event)
  const body = await readBody(event)
  return unlockVisitor(
    event,
    context,
    Number(getRouterParam(event, 'albumId')),
    body?.password,
    useRuntimeConfig(event).platform.secret,
  )
})
