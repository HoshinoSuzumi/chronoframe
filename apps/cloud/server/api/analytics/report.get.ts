import { getQuery, createError, setResponseHeader } from 'h3'
import {
  definePlatformHandler,
  platformDatabase,
} from '../../../../shared/platform/runtime'
import { requirePlatformSession } from '../../../../shared/platform/context'
import { workspaceEntitlements } from '../../../../../packages/platform/src/entitlements'
import { analyticsFilter } from '../../../../../packages/platform/src/analytics'
import { analyticsReport } from '../../../../shared/analytics/query'
export default definePlatformHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  const session = await requirePlatformSession(
    event,
    useRuntimeConfig(event).platform,
  )
  const query = getQuery(event)
  let filter
  try {
    filter = analyticsFilter(query)
  } catch {
    throw createError({ statusCode: 400 })
  }
  if (!filter.workspaceId) throw createError({ statusCode: 400 })
  const db = platformDatabase(event)
  const member = await db
    .prepare(
      "SELECT workspace_id FROM platform_memberships WHERE user_id=? AND workspace_id=? AND role IN('admin','member')",
    )
    .bind(session.userId, filter.workspaceId)
    .first()
  if (!member) throw createError({ statusCode: 404 })
  if (!(await workspaceEntitlements(db, filter.workspaceId)).analytics)
    throw createError({
      statusCode: 403,
      statusMessage: 'Analytics is not included in this plan',
    })
  if (
    filter.siteId &&
    !(await db
      .prepare('SELECT id FROM platform_sites WHERE id=? AND workspace_id=?')
      .bind(filter.siteId, filter.workspaceId)
      .first())
  )
    throw createError({ statusCode: 404 })
  // Client kind/scope can never broaden this query to portal traffic or another tenant.
  return analyticsReport(event, { ...filter, kind: 'site' })
})
