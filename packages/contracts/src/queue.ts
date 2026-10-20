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
