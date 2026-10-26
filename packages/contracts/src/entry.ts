/** Public presentation capabilities, never authorization or a source of billing limits. */
export interface EntryCapabilities {
  edition: 'self-hosted' | 'cloud' | 'site'
  identity: 'instance' | 'platform' | 'visitor'
  database: 'sqlite' | 'd1'
  storageProviders: readonly string[]
  quota: 'unlimited' | 'plan'
  mediaManagement: boolean
  subscriptions: boolean
  customScripts: boolean
}
export const SELF_HOSTED_CAPABILITIES: EntryCapabilities = {
  edition: 'self-hosted',
  identity: 'instance',
  database: 'sqlite',
  storageProviders: ['local', 's3', 'openlist'],
  quota: 'unlimited',
  mediaManagement: true,
  subscriptions: true,
  customScripts: true,
}
export const CLOUD_CAPABILITIES: EntryCapabilities = {
  edition: 'cloud',
  identity: 'platform',
  database: 'd1',
  storageProviders: ['s3'],
  quota: 'plan',
  mediaManagement: true,
  subscriptions: true,
  customScripts: false,
}
export const SITE_CAPABILITIES: EntryCapabilities = {
  ...CLOUD_CAPABILITIES,
  edition: 'site',
  identity: 'visitor',
  mediaManagement: false,
  storageProviders: [],
  subscriptions: false,
}
export interface EntrySiteContext {
  siteId: number
  scope: string
  name: string
  published: boolean
  audience: 'portal' | 'public'
  canonicalOrigin?: string
  role?: 'admin' | 'member'
  workspaceId?: number
  capabilities: EntryCapabilities
}

/** Prefix resolved Site APIs and reject traversal; preserve legacy Self-hosted paths. */
export function entryRequestPath(
  path: string,
  context: EntrySiteContext | null,
): string {
  if (!context) return path
  if (
    !path.startsWith('/api/') ||
    decodeURIComponent(path.split('?')[0]!).includes('..') ||
    /[#\\]/.test(path)
  )
    throw new Error('A scoped API path is required')
  const prefix =
    context.audience === 'portal'
      ? `/api/sites/${context.siteId}`
      : '/api/public'
  return prefix + path.slice(4)
}

export interface EntrySiteSummary {
  suspended?: boolean
  suspensionReason?: string
  siteId: number
  workspaceId: number
  name: string
  published: boolean
  role: 'admin' | 'member'
}
export interface EntrySiteCatalog {
  userId: number
  sites: EntrySiteSummary[]
}
