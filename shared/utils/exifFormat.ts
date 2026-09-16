/**
 * Shape validators for free-text EXIF values that are shared between the
 * dashboard editor (inline field errors) and the PUT /api/photos/:photoId
 * schema, so both sides accept exactly the same input.
 */

/** "24", "24.5" or "24 mm" — what exiftool accepts for FocalLength tags. */
const FOCAL_LENGTH_RE = /^\d+(\.\d+)?( mm)?$/

/** "0.5", "2", or a fraction with a non-zero denominator ("1/250"). */
const EXPOSURE_TIME_RE = /^(\d+(\.\d+)?|\d+\/0*[1-9]\d*)$/

export const isValidFocalLength = (value: string): boolean =>
  FOCAL_LENGTH_RE.test(value.trim())

export const isValidExposureTime = (value: string): boolean =>
  EXPOSURE_TIME_RE.test(value.trim())
