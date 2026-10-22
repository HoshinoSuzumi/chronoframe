/** A trusted application boundary supplies this context; never accept a caller-selected header. */
export interface SiteContext {
  readonly id: number
}
export const DEFAULT_SITE: SiteContext = Object.freeze({ id: 1 })
export function assertSiteContext(site: SiteContext): void {
  if (!site || !Number.isSafeInteger(site.id) || site.id < 1)
    throw new RangeError('A valid Site context is required')
}
/** Length framing prevents key collisions when logical keys contain separators. */
export function siteCacheKey(site: SiteContext, key: string): string {
  assertSiteContext(site)
  return `site:${site.id}:${key.length}:${key}`
}
