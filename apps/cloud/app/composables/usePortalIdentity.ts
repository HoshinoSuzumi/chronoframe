export interface PortalIdentity {
  id: number
  name?: string | null
  email?: string
}
export function usePortalIdentity() {
  return useState<PortalIdentity | null>('platform-current-user', () => null)
}
