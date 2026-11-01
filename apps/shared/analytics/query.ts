import type { H3Event } from 'h3'
import { createError } from 'h3'
import { historicalAnalytics } from '../../../packages/platform/src/analytics-archive'
import { analyticsWindow } from '../../../packages/platform/src/analytics'
import { platformDatabase } from '../platform/runtime'
import { queryAnalytics } from '../../../packages/platform/src/analytics'
import type { AnalyticsFilter } from '../../../packages/platform/src/analytics'
export async function analyticsReport(event: H3Event, filter: AnalyticsFilter) {
  const env = event.context.cloudflare?.env ?? {}
  try {
    const config = {
      accountId: String(env.ANALYTICS_ACCOUNT_ID ?? ''),
      token: String(env.ANALYTICS_API_TOKEN ?? ''),
      dataset: String(env.ANALYTICS_DATASET ?? ''),
    }
    const window = analyticsWindow(filter.from, filter.to)
    if (
      filter.allTime ||
      window.end - window.start > 31 * 86400000 ||
      window.start < Date.now() - 89 * 86400000
    )
      return await historicalAnalytics(platformDatabase(event), config, filter)
    return await queryAnalytics(config, filter)
  } catch (error) {
    throw createError({
      statusCode: 503,
      statusMessage:
        error instanceof Error && error.message === 'analytics_not_configured'
          ? 'Analytics is not configured'
          : 'Analytics is temporarily unavailable',
    })
  }
}
