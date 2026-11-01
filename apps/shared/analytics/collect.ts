import {
  createError,
  getHeader,
  getRequestWebStream,
  setResponseStatus,
  setResponseHeader,
} from 'h3'
import type { H3Event } from 'h3'
import { readSiteBody } from '../platform/json'
import { platformRequestURL } from '../platform/runtime'
import { publicSiteContext } from '../platform/context'
import {
  visitAgent,
  visitPath,
  visitReferrer,
  visitorHash,
} from '../../../packages/platform/src/analytics'
import type { VisitScope } from '../../../packages/platform/src/analytics'
export async function collectVisit(
  event: H3Event,
  entry: 'cloud' | 'site',
  secret: string,
) {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  const url = platformRequestURL(event)
  if (
    event.method !== 'POST' ||
    getHeader(event, 'origin') !== url.origin ||
    !getHeader(event, 'content-type')?.startsWith('application/json')
  )
    throw createError({ statusCode: 403 })
  const body = await readSiteBody(getRequestWebStream(event), 4096)
  const binding = event.context.cloudflare?.env?.VISIT_ANALYTICS as
    | {
        writeDataPoint(point: {
          indexes: string[]
          blobs: string[]
          doubles: number[]
        }): void
      }
    | undefined
  setResponseStatus(event, 204)
  const ua = getHeader(event, 'user-agent') ?? ''
  if (
    !binding ||
    secret.length < 32 ||
    getHeader(event, 'dnt') === '1' ||
    getHeader(event, 'sec-gpc') === '1' ||
    /bot|crawler|spider|headless|preview|curl|wget/i.test(ua)
  )
    return
  let scope: VisitScope
  if (entry === 'site') {
    const context = await publicSiteContext(event)
    scope = {
      kind: 'site',
      workspaceId: context.site.workspaceId,
      siteId: context.site.id,
    }
  } else {
    scope = {
      kind: /^\/(?:sites|workspace|analytics|account|auth|signin|signup|login|register|onboarding)(?:\/|$)/.test(
        String(body.path),
      )
        ? 'portal'
        : 'website',
      workspaceId: 0,
      siteId: 0,
    }
  }
  let path: string
  try {
    path = visitPath(body.path, scope.kind)
  } catch {
    throw createError({ statusCode: 400 })
  }
  const request = event.context.cloudflare?.request as
    | (Request & { cf?: { country?: string } })
    | undefined
  // Only Cloudflare's trusted client-IP header is used transiently; never persist it.
  const ip = getHeader(event, 'cf-connecting-ip') ?? ''
  if (!ip) return // Fail closed in local/proxy environments without a trustworthy visitor identity.
  const visitor = await visitorHash(
    secret,
    new Date().toISOString().slice(0, 10),
    scope,
    ip,
    ua,
  )
  const { browser, device, os } = visitAgent(ua)
  const campaign = (value: unknown) =>
    typeof value === 'string' && /^[\p{L}\p{N} _.-]{1,64}$/u.test(value)
      ? value
      : ''
  try {
    binding.writeDataPoint({
      indexes: [`${scope.kind}:${scope.workspaceId}:${scope.siteId}`],
      blobs: [
        'v1',
        scope.kind,
        String(scope.workspaceId),
        String(scope.siteId),
        url.hostname,
        path,
        visitor,
        visitReferrer(body.referrer, url.hostname),
        String(request?.cf?.country ?? 'Unknown'),
        browser,
        device,
        os,
        [campaign(body.source), campaign(body.medium), campaign(body.campaign)]
          .filter(Boolean)
          .join(' / ') || 'None',
      ],
      doubles: [1],
    })
  } catch {
    /* Analytics must not break browsing; no credentials or request data in logs. */
  }
}
