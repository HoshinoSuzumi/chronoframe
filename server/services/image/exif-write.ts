import type { EditableExif } from '../../../shared/schemas/exif'

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
  'DateTimeOriginal',
  'OffsetTimeOriginal',
] as const satisfies readonly (keyof EditableExif)[]

/** Numeric fields written 1:1 (null clears the tag). */
const NUMBER_FIELDS = [
  'FNumber',
  'ISO',
  'FocalPlaneXResolution',
  'FocalPlaneYResolution',
] as const satisfies readonly (keyof EditableExif)[]

/** Editing either of these moves the capture instant, so `dateTaken` must be re-derived. */
const DATE_FIELDS = [
  'DateTimeOriginal',
  'OffsetTimeOriginal',
] as const satisfies readonly (keyof EditableExif)[]

export interface ExifWriteResult {
  /** Tag record for exiftool.write: only keys present in the payload, `null` clears. */
  writeTags: Record<string, string | number | null>
  /**
   * True when DateTimeOriginal or OffsetTimeOriginal was edited. The caller
   * must then re-derive `dateTaken` from the re-extracted EXIF (the same way
   * ingest does) instead of trusting the payload, so that a later reprocess
   * yields the same instant.
   */
  dateChanged: boolean
}

const emptyToNull = (value: string | null | undefined): string | null => {
  if (value === undefined || value === null) return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Map an EditableExif payload to exiftool write tags.
 * Only keys present (not `undefined`) in `exif` are processed; each key is
 * independent, so e.g. sending `DateTimeOriginal` alone leaves the file's
 * existing `OffsetTimeOriginal` untouched.
 *
 * The file is the source of truth: after writing, the caller re-extracts the
 * EXIF and stores that. Nothing from the payload is copied into the DB
 * directly, so a tag exiftool refused to write never shows up as if it had
 * been written.
 */
export const buildExifWriteTags = (exif: EditableExif): ExifWriteResult => {
  const writeTags: Record<string, string | number | null> = {}

  for (const key of TEXT_FIELDS) {
    const raw = exif[key]
    if (raw === undefined) continue
    writeTags[key] = emptyToNull(raw)
  }

  for (const key of NUMBER_FIELDS) {
    const raw = exif[key]
    if (raw === undefined) continue
    writeTags[key] = raw
  }

  const dateChanged = DATE_FIELDS.some((key) => exif[key] !== undefined)

  return { writeTags, dateChanged }
}
