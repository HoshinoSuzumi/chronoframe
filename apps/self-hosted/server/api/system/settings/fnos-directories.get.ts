import { fnosStorageDirectories } from '../../../utils/fnos-storage'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  if (!session.user.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }
  return { directories: await fnosStorageDirectories() }
})
