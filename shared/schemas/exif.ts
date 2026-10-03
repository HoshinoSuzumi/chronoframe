import { z } from 'zod'
import { EXIF_ENUM_OPTIONS } from '../constants/exifOptions'
import { isValidExifDate, isValidUtcOffset } from '../utils/exifDateTime'
import { isValidExposureTime, isValidFocalLength } from '../utils/exifFormat'

const focalLengthSchema = z
  .string()
  .trim()
  .max(32)
  .refine(isValidFocalLength, 'Invalid focal length (expected e.g. 24 mm)')
  .nullish()

/**
 * Subset of EXIF fields editable from the dashboard editor, sent in the
 * PUT /api/photos/:photoId body under `exif`.
 *
 * Convention: an omitted key = unchanged; `null` (or empty string for text)
 * = clear the tag. Every key is independent, including `DateTimeOriginal`
 * (exiftool format "YYYY:MM:DD HH:MM:SS") and `OffsetTimeOriginal` ("+02:00").
 */
export const editableExifSchema = z.object({
  Make: z.string().trim().max(256).nullish(),
  Model: z.string().trim().max(256).nullish(),
  LensMake: z.string().trim().max(256).nullish(),
  LensModel: z.string().trim().max(256).nullish(),
  FNumber: z.number().positive().max(1000).nullish(),
  ExposureTime: z
    .string()
    .trim()
    .max(32)
    .refine(isValidExposureTime, 'Invalid exposure time (expected e.g. 1/250)')
    .nullish(),
  ISO: z.number().int().min(1).max(10_000_000).nullish(),
  FocalLength: focalLengthSchema,
  FocalLengthIn35mmFormat: focalLengthSchema,
  Flash: z.enum(EXIF_ENUM_OPTIONS.flash).nullish(),
  SceneCaptureType: z.enum(EXIF_ENUM_OPTIONS.sceneCaptureType).nullish(),
  WhiteBalance: z.enum(EXIF_ENUM_OPTIONS.whiteBalance).nullish(),
  MeteringMode: z.enum(EXIF_ENUM_OPTIONS.meteringMode).nullish(),
  ExposureProgram: z.enum(EXIF_ENUM_OPTIONS.exposureProgram).nullish(),
  ExposureMode: z.enum(EXIF_ENUM_OPTIONS.exposureMode).nullish(),
  Artist: z.string().trim().max(256).nullish(),
  Copyright: z.string().trim().max(512).nullish(),
  Software: z.string().trim().max(256).nullish(),
  DateTimeOriginal: z
    .string()
    .trim()
    .refine(isValidExifDate, 'Invalid date (expected YYYY:MM:DD HH:MM:SS)')
    .nullish(),
  OffsetTimeOriginal: z
    .string()
    .trim()
    .refine(isValidUtcOffset, 'Invalid UTC offset (expected +HH:MM)')
    .nullish(),
  FocalPlaneXResolution: z.number().positive().max(1_000_000).nullish(),
  FocalPlaneYResolution: z.number().positive().max(1_000_000).nullish(),
})

type InferredExif = z.infer<typeof editableExifSchema>

/**
 * Payload type for the client. Keys and number-vs-text kind come from the
 * schema, but enum fields are widened to `string` because the editor binds
 * them to plain text state; the server still enforces the whitelist.
 */
export type EditableExif = {
  [K in keyof InferredExif]?: InferredExif[K] extends number | null | undefined
    ? number | null
    : string | null
}
