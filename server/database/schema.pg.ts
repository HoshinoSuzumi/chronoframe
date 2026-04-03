import { sql } from 'drizzle-orm'
import { pgTable, text, integer, real, uniqueIndex } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: integer('id').generatedByDefaultAsIdentity().primaryKey(),
  username: text('name').notNull().unique(),
  email: text('email').notNull().unique(),
  password: text('password'),
  avatar: text('avatar'),
  createdAt: integer('created_at').notNull(),
  isAdmin: integer('is_admin').default(0).notNull(),
})

export const photos = pgTable('photos', {
  id: text('id').primaryKey(),
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
  tags: text('tags'),
  exif: text('exif'),
  latitude: real('latitude'),
  longitude: real('longitude'),
  country: text('country'),
  city: text('city'),
  locationName: text('location_name'),
  isLivePhoto: integer('is_live_photo').default(0).notNull(),
  livePhotoVideoUrl: text('live_photo_video_url'),
  livePhotoVideoKey: text('live_photo_video_key'),
})

export const pipelineQueue = pgTable('pipeline_queue', {
  id: integer('id').generatedByDefaultAsIdentity().primaryKey(),
  payload: text('payload')
    .notNull()
    .default('{"type":"photo","storageKey":""}'),
  priority: integer('priority').default(0).notNull(),
  attempts: integer('attempts').default(0).notNull(),
  maxAttempts: integer('max_attempts').default(3).notNull(),
  status: text('status').notNull().default('pending'),
  statusStage: text('status_stage'),
  errorMessage: text('error_message'),
  createdAt: integer('created_at')
    .notNull()
    .default(sql`(extract(epoch from now())::integer)`),
  completedAt: integer('completed_at'),
})

export const photoReactions = pgTable('photo_reactions', {
  id: integer('id').generatedByDefaultAsIdentity().primaryKey(),
  photoId: text('photo_id')
    .notNull()
    .references(() => photos.id, { onDelete: 'cascade' }),
  reactionType: text('reaction_type').notNull(),
  fingerprint: text('fingerprint').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: integer('created_at')
    .notNull()
    .default(sql`(extract(epoch from now())::integer)`),
  updatedAt: integer('updated_at')
    .notNull()
    .default(sql`(extract(epoch from now())::integer)`),
})

export const albums = pgTable('albums', {
  id: integer('id').generatedByDefaultAsIdentity().primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  coverPhotoId: text('cover_photo_id').references(() => photos.id, {
    onDelete: 'set null',
  }),
  createdAt: integer('created_at')
    .notNull()
    .default(sql`(extract(epoch from now())::integer)`),
  updatedAt: integer('updated_at')
    .notNull()
    .default(sql`(extract(epoch from now())::integer)`),
})

export const albumPhotos = pgTable('album_photos', {
  id: integer('id').generatedByDefaultAsIdentity().primaryKey(),
  albumId: integer('album_id')
    .notNull()
    .references(() => albums.id, { onDelete: 'cascade' }),
  photoId: text('photo_id')
    .notNull()
    .references(() => photos.id, { onDelete: 'cascade' }),
  position: real('position').notNull().default(1000000),
  addedAt: integer('added_at')
    .notNull()
    .default(sql`(extract(epoch from now())::integer)`),
})

export const settings = pgTable(
  'settings',
  {
    id: integer('id').generatedByDefaultAsIdentity().primaryKey(),
    namespace: text('namespace').notNull().default('common'),
    key: text('key').notNull(),
    type: text('type').notNull(),
    value: text('value'),
    defaultValue: text('default_value'),
    label: text('label'),
    description: text('description'),
    isPublic: integer('is_public').default(0).notNull(),
    isReadonly: integer('is_readonly').default(0).notNull(),
    isSecret: integer('is_secret').default(0).notNull(),
    enum: text('enum'),
    updatedAt: integer('updated_at')
      .notNull()
      .default(sql`(extract(epoch from now())::integer)`),
    updatedBy: integer('updated_by').references(() => users.id, {
      onDelete: 'set null',
    }),
  },
  (t) => [uniqueIndex('idx_namespace_key').on(t.namespace, t.key)],
)

export const settings_storage_providers = pgTable(
  'settings_storage_providers',
  {
    id: integer('id').generatedByDefaultAsIdentity().primaryKey(),
    name: text('name').notNull(),
    provider: text('provider').notNull(),
    config: text('config').notNull(),
    createdAt: integer('created_at')
      .notNull()
      .default(sql`(extract(epoch from now())::integer)`),
    updatedAt: integer('updated_at')
      .notNull()
      .default(sql`(extract(epoch from now())::integer)`),
  },
)
