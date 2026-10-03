/**
 * Canonical exiftool PrintConv string values for editable enum EXIF fields.
 *
 * Each value is the human-readable string exiftool reads/writes for the tag.
 * Passing a value through `toCamelCaseKey` (app/utils/exif-localization.ts)
 * yields the matching key under `exif.values.<category>` in the locale files,
 * so the UI can localize the label while writing the canonical string back.
 */
export const EXIF_ENUM_OPTIONS = {
  flash: [
    'No Flash',
    'Fired',
    'Fired, Return not detected',
    'Fired, Return detected',
    'On, Did not fire',
    'On, Fired',
    'On, Return not detected',
    'On, Return detected',
    'Off, Did not fire',
    'Off, Did not fire, Return not detected',
    'Auto, Did not fire',
    'Auto, Fired',
    'Auto, Fired, Return not detected',
    'Auto, Fired, Return detected',
    'No flash function',
    'Off, No flash function',
    'Fired, Red-eye reduction',
    'Fired, Red-eye reduction, Return not detected',
    'Fired, Red-eye reduction, Return detected',
    'On, Red-eye reduction',
    'On, Red-eye reduction, Return not detected',
    'On, Red-eye reduction, Return detected',
    'Off, Red-eye reduction',
    'Auto, Did not fire, Red-eye reduction',
    'Auto, Fired, Red-eye reduction',
    'Auto, Fired, Red-eye reduction, Return not detected',
    'Auto, Fired, Red-eye reduction, Return detected',
  ],
  sceneCaptureType: ['Standard', 'Landscape', 'Portrait', 'Night', 'Other'],
  whiteBalance: ['Auto', 'Manual'],
  meteringMode: [
    'Unknown',
    'Average',
    'Center-weighted average',
    'Spot',
    'Multi-spot',
    'Multi-segment',
    'Partial',
    'Other',
  ],
  exposureProgram: [
    'Not Defined',
    'Manual',
    'Program AE',
    'Aperture-priority AE',
    'Shutter speed priority AE',
    'Creative (Slow speed)',
    'Action (High speed)',
    'Portrait',
    'Landscape',
    'Bulb',
  ],
  exposureMode: ['Auto', 'Manual', 'Auto bracket'],
} as const

/** Maps an editable enum EXIF tag name to its option-list category. */
export const EXIF_ENUM_FIELD_CATEGORY = {
  Flash: 'flash',
  SceneCaptureType: 'sceneCaptureType',
  WhiteBalance: 'whiteBalance',
  MeteringMode: 'meteringMode',
  ExposureProgram: 'exposureProgram',
  ExposureMode: 'exposureMode',
} as const

export type ExifEnumCategory = keyof typeof EXIF_ENUM_OPTIONS
export type ExifEnumField = keyof typeof EXIF_ENUM_FIELD_CATEGORY
