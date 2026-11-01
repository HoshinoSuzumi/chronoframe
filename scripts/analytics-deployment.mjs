/** Production and named Previews never share a dataset. No credential goes into Wrangler JSON. */
export function configureAnalyticsDeployment(config, environment, env) {
  delete config.analytics_engine_datasets
  if (config.previews) delete config.previews.analytics_engine_datasets
  if (!env.ANALYTICS_API_TOKEN && !env.ANALYTICS_VISITOR_SECRET) return
  if (!/^[a-f0-9]{32}$/.test(env.ANALYTICS_ACCOUNT_ID))
    throw new Error('Invalid ANALYTICS_ACCOUNT_ID')
  if (
    !env.ANALYTICS_API_TOKEN ||
    (env.ANALYTICS_VISITOR_SECRET ?? '').length < 32
  )
    throw new Error(
      'Configure ANALYTICS_API_TOKEN and ANALYTICS_VISITOR_SECRET before enabling analytics',
    )
  const preview = environment === 'staging'
  const target = preview ? (config.previews ??= {}) : config
  target.analytics_engine_datasets = [
    {
      binding: 'VISIT_ANALYTICS',
      dataset: preview ? 'chronoframe_visits_preview' : 'chronoframe_visits',
    },
  ]
  target.vars = {
    ...target.vars,
    ANALYTICS_ACCOUNT_ID: env.ANALYTICS_ACCOUNT_ID,
    ANALYTICS_DATASET: preview
      ? 'chronoframe_visits_preview'
      : 'chronoframe_visits',
  }
}
