import { getLocationMigrationStatus } from '../../services/pipeline-queue/location-migration.ts'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  if (!session.user.isAdmin) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Admin privileges required',
    })
  }
  return getLocationMigrationStatus(useDB())
})
