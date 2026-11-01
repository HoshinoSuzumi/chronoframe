import { collectVisit } from '../../../../shared/analytics/collect'
export default defineEventHandler((event) =>
  collectVisit(
    event,
    'site',
    String(event.context.cloudflare?.env?.ANALYTICS_VISITOR_SECRET ?? ''),
  ),
)
