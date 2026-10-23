import { definePlatformHandler } from '../../../../../shared/platform/runtime'
import { emailSignIn } from '../../../utils/platform-auth'
export default definePlatformHandler(async (event) => {
  const body = await readBody(event)
  if (!body || typeof body.email !== 'string')
    throw createError({ statusCode: 400, statusMessage: 'Email required' })
  // In Workers, Cloudflare sets this header. Local development has no production fallback.
  const client = event.context.cloudflare
    ? getRequestHeader(event, 'cf-connecting-ip')
    : undefined
  if (!client)
    throw createError({
      statusCode: 503,
      statusMessage: 'Client context unavailable',
    })
  return (await emailSignIn(event)).request(body.email, client)
})
