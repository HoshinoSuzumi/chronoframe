import { popularPhotos } from '../../../../../packages/platform/src/analytics-popular'
import { allRows } from '../../../../../packages/platform/src/subscriptions'
import { resolveAnalyticsPages } from '../../../../../packages/platform/src/analytics-pages'
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
  if (query.popular === '1') {
    if (!filter.siteId) throw createError({ statusCode: 400 })
    const range = {
      ...analyticsFilter({}),
      workspaceId: filter.workspaceId,
      siteId: filter.siteId,
      kind: 'site' as const,
    }
    const photos = await allRows<{ id: string }>(
      db
        .prepare('SELECT id FROM cloud_photos WHERE site_id=? AND deleted=0')
        .bind(filter.siteId),
    )
    const env = event.context.cloudflare?.env ?? {}
    try {
      const pages = await popularPhotos(
        {
          accountId: String(env.ANALYTICS_ACCOUNT_ID ?? ''),
          token: String(env.ANALYTICS_API_TOKEN ?? ''),
          dataset: String(env.ANALYTICS_DATASET ?? ''),
        },
        range,
        photos.map((p) => p.id),
      )
      return await resolveAnalyticsPages(
        db,
        { pages, from: range.from, to: range.to },
        range,
      )
    } catch {
      throw createError({
        statusCode: 503,
        statusMessage: 'Analytics is temporarily unavailable',
      })
    }
  }
  // Client kind/scope can never broaden this query to portal traffic or another tenant.
  return resolveAnalyticsPages(
    db,
    await analyticsReport(event, { ...filter, kind: 'site' }),
    { ...filter, kind: 'site' },
  )
})
