# Design: Edit EXIF properties in the photo editor

- **Date:** 2026-06-01
- **Status:** Approved (pending spec review)
- **Area:** Dashboard photo editor (`app/pages/dashboard/photos.vue`), photo update API (`server/api/photos/[photoId]/index.put.ts`)

## Summary

Add an **"Advanced — EXIF metadata"** section to the existing photo edit slideover in the
dashboard, letting authenticated users edit a curated set of EXIF fields (camera, lens,
exposure, capture-mode enums, authorship, capture date, sensor resolution) alongside the
existing title/description/tags/rating/location fields. The section is **collapsed by
default**. Saving writes the changes back into the physical image file via `exiftool` and
syncs the database, reusing the round-trip the update endpoint already performs.

## Goals

- Edit a curated set of EXIF fields from the dashboard, grouped and labeled.
- Coded/enum fields (Flash, white balance, metering mode, exposure program, exposure mode,
  scene capture type, color space) are edited via dropdowns of standard values, not free text.
- Capture date is editable as a datetime plus an editable UTC offset, and updates the
  timeline sort order.
- Reuse the existing write-back-to-file + DB-sync pipeline; one Save action commits both
  basic and advanced edits.
- Keep `photos.vue` and the PUT handler maintainable by extracting focused units.

## Non-goals

- A generic "edit any EXIF tag" editor.
- Editing GPS/location here (already handled by the existing map picker).
- Bulk EXIF editing across multiple photos.
- Re-deriving computed values (e.g. recomputing 35 mm-equivalent focal length from sensor
  data) — manual overrides are accepted as entered.

## Background (current architecture)

Confirmed by exploration of the codebase:

- **Edit UI**: `app/pages/dashboard/photos.vue` renders a `USlideover` containing a `UForm`
  (`id="edit-photo-form"`) with title, description, tags, rating, and a `MapLocationPicker`.
  Save calls `PUT /api/photos/:photoId`. Dirty state is tracked with an `editFormState`
  reactive, an `originalMetadata` snapshot, per-field `*Changed` computeds, and an aggregate
  `isMetadataDirty` that gates the Save button. There is **no** existing collapsible/accordion
  pattern in the app.
- **Update endpoint**: `server/api/photos/[photoId]/index.put.ts` already performs the full
  round-trip — download original from storage → `exiftool.write(tempFile, exifUpdates,
  ['-overwrite_original'])` → re-upload → `extractExifData(updatedBuffer)` → update the DB
  row. Today it writes a fixed set derived from title/description/tags/location/rating. Auth
  is `requireUserSession`.
- **Storage**: `photos.exif` is a JSON column typed `NeededExif` (`shared/types/photo.ts`),
  plus promoted columns (`dateTaken`, `latitude`, `longitude`, `country`, `city`,
  `locationName`, `title`, `description`, `tags`). The gallery list is ordered by
  `dateTaken DESC` (`server/api/photos/index.get.ts`), so editing capture date affects the
  timeline.
- **EXIF read & overrides**: `server/services/image/exif.ts` filters EXIF to a `neededKeys`
  whitelist. `processExifData` **overrides** `ColorSpace` (from ICC profile / sharp / format
  default) and `ImageWidth`/`ImageHeight` on every extract. This matters for ColorSpace
  editing (see Limitations).
- **Enum localization**: `app/utils/exif-localization.ts` maps an exiftool PrintConv **string**
  value → camelCase key → `exif.values.{category}.{key}` in the locale files. The locale
  files already contain the enum value labels for: `exposureProgram`, `exposureMode`, `flash`,
  `meteringMode`, `whiteBalance`, `sceneCaptureType`, `sensingMethod`, `colorSpace`.

## Decisions (from brainstorming)

1. **Field scope**: Camera & Lens, Exposure, Authorship, Date taken — plus Flash,
   SceneCaptureType, FocalPlaneResolution.
2. **Enum handling**: dropdowns covering the full capture-mode set (Flash, SceneCaptureType,
   White balance, Metering mode, Exposure program, Exposure mode, Color space), written back
   via exiftool's value conversion.
3. **Date taken**: datetime + editable UTC offset (`OffsetTimeOriginal`).
4. **ColorSpace**: keep editable as best-effort file embed with authoritative DB overlay.
5. **Tests**: no vitest; rely on TypeScript types + lint + manual verification.
6. **Approach**: extend the existing PUT endpoint and add a collapsible section to the
   existing slideover (vs. a separate endpoint/component).

## UX & placement

Inside the existing edit `USlideover`, after the current fields and **still inside the same
`UForm`**, add a `UCollapsible` (new to this codebase, from `@nuxt/ui` v4) titled
**"Advanced — EXIF metadata"**, collapsed by default, with a chevron that rotates on open.
The single existing Save button commits basic + advanced together; it stays disabled until
either the basic fields or the advanced fields are dirty.

## Editable field set

Each label is localized; enum option labels reuse `localizeExif`.

| Group | Field → EXIF tag | Input | Notes |
|---|---|---|---|
| Camera & Lens | `Make`, `Model`, `LensMake`, `LensModel` | text | free text |
| Exposure | `FNumber` | number | > 0 |
| | `ExposureTime` | text | `1/250` or decimal seconds |
| | `ISO` | number | integer ≥ 0 |
| | `FocalLength` | text | e.g. `24 mm` or number |
| | `FocalLengthIn35mmFormat` | text | manual override allowed |
| Capture mode (enums) | `Flash`, `SceneCaptureType`, `WhiteBalance`, `MeteringMode`, `ExposureProgram`, `ExposureMode`, `ColorSpace` | `USelectMenu` | values from shared option lists |
| Authorship | `Artist`, `Copyright`, `Software` | text | free text |
| Date & sensor | `DateTimeOriginal` (+ `OffsetTimeOriginal`) | datetime + offset | also updates `dateTaken` column |
| | `FocalPlaneXResolution`, `FocalPlaneYResolution` | number | > 0 |

**Clear semantics**: emptying a text field or clearing a dropdown sends `null`, which deletes
the tag via exiftool and nulls the DB value — mirroring the existing title/description
behavior.

## Enum handling & shared constants

New module `shared/constants/exif-options.ts` exports, per category, the canonical exiftool
PrintConv **string** values. These strings are chosen so that `toCamelCaseKey(value)` matches
the existing keys under `exif.values.*`, guaranteeing localized labels work. Examples:

- `exposureProgram`: `Not Defined`, `Manual`, `Program AE`, `Aperture-priority AE`,
  `Shutter speed priority AE`, `Creative (Slow speed)`, `Action (High speed)`, `Portrait`,
  `Landscape`, `Bulb`
- `meteringMode`: `Unknown`, `Average`, `Center-weighted average`, `Spot`, `Multi-spot`,
  `Multi-segment`, `Partial`, `Other`
- `exposureMode`: `Auto`, `Manual`, `Auto bracket`
- `sceneCaptureType`: `Standard`, `Landscape`, `Portrait`, `Night`, `Other`
- `whiteBalance`: `Auto`, `Manual` (the standard EXIF-writable values; camera-specific
  `Auto (1)`/`Auto (2)` variants are read-only and not offered for writing)
- `colorSpace`: `sRGB`, `Adobe RGB`, `Wide Gamut RGB`, `ICC Profile`, `Uncalibrated`
  (`Display P3` / `RGB` are app-inferred, not standard EXIF ColorSpace values — see Limitations)
- `flash`: the full set of standard exiftool Flash strings (e.g. `No Flash`,
  `Off, Did not fire`, `On, Did not fire`, `Auto, Fired`, `Fired, Red-eye reduction`, …)

Dropdown option `value` = the exiftool string; option `label` = `localizeExif(category, value)`.
Writing passes the string to `exiftool.write`, which applies the PrintConv inverse. The same
arrays back server-side validation.

## Frontend design

- **New component** `app/components/dashboard/PhotoExifAdvancedFields.vue` (presentational):
  receives the reactive advanced-EXIF edit state via `v-model`, renders the grouped
  `UFormField`s / `UInput` / `USelectMenu` / datetime inputs, and uses `localizeExif` for enum
  labels. This keeps the already-large `photos.vue` from growing further.
- **State** (in `photos.vue`): extend `EditFormState` with a nested `exif: EditableExif`
  object; extend the `originalMetadata` snapshot with an `exif` baseline captured in
  `openMetadataEditor`. Add an `exifChanged` computed (normalized per-field comparison) and
  fold it into `isMetadataDirty`.
- **Save**: `saveMetadataChanges()` adds `payload.exif` containing **only changed** advanced
  fields, consistent with the existing partial-payload pattern. The `UCollapsible` lives
  inside the existing `UForm`, so the existing submit path is unchanged.

## Backend design

Extend `server/api/photos/[photoId]/index.put.ts`:

- Add an optional `exif` object to the Zod `bodySchema`, typed by a new shared `EditableExif`
  type (`shared/types/photo.ts`). Per-field validation: `FNumber` > 0; `ISO` integer ≥ 0;
  `ExposureTime` matches a fraction or decimal; enums ∈ the shared option arrays;
  `OffsetTimeOriginal` matches `^[+-]\d{2}:\d{2}$`; string max-lengths; numeric ranges for
  focal-plane resolution.
- **New helper** `server/services/image/exif-write.ts` exporting a pure
  `buildExifWriteTags(editableExif)` that maps the validated payload to the `exiftool.write`
  tag record (mostly 1:1; `null`/empty → tag deletion). Keeps the handler lean.
- Feed those tags into the **existing** download → `exiftool.write` → re-upload →
  `extractExifData` flow. No new round-trip is introduced.
- **DB overlay**: after re-extracting, overlay the user's explicitly-edited EXIF fields onto
  the re-extracted `exif` object before writing the DB row, so the gallery/InfoPanel show
  exactly what the user entered regardless of exiftool normalization. This also makes
  ColorSpace edits display correctly (see Limitations).
- **Date taken**: when `DateTimeOriginal` changes, recompute and update the `dateTaken` DB
  column using the same date formatting the ingestion pipeline uses, so the timeline re-sorts.
  `OffsetTimeOriginal` is written alongside.
- The existing "at least one field present" 400 guard is expanded to include `exif`.

## i18n

Add field/section labels under `dashboard.photos.editModal.advanced.*` across all five locale
files (`en`, `ja`, `zh-Hans`, `zh-Hant-HK`, `zh-Hant-TW`). Reuse existing `exif.*` label keys
where present and `exif.values.*` for enum option labels (already present). English strings
are authored here; the other four locales get reasonable translations flagged for maintainer
review.

## Edge cases & limitations

- **ColorSpace** is partly app-inferred (`processExifData` overrides it on every extract), and
  values like `Display P3`/`RGB` are not standard EXIF ColorSpace values. Editing is therefore
  **best-effort** for the physical file; the DB-overlay strategy ensures the **displayed**
  value matches the user's choice. Documented as a known limitation.
- **FocalLengthIn35mmFormat** is normally derived; a manual override is accepted as entered.
- **WhiteBalance** standard EXIF tag only writes `Auto`/`Manual` reliably; camera-specific
  variants are not offered for editing.
- Missing photo / missing storage file: existing 404 guards apply. exiftool write failures →
  500 with the existing localized error toast; the temp directory is always cleaned in
  `finally`.

## Error handling

Reuse the endpoint's existing patterns: `requireUserSession`; 400 when no editable field is
present or when validation fails (Zod), with a localized `statusMessage`; 404 when the photo
or its stored file is missing; 500 on write/storage failures. The frontend surfaces failures
via the existing toast and keeps the slideover open.

## Testing & verification

No active test runner exists (`@nuxt/test-utils` is present but there is no vitest config, no
`test` script, and no spec files). Verification plan:

- Type safety via the shared `EditableExif` type and `nuxt prepare` typecheck; `oxlint` +
  `oxfmt`.
- Manual verification in `pnpm dev`: edit each group on a sample photo; confirm InfoPanel and
  DB reflect the changes; reopen the editor to confirm persistence; confirm a date edit
  re-orders the timeline; confirm clearing a field removes it.
- `buildExifWriteTags` is written as a pure, test-ready function should a runner be added
  later; no test is written now per decision.

## File-by-file change list

**New**
- `shared/constants/exif-options.ts` — per-category canonical exiftool enum string arrays.
- `server/services/image/exif-write.ts` — `buildExifWriteTags(editableExif)` mapper.
- `app/components/dashboard/PhotoExifAdvancedFields.vue` — presentational advanced-EXIF fields.

**Modified**
- `shared/types/photo.ts` — add `EditableExif` type.
- `server/api/photos/[photoId]/index.put.ts` — accept `exif`, validate, map, write, overlay
  DB, update `dateTaken`.
- `app/pages/dashboard/photos.vue` — `UCollapsible` advanced section; extend
  `EditFormState`/`originalMetadata`/dirty computeds/save payload; populate from `photo.exif`.
- `i18n/locales/{en,ja,zh-Hans,zh-Hant-HK,zh-Hant-TW}.json` — advanced-section + field labels.

## Out of scope / future

- Bulk EXIF editing.
- Editing GPS via the advanced section (the map picker already covers location).
- Re-deriving computed EXIF values.
- A dedicated EXIF-edit endpoint (decided against in favor of extending the existing PUT).
