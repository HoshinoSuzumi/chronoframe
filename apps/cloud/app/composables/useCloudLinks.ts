import { planPurchasePath } from '../utils/plan-purchase'
/** Production actions cross to the portal; preview/local auth stays on its own isolated origin. */
export function useCloudLinks() {
  const hostname = useCloudRequestURL().hostname
  const portal = ['chronoframe.art', 'app.chronoframe.art'].includes(hostname)
    ? 'https://app.chronoframe.art'
    : ''
  return {
    website: 'https://chronoframe.art/',
    signin: portal + '/signin',
    signup: portal + '/signup',
    redeem: portal + '/account/redeem',
    portalPricing: portal + '/account/plan#plans',
    purchase: (plan: string, interval: 1 | 3) =>
      portal + (planPurchasePath(plan, interval) ?? '/account/plan#plans'),
  }
}
