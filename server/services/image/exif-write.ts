import type { EditableExif } from '../../../shared/types/photo'
import { exifDateAndOffsetToStoredIso } from '../../../shared/utils/exifDateTime'

/** Text fields written 1:1 (null/'' clears the tag). */
const TEXT_FIELDS = [
  'Make',
  'Model',
  'LensMake',
  'LensModel',
  'ExposureTime',
  'FocalLength',
  'FocalLengthIn35mmFormat',
  'Flash',
  'SceneCaptureType',
  'WhiteBalance',
  'MeteringMode',
  'ExposureProgram',
  'ExposureMode',
  'Artist',
  'Copyright',
  'Software',
] as const

/** Numeric fields written 1:1 (null clears the tag). */
const NUMBER_FIELDS = [
  'FNumber',
  'ISO',
  'FocalPlaneXResolution',
  'FocalPlaneYResolution',
] as const

export interface ExifWriteResult {
  /** Tag record for exiftool.write (only keys present in the payload). */
  writeTags: Record<string, unknown>
  /** Values to overlay onto the re-extracted exif before saving to DB. */
  dbOverlay: Record<string, unknown>
  /**
   * Value for the `dateTaken` column when the capture date changed:
   * an ISO instant when set, `null` when cleared (caller derives a fallback),
   * `undefined` when untouched or unparseable.
   */
  dateTakenIso?: string | null
}

const emptyToNull = (value: string | null | undefined): string | null => {
  if (value === undefined || value === null) return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Map an EditableExif payload to exiftool write tags + DB overlay values.
 * Only keys present (not `undefined`) in `exif` are processed.
 */
export const buildExifWriteTags = (exif: EditableExif): ExifWriteResult => {
  const writeTags: Record<string, unknown> = {}
  const dbOverlay: Record<string, unknown> = {}
  let dateTakenIso: string | null | undefined

  for (const key of TEXT_FIELDS) {
    if (exif[key] === undefined) continue
    const value = emptyToNull(exif[key] as string | null | undefined)
    writeTags[key] = value
    dbOverlay[key] = value ?? undefined
  }

  for (const key of NUMBER_FIELDS) {
    if (exif[key] === undefined) continue
    const raw = exif[key] as number | null | undefined
    const value = raw === null || Number.isNaN(raw) ? null : raw
    writeTags[key] = value
    dbOverlay[key] = value ?? undefined
  }

  if (exif.DateTimeOriginal !== undefined) {
    const dateValue = emptyToNull(exif.DateTimeOriginal)
    const offsetValue = emptyToNull(exif.OffsetTimeOriginal)

    // Both tags are written together so editing the date also asserts/clears its offset.
    writeTags.DateTimeOriginal = dateValue
    writeTags.OffsetTimeOriginal = offsetValue

    if (dateValue) {
      // Stored in the same shape the extractor produces (offset form, or
      // zone-less when no offset is known) so ingest and edit agree.
      const stored = exifDateAndOffsetToStoredIso(dateValue, offsetValue)
      if (stored) {
        dateTakenIso = new Date(stored).toISOString()
        dbOverlay.DateTimeOriginal = stored
        dbOverlay.OffsetTimeOriginal = offsetValue ?? undefined
      }
      // Unparseable date: leave the re-extracted values untouched.
    } else {
      // Date explicitly cleared: the caller recomputes the dateTaken fallback.
      dateTakenIso = null
      dbOverlay.DateTimeOriginal = undefined
      dbOverlay.OffsetTimeOriginal = undefined
    }
  } else if (exif.OffsetTimeOriginal !== undefined) {
    const offsetValue = emptyToNull(exif.OffsetTimeOriginal)
    writeTags.OffsetTimeOriginal = offsetValue
    dbOverlay.OffsetTimeOriginal = offsetValue ?? undefined
  }

  return { writeTags, dbOverlay, dateTakenIso }
}
