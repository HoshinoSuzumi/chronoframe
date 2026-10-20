import { z } from 'zod'

/**
 * Warning codes attached to completed pipeline queue tasks.
 *
 * The values are persisted in `pipeline_queue.warning_code` and returned by
 * the queue APIs. Keep them stable.
 */

export const QueueWarningCode = {
  AlbumMissing: 'album-missing',
} as const

export type QueueWarningCode =
  (typeof QueueWarningCode)[keyof typeof QueueWarningCode]

export const QUEUE_WARNING_CODES: [QueueWarningCode, ...QueueWarningCode[]] = [
  QueueWarningCode.AlbumMissing,
]

export const queuePayloadSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('location-migration') }),
  z.object({
    type: z.literal('photo'),
    storageKey: z.string().nonempty(),
    eraseLocation: z.boolean().optional(),
    albumId: z.number().int().positive().optional(),
  }),
  z
    .object({
      type: z.literal('live-photo-video'),
      storageKey: z.string().nonempty(),
    })
    .strict(),
  z.object({
    type: z.literal('photo-reverse-geocoding'),
    photoId: z.string().min(1),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
  }),
  z.object({
    type: z.literal('photo-erase-location'),
    photoId: z.string().min(1),
  }),
])

export type PipelineQueuePayload =
  | { type: 'location-migration' }
  | {
      type: 'photo'
      storageKey: string
      eraseLocation?: boolean
      albumId?: number
    }
  | {
      type: 'live-photo-video'
      storageKey: string
    }
  | {
      type: 'photo-reverse-geocoding'
      migrationOnly?: boolean
      photoId: string
      latitude?: number | null
      longitude?: number | null
    }
  | {
      type: 'photo-erase-location'
      photoId: string
    }

export type ProcessingStage =
  | 'preprocessing'
  | 'metadata'
  | 'thumbnail'
  | 'exif'
  | 'motion-photo'
  | 'reverse-geocoding'
  | 'live-photo'
  | 'location-erase'
/** Persist only operational references; credentials belong to versioned storage connections. */
export const jobPayloadSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('location-migration') }).strict(),
  z
    .object({
      type: z.literal('photo'),
      storageKey: z.string().min(1).max(2048),
      eraseLocation: z.boolean().optional(),
      albumId: z.number().int().positive().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('live-photo-video'),
      storageKey: z.string().min(1).max(2048),
    })
    .strict(),
  z
    .object({
      type: z.literal('photo-reverse-geocoding'),
      photoId: z.string().min(1).max(256),
      migrationOnly: z.boolean().optional(),
      latitude: z.number().min(-90).max(90).nullable().optional(),
      longitude: z.number().min(-180).max(180).nullable().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('photo-erase-location'),
      photoId: z.string().min(1).max(256),
    })
    .strict(),
])
