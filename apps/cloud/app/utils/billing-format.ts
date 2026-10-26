export const BILLING_LIMITS = [
  'storageBytes',
  'fileBytes',
  'sites',
  'photos',
  'customDomains',
  'byos',
  'monthlyBytes',
] as const
export function allowance(key: string, value: number, locale: string) {
  if (key === 'byos') return value ? '✓' : '—'
  if (key.endsWith('Bytes')) {
    if (!value) return '0 B'
    const i = Math.min(3, Math.floor(Math.log(value) / Math.log(1024)))
    return (
      new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(
        value / 1024 ** i,
      ) +
      ' ' +
      ['B', 'KiB', 'MiB', 'GiB'][i]
    )
  }
  return new Intl.NumberFormat(locale).format(value)
}
export function price(amount: number | null, currency: string, locale: string) {
  return amount === null
    ? '—'
    : new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
        maximumFractionDigits: 2,
      }).format(amount / 100)
}
export function conditionText(c: any, t: (key: string) => string): string {
  if (c.all)
    return (
      '(' +
      c.all
        .map((v: any) => conditionText(v, t))
        .join(' ' + t('cloud.billing.and') + ' ') +
      ')'
    )
  if (c.any)
    return (
      '(' +
      c.any
        .map((v: any) => conditionText(v, t))
        .join(' ' + t('cloud.billing.or') + ' ') +
      ')'
    )
  const value =
    typeof c.value === 'boolean'
      ? t('cloud.billing.' + (c.value ? 'yes' : 'no'))
      : c.field === 'storageMode'
        ? t('cloud.billing.' + c.value)
        : String(c.value)
  return (
    t('cloud.billing.' + c.field) +
    ' ' +
    { eq: '=', gte: '≥', lte: '≤' }[c.op as 'eq'] +
    ' ' +
    value
  )
}
export function billingError(error: any, t: (key: string) => string) {
  const code = error?.data?.data?.code ?? error?.data?.code
  const key = (
    {
      invalid_activation_code: 'invalidCode',
      permanent_plan_active: 'permanentActive',
      activation_rate_limit: 'rateLimit',
      subscription_changed: 'changed',
      workspace_admin_required: 'adminOnly',
      redemption_changed: 'changed',
    } as Record<string, string>
  )[code]
  return t('cloud.billing.' + (key ?? 'failed'))
}
