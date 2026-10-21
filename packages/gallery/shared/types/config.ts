import type { StorageConfig } from '@chronoframe/contracts/storage'

/** Server configuration containing credentials; not a public response. */
export interface ChronoConfig {
  storage: StorageConfig
}

export interface MatomoConfig {
  enabled: boolean
  url: string
  siteId: string
}

export interface AnalyticsConfig {
  matomo: MatomoConfig
}
