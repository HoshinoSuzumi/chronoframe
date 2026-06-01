/** UI form shape for the advanced EXIF editor. All values are strings for
 * binding simplicity; numbers are parsed and the date is converted at save. */
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
  ColorSpace: string
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
  ColorSpace: '',
  Artist: '',
  Copyright: '',
  Software: '',
  dateTakenLocal: '',
  utcOffset: '',
  FocalPlaneXResolution: '',
  FocalPlaneYResolution: '',
})
