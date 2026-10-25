import type { PlatformD1 } from './index.ts'

export class ProvisioningError extends Error {
  statusCode: number
  constructor(statusCode: number, message: string) {
    super(message)
    this.statusCode = statusCode
  }
}
const reserved = new Set([
  'www',
  'app',
  'api',
  'admin',
  'account',
  'auth',
  'cloud',
  'site',
  'sites',
  'staging',
  'preview',
  'production',
  'mail',
  'email',
  'noreply',
  'support',
  'help',
  'docs',
  'status',
  'assets',
  'static',
  'cdn',
  'chronoframe',
])
export function siteIdentity(name: unknown, slug: unknown) {
  if (
    typeof name !== 'string' ||
    !name.trim() ||
    name.trim().length > 80 ||
    Array.from(name).some(
      (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
    )
  )
    throw new ProvisioningError(400, 'Invalid site name')
  if (
    typeof slug !== 'string' ||
    !/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(slug) ||
    reserved.has(slug)
  )
    throw new ProvisioningError(400, 'Invalid site address')
  return { name: name.trim(), slug }
}
export function siteProfile(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ProvisioningError(400, 'Invalid gallery profile')
  const profile = value as Record<string, unknown>
  function text(key: string, max: number) {
    const value = profile[key]
    if (
      typeof value !== 'string' ||
      value.length > max ||
      Array.from(value).some(
        (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
      )
    )
      throw new ProvisioningError(400, 'Invalid gallery profile')
    return value.trim()
  }
  const avatarUrl = text('avatarUrl', 65536)
  // Raster uploads only: no scripts, SVG or server-side remote image fetches.
  if (
    avatarUrl &&
    !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(
      avatarUrl,
    )
  )
    throw new ProvisioningError(400, 'Invalid gallery icon')
  return {
    title: text('title', 80),
    slogan: text('slogan', 200),
    author: text('author', 80),
    avatarUrl,
  }
}
export interface ManagedSite {
  siteId: number
  workspaceId: number
  name: string
  slug: string | null
  published: number
  revision: number
  title: string
  slogan: string
  author: string
  avatarUrl: string
}
const fields =
  's.id AS siteId, s.workspace_id AS workspaceId, s.name, s.slug, s.published, s.revision, s.gallery_title AS title, s.gallery_slogan AS slogan, s.gallery_author AS author, s.gallery_avatar AS avatarUrl'
/** Transactional D1 writes retain live membership checks, including during retries. */
export function createD1Provisioning(db: PlatformD1) {
  async function defaultWorkspace(userId: number) {
    await db.batch([
      db
        .prepare(`INSERT INTO platform_workspaces(name, owner_user_id)
        SELECT 'My workspace', id FROM platform_users WHERE id = ? AND email_verified = 1
        ON CONFLICT(owner_user_id) DO NOTHING`)
        .bind(userId),
      // Only the transaction that created the workspace grants its initial membership.
      // A later read must never restore a membership that was explicitly revoked.
      db
        .prepare(`INSERT INTO platform_memberships(user_id, workspace_id, role)
        SELECT ?, id, 'admin' FROM platform_workspaces WHERE owner_user_id = ? AND changes() = 1
        ON CONFLICT(user_id, workspace_id) DO NOTHING`)
        .bind(userId, userId),
    ])
    const workspace = await db
      .prepare(`SELECT w.id, w.name, m.role FROM platform_workspaces w
      JOIN platform_memberships m ON m.workspace_id = w.id AND m.user_id = ?
      WHERE w.owner_user_id = ?`)
      .bind(userId, userId)
      .first<{ id: number; name: string; role: string }>()
    if (!workspace) throw new ProvisioningError(403, 'Workspace unavailable')
    return workspace
  }
  async function get(userId: number, siteId: number) {
    const site = await db
      .prepare(`SELECT ${fields}, m.role FROM platform_sites s
      JOIN platform_memberships m ON m.workspace_id = s.workspace_id
      WHERE s.id = ? AND m.user_id = ? AND m.role IN ('admin','member')`)
      .bind(siteId, userId)
      .first<ManagedSite & { role: string }>()
    if (!site) throw new ProvisioningError(404, 'Site not found')
    return site
  }
  return {
    defaultWorkspace,
    get,
    async create(
      userId: number,
      input: { name: unknown; slug: unknown; requestId: unknown },
    ) {
      const identity = siteIdentity(input.name, input.slug)
      if (
        typeof input.requestId !== 'string' ||
        !/^[a-f0-9-]{36}$/.test(input.requestId)
      )
        throw new ProvisioningError(400, 'Invalid request identifier')
      const workspace = await defaultWorkspace(userId)
      const existing = await db
        .prepare(`SELECT ${fields} FROM platform_sites s
        JOIN platform_memberships m ON m.workspace_id = s.workspace_id
        WHERE s.workspace_id = ? AND s.provision_key = ? AND m.user_id = ? AND m.role = 'admin'`)
        .bind(workspace.id, input.requestId, userId)
        .first<ManagedSite>()
      if (existing) {
        if (existing.name !== identity.name || existing.slug !== identity.slug)
          throw new ProvisioningError(409, 'Request identifier already used')
        return existing
      }
      try {
        const site = await db
          .prepare(`INSERT INTO platform_sites(workspace_id, name, slug, created_at, provision_key)
          SELECT ?, ?, ?, ?, ? WHERE EXISTS(SELECT 1 FROM platform_memberships WHERE workspace_id = ? AND user_id = ? AND role = 'admin')
          AND (SELECT COUNT(*) FROM platform_sites WHERE workspace_id = ?) < 10
          ON CONFLICT(workspace_id, provision_key) DO UPDATE SET provision_key = excluded.provision_key
          RETURNING id AS siteId, workspace_id AS workspaceId, name, slug, published, revision, gallery_title AS title, gallery_slogan AS slogan, gallery_author AS author, gallery_avatar AS avatarUrl`)
          .bind(
            workspace.id,
            identity.name,
            identity.slug,
            Date.now(),
            input.requestId,
            workspace.id,
            userId,
            workspace.id,
          )
          .first<ManagedSite>()
        if (!site)
          throw new ProvisioningError(
            403,
            'Workspace site limit reached or permission changed',
          )
        if (site.name !== identity.name || site.slug !== identity.slug)
          throw new ProvisioningError(409, 'Request identifier already used')
        return site
      } catch (error) {
        if (
          String(error).includes(
            'UNIQUE constraint failed: platform_sites.slug',
          )
        )
          throw new ProvisioningError(409, 'Site address is already taken')
        throw error
      }
    },
    async update(
      userId: number,
      siteId: number,
      input: {
        name: unknown
        revision: unknown
        published: unknown
        profile?: unknown
      },
    ) {
      const current = await get(userId, siteId)
      if (current.role !== 'admin')
        throw new ProvisioningError(403, 'Administrator required')
      const name = siteIdentity(input.name, current.slug ?? 'legacy-site').name
      const profile =
        input.profile === undefined ? current : siteProfile(input.profile)
      if (
        !Number.isSafeInteger(input.revision) ||
        typeof input.published !== 'boolean'
      )
        throw new ProvisioningError(400, 'Invalid site settings')
      // Publishing new galleries stays gated until media/storage and default routing are ready.
      if (input.published && !current.published)
        throw new ProvisioningError(400, 'Publishing is not available yet')
      const result = await db
        .prepare(`UPDATE platform_sites SET name = ?, published = ?, gallery_title = ?, gallery_slogan = ?, gallery_author = ?, gallery_avatar = ?, revision = revision + 1
        WHERE id = ? AND revision = ? AND EXISTS(SELECT 1 FROM platform_memberships WHERE workspace_id = platform_sites.workspace_id AND user_id = ? AND role = 'admin')
        RETURNING id AS siteId, workspace_id AS workspaceId, name, slug, published, revision, gallery_title AS title, gallery_slogan AS slogan, gallery_author AS author, gallery_avatar AS avatarUrl`)
        .bind(
          name,
          input.published ? 1 : 0,
          profile.title,
          profile.slogan,
          profile.author,
          profile.avatarUrl,
          siteId,
          input.revision as number,
          userId,
        )
        .first<ManagedSite>()
      if (!result)
        throw new ProvisioningError(409, 'Site changed; reload before saving')
      return result
    },
  }
}
