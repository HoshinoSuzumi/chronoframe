import { purchaseReturnPath } from '../utils/plan-purchase'
export function useCloudAuthDestination() {
  const route = useRoute()
  const destination = computed(
    () => purchaseReturnPath(route.query.next) ?? '/workspace',
  )
  function authLink(path: '/signin' | '/signup') {
    const next = purchaseReturnPath(route.query.next)
    return { path, query: next ? { next } : {} }
  }
  return { destination, authLink }
}
