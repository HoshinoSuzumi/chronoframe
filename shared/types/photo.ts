import type { Tags } from 'exiftool-vendored'

export interface NeededExif {
  Title?: string
  XPTitle?: string
  Subject?: string[]
  Keywords?: string[]
  XPKeywords?: string

  Description?: Tags['Description']
  ImageDescription?: Tags['ImageDescription']
  CaptionAbstract?: Tags['Caption-Abstract']
  XPComment?: Tags['XPComment']
  UserComment?: Tags['UserComment']

  zone?: string
  tz?: string
  tzSource?: string

  Orientation?: number
  Make?: string
  Model?: string
  Software?: string
  Artist?: string
  Copyright?: string

  ExposureTime?: string | number
  FNumber?: number
  ExposureProgram?: string
  ISO?: number
  ShutterSpeedValue?: string | number
  ApertureValue?: number
  BrightnessValue?: number
  ExposureCompensation?: number
  MaxApertureValue?: number

  OffsetTime?: string
  OffsetTimeOriginal?: string
  OffsetTimeDigitized?: string

  LightSource?: string
  Flash?: string

  FocalLength?: string
  FocalLengthIn35mmFormat?: string

  LensMake?: string
  LensModel?: string

  ColorSpace?: string

  ExposureMode?: string
  SceneCaptureType?: string

  Aperture?: number
  ScaleFactor35efl?: number
  ShutterSpeed?: string | number
  LightValue?: number

  DateTimeOriginal?: string
  DateTimeDigitized?: string

  ImageWidth?: number
  ImageHeight?: number

  MeteringMode: Tags['MeteringMode']
  WhiteBalance: Tags['WhiteBalance']
  WBShiftAB: Tags['WBShiftAB']
  WBShiftGM: Tags['WBShiftGM']
  WhiteBalanceBias: Tags['WhiteBalanceBias']
  WhiteBalanceFineTune: Tags['WhiteBalanceFineTune']
  FlashMeteringMode: Tags['FlashMeteringMode']
  SensingMethod: Tags['SensingMethod']
  FocalPlaneXResolution: Tags['FocalPlaneXResolution']
  FocalPlaneYResolution: Tags['FocalPlaneYResolution']
  GPSAltitude: Tags['GPSAltitude']
  GPSLatitude: Tags['GPSLatitude']
  GPSLongitude: Tags['GPSLongitude']
  GPSAltitudeRef: Tags['GPSAltitudeRef']
  GPSLatitudeRef: Tags['GPSLatitudeRef']
  GPSLongitudeRef: Tags['GPSLongitudeRef']

  // HDR Type
  MPImageType?: Tags['MPImageType']

  Rating?: number

  // Motion Photo (XMP) related fields
  MotionPhoto?: Tags['MotionPhoto']
  MotionPhotoVersion?: Tags['MotionPhotoVersion']
  MotionPhotoPresentationTimestampUs?: Tags['MotionPhotoPresentationTimestampUs']
  MicroVideo?: Tags['MicroVideo']
  MicroVideoVersion?: Tags['MicroVideoVersion']
  MicroVideoOffset?: Tags['MicroVideoOffset']
  MicroVideoPresentationTimestampUs?: Tags['MicroVideoPresentationTimestampUs']
}

export interface PhotoInfo {
  title: string
  dateTaken: string
  tags: string[]
  description: string
}

/**
 * Subset of EXIF fields editable from the dashboard editor.
 * Sent in the PUT /api/photos/:photoId body under `exif`.
 *
 * Convention: an omitted key = unchanged; `null` (or empty string for text)
 * = clear the tag. `DateTimeOriginal` is sent in exiftool format
 * ("YYYY:MM:DD HH:MM:SS") with `OffsetTimeOriginal` as "+02:00".
 */
export interface EditableExif {
  Make?: string | null
  Model?: string | null
  LensMake?: string | null
  LensModel?: string | null

  FNumber?: number | null
  ExposureTime?: string | null
  ISO?: number | null
  FocalLength?: string | null
  FocalLengthIn35mmFormat?: string | null

  Flash?: string | null
  SceneCaptureType?: string | null
  WhiteBalance?: string | null
  MeteringMode?: string | null
  ExposureProgram?: string | null
  ExposureMode?: string | null

  Artist?: string | null
  Copyright?: string | null
  Software?: string | null

  DateTimeOriginal?: string | null
  OffsetTimeOriginal?: string | null

  FocalPlaneXResolution?: number | null
  FocalPlaneYResolution?: number | null
}
