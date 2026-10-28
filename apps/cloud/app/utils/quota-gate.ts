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

export type UploadConnection = {
  id: string
  pool_id?: string | null
  uploads_enabled?: number
}
/** Prefer the current target, but never hide another connection with available allowance. */
export function uploadQuotaGate(
  data: any,
  connections: UploadConnection[],
  selected = '',
) {
  const candidates = connections
    .filter((c) => c.uploads_enabled !== 0)
    .sort((a, b) => Number(b.id === selected) - Number(a.id === selected))
  if ((selected || connections.length) && !candidates.length)
    return { allowed: false, reason: 'storage', connectionId: '' }
  const targets = candidates.length
    ? candidates
    : [{ id: '', pool_id: 'platform' }]
  const gates = targets.map((connection) => {
    const mode = connection.pool_id ? 'platform' : 'byos'
    const resources: QuotaResource[] =
      mode === 'byos'
        ? ['byos', 'photos', 'monthlyBytes', 'fileBytes']
        : ['photos', 'storageBytes', 'monthlyBytes', 'fileBytes']
    const denied = resources
      .map((resource) => quotaGate(data, resource, mode))
      .find((gate) => !gate.allowed)
    return {
      ...(denied ?? { allowed: true, reason: '' }),
      connectionId: connection.id,
    }
  })
  return gates.find((gate) => gate.allowed) ?? gates[0]!
}
