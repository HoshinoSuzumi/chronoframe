export interface AccountSetup {
  required: boolean
  step: 1 | 2 | 3
  revision: number
  name: string
  workspace: { id: number; name: string; customized: boolean } | null
  site: { siteId: number; name: string; slug: string | null } | null
}
export type TrialBlock =
  | 'disabled'
  | 'not_owner'
  | 'unverified'
  | 'account_unavailable'
  | 'already_used'
  | 'existing_entitlement'
  | 'not_started'
  | 'ended'
  | 'configuration_changed'
  | 'pending_payment'
export interface WorkspaceTrial {
  serverTime: number
  eligible: boolean
  reason: TrialBlock | null
  offer: {
    planId: string
    planName: string
    days: number
    revision: string
    limits: Record<string, number>
    analytics: boolean
  } | null
  fallback: { id: string; name: string }
  trial: {
    workspaceId: number | null
    planName: string
    startedAt: number
    expiresAt: number
    state: 'active' | 'expired' | 'converted' | 'revoked'
  } | null
}
