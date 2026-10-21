import { z } from 'zod'
import { settingNamespaces } from '~~/server/services/settings/contants'
import { settingsManager } from '~~/server/services/settings/settingsManager'

export default eventHandler(async (event) => {
  const { namespace } = await getValidatedRouterParams(
    event,
    z.object({
      namespace: z.enum([...settingNamespaces]),
    }).parse,
  )

  const session = await requireUserSession(event)
  if (!session || !session.user.isAdmin) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Admin privileges required',
    })
  }

  try {
    const settings = await settingsManager.getNamespace(namespace)
    return { namespace, settings }
  } catch {
    throw createError({
      statusCode: 404,
      statusMessage: `Namespace ${namespace} not found or empty`,
    })
  }
})
