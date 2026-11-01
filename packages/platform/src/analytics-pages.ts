import type { PlatformD1 } from './index.ts'
import { allRows } from './subscriptions.ts'
import type { AnalyticsFilter, AnalyticsRow } from './analytics.ts'
/** Attribution survives multi-site aggregation and daily archival. */
export const PAGE_LABEL_SQL = "format('{}|{}|{}',blob4,blob5,blob6)"
export function decodeAnalyticsPage(value: string) {
  const match = /^(\d+)\|([^|]+)\|([\s\S]*)$/.exec(value)
  if (!match) return null
  const siteId = Number(match[1]),
    host = match[2]!,
    path = match[3]!
  if (
    !Number.isSafeInteger(siteId) ||
    siteId < 0 ||
    !/^([a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)$/.test(host) ||
    host.length > 253 ||
    !path.startsWith('/') ||
    path.startsWith('//')
  )
    return null
  return { siteId, host, path }
}
export type AnalyticsLink = { title: string; href?: string; kind?: string }
export type AnalyticsPage = {
  key: string
  path: string
  site: AnalyticsLink
  segments: AnalyticsLink[]
}
export async function resolveAnalyticsPages<
  T extends { pages: AnalyticsRow[] },
>(db: PlatformD1, report: T, filter: AnalyticsFilter, now = Date.now()) {
  const entries = report.pages.map((row) => ({
    row,
    context:
      decodeAnalyticsPage(row.label) ??
      (filter.siteId && row.label.startsWith('/')
        ? { siteId: filter.siteId, host: '', path: row.label }
        : null),
  }))
  const ids = [
    ...new Set(
      entries.flatMap((e) => (e.context?.siteId ? [e.context.siteId] : [])),
    ),
  ]
  const sites = new Map<number, any>(),
    domains = new Map<number, any[]>()
  if (ids.length) {
    const marks = ids.map(() => '?').join(',')
    for (const site of await allRows<any>(
      db
        .prepare(
          `SELECT s.id,s.workspace_id,s.name,s.gallery_title,s.published,s.suspended,COALESCE(c.suspended,0) AS owner_suspended FROM platform_sites s LEFT JOIN platform_workspaces w ON w.id=s.workspace_id LEFT JOIN platform_account_controls c ON c.user_id=w.owner_user_id WHERE s.id IN (${marks})${filter.workspaceId ? ' AND s.workspace_id=?' : ''}`,
        )
        .bind(...ids, ...(filter.workspaceId ? [filter.workspaceId] : [])),
    ))
      sites.set(Number(site.id), site)
    for (const domain of await allRows<any>(
      db
        .prepare(
          `SELECT d.site_id,d.hostname,COALESCE(c.is_primary,0) AS is_primary,d.kind FROM platform_domains d LEFT JOIN platform_custom_domains c ON c.hostname=d.hostname AND c.site_id=d.site_id WHERE d.site_id IN (${marks}) AND d.active=1 AND d.verified=1 AND (d.kind<>'custom' OR (c.state='active' AND c.verified_at>=?)) AND (d.kind<>'alias' OR d.redirect_until>?) ORDER BY is_primary DESC,CASE WHEN d.kind='default' THEN 0 ELSE 1 END,d.hostname`,
        )
        .bind(...ids, now - 3600000, now),
    )) {
      const list = domains.get(Number(domain.site_id)) ?? []
      list.push(domain)
      domains.set(Number(domain.site_id), list)
    }
  }
  const paths = entries
    .filter((e) => e.context && sites.has(e.context.siteId))
    .map((e) => e.context!)
  const photoIds = [
    ...new Set(
      paths.flatMap((p) => {
        const parts = p.path.split('/').filter(Boolean)
        return parts[0] === 'albums' && parts.length === 3
          ? [parts[2]!]
          : parts.length === 1
            ? [parts[0]!]
            : []
      }),
    ),
  ]
  const albumSlugs = [
    ...new Set(
      paths.flatMap((p) => {
        const parts = p.path.split('/').filter(Boolean)
        return parts[0] === 'albums' && parts[1] ? [parts[1]] : []
      }),
    ),
  ]
  const photos = new Map<string, any>(),
    albums = new Map<string, any>()
  if (ids.length && photoIds.length)
    for (const p of await allRows<any>(
      db
        .prepare(
          `SELECT site_id,id,title FROM cloud_photos WHERE deleted=0 AND site_id IN (${ids.map(() => '?')}) AND id IN (${photoIds.map(() => '?')})`,
        )
        .bind(...ids, ...photoIds),
    ))
      if (sites.has(Number(p.site_id))) photos.set(`${p.site_id}:${p.id}`, p)
  if (ids.length && albumSlugs.length)
    for (const a of await allRows<any>(
      db
        .prepare(
          `SELECT a.site_id,a.id,a.title,sl.slug,current.slug AS canonical FROM cloud_albums a LEFT JOIN cloud_album_slugs sl ON sl.site_id=a.site_id AND sl.album_id=a.id LEFT JOIN cloud_album_slugs current ON current.site_id=a.site_id AND current.album_id=a.id AND current.is_current=1 WHERE a.site_id IN (${ids.map(() => '?')}) AND (sl.slug IN (${albumSlugs.map(() => '?')}) OR a.id IN (${albumSlugs.map(() => '?')}))`,
        )
        .bind(...ids, ...albumSlugs, ...albumSlugs),
    )) {
      if (!sites.has(Number(a.site_id))) continue
      albums.set(`${a.site_id}:${a.slug}`, a)
      albums.set(`${a.site_id}:${a.id}`, a)
    }
  const memberships = new Set<string>()
  if (ids.length && photoIds.length && albumSlugs.length)
    for (const item of await allRows<{
      site_id: number
      album_id: string
      photo_id: string
    }>(
      db
        .prepare(
          `SELECT site_id,album_id,photo_id FROM cloud_album_photos WHERE site_id IN (${ids.map(() => '?')}) AND photo_id IN (${photoIds.map(() => '?')})`,
        )
        .bind(...ids, ...photoIds),
    ))
      memberships.add(`${item.site_id}:${item.album_id}:${item.photo_id}`)
  return {
    ...report,
    pages: entries.map(({ row, context }) => {
      if (!context) return row
      const { siteId, host, path } = context,
        site = sites.get(siteId)
      if (siteId && (!site || (filter.siteId && filter.siteId !== siteId)))
        return { ...row, label: path }
      const choices = domains.get(siteId) ?? [],
        domain =
          choices.find((d) => d.is_primary) ||
          choices.find((d) => d.hostname === host) ||
          choices[0]
      const origin = siteId
        ? domain
          ? `https://${domain.hostname}`
          : undefined
        : `https://${host}`
      const available =
        !siteId || (site.published && !site.suspended && !site.owner_suspended)
      const url = (suffix: string) =>
        available && origin ? origin + suffix : undefined
      const page: AnalyticsPage = {
        key: row.label,
        path,
        site: {
          title:
            site?.gallery_title ||
            site?.name ||
            (host === 'app.chronoframe.art'
              ? 'ChronoFrame Cloud'
              : host === 'chronoframe.art'
                ? 'ChronoFrame'
                : host),
          href: url('/'),
        },
        segments: [],
      }
      const parts = path
        .split('/')
        .filter(Boolean)
        .map((segment) => {
          try {
            return decodeURIComponent(segment)
          } catch {
            return segment
          }
        })
      if (!parts.length) return { ...row, label: path, page }
      if (parts[0] === 'albums') {
        page.segments.push({
          title: 'Albums',
          kind: 'albums',
          href: url('/albums'),
        })
        if (parts[1]) {
          const album = albums.get(`${siteId}:${parts[1]}`),
            albumPath = `/albums/${encodeURIComponent(album?.canonical || parts[1])}`
          page.segments.push({
            title: album?.title || parts[1],
            href: album ? url(albumPath) : undefined,
          })
          if (parts[2]) {
            const photo = photos.get(`${siteId}:${parts[2]}`)
            page.segments.push({
              title: photo?.title || parts[2],
              href: photo
                ? url(
                    album &&
                      memberships.has(`${siteId}:${album.id}:${photo.id}`)
                      ? `${albumPath}?photo=${encodeURIComponent(photo.id)}`
                      : `/${encodeURIComponent(photo.id)}`,
                  )
                : undefined,
            })
          }
        }
      } else if (parts.length === 1 && photos.has(`${siteId}:${parts[0]}`)) {
        const photo = photos.get(`${siteId}:${parts[0]}`)
        page.segments.push({
          title: photo.title || photo.id,
          href: url(`/${encodeURIComponent(photo.id)}`),
        })
      } else
        page.segments.push({
          title: path.slice(1),
          href: !path.includes(':') ? url(path) : undefined,
        })
      return { ...row, label: path, page }
    }),
  }
}
