import type { H3Event } from 'h3'
import { createError } from 'h3'
import { queryAnalytics } from '../../../packages/platform/src/analytics'
import type { AnalyticsFilter } from '../../../packages/platform/src/analytics'
export async function analyticsReport(event: H3Event, filter: AnalyticsFilter) {
  const env = event.context.cloudflare?.env ?? {}
  try {
    return await queryAnalytics(
      {
        accountId: String(env.ANALYTICS_ACCOUNT_ID ?? ''),
        token: String(env.ANALYTICS_API_TOKEN ?? ''),
        dataset: String(env.ANALYTICS_DATASET ?? ''),
      },
      filter,
    )
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
