import type { H3Event } from 'h3'

export const requireAdminSession = async (event: H3Event) => {
  const session = await requireUserSession(event)
  if (!session.user.isAdmin) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Admin privileges required',
    })
  }
  return session
}
