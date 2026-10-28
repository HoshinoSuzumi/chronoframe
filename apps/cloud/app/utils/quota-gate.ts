export type QuotaResource =
  | 'fileBytes'
  | 'sites'
  | 'customDomains'
  | 'photos'
  | 'storageBytes'
  | 'monthlyBytes'
  | 'byos'
export function quotaGate(
  data: any,
  resource: QuotaResource,
  mode: 'platform' | 'byos' = 'platform',
) {
  if (!data) return { allowed: false, reason: 'checking', used: 0, limit: 0 }
  if (data.workspace?.role !== 'admin')
    return { allowed: false, reason: 'permission', used: 0, limit: 0 }
  if (!data.plan || !data.usage)
    return { allowed: false, reason: 'checking', used: 0, limit: 0 }
  const limits =
    mode === 'byos' || resource === 'byos'
      ? data.plan.byosLimits
      : data.plan.limits
  const limit = Number(limits?.[resource] ?? 0),
    used = Number(data.usage?.[resource] ?? 0)
  if (resource === 'byos')
    return { allowed: !!limit, reason: limit ? '' : 'upgrade', used, limit }
  return {
    allowed: limit > used,
    reason: limit > used ? '' : 'upgrade',
    used,
    limit,
  }
}
