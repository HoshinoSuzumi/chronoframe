export interface NeededExif {
  Title?: string
  XPTitle?: string
  Subject?: string[]
  Keywords?: string[]
  XPKeywords?: string

  Description?: string | undefined
  ImageDescription?: string | undefined
  CaptionAbstract?: string | undefined
  XPComment?: string | undefined
  UserComment?: string | undefined

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

  MeteringMode: string | number | undefined
  WhiteBalance: string | number | undefined
  WBShiftAB: number | undefined
  WBShiftGM: number | undefined
  WhiteBalanceBias: number | undefined
  WhiteBalanceFineTune: unknown
  FlashMeteringMode: string | undefined
  SensingMethod: string | undefined
  FocalPlaneXResolution: number | undefined
  FocalPlaneYResolution: number | undefined
  GPSAltitude: number | undefined
  GPSLatitude: string | number | undefined
  GPSLongitude: string | number | undefined
  GPSAltitudeRef: number | undefined
  GPSLatitudeRef: string | undefined
  GPSLongitudeRef: string | undefined

  // HDR Type
  MPImageType?: string | undefined

  Rating?: number

  // Motion Photo (XMP) related fields
  MotionPhoto?: number | undefined
  MotionPhotoVersion?: number | undefined
  MotionPhotoPresentationTimestampUs?: number | undefined
  MicroVideo?: number | undefined
  MicroVideoVersion?: number | undefined
  MicroVideoOffset?: number | undefined
  MicroVideoPresentationTimestampUs?: number | undefined
}

export interface PhotoInfo {
  title: string
  dateTaken: string
  tags: string[]
  description: string
}
