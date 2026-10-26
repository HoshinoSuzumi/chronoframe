/** Nonsecret domain configuration is applied equally to the build artifact and publish CLI. */
export function domainDeploymentValues(environment, values = {}) {
  if (!['staging', 'production'].includes(environment))
    throw new Error('Invalid deployment environment')
  const base =
    values.PLATFORM_SITE_BASE_DOMAIN ||
    (environment === 'production'
      ? 'chronoframe.art'
      : 'staging.chronoframe.art')
  const target = values.PLATFORM_DOMAIN_CNAME_TARGET || 'cname.chronoframe.art'
  const hostname = (value) =>
    /^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])$/.test(value) &&
    value
      .split('.')
      .every(
        (label) =>
          label &&
          label.length <= 63 &&
          !label.startsWith('-') &&
          !label.endsWith('-'),
      )
  if (!hostname(base) || !hostname(target))
    throw new Error('Invalid domain configuration hostname')
  const enabled = values.PLATFORM_DOMAIN_ENABLED === 'true'
  const ready = values.PLATFORM_DEFAULT_DOMAINS_READY === 'true'
  const routing = values.PLATFORM_DOMAIN_ROUTING_READY === 'true'
  const worker = values.PLATFORM_DOMAIN_SITE_WORKER || 'chronoframe-site'
  const zone = values.PLATFORM_DOMAIN_ZONE_ID || ''
  const limit = Number(values.PLATFORM_DOMAIN_RESOURCE_LIMIT || 20)
  if (!Number.isInteger(limit) || limit < 1 || limit > 20)
    throw new Error('Domain resource limit must be between 1 and 20')
  if (
    enabled &&
    (!/^[a-f0-9]{32}$/i.test(zone) ||
      (values.PLATFORM_DOMAIN_PROVIDER_TOKEN || '').length < 20)
  )
    throw new Error(
      'Enabled domain services require a zone ID and a dedicated domain provider token',
    )
  if (!/^chronoframe-site(?:-[a-z0-9-]+)?$/.test(worker))
    throw new Error('Invalid Site Worker name')
  // Named Previews cannot receive production zone routes. Keep provider automation disabled there.
  if (environment === 'staging' && (enabled || routing || ready))
    throw new Error(
      'Named staging Previews require domain automation and default-domain activation to remain disabled; use isolated local acceptance for domains',
    )
  return {
    NUXT_PUBLIC_SITE_BASE_DOMAIN: base,
    NUXT_PUBLIC_DEFAULT_DOMAINS_READY: String(ready),
    NUXT_PLATFORM_DOMAIN_ENABLED: String(enabled),
    NUXT_PLATFORM_DOMAIN_ROUTING_READY: String(routing),
    NUXT_PLATFORM_DOMAIN_ZONE_ID: zone,
    NUXT_PLATFORM_DOMAIN_CNAME_TARGET: target,
    NUXT_PLATFORM_DOMAIN_SITE_WORKER: worker,
    NUXT_PLATFORM_DOMAIN_RESOURCE_LIMIT: String(limit),
  }
}
export function configureDomainDeployment(
  config,
  entry,
  environment,
  values = {},
) {
  const vars = domainDeploymentValues(environment, values)
  const publicVars = Object.fromEntries(
    Object.entries(vars).filter(([key]) => key.startsWith('NUXT_PUBLIC_')),
  )
  const target = environment === 'staging' ? (config.previews ??= {}) : config
  target.vars = { ...target.vars, ...(entry === 'cloud' ? vars : publicVars) }
  // The domain controller owns exact customer routes. Artifact publication does not replace them.
  delete config.routes
  delete config.route
  delete config.triggers
  if (environment === 'production' && entry === 'cloud')
    config.triggers = { crons: ['* * * * *'] }
  return config
}
