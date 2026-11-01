# SaaS visit analytics

Cloud and Site write to Workers Analytics Engine. Production uses `chronoframe_visits`; named staging Previews use `chronoframe_visits_preview`. Bindings create the dataset on the first write. Do not create a dataset per tenant. Local builds without bindings do not collect visits.

## Configuration

Enable Analytics Engine in the Cloudflare account. In each main-repository deployment GitHub Environment, configure:

| Type | Name | Value |
| --- | --- | --- |
| Existing Secret | `CLOUDFLARE_ACCOUNT_ID` | Reused automatically; no additional account-ID variable is required |
| Secret | `ANALYTICS_API_TOKEN` | API token with **Account / Account Analytics / Read**, restricted to this account |
| Secret | `ANALYTICS_VISITOR_SECRET` | At least 32 characters of cryptographically random key material; generate with `openssl rand -hex 32` |

Use different visitor secrets in production and staging. The deploy workflow creates `VISIT_ANALYTICS`, sets the dataset and account ID on each Worker, and supplies the visitor secret to both Cloud and Site. Only Cloud receives the query token. Credentials are never bundled into browser JavaScript or committed Wrangler files. With neither new secret configured, analytics remains disabled. Configuring only one of the two new secrets fails deployment validation.

In the private Admin repository's **platform-production** Environment, reuse the existing `CLOUDFLARE_ACCOUNT_ID` Secret and configure the query-token Secret. Admin does not require the visitor secret or a write binding. Its runtime-secrets step sets `ANALYTICS_ACCOUNT_ID`, `ANALYTICS_API_TOKEN`, and `ANALYTICS_DATASET=chronoframe_visits` on the Admin Worker.

Merge and deploy Cloud and Site from the main repository, then deploy Admin. The Admin source pin must include this feature. Admin's private migration grants `analytics.read` to existing operator/admin roles; root always has access. Custom roles remain unchanged and can be configured by root.

## Entitlements and access

All existing plans default to analytics disabled. Enable **Allow workspace site analytics** in the Admin plan editor to grant access. The workspace navigation displays Analytics only with the effective current plan's entitlement. API access independently requires an active authenticated workspace membership, the current entitlement, and, when selected, a site belonging to that workspace. A missing entitlement returns 403 even for a manually entered URL. All-site queries still force the workspace and site traffic scope; they cannot include website, portal or another tenant.

Admin's Analytics page supports all traffic or website/portal/customer-site filters and optional workspace/site IDs. Portal's Analytics page supports all sites in the workspace or one site. Reports include PV, daily UV total, daily trends and the top 20 pages, referrer hosts, countries, hosts, browsers, devices, operating systems and campaign labels. Queries allow up to 31 days within the last 90 days, UTC. Responses are private and query results are cached internally for 60 seconds after authorization. Retention is Analytics Engine's three-month window; this is not a permanent archive.

## Counting and privacy

A browser page entry or SPA path navigation sends one same-origin event. Assets, API requests and prefetches do not count. Same-path query/hash changes do not count as new views. Reloading a page does count. Blocked scripts, privacy preferences, network failures and known-bot filtering affect coverage; this is an operational reference rather than billing evidence. Configure Cloudflare rate limiting on `/api/analytics/visit` for your traffic profile; like ordinary client analytics, events are not proof that a human visited.

The collector derives workspace/site identity from the verified request Host, never client-supplied IDs. It honors DNT and GPC, excludes known bot user agents, uses Cloudflare's trusted visitor IP transiently and does not set cookies. The HMAC visitor identifier rotates daily (UTC), is scoped by traffic kind and workspace, and cannot be linked across workspaces or days. Shared-network users with identical browser information may be grouped. Changing the key during a day may split that day's UV.

No raw IP, full user agent, URL query string or full referrer URL is written. Only referrer host and coarse browser/device categories are stored. Private portal routes are recorded as templates, not account identifiers. Published privacy-policy defaults disclose the collection; if you have customized published policy records, update those records through the Admin legal editor before enabling collection.

PV uses `SUM(_sample_interval)`. UV uses distinct daily HMAC values; over multiple days it is the daily UV sum, not cross-day distinct users. When Analytics Engine sampling occurs, observed UV can undercount and the UI explicitly identifies sampled results. Per-dimension UV is not additive across rows. Queries return only aggregates, never visitor hashes. Empty data, an uninitialized dataset and query/configuration errors are separate states.

## Dataset schema v1

| Field | Content |
| --- | --- |
| index1 | `kind:workspaceId:siteId` |
| blob1 | `v1` |
| blob2 | `website`, `portal`, or `site` |
| blob3–4 | Server-resolved workspace and site IDs; `0` for platform traffic |
| blob5–6 | Request hostname and path / private route template |
| blob7 | Daily HMAC visitor identifier |
| blob8–9 | Referrer hostname and Cloudflare country |
| blob10–12 | Browser, device, operating-system categories |
| blob13 | Validated campaign source / medium / name |
| double1 | `1` |

Official references: [Bindings and dataset creation](https://developers.cloudflare.com/analytics/analytics-engine/get-started/), [SQL API token](https://developers.cloudflare.com/analytics/analytics-engine/sql-api/), [sampling](https://developers.cloudflare.com/analytics/analytics-engine/sampling/).
