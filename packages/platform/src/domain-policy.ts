import type { PlatformD1 } from './index.ts'
import { workspaceEntitlements } from './entitlements.ts'
export type DomainHold = 'plan' | 'site' | 'account' | 'manual'
export async function domainEligibility(db: PlatformD1, hostname: string) {
  const row = await db
    .prepare(`SELECT d.site_id,s.workspace_id,s.suspended,COALESCE(c.suspended,0) AS owner_suspended,
    (SELECT COUNT(*) FROM platform_custom_domains other JOIN platform_sites os ON os.id=other.site_id
      WHERE os.workspace_id=s.workspace_id AND other.state NOT IN('deleted','deleting') AND (other.created_at<d.created_at OR (other.created_at=d.created_at AND other.hostname<=d.hostname))) AS rank
    FROM platform_custom_domains d JOIN platform_sites s ON s.id=d.site_id JOIN platform_workspaces w ON w.id=s.workspace_id
    LEFT JOIN platform_account_controls c ON c.user_id=w.owner_user_id WHERE d.hostname=?`)
    .bind(hostname)
    .first<{
      site_id: number
      workspace_id: number
      suspended: number
      owner_suspended: number
      rank: number
    }>()
  if (!row) return { allowed: false, reason: 'plan' as DomainHold }
  if (row.suspended) return { allowed: false, reason: 'site' as DomainHold }
  if (row.owner_suspended)
    return { allowed: false, reason: 'account' as DomainHold }
  const plan = await workspaceEntitlements(db, row.workspace_id)
  return row.rank > 0 && row.rank <= plan.limits.customDomains
    ? { allowed: true, reason: null }
    : { allowed: false, reason: 'plan' as DomainHold }
}
