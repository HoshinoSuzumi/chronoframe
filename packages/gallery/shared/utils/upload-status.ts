/**
 * Upload state machines.
 *
 * Queue status is the dashboard item lifecycle. Transport status is one
 * storage upload inside `useUpload`. The names overlap (`uploading`,
 * `finalizing`, `error`) but the values are not interchangeable:
 * transport `success` becomes queue `processing`, and transport `aborted`
 * has no queue equivalent.
 *
 * The string values are the in-memory contract. Keep them stable.
 */

export const UploadQueueStatus = {
  Waiting: 'waiting',
  Preparing: 'preparing',
  Uploading: 'uploading',
  Finalizing: 'finalizing',
  Processing: 'processing',
  Completed: 'completed',
  Error: 'error',
  Skipped: 'skipped',
  Blocked: 'blocked',
} as const

export type UploadQueueStatus =
  (typeof UploadQueueStatus)[keyof typeof UploadQueueStatus]

export const UploadTransportStatus = {
  Idle: 'idle',
  Uploading: 'uploading',
  Finalizing: 'finalizing',
  Success: 'success',
  Error: 'error',
  Aborted: 'aborted',
} as const

export type UploadTransportStatus =
  (typeof UploadTransportStatus)[keyof typeof UploadTransportStatus]

const ABORTABLE_UPLOAD_STATUSES = new Set<UploadQueueStatus>([
  UploadQueueStatus.Uploading,
  UploadQueueStatus.Finalizing,
])

const QUEUED_UPLOAD_STATUSES = new Set<UploadQueueStatus>([
  UploadQueueStatus.Waiting,
  UploadQueueStatus.Preparing,
])

const CLEARABLE_UPLOAD_STATUSES = new Set<UploadQueueStatus>([
  UploadQueueStatus.Completed,
  UploadQueueStatus.Error,
])

const SKIPPED_OR_BLOCKED_UPLOAD_STATUSES = new Set<UploadQueueStatus>([
  UploadQueueStatus.Skipped,
  UploadQueueStatus.Blocked,
])

const ACTIVE_UPLOAD_STATUSES = new Set<UploadQueueStatus>([
  ...ABORTABLE_UPLOAD_STATUSES,
  UploadQueueStatus.Processing,
])

const DISMISSIBLE_UPLOAD_STATUSES = new Set<UploadQueueStatus>([
  ...CLEARABLE_UPLOAD_STATUSES,
  ...SKIPPED_OR_BLOCKED_UPLOAD_STATUSES,
])

const IN_FLIGHT_TRANSPORT_STATUSES = new Set<UploadTransportStatus>([
  UploadTransportStatus.Uploading,
  UploadTransportStatus.Finalizing,
])

export function isAbortableUploadStatus(status: UploadQueueStatus): boolean {
  return ABORTABLE_UPLOAD_STATUSES.has(status)
}

export function isActiveUploadStatus(status: UploadQueueStatus): boolean {
  return ACTIVE_UPLOAD_STATUSES.has(status)
}

export function isQueuedUploadStatus(status: UploadQueueStatus): boolean {
  return QUEUED_UPLOAD_STATUSES.has(status)
}

export function isDismissibleUploadStatus(status: UploadQueueStatus): boolean {
  return DISMISSIBLE_UPLOAD_STATUSES.has(status)
}

export function isClearableUploadStatus(status: UploadQueueStatus): boolean {
  return CLEARABLE_UPLOAD_STATUSES.has(status)
}

export function isSkippedOrBlockedUploadStatus(
  status: UploadQueueStatus,
): boolean {
  return SKIPPED_OR_BLOCKED_UPLOAD_STATUSES.has(status)
}

export function isInFlightTransportStatus(
  status: UploadTransportStatus,
): boolean {
  return IN_FLIGHT_TRANSPORT_STATUSES.has(status)
}
