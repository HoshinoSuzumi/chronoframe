export function planPurchasePath(
  plan: unknown,
  interval: unknown,
): string | null {
  if (
    typeof plan !== 'string' ||
    !/^[a-zA-Z0-9_.-]{1,128}$/.test(plan) ||
    ![1, 3, '1', '3'].includes(interval as string | number)
  )
    return null
  return `/account/plan?plan=${encodeURIComponent(plan)}&interval=${interval}#plan-${encodeURIComponent(plan)}`
}
export function purchaseReturnPath(input: unknown): string | null {
  if (typeof input !== 'string' || !input.startsWith('/account/plan?'))
    return null
  try {
    const url = new URL(input, 'https://portal.invalid')
    if (
      url.origin !== 'https://portal.invalid' ||
      url.pathname !== '/account/plan'
    )
      return null
    if (
      [...url.searchParams.keys()].some(
        (key) => !['plan', 'interval'].includes(key),
      ) ||
      url.searchParams.getAll('plan').length !== 1 ||
      url.searchParams.getAll('interval').length !== 1
    )
      return null
    return planPurchasePath(
      url.searchParams.get('plan'),
      url.searchParams.get('interval'),
    )
  } catch {
    return null
  }
}
