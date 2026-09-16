/** UI form shape for the advanced EXIF editor. Values are bound as strings;
 * numbers are parsed and the date is converted at save. Note that
 * `<UInput type="number">` emits numbers, so always read through
 * `normalizeFormValue` rather than calling string methods directly. */
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

/** Factory for an empty state (used by the parent for reset/snapshot). */
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

/** Coerce a form value (string, or number from a numeric input) to a trimmed string. */
export const normalizeFormValue = (value: unknown): string =>
  value === null || value === undefined ? '' : String(value).trim()
