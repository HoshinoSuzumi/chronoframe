import type {
  EntrySiteContext,
  EntryCapabilities,
} from '@chronoframe/contracts/entry'
import { SELF_HOSTED_CAPABILITIES } from '@chronoframe/contracts/entry'

/** Request-local on SSR; replaced before rendering any different tenant/account. */
export function useEntryContext() {
  return useState<EntrySiteContext | null>('entry-site-context', () => null)
}
/** Prefer server-resolved Site capabilities, with the entry profile as the bootstrap default. */
export function useEntryCapabilities(): EntryCapabilities {
  return (
    useEntryContext().value?.capabilities ??
    (useRuntimeConfig().public.capabilities as EntryCapabilities | undefined) ??
    SELF_HOSTED_CAPABILITIES
  )
}
export { entryRequestPath } from '@chronoframe/contracts/entry'
