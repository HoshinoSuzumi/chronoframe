import type { EditableExif, NeededExif } from '~~/shared/types/photo'
import {
  isValidExifDate,
  isValidUtcOffset,
  storedDateToWallClock,
  wallClockToExifDate,
} from '~~/shared/utils/exifDateTime'
import {
  isValidExposureTime,
  isValidFocalLength,
} from '~~/shared/utils/exifFormat'

/**
 * UI form shape for the advanced EXIF editor. Every field is bound to a text
 * input and kept as a string; numbers are parsed and the date is converted
 * when the payload is built.
 */
export interface ExifFormState {
  Make: string
  Model: string
  LensMake: string
  LensModel: string
  FNumber: string
  ExposureTime: string
  ISO: string
  FocalLength: string
  FocalLengthIn35mmFormat: string
  Flash: string
  SceneCaptureType: string
  WhiteBalance: string
  MeteringMode: string
  ExposureProgram: string
  ExposureMode: string
  Artist: string
  Copyright: string
  Software: string
  dateTakenLocal: string
  utcOffset: string
  FocalPlaneXResolution: string
  FocalPlaneYResolution: string
}

export type ExifFormKey = keyof ExifFormState

/** Error codes map to `dashboard.photos.editModal.advanced.errors.<code>`. */
export type ExifFieldErrorCode =
  'number' | 'integer' | 'exposureTime' | 'focalLength' | 'utcOffset' | 'date'

export type ExifFormErrors = Partial<Record<ExifFormKey, ExifFieldErrorCode>>

export const createEmptyExifFormState = (): ExifFormState => ({
  Make: '',
  Model: '',
  LensMake: '',
  LensModel: '',
  FNumber: '',
  ExposureTime: '',
  ISO: '',
  FocalLength: '',
  FocalLengthIn35mmFormat: '',
  Flash: '',
  SceneCaptureType: '',
  WhiteBalance: '',
  MeteringMode: '',
  ExposureProgram: '',
  ExposureMode: '',
  Artist: '',
  Copyright: '',
  Software: '',
  dateTakenLocal: '',
  utcOffset: '',
  FocalPlaneXResolution: '',
  FocalPlaneYResolution: '',
})

/** Coerce any stored/entered value to a trimmed string ('' for null/undefined). */
export const normalizeFormValue = (value: unknown): string =>
  value === null || value === undefined ? '' : String(value).trim()

/** Prefill the form from the EXIF stored on a photo. */
export const exifToFormState = (
  exif: Partial<NeededExif> | null | undefined,
): ExifFormState => {
  const e = exif ?? {}
  return {
    Make: normalizeFormValue(e.Make),
    Model: normalizeFormValue(e.Model),
    LensMake: normalizeFormValue(e.LensMake),
    LensModel: normalizeFormValue(e.LensModel),
    FNumber: normalizeFormValue(e.FNumber),
    ExposureTime: normalizeFormValue(e.ExposureTime),
    ISO: normalizeFormValue(e.ISO),
    FocalLength: normalizeFormValue(e.FocalLength),
    FocalLengthIn35mmFormat: normalizeFormValue(e.FocalLengthIn35mmFormat),
    Flash: normalizeFormValue(e.Flash),
    SceneCaptureType: normalizeFormValue(e.SceneCaptureType),
    WhiteBalance: normalizeFormValue(e.WhiteBalance),
    MeteringMode: normalizeFormValue(e.MeteringMode),
    ExposureProgram: normalizeFormValue(e.ExposureProgram),
    ExposureMode: normalizeFormValue(e.ExposureMode),
    Artist: normalizeFormValue(e.Artist),
    Copyright: normalizeFormValue(e.Copyright),
    Software: normalizeFormValue(e.Software),
    dateTakenLocal: e.DateTimeOriginal
      ? storedDateToWallClock(e.DateTimeOriginal, e.OffsetTimeOriginal)
      : '',
    utcOffset: normalizeFormValue(e.OffsetTimeOriginal),
    FocalPlaneXResolution: normalizeFormValue(e.FocalPlaneXResolution),
    FocalPlaneYResolution: normalizeFormValue(e.FocalPlaneYResolution),
  }
}

export const isExifFieldChanged = (
  state: ExifFormState,
  original: ExifFormState,
  key: ExifFormKey,
): boolean =>
  normalizeFormValue(state[key]) !== normalizeFormValue(original[key])

export const isExifFormDirty = (
  state: ExifFormState,
  original: ExifFormState,
): boolean =>
  (Object.keys(state) as ExifFormKey[]).some((key) =>
    isExifFieldChanged(state, original, key),
  )

const isPositiveNumber = (raw: string) =>
  /^\d+(\.\d+)?$/.test(raw) && Number(raw) > 0

const isPositiveInteger = (raw: string) => /^\d+$/.test(raw) && Number(raw) > 0

/**
 * Field-level validation mirroring the server schema. Empty values are always
 * valid (they clear the tag). Returns an error code per invalid field.
 */
export const validateExifForm = (state: ExifFormState): ExifFormErrors => {
  const errors: ExifFormErrors = {}
  const check = (
    key: ExifFormKey,
    isValid: (raw: string) => boolean,
    code: ExifFieldErrorCode,
  ) => {
    const raw = normalizeFormValue(state[key])
    if (raw.length > 0 && !isValid(raw)) errors[key] = code
  }

  check('FNumber', isPositiveNumber, 'number')
  check('FocalPlaneXResolution', isPositiveNumber, 'number')
  check('FocalPlaneYResolution', isPositiveNumber, 'number')
  check('ISO', isPositiveInteger, 'integer')
  check('ExposureTime', isValidExposureTime, 'exposureTime')
  check('FocalLength', isValidFocalLength, 'focalLength')
  check('FocalLengthIn35mmFormat', isValidFocalLength, 'focalLength')
  check('utcOffset', isValidUtcOffset, 'utcOffset')
  check(
    'dateTakenLocal',
    (raw) => isValidExifDate(wallClockToExifDate(raw)),
    'date',
  )

  return errors
}

type SharedKey = Extract<keyof EditableExif, ExifFormKey>

const TEXT_KEYS = [
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
] as const satisfies readonly SharedKey[]

const NUMBER_KEYS = [
  'FNumber',
  'ISO',
  'FocalPlaneXResolution',
  'FocalPlaneYResolution',
] as const satisfies readonly SharedKey[]

/**
 * Diff the form against its snapshot and build the `exif` part of the
 * PUT payload: omitted key = unchanged, `null` = clear the tag.
 * Returns undefined when nothing changed. Assumes `validateExifForm` passed.
 */
export const buildExifPayload = (
  state: ExifFormState,
  original: ExifFormState,
): EditableExif | undefined => {
  const payload: EditableExif = {}

  for (const key of TEXT_KEYS) {
    if (!isExifFieldChanged(state, original, key)) continue
    const value = normalizeFormValue(state[key])
    payload[key] = value.length > 0 ? value : null
  }

  for (const key of NUMBER_KEYS) {
    if (!isExifFieldChanged(state, original, key)) continue
    const raw = normalizeFormValue(state[key])
    if (raw.length === 0) {
      payload[key] = null
      continue
    }
    const parsed = Number(raw)
    if (Number.isFinite(parsed)) payload[key] = parsed
  }

  const dateChanged =
    isExifFieldChanged(state, original, 'dateTakenLocal') ||
    isExifFieldChanged(state, original, 'utcOffset')
  if (dateChanged) {
    const offset = normalizeFormValue(state.utcOffset)
    payload.OffsetTimeOriginal = offset.length > 0 ? offset : null
    const localDate = normalizeFormValue(state.dateTakenLocal)
    if (localDate) {
      payload.DateTimeOriginal = wallClockToExifDate(localDate)
    } else if (normalizeFormValue(original.dateTakenLocal)) {
      // Date existed before and was cleared by the user.
      payload.DateTimeOriginal = null
    }
    // No date before and none now: DateTimeOriginal is left untouched.
  }

  return Object.keys(payload).length > 0 ? payload : undefined
}
