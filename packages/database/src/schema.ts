import type { NormalizedLocation } from '@chronoframe/contracts/location'
import { sql } from 'drizzle-orm'
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'
import {
  QUEUE_WARNING_CODES,
  type PipelineQueuePayload,
} from '@chronoframe/contracts/queue'
import type { NeededExif } from '@chronoframe/contracts/photo'
import type { StorageConfig } from '@chronoframe/contracts/storage'

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('name').notNull().unique(),
  email: text('email').notNull().unique(),
  password: text('password'),
  avatar: text('avatar'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  isAdmin: integer('is_admin').default(0).notNull(),
})

export const workspaces = sqliteTable('workspaces', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
})
export const sites = sqliteTable('sites', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  workspaceId: integer('workspace_id')
    .notNull()
    .references(() => workspaces.id),
  name: text('name').notNull(),
})
export const memberships = sqliteTable(
  'memberships',
  {
    workspaceId: integer('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['admin', 'member'] }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.userId] })],
)
const siteColumn = () =>
  integer('site_id')
    .notNull()
    .default(1)
    .references(() => sites.id)

export const photos = sqliteTable(
  'photos',
  {
    originalDerivedKey: text('original_derived_key'),
    storageConnectionId: integer('storage_connection_id'),
    storageRevision: integer('storage_revision').notNull().default(1),
    sourceVersion: integer('source_version').notNull().default(1),
    siteId: siteColumn(),
    id: text('id').primaryKey().unique(),
    title: text('title'),
    description: text('description'),
    width: integer('width'),
    height: integer('height'),
    aspectRatio: real('aspect_ratio'),
    dateTaken: text('date_taken'),
    storageKey: text('storage_key'),
    thumbnailKey: text('thumbnail_key'),
    fileSize: integer('file_size'),
    lastModified: text('last_modified'),
    originalUrl: text('original_url'),
    thumbnailUrl: text('thumbnail_url'),
    thumbnailHash: text('thumbnail_hash'),
    tags: text('tags', { mode: 'json' }).$type<string[]>(),
    exif: text('exif', { mode: 'json' }).$type<NeededExif>(),
    // 地理位置信息
    latitude: real('latitude'),
    longitude: real('longitude'),
    country: text('country'),
    city: text('city'),
    locationName: text('location_name'),
    geocoding: text('geocoding', { mode: 'json' }).$type<NormalizedLocation>(),
    // LivePhoto 相关字段
    isLivePhoto: integer('is_live_photo').default(0).notNull(),
    livePhotoVideoUrl: text('live_photo_video_url'),
    livePhotoVideoKey: text('live_photo_video_key'),
  },
  (t) => [index('idx_photos_site').on(t.siteId)],
)

// One row per string an image request may use to identify a photo: the photo
// id, each storage key, each public URL, and the tidied form of those paths.
// Photos insert/update/delete triggers (migration 0014) keep the rows in sync.
// Album checks look up this indexed key instead of reading every photos row.
export const photoAccessKeys = sqliteTable(
  'photo_access_keys',
  {
    siteId: siteColumn(),
    accessKey: text('access_key').notNull(),
    photoId: text('photo_id')
      .notNull()
      .references(() => photos.id, { onDelete: 'cascade' }),
  },
  (t) => [
    index('idx_photo_access_keys_site').on(t.siteId),
    primaryKey({ columns: [t.accessKey, t.photoId] }),
    index('idx_photo_access_keys_photo_id').on(t.photoId),
  ],
)

export const pipelineQueue = sqliteTable(
  'pipeline_queue',
  {
    resourceId: text('resource_id'),
    sourceHash: text('source_hash'),
    pipelineVersion: text('pipeline_version').notNull().default('1'),
    attemptId: text('attempt_id'),
    workerId: text('worker_id'),
    leaseExpiresAt: integer('lease_expires_at', { mode: 'timestamp_ms' }),
    heartbeatAt: integer('heartbeat_at', { mode: 'timestamp_ms' }),
    storageConnectionId: integer('storage_connection_id'),
    storageRevision: integer('storage_revision').notNull().default(1),
    sourceVersion: integer('source_version').notNull().default(1),
    siteId: siteColumn(),
    id: integer('id').primaryKey({ autoIncrement: true }),
    payload: text('payload', { mode: 'json' })
      .$type<PipelineQueuePayload>()
      .notNull()
      .default({
        type: 'photo',
        storageKey: '',
      } satisfies PipelineQueuePayload),
    priority: integer('priority').default(0).notNull(),
    availableAt: integer('available_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`0`),
    attempts: integer('attempts').default(0).notNull(),
    maxAttempts: integer('max_attempts').default(3).notNull(),
    status: text('status', {
      enum: [
        'pending', // Waiting to be processed
        'in-stages', // Currently being processed
        'completed', // Successfully processed
        'failed', // Processing failed
      ],
    })
      .notNull()
      .default('pending'),
    statusStage: text('status_stage', {
      enum: [
        'preprocessing',
        'metadata',
        'thumbnail',
        'exif',
        'motion-photo',
        'reverse-geocoding',
        'live-photo',
        'location-erase',
      ],
    }),
    errorMessage: text('error_message'),
    warningCode: text('warning_code', { enum: QUEUE_WARNING_CODES }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    completedAt: integer('completed_at', { mode: 'timestamp' }),
  },
  (t) => [
    index('idx_pipeline_queue_site').on(t.siteId),
    index('idx_pipeline_queue_lease').on(t.siteId, t.status, t.leaseExpiresAt),
    index('idx_pipeline_queue_resource').on(
      t.siteId,
      t.resourceId,
      t.sourceVersion,
    ),
    index('idx_pipeline_queue_pending')
      .on(sql`${t.priority} DESC`, t.createdAt, t.id)
      .where(sql`${t.status} = 'pending'`),
  ],
)

// 照片表态表
export const photoReactions = sqliteTable(
  'photo_reactions',
  {
    siteId: siteColumn(),
    id: integer('id').primaryKey({ autoIncrement: true }),
    photoId: text('photo_id')
      .notNull()
      .references(() => photos.id, { onDelete: 'cascade' }),
    reactionType: text('reaction_type', {
      enum: [
        'like',
        'love',
        'amazing',
        'funny',
        'wow',
        'sad',
        'fire',
        'sparkle',
      ],
    }).notNull(),
    // 使用指纹而不是 IP 地址，更准确且支持匿名用户
    fingerprint: text('fingerprint').notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [index('idx_photo_reactions_site').on(t.siteId)],
)

// 相簿表
export const albums = sqliteTable(
  'albums',
  {
    siteId: siteColumn(),
    id: integer('id').primaryKey({ autoIncrement: true }),
    title: text('title').notNull(),
    description: text('description'),
    coverPhotoId: text('cover_photo_id').references(() => photos.id, {
      onDelete: 'set null',
    }),
    isHidden: integer('is_hidden', { mode: 'boolean' })
      .default(false)
      .notNull(),
    passwordHash: text('password_hash'),
    // Album sort position (ascending; smaller value appears first)
    position: real('position').notNull().default(0),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [index('idx_albums_site').on(t.siteId)],
)

/** Current and historical public paths share one per-site namespace. */
export const albumSlugs = sqliteTable(
  'album_slugs',
  {
    siteId: siteColumn(),
    slug: text('slug').notNull(),
    albumId: integer('album_id')
      .notNull()
      .references(() => albums.id, { onDelete: 'cascade' }),
    isCurrent: integer('is_current', { mode: 'boolean' })
      .notNull()
      .default(false),
  },
  (t) => [
    primaryKey({ columns: [t.siteId, t.slug] }),
    uniqueIndex('album_slugs_one_current')
      .on(t.siteId, t.albumId)
      .where(sql`is_current = 1`),
    index('album_slugs_album').on(t.siteId, t.albumId),
  ],
)

// 相簿-照片 多对多关系表
export const albumPhotos = sqliteTable(
  'album_photos',
  {
    siteId: siteColumn(),
    id: integer('id').primaryKey({ autoIncrement: true }),
    albumId: integer('album_id')
      .notNull()
      .references(() => albums.id, { onDelete: 'cascade' }),
    photoId: text('photo_id')
      .notNull()
      .references(() => photos.id, { onDelete: 'cascade' }),
    position: real('position').notNull().default(1000000),
    addedAt: integer('added_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    index('idx_album_photos_site').on(t.siteId),
    uniqueIndex('album_photos_album_photo_unique').on(t.albumId, t.photoId),
  ],
)

export const settings = sqliteTable(
  'settings',
  {
    siteId: siteColumn(),
    id: integer('id').primaryKey({ autoIncrement: true }),
    namespace: text('namespace').notNull().default('common'),
    key: text('key').notNull(),
    type: text('type', {
      enum: ['string', 'number', 'boolean', 'json'],
    }).notNull(),
    value: text('value'),
    defaultValue: text('default_value'),
    label: text('label'),
    description: text('description'),
    isPublic: integer('is_public', { mode: 'boolean' })
      .default(false)
      .notNull(),
    isReadonly: integer('is_readonly', { mode: 'boolean' })
      .default(false)
      .notNull(),
    isSecret: integer('is_secret', { mode: 'boolean' })
      .default(false)
      .notNull(),
    enum: text('enum', { mode: 'json' }).$type<string[] | null>(),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedBy: integer('updated_by').references(() => users.id, {
      onDelete: 'set null',
    }),
  },
  (t) => [
    index('idx_settings_site').on(t.siteId),
    uniqueIndex('idx_namespace_key').on(t.siteId, t.namespace, t.key),
  ],
)

export const settings_storage_providers = sqliteTable(
  'settings_storage_providers',
  {
    revision: integer('revision').notNull().default(1),
    siteId: siteColumn(),
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    provider: text('provider', {
      enum: ['s3', 'local', 'openlist'],
    }).notNull(),
    config: text('config', { mode: 'json' }).$type<StorageConfig>().notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [index('idx_settings_storage_providers_site').on(t.siteId)],
)

export const storageConnectionVersions = sqliteTable(
  'storage_connection_versions',
  {
    connectionId: integer('connection_id').notNull(),
    revision: integer('revision').notNull(),
    siteId: siteColumn(),
    config: text('config', { mode: 'json' }).$type<StorageConfig>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.connectionId, t.revision] })],
)

export const resourceVersions = sqliteTable(
  'resource_versions',
  {
    siteId: siteColumn(),
    resourceId: text('resource_id').notNull(),
    version: integer('version').notNull().default(1),
    deleted: integer('deleted', { mode: 'boolean' }).notNull().default(false),
    storageConnectionId: integer('storage_connection_id'),
    storageRevision: integer('storage_revision').notNull().default(1),
    storageKey: text('storage_key'),
  },
  (t) => [primaryKey({ columns: [t.siteId, t.resourceId] })],
)
export const jobCommitGuards = sqliteTable(
  'job_commit_guards',
  {
    siteId: integer('site_id').notNull(),
    resourceId: text('resource_id').notNull(),
    attemptId: text('attempt_id').notNull(),
  },
  (t) => [primaryKey({ columns: [t.siteId, t.resourceId] })],
)
