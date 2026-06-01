# EXIF Property Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let authenticated users edit a curated set of EXIF fields (camera, lens, exposure, capture-mode enums, authorship, capture date) from a collapsible "Advanced" section in the dashboard photo editor, writing changes back into the image file and syncing the database.

**Architecture:** Extend the existing `PUT /api/photos/:photoId` endpoint (which already does download → `exiftool.write` → re-upload → re-extract → DB update) to accept a structured `exif` payload. On the frontend, add a `UCollapsible` section inside the existing edit `USlideover`, rendered by a new presentational component. Enum dropdown values are canonical exiftool PrintConv strings shared between client and server.

**Tech Stack:** Nuxt 4, Vue 3 `<script setup>`, `@nuxt/ui` v4, Drizzle ORM (SQLite), `exiftool-vendored`, Zod v4, `@nuxtjs/i18n`.

---

## Testing approach (read first)

This project has **no test runner** (`@nuxt/test-utils` is present but there is no vitest config, no `test` script, and no spec files). Per the approved design, we do **not** add vitest. Each code task is verified by:

- `pnpm fmt` then `pnpm lint` — must report no errors for the changed files.
- `pnpm postinstall` (alias for `nuxt prepare`) after type-affecting changes — must finish without error (regenerates `.nuxt` types and catches import/config breakage).
- A final **manual verification** task that runs the app and exercises every field group.

`pnpm dev` runs the app (`run-p dev:dep dev:wait-only`: builds the `@chronoframe/webgl-image` workspace package, waits for it, then `nuxt dev --host`). Type errors in `.vue`/`.ts` files surface in the editor/IDE (Volar) and at runtime in dev; there is no CLI typecheck gate in this repo, so author carefully.

Commit after every task. Never create merge commits (repo rule: rebase/fast-forward only). Work happens on the existing `feature/exif-editing` branch.

---

## File structure

**New files**
- `shared/constants/exifOptions.ts` — canonical exiftool enum string arrays + category list. Pure data, importable on client and server.
- `shared/utils/exifDateTime.ts` — pure date/offset conversion helpers (client + server).
- `server/services/image/exif-write.ts` — `buildExifWriteTags()` mapper (payload → exiftool write tags).
- `app/utils/exifForm.ts` — `ExifFormState` UI type + `createEmptyExifFormState()` factory (shared by the component and the page; kept out of the component because `<script setup>` cannot declare named exports).
- `app/components/dashboard/PhotoExifAdvancedFields.vue` — presentational grouped EXIF fields.

**Modified files**
- `shared/types/photo.ts` — add `EditableExif` transport type.
- `server/api/photos/[photoId]/index.put.ts` — accept/validate/map `exif`; overlay DB exif; update `dateTaken`.
- `app/pages/dashboard/photos.vue` — add `exifFormState` + `originalExif` snapshot, `exifChanged`, populate/save wiring, and the `UCollapsible` section.
- `i18n/locales/{en,ja,zh-Hans,zh-Hant-HK,zh-Hant-TW}.json` — advanced-section + field labels.

---

## Task 1: Shared enum constants, EditableExif type, and date helpers

**Files:**
- Create: `shared/constants/exifOptions.ts`
- Create: `shared/utils/exifDateTime.ts`
- Modify: `shared/types/photo.ts` (append a new exported interface)

- [ ] **Step 1: Create the enum options module**

Create `shared/constants/exifOptions.ts`. The string values are the exiftool PrintConv values; each, when passed through the existing `toCamelCaseKey` (`app/utils/exif-localization.ts`), matches a key under `exif.values.*` in the locale files, so `localizeExif` produces localized labels.

```ts
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
  colorSpace: [
    'sRGB',
    'Adobe RGB',
    'Wide Gamut RGB',
    'Display P3',
    'ICC Profile',
    'Uncalibrated',
    'RGB',
  ],
} as const

/** Maps an editable enum EXIF tag name to its option-list category. */
export const EXIF_ENUM_FIELD_CATEGORY = {
  Flash: 'flash',
  SceneCaptureType: 'sceneCaptureType',
  WhiteBalance: 'whiteBalance',
  MeteringMode: 'meteringMode',
  ExposureProgram: 'exposureProgram',
  ExposureMode: 'exposureMode',
  ColorSpace: 'colorSpace',
} as const

export type ExifEnumCategory = keyof typeof EXIF_ENUM_OPTIONS
export type ExifEnumField = keyof typeof EXIF_ENUM_FIELD_CATEGORY
```

- [ ] **Step 2: Create the date/offset helper module**

Create `shared/utils/exifDateTime.ts`. Pure functions, no Nuxt/runtime deps, usable on both client and server.

```ts
/**
 * Pure helpers for converting between:
 *  - exiftool date string  "YYYY:MM:DD HH:MM:SS"
 *  - <input type=datetime-local> wall-clock value "YYYY-MM-DDTHH:mm:ss"
 *  - ISO instant string     "YYYY-MM-DDTHH:mm:ss.sssZ"
 *  - UTC offset string      "+02:00" / "-05:30"
 */

/** "+02:00" -> 120, "-05:30" -> -330, ""/null/invalid -> 0. */
export const parseUtcOffsetMinutes = (
  offset: string | null | undefined,
): number => {
  const m = /^([+-])(\d{2}):(\d{2})$/.exec((offset ?? '').trim())
  if (!m) return 0
  const sign = m[1] === '-' ? -1 : 1
  return sign * (Number.parseInt(m[2], 10) * 60 + Number.parseInt(m[3], 10))
}

/** "YYYY-MM-DDTHH:mm[:ss]" -> exiftool "YYYY:MM:DD HH:MM:SS". */
export const wallClockToExifDate = (wallClock: string): string => {
  const [datePart, timePartRaw = '00:00:00'] = wallClock.trim().split('T')
  const timePart =
    timePartRaw.length === 5 ? `${timePartRaw}:00` : timePartRaw.slice(0, 8)
  return `${datePart.replace(/-/g, ':')} ${timePart}`
}

/** exiftool "YYYY:MM:DD HH:MM:SS" + offset -> ISO instant string. */
export const exifDateAndOffsetToIsoInstant = (
  exifDate: string,
  offset: string | null | undefined,
): string => {
  const [datePart, timePart = '00:00:00'] = exifDate.trim().split(' ')
  const isoLocal = `${datePart.replace(/:/g, '-')}T${timePart}`
  const zone = /^[+-]\d{2}:\d{2}$/.test((offset ?? '').trim())
    ? (offset as string).trim()
    : 'Z'
  return new Date(`${isoLocal}${zone}`).toISOString()
}

/** ISO instant + offset -> wall-clock "YYYY-MM-DDTHH:mm:ss" for datetime-local. */
export const isoInstantToWallClock = (
  iso: string,
  offset: string | null | undefined,
): string => {
  const base = new Date(iso)
  if (Number.isNaN(base.getTime())) return ''
  const shifted = new Date(
    base.getTime() + parseUtcOffsetMinutes(offset) * 60_000,
  )
  return shifted.toISOString().slice(0, 19)
}
```

- [ ] **Step 3: Add the `EditableExif` transport type**

In `shared/types/photo.ts`, append after the `PhotoInfo` interface (currently ends at line 103):

```ts
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
  ColorSpace?: string | null

  Artist?: string | null
  Copyright?: string | null
  Software?: string | null

  DateTimeOriginal?: string | null
  OffsetTimeOriginal?: string | null

  FocalPlaneXResolution?: number | null
  FocalPlaneYResolution?: number | null
}
```

- [ ] **Step 4: Format, lint, and prepare**

Run:
```bash
pnpm fmt && pnpm lint && pnpm postinstall
```
Expected: `oxfmt` reformats/leaves files clean, `oxlint` reports **0 errors**, `nuxt prepare` finishes with "✔ Types generated" (no errors).

- [ ] **Step 5: Commit**

```bash
git add shared/constants/exifOptions.ts shared/utils/exifDateTime.ts shared/types/photo.ts
git commit -m "feat(exif): add editable-exif types, enum options, and date helpers

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Server-side EXIF write mapper

**Files:**
- Create: `server/services/image/exif-write.ts`

- [ ] **Step 1: Create the mapper module**

Create `server/services/image/exif-write.ts`. `buildExifWriteTags` converts an `EditableExif` payload into the tag record passed to `exiftool.write`, and returns the ISO instant for `dateTaken` when the date changed. Empty/null values map to `null` (exiftool deletes the tag).

```ts
import type { EditableExif } from '../../../shared/types/photo'
import { exifDateAndOffsetToIsoInstant } from '../../../shared/utils/exifDateTime'

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
  'ColorSpace',
  'Artist',
  'Copyright',
  'Software',
] as const

/** Numeric fields written 1:1 (null clears the tag). */
const NUMBER_FIELDS = [
  'FNumber',
  'ISO',
  'FocalPlaneXResolution',
  'FocalPlaneYResolution',
] as const

export interface ExifWriteResult {
  /** Tag record for exiftool.write (only keys present in the payload). */
  writeTags: Record<string, unknown>
  /** Values to overlay onto the re-extracted exif before saving to DB. */
  dbOverlay: Record<string, unknown>
  /** New ISO instant for the `dateTaken` column, if DateTimeOriginal changed. */
  dateTakenIso?: string
}

const emptyToNull = (value: string | null | undefined): string | null => {
  if (value === undefined || value === null) return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Map an EditableExif payload to exiftool write tags + DB overlay values.
 * Only keys present (not `undefined`) in `exif` are processed.
 */
export const buildExifWriteTags = (exif: EditableExif): ExifWriteResult => {
  const writeTags: Record<string, unknown> = {}
  const dbOverlay: Record<string, unknown> = {}
  let dateTakenIso: string | undefined

  for (const key of TEXT_FIELDS) {
    if (exif[key] === undefined) continue
    const value = emptyToNull(exif[key] as string | null | undefined)
    writeTags[key] = value
    dbOverlay[key] = value ?? undefined
  }

  for (const key of NUMBER_FIELDS) {
    if (exif[key] === undefined) continue
    const raw = exif[key] as number | null | undefined
    const value = raw === null || Number.isNaN(raw) ? null : raw
    writeTags[key] = value
    dbOverlay[key] = value ?? undefined
  }

  if (exif.DateTimeOriginal !== undefined) {
    const dateValue = emptyToNull(exif.DateTimeOriginal)
    const offsetValue = emptyToNull(exif.OffsetTimeOriginal)

    writeTags.DateTimeOriginal = dateValue
    writeTags.OffsetTimeOriginal = offsetValue

    if (dateValue) {
      const iso = exifDateAndOffsetToIsoInstant(dateValue, offsetValue)
      dateTakenIso = iso
      dbOverlay.DateTimeOriginal = iso
      dbOverlay.OffsetTimeOriginal = offsetValue ?? undefined
    } else {
      dbOverlay.DateTimeOriginal = undefined
      dbOverlay.OffsetTimeOriginal = undefined
    }
  } else if (exif.OffsetTimeOriginal !== undefined) {
    const offsetValue = emptyToNull(exif.OffsetTimeOriginal)
    writeTags.OffsetTimeOriginal = offsetValue
    dbOverlay.OffsetTimeOriginal = offsetValue ?? undefined
  }

  return { writeTags, dbOverlay, dateTakenIso }
}
```

- [ ] **Step 2: Format and lint**

Run:
```bash
pnpm fmt && pnpm lint
```
Expected: `oxlint` reports **0 errors**.

- [ ] **Step 3: Commit**

```bash
git add server/services/image/exif-write.ts
git commit -m "feat(exif): add server exif write-tag mapper

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Extend the PUT endpoint to accept EXIF edits

**Files:**
- Modify: `server/api/photos/[photoId]/index.put.ts`

- [ ] **Step 1: Import the mapper and enum options**

At the top of `server/api/photos/[photoId]/index.put.ts`, after the existing import of `extractExifData` (line 8), add:

```ts
import { buildExifWriteTags } from '~~/server/services/image/exif-write'
import { EXIF_ENUM_OPTIONS } from '~~/shared/constants/exifOptions'
```

- [ ] **Step 2: Add the `exif` schema to the request body**

In the `bodySchema` (currently lines 16-30), add an `exif` key before the closing `})`. Insert after the `rating` line (line 29):

```ts
  exif: z
    .object({
      Make: z.string().trim().max(256).nullish(),
      Model: z.string().trim().max(256).nullish(),
      LensMake: z.string().trim().max(256).nullish(),
      LensModel: z.string().trim().max(256).nullish(),
      FNumber: z.number().positive().max(1000).nullish(),
      ExposureTime: z
        .string()
        .trim()
        .max(32)
        .regex(/^(\d+(\.\d+)?|\d+\/\d+)$/, 'Invalid exposure time')
        .nullish(),
      ISO: z.number().int().min(0).max(10_000_000).nullish(),
      FocalLength: z.string().trim().max(32).nullish(),
      FocalLengthIn35mmFormat: z.string().trim().max(32).nullish(),
      Flash: z.enum(EXIF_ENUM_OPTIONS.flash).nullish(),
      SceneCaptureType: z.enum(EXIF_ENUM_OPTIONS.sceneCaptureType).nullish(),
      WhiteBalance: z.enum(EXIF_ENUM_OPTIONS.whiteBalance).nullish(),
      MeteringMode: z.enum(EXIF_ENUM_OPTIONS.meteringMode).nullish(),
      ExposureProgram: z.enum(EXIF_ENUM_OPTIONS.exposureProgram).nullish(),
      ExposureMode: z.enum(EXIF_ENUM_OPTIONS.exposureMode).nullish(),
      ColorSpace: z.enum(EXIF_ENUM_OPTIONS.colorSpace).nullish(),
      Artist: z.string().trim().max(256).nullish(),
      Copyright: z.string().trim().max(512).nullish(),
      Software: z.string().trim().max(256).nullish(),
      DateTimeOriginal: z
        .string()
        .trim()
        .regex(
          /^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}$/,
          'Invalid date (expected YYYY:MM:DD HH:MM:SS)',
        )
        .nullish(),
      OffsetTimeOriginal: z
        .string()
        .trim()
        .regex(/^[+-]\d{2}:\d{2}$/, 'Invalid UTC offset')
        .nullish(),
      FocalPlaneXResolution: z.number().positive().max(1_000_000).nullish(),
      FocalPlaneYResolution: z.number().positive().max(1_000_000).nullish(),
    })
    .optional(),
```

Note: `z.enum()` accepts a readonly string array in Zod v4; `EXIF_ENUM_OPTIONS.*` arrays are `as const`. `.nullish()` allows `null` (clear) and `undefined` (omit/unchanged).

- [ ] **Step 3: Include `exif` in the "no changes" guard**

Replace the empty-payload guard (currently lines 54-65) with one that also checks `exif`:

```ts
  const hasExifEdits =
    payload.exif !== undefined && Object.keys(payload.exif).length > 0

  if (
    payload.title === undefined &&
    payload.description === undefined &&
    payload.tags === undefined &&
    payload.location === undefined &&
    payload.rating === undefined &&
    !hasExifEdits
  ) {
    throw createError({
      statusCode: 400,
      statusMessage: t('dashboard.photos.messages.noChangesProvided'),
    })
  }
```

- [ ] **Step 4: Merge advanced EXIF tags into the write set**

After the existing `rating` block (currently lines 153-155, ends with the closing `}` of `if (payload.rating !== undefined)`), and before the `const tempRoot = tmpdir()` line (line 157), insert:

```ts
  const advancedExif = hasExifEdits
    ? buildExifWriteTags(payload.exif!)
    : { writeTags: {}, dbOverlay: {}, dateTakenIso: undefined }

  Object.assign(exifUpdates, advancedExif.writeTags)
```

- [ ] **Step 5: Overlay edited EXIF onto the DB row and update `dateTaken`**

After the line `const exifData = await extractExifData(updatedBuffer)` (currently line 180) and the construction of `updateData` (lines 182-186), the `updateData.exif` is set to the freshly re-extracted `exifData`. Replace the `updateData` initialization block (lines 182-186) with a version that overlays the user's edited values so the DB reflects exactly what was entered:

```ts
    const overlaidExif: Record<string, any> = { ...exifData }
    for (const [overlayKey, overlayValue] of Object.entries(
      advancedExif.dbOverlay,
    )) {
      if (overlayValue === undefined) {
        delete overlaidExif[overlayKey]
      } else {
        overlaidExif[overlayKey] = overlayValue
      }
    }

    const updateData: Record<string, any> = {
      exif: overlaidExif,
      fileSize: updatedBuffer.length,
      lastModified: new Date().toISOString(),
    }

    if (advancedExif.dateTakenIso) {
      updateData.dateTaken = advancedExif.dateTakenIso
    }
```

(The subsequent `if (normalizedTitle !== undefined)` / description / tags / location blocks stay unchanged and continue to mutate `updateData`.)

- [ ] **Step 6: Format, lint, and prepare**

Run:
```bash
pnpm fmt && pnpm lint && pnpm postinstall
```
Expected: `oxlint` reports **0 errors**; `nuxt prepare` succeeds.

- [ ] **Step 7: Commit**

```bash
git add server/api/photos/\[photoId\]/index.put.ts
git commit -m "feat(exif): accept and persist advanced EXIF edits in PUT endpoint

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Add i18n labels

**Files:**
- Modify: `i18n/locales/en.json`
- Modify: `i18n/locales/ja.json`
- Modify: `i18n/locales/zh-Hans.json`
- Modify: `i18n/locales/zh-Hant-HK.json`
- Modify: `i18n/locales/zh-Hant-TW.json`

The new keys live under `dashboard.photos.editModal.advanced`. Enum **value** labels already exist under `exif.values.*` and are reused via `localizeExif`.

- [ ] **Step 1: Add the `advanced` block to `en.json`**

In `i18n/locales/en.json`, inside `dashboard.photos.editModal`, add an `advanced` key as a sibling of `fields` and `actions` (i.e. add it after the `fields` object). Insert this object:

```json
"advanced": {
  "toggle": "Advanced — EXIF metadata",
  "hint": "Edit raw EXIF fields. Changes are written into the image file.",
  "groups": {
    "cameraLens": "Camera & lens",
    "exposure": "Exposure",
    "captureMode": "Capture mode",
    "authorship": "Authorship",
    "dateSensor": "Date & sensor"
  },
  "fields": {
    "make": "Camera make",
    "model": "Camera model",
    "lensMake": "Lens make",
    "lensModel": "Lens model",
    "fNumber": "Aperture (f-number)",
    "exposureTime": "Shutter (exposure time)",
    "iso": "ISO",
    "focalLength": "Focal length",
    "focalLength35": "Focal length (35mm equiv.)",
    "flash": "Flash",
    "sceneCaptureType": "Scene capture type",
    "whiteBalance": "White balance",
    "meteringMode": "Metering mode",
    "exposureProgram": "Exposure program",
    "exposureMode": "Exposure mode",
    "colorSpace": "Color space",
    "artist": "Artist",
    "copyright": "Copyright",
    "software": "Software",
    "dateTaken": "Date taken",
    "utcOffset": "UTC offset",
    "focalPlaneXResolution": "Focal plane X resolution",
    "focalPlaneYResolution": "Focal plane Y resolution"
  },
  "placeholders": {
    "none": "Not set",
    "utcOffset": "+02:00",
    "exposureTime": "e.g. 1/250 or 0.004",
    "focalLength": "e.g. 24 mm"
  },
  "colorSpaceNote": "Color space is partly auto-detected; edits are best-effort and may not change the file."
}
```

- [ ] **Step 2: Verify `en.json` is valid JSON**

Run:
```bash
python3 -c "import json; json.load(open('i18n/locales/en.json')); print('en OK')"
```
Expected: `en OK`.

- [ ] **Step 3: Replicate into the other four locales**

Add the same `advanced` block (translated) into `ja.json`, `zh-Hans.json`, `zh-Hant-HK.json`, `zh-Hant-TW.json` under `dashboard.photos.editModal`. Use these translations (mark for maintainer review in the PR description). For each file, insert the appropriate object.

`ja.json`:
```json
"advanced": {
  "toggle": "詳細 — EXIF メタデータ",
  "hint": "EXIF フィールドを編集します。変更は画像ファイルに書き込まれます。",
  "groups": {
    "cameraLens": "カメラとレンズ",
    "exposure": "露出",
    "captureMode": "撮影モード",
    "authorship": "著作情報",
    "dateSensor": "日付とセンサー"
  },
  "fields": {
    "make": "カメラメーカー",
    "model": "カメラ機種",
    "lensMake": "レンズメーカー",
    "lensModel": "レンズ機種",
    "fNumber": "絞り (F値)",
    "exposureTime": "シャッター (露出時間)",
    "iso": "ISO",
    "focalLength": "焦点距離",
    "focalLength35": "焦点距離 (35mm換算)",
    "flash": "フラッシュ",
    "sceneCaptureType": "シーンキャプチャタイプ",
    "whiteBalance": "ホワイトバランス",
    "meteringMode": "測光モード",
    "exposureProgram": "露出プログラム",
    "exposureMode": "露出モード",
    "colorSpace": "色空間",
    "artist": "作成者",
    "copyright": "著作権",
    "software": "ソフトウェア",
    "dateTaken": "撮影日時",
    "utcOffset": "UTCオフセット",
    "focalPlaneXResolution": "焦点面X解像度",
    "focalPlaneYResolution": "焦点面Y解像度"
  },
  "placeholders": {
    "none": "未設定",
    "utcOffset": "+09:00",
    "exposureTime": "例: 1/250 または 0.004",
    "focalLength": "例: 24 mm"
  },
  "colorSpaceNote": "色空間は一部自動検出されるため、編集はベストエフォートでありファイルに反映されない場合があります。"
}
```

`zh-Hans.json`:
```json
"advanced": {
  "toggle": "高级 — EXIF 元数据",
  "hint": "编辑 EXIF 字段。更改将写入图像文件。",
  "groups": {
    "cameraLens": "相机与镜头",
    "exposure": "曝光",
    "captureMode": "拍摄模式",
    "authorship": "作者信息",
    "dateSensor": "日期与传感器"
  },
  "fields": {
    "make": "相机制造商",
    "model": "相机型号",
    "lensMake": "镜头制造商",
    "lensModel": "镜头型号",
    "fNumber": "光圈 (F值)",
    "exposureTime": "快门 (曝光时间)",
    "iso": "ISO",
    "focalLength": "焦距",
    "focalLength35": "焦距 (35mm 等效)",
    "flash": "闪光灯",
    "sceneCaptureType": "场景拍摄类型",
    "whiteBalance": "白平衡",
    "meteringMode": "测光模式",
    "exposureProgram": "曝光程序",
    "exposureMode": "曝光模式",
    "colorSpace": "色彩空间",
    "artist": "作者",
    "copyright": "版权",
    "software": "软件",
    "dateTaken": "拍摄日期",
    "utcOffset": "UTC 偏移",
    "focalPlaneXResolution": "焦平面 X 分辨率",
    "focalPlaneYResolution": "焦平面 Y 分辨率"
  },
  "placeholders": {
    "none": "未设置",
    "utcOffset": "+08:00",
    "exposureTime": "例如 1/250 或 0.004",
    "focalLength": "例如 24 mm"
  },
  "colorSpaceNote": "色彩空间部分为自动检测，编辑为尽力而为，可能不会更改文件。"
}
```

`zh-Hant-HK.json` and `zh-Hant-TW.json` (identical traditional-Chinese text for both):
```json
"advanced": {
  "toggle": "進階 — EXIF 中繼資料",
  "hint": "編輯 EXIF 欄位。變更將寫入圖像檔案。",
  "groups": {
    "cameraLens": "相機與鏡頭",
    "exposure": "曝光",
    "captureMode": "拍攝模式",
    "authorship": "作者資訊",
    "dateSensor": "日期與感光元件"
  },
  "fields": {
    "make": "相機製造商",
    "model": "相機型號",
    "lensMake": "鏡頭製造商",
    "lensModel": "鏡頭型號",
    "fNumber": "光圈 (F值)",
    "exposureTime": "快門 (曝光時間)",
    "iso": "ISO",
    "focalLength": "焦距",
    "focalLength35": "焦距 (35mm 等效)",
    "flash": "閃光燈",
    "sceneCaptureType": "場景拍攝類型",
    "whiteBalance": "白平衡",
    "meteringMode": "測光模式",
    "exposureProgram": "曝光程式",
    "exposureMode": "曝光模式",
    "colorSpace": "色彩空間",
    "artist": "作者",
    "copyright": "版權",
    "software": "軟件",
    "dateTaken": "拍攝日期",
    "utcOffset": "UTC 偏移",
    "focalPlaneXResolution": "焦平面 X 解析度",
    "focalPlaneYResolution": "焦平面 Y 解析度"
  },
  "placeholders": {
    "none": "未設定",
    "utcOffset": "+08:00",
    "exposureTime": "例如 1/250 或 0.004",
    "focalLength": "例如 24 mm"
  },
  "colorSpaceNote": "色彩空間部分為自動偵測，編輯為盡力而為，可能不會更改檔案。"
}
```

- [ ] **Step 4: Verify all locales are valid JSON**

Run:
```bash
python3 -c "import json,glob; [json.load(open(f)) for f in glob.glob('i18n/locales/*.json')]; print('all locales OK')"
```
Expected: `all locales OK`.

- [ ] **Step 5: Commit**

```bash
git add i18n/locales/
git commit -m "i18n(exif): add advanced EXIF editor labels

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Advanced EXIF fields component

**Files:**
- Create: `app/utils/exifForm.ts`
- Create: `app/components/dashboard/PhotoExifAdvancedFields.vue`

This presentational component renders the grouped fields and mutates the reactive `state` object passed via the `state` prop (mirroring the `UForm :state` pattern used elsewhere). It owns no save logic and no dirty tracking. The form-state type and factory live in a separate module because `<script setup>` cannot declare named exports.

- [ ] **Step 1: Create the form-state module**

Create `app/utils/exifForm.ts`:

```ts
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
```

- [ ] **Step 2: Create the component**

Create `app/components/dashboard/PhotoExifAdvancedFields.vue`:

```vue
<script setup lang="ts">
import {
  EXIF_ENUM_FIELD_CATEGORY,
  EXIF_ENUM_OPTIONS,
  type ExifEnumField,
} from '~~/shared/constants/exifOptions'
import type { ExifFormState } from '~/utils/exifForm'

defineProps<{ state: ExifFormState }>()

const { localizeExif } = useExifLocalization()

/** Build USelectMenu items for an enum field: '' (none) + localized values. */
const enumItems = (field: ExifEnumField) => {
  const category = EXIF_ENUM_FIELD_CATEGORY[field]
  return [
    { label: $t('dashboard.photos.editModal.advanced.placeholders.none'), value: '' },
    ...EXIF_ENUM_OPTIONS[category].map((value) => ({
      label: localizeExif(category, value) || value,
      value,
    })),
  ]
}

const a = (key: string) => $t(`dashboard.photos.editModal.advanced.${key}`)
</script>

<template>
  <div class="space-y-6">
    <!-- Camera & lens -->
    <div class="space-y-3">
      <h4 class="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {{ a('groups.cameraLens') }}
      </h4>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <UFormField :label="a('fields.make')" name="exifMake">
          <UInput v-model="state.Make" class="w-full" />
        </UFormField>
        <UFormField :label="a('fields.model')" name="exifModel">
          <UInput v-model="state.Model" class="w-full" />
        </UFormField>
        <UFormField :label="a('fields.lensMake')" name="exifLensMake">
          <UInput v-model="state.LensMake" class="w-full" />
        </UFormField>
        <UFormField :label="a('fields.lensModel')" name="exifLensModel">
          <UInput v-model="state.LensModel" class="w-full" />
        </UFormField>
      </div>
    </div>

    <!-- Exposure -->
    <div class="space-y-3">
      <h4 class="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {{ a('groups.exposure') }}
      </h4>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <UFormField :label="a('fields.fNumber')" name="exifFNumber">
          <UInput v-model="state.FNumber" type="number" step="0.1" min="0" class="w-full" />
        </UFormField>
        <UFormField :label="a('fields.exposureTime')" name="exifExposureTime">
          <UInput
            v-model="state.ExposureTime"
            :placeholder="a('placeholders.exposureTime')"
            class="w-full"
          />
        </UFormField>
        <UFormField :label="a('fields.iso')" name="exifIso">
          <UInput v-model="state.ISO" type="number" step="1" min="0" class="w-full" />
        </UFormField>
        <UFormField :label="a('fields.focalLength')" name="exifFocalLength">
          <UInput
            v-model="state.FocalLength"
            :placeholder="a('placeholders.focalLength')"
            class="w-full"
          />
        </UFormField>
        <UFormField :label="a('fields.focalLength35')" name="exifFocalLength35">
          <UInput v-model="state.FocalLengthIn35mmFormat" class="w-full" />
        </UFormField>
      </div>
    </div>

    <!-- Capture mode (enums) -->
    <div class="space-y-3">
      <h4 class="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {{ a('groups.captureMode') }}
      </h4>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <UFormField :label="a('fields.flash')" name="exifFlash">
          <USelectMenu
            v-model="state.Flash"
            :items="enumItems('Flash')"
            value-key="value"
            label-key="label"
            class="w-full"
          />
        </UFormField>
        <UFormField :label="a('fields.sceneCaptureType')" name="exifSceneCaptureType">
          <USelectMenu
            v-model="state.SceneCaptureType"
            :items="enumItems('SceneCaptureType')"
            value-key="value"
            label-key="label"
            class="w-full"
          />
        </UFormField>
        <UFormField :label="a('fields.whiteBalance')" name="exifWhiteBalance">
          <USelectMenu
            v-model="state.WhiteBalance"
            :items="enumItems('WhiteBalance')"
            value-key="value"
            label-key="label"
            class="w-full"
          />
        </UFormField>
        <UFormField :label="a('fields.meteringMode')" name="exifMeteringMode">
          <USelectMenu
            v-model="state.MeteringMode"
            :items="enumItems('MeteringMode')"
            value-key="value"
            label-key="label"
            class="w-full"
          />
        </UFormField>
        <UFormField :label="a('fields.exposureProgram')" name="exifExposureProgram">
          <USelectMenu
            v-model="state.ExposureProgram"
            :items="enumItems('ExposureProgram')"
            value-key="value"
            label-key="label"
            class="w-full"
          />
        </UFormField>
        <UFormField :label="a('fields.exposureMode')" name="exifExposureMode">
          <USelectMenu
            v-model="state.ExposureMode"
            :items="enumItems('ExposureMode')"
            value-key="value"
            label-key="label"
            class="w-full"
          />
        </UFormField>
        <UFormField
          :label="a('fields.colorSpace')"
          name="exifColorSpace"
          class="sm:col-span-2"
        >
          <USelectMenu
            v-model="state.ColorSpace"
            :items="enumItems('ColorSpace')"
            value-key="value"
            label-key="label"
            class="w-full"
          />
          <p class="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            {{ a('colorSpaceNote') }}
          </p>
        </UFormField>
      </div>
    </div>

    <!-- Authorship -->
    <div class="space-y-3">
      <h4 class="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {{ a('groups.authorship') }}
      </h4>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <UFormField :label="a('fields.artist')" name="exifArtist">
          <UInput v-model="state.Artist" class="w-full" />
        </UFormField>
        <UFormField :label="a('fields.software')" name="exifSoftware">
          <UInput v-model="state.Software" class="w-full" />
        </UFormField>
        <UFormField :label="a('fields.copyright')" name="exifCopyright" class="sm:col-span-2">
          <UInput v-model="state.Copyright" class="w-full" />
        </UFormField>
      </div>
    </div>

    <!-- Date & sensor -->
    <div class="space-y-3">
      <h4 class="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {{ a('groups.dateSensor') }}
      </h4>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <UFormField :label="a('fields.dateTaken')" name="exifDateTaken">
          <UInput v-model="state.dateTakenLocal" type="datetime-local" step="1" class="w-full" />
        </UFormField>
        <UFormField :label="a('fields.utcOffset')" name="exifUtcOffset">
          <UInput
            v-model="state.utcOffset"
            :placeholder="a('placeholders.utcOffset')"
            class="w-full"
          />
        </UFormField>
        <UFormField :label="a('fields.focalPlaneXResolution')" name="exifFpx">
          <UInput v-model="state.FocalPlaneXResolution" type="number" step="0.01" min="0" class="w-full" />
        </UFormField>
        <UFormField :label="a('fields.focalPlaneYResolution')" name="exifFpy">
          <UInput v-model="state.FocalPlaneYResolution" type="number" step="0.01" min="0" class="w-full" />
        </UFormField>
      </div>
    </div>
  </div>
</template>
```

Notes:
- `$t` and `useExifLocalization` are auto-imported (used the same way in `InfoPanel.vue`).
- `USelectMenu` with `value-key`/`label-key` and a string `v-model` follows the existing pattern at `photos.vue:2300`.

- [ ] **Step 3: Format and lint**

Run:
```bash
pnpm fmt && pnpm lint
```
Expected: `oxlint` reports **0 errors**.

- [ ] **Step 4: Commit**

```bash
git add app/utils/exifForm.ts app/components/dashboard/PhotoExifAdvancedFields.vue
git commit -m "feat(exif): add advanced EXIF fields component

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Wire the advanced section into the editor

**Files:**
- Modify: `app/pages/dashboard/photos.vue`

- [ ] **Step 1: Import the component types/helpers and shared utils**

In the `<script setup>` of `app/pages/dashboard/photos.vue`, near the existing import of `Photo` (line 3 `import type { Photo, PipelineQueueItem } from '~~/server/utils/db'`), add:

```ts
import type { EditableExif } from '~~/shared/types/photo'
import {
  createEmptyExifFormState,
  type ExifFormState,
} from '~/utils/exifForm'
import {
  isoInstantToWallClock,
  wallClockToExifDate,
} from '~~/shared/utils/exifDateTime'
```

- [ ] **Step 2: Add reactive advanced-EXIF state and original snapshot**

After the `editFormState` reactive (currently lines 151-156) and the `originalMetadata` ref (lines 158-170), add:

```ts
const exifFormState = reactive<ExifFormState>(createEmptyExifFormState())
const originalExif = ref<ExifFormState>(createEmptyExifFormState())
```

- [ ] **Step 3: Add the `exifChanged` computed and fold it into `isMetadataDirty`**

After the `ratingChanged` computed (currently lines 242-244) and before `isMetadataDirty` (lines 246-253), add:

```ts
const exifChanged = computed(() => {
  const keys = Object.keys(exifFormState) as (keyof ExifFormState)[]
  return keys.some(
    (key) => exifFormState[key].trim() !== originalExif.value[key].trim(),
  )
})
```

Then replace the `isMetadataDirty` computed (lines 246-253) with:

```ts
const isMetadataDirty = computed(
  () =>
    titleChanged.value ||
    descriptionChanged.value ||
    tagsChanged.value ||
    locationChanged.value ||
    ratingChanged.value ||
    exifChanged.value,
)
```

- [ ] **Step 4: Populate the advanced state in `openMetadataEditor`**

Inside `openMetadataEditor` (currently lines 1253-1286), before the final `isEditModalOpen.value = true` (line 1285), add population from `photo.exif`. Add this block:

```ts
  const exif = photo.exif ?? {}
  const populatedExif: ExifFormState = {
    Make: exif.Make ?? '',
    Model: exif.Model ?? '',
    LensMake: exif.LensMake ?? '',
    LensModel: exif.LensModel ?? '',
    FNumber: exif.FNumber != null ? String(exif.FNumber) : '',
    ExposureTime: exif.ExposureTime != null ? String(exif.ExposureTime) : '',
    ISO: exif.ISO != null ? String(exif.ISO) : '',
    FocalLength: exif.FocalLength ?? '',
    FocalLengthIn35mmFormat: exif.FocalLengthIn35mmFormat ?? '',
    Flash: exif.Flash ?? '',
    SceneCaptureType: exif.SceneCaptureType ?? '',
    WhiteBalance: exif.WhiteBalance != null ? String(exif.WhiteBalance) : '',
    MeteringMode: exif.MeteringMode != null ? String(exif.MeteringMode) : '',
    ExposureProgram: exif.ExposureProgram ?? '',
    ExposureMode: exif.ExposureMode ?? '',
    ColorSpace: exif.ColorSpace ?? '',
    Artist: exif.Artist ?? '',
    Copyright: exif.Copyright ?? '',
    Software: exif.Software ?? '',
    dateTakenLocal: exif.DateTimeOriginal
      ? isoInstantToWallClock(exif.DateTimeOriginal, exif.OffsetTimeOriginal)
      : '',
    utcOffset: exif.OffsetTimeOriginal ?? '',
    FocalPlaneXResolution:
      exif.FocalPlaneXResolution != null
        ? String(exif.FocalPlaneXResolution)
        : '',
    FocalPlaneYResolution:
      exif.FocalPlaneYResolution != null
        ? String(exif.FocalPlaneYResolution)
        : '',
  }
  Object.assign(exifFormState, populatedExif)
  originalExif.value = { ...populatedExif }
```

- [ ] **Step 5: Build the `exif` payload in `saveMetadataChanges`**

Inside `saveMetadataChanges` (currently lines 1323-1416), after the `ratingChanged` block (lines 1360-1362) and before `let hasAnySuccessfulAction = false` (line 1364), add the advanced-EXIF diff builder:

```ts
    if (exifChanged.value) {
      const exifPayload: EditableExif = {}
      const orig = originalExif.value

      const setText = (
        key: keyof EditableExif,
        formKey: keyof ExifFormState,
      ) => {
        if (exifFormState[formKey].trim() === orig[formKey].trim()) return
        const value = exifFormState[formKey].trim()
        ;(exifPayload[key] as string | null) = value.length > 0 ? value : null
      }

      const setNumber = (
        key: keyof EditableExif,
        formKey: keyof ExifFormState,
      ) => {
        if (exifFormState[formKey].trim() === orig[formKey].trim()) return
        const raw = exifFormState[formKey].trim()
        ;(exifPayload[key] as number | null) =
          raw.length > 0 ? Number(raw) : null
      }

      setText('Make', 'Make')
      setText('Model', 'Model')
      setText('LensMake', 'LensMake')
      setText('LensModel', 'LensModel')
      setNumber('FNumber', 'FNumber')
      setText('ExposureTime', 'ExposureTime')
      setNumber('ISO', 'ISO')
      setText('FocalLength', 'FocalLength')
      setText('FocalLengthIn35mmFormat', 'FocalLengthIn35mmFormat')
      setText('Flash', 'Flash')
      setText('SceneCaptureType', 'SceneCaptureType')
      setText('WhiteBalance', 'WhiteBalance')
      setText('MeteringMode', 'MeteringMode')
      setText('ExposureProgram', 'ExposureProgram')
      setText('ExposureMode', 'ExposureMode')
      setText('ColorSpace', 'ColorSpace')
      setText('Artist', 'Artist')
      setText('Copyright', 'Copyright')
      setText('Software', 'Software')
      setNumber('FocalPlaneXResolution', 'FocalPlaneXResolution')
      setNumber('FocalPlaneYResolution', 'FocalPlaneYResolution')

      const dateChanged =
        exifFormState.dateTakenLocal.trim() !==
          orig.dateTakenLocal.trim() ||
        exifFormState.utcOffset.trim() !== orig.utcOffset.trim()
      if (dateChanged) {
        const offset = exifFormState.utcOffset.trim()
        exifPayload.OffsetTimeOriginal = offset.length > 0 ? offset : null
        exifPayload.DateTimeOriginal = exifFormState.dateTakenLocal.trim()
          ? wallClockToExifDate(exifFormState.dateTakenLocal.trim())
          : null
      }

      if (Object.keys(exifPayload).length > 0) {
        payload.exif = exifPayload
      }
    }
```

Also extend the `payload` type declaration (currently lines 1330-1336) to include `exif`:

```ts
    const payload: {
      title?: string
      description?: string
      tags?: string[]
      location?: { latitude: number; longitude: number } | null
      rating?: number | null
      exif?: EditableExif
    } = {}
```

- [ ] **Step 6: Add the collapsible section to the template**

In the edit `USlideover`'s `UForm` (the form ends at `</UForm>` on line 2688), add the advanced section as the **last child inside** the `UForm`, immediately before `</UForm>` (line 2688):

```vue
                <UCollapsible
                  class="border-t border-neutral-200 dark:border-neutral-800 pt-4"
                >
                  <UButton
                    type="button"
                    variant="ghost"
                    color="neutral"
                    class="group w-full justify-between"
                    trailing-icon="tabler:chevron-down"
                    :ui="{ trailingIcon: 'group-data-[state=open]:rotate-180 transition-transform' }"
                  >
                    {{ $t('dashboard.photos.editModal.advanced.toggle') }}
                  </UButton>

                  <template #content>
                    <div class="pt-4 space-y-3">
                      <p class="text-xs text-neutral-500 dark:text-neutral-400">
                        {{ $t('dashboard.photos.editModal.advanced.hint') }}
                      </p>
                      <PhotoExifAdvancedFields :state="exifFormState" />
                    </div>
                  </template>
                </UCollapsible>
```

Notes:
- `UCollapsible` is from `@nuxt/ui` v4; default slot = trigger, `#content` slot = collapsible body; collapsed by default.
- The component auto-imports as `PhotoExifAdvancedFields` (Nuxt component auto-import; the `dashboard/` directory prefix is not required because the file name is unique — if a name clash occurs, use `<DashboardPhotoExifAdvancedFields>`).
- The `type="button"` on the trigger prevents it from submitting the surrounding form.

- [ ] **Step 7: Format, lint, and prepare**

Run:
```bash
pnpm fmt && pnpm lint && pnpm postinstall
```
Expected: `oxlint` reports **0 errors**; `nuxt prepare` succeeds.

- [ ] **Step 8: Commit**

```bash
git add app/pages/dashboard/photos.vue
git commit -m "feat(exif): wire advanced EXIF editor into the photo edit slideover

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Manual verification

**Files:** none (verification only).

- [ ] **Step 1: Start the app**

Run:
```bash
pnpm dev
```
Expected: webgl-image package builds, then Nuxt dev server starts and prints a local URL. Open it and sign in to the dashboard.

- [ ] **Step 2: Open the editor and the advanced section**

Go to `/dashboard/photos`, open the edit slideover for a photo with rich EXIF (e.g. a JPEG from a camera). Confirm:
- The "Advanced — EXIF metadata" toggle appears below the location field and is **collapsed by default**.
- Expanding it shows the five groups, populated from the photo's current EXIF (camera/lens/exposure values present, enum dropdowns showing the localized current value, date + offset filled).

- [ ] **Step 3: Edit a representative field from each group and save**

Change: Camera model (text), ISO (number), Flash (enum dropdown), Artist (text), and Date taken + UTC offset. Click **Save changes**. Expected: success toast; slideover closes; table refreshes.

- [ ] **Step 4: Verify persistence and display**

Reopen the same photo's editor. Expected: all edited values persisted (date shows the new wall-clock time and offset). Open the public photo viewer's InfoPanel for that photo and confirm the edited camera/exposure values and date render correctly.

- [ ] **Step 5: Verify the timeline re-sorts on date change**

In `/dashboard/photos` (and the public gallery, ordered by `dateTaken DESC`), confirm the photo whose Date taken changed has moved to the expected position in the ordering after refresh.

- [ ] **Step 6: Verify clearing a field**

Reopen the editor, clear a previously-set text field (e.g. delete Artist) and set an enum back to "Not set", and Save. Reopen and confirm those fields are now empty (tag removed).

- [ ] **Step 7: Verify the dirty guard**

Open the editor and immediately try Save without changes — the button is disabled. Expand Advanced, change one field, and confirm Save enables; revert it and confirm Save disables again.

- [ ] **Step 8: Confirm no regressions to basic editing**

Edit only the title/description/tags/rating/location (advanced section untouched) and save — confirm this still works exactly as before.

- [ ] **Step 9: Final lint/format gate**

Stop the dev server. Run:
```bash
pnpm fmt:check && pnpm lint
```
Expected: both pass with no errors. If `fmt:check` reports diffs, run `pnpm fmt` and amend the relevant commit.

---

## Self-review (completed by plan author)

**Spec coverage:**
- Field groups (camera/lens, exposure, authorship, date) → Tasks 1, 5, 6. ✅
- Extra fields Flash/SceneCaptureType/FocalPlaneResolution → enum options + component + schema (Tasks 1, 3, 5). ✅
- Full enum set via dropdowns (Flash, SceneCaptureType, WhiteBalance, MeteringMode, ExposureProgram, ExposureMode, ColorSpace) → `EXIF_ENUM_OPTIONS` + component dropdowns (Tasks 1, 5). ✅
- Date taken + editable UTC offset, updates `dateTaken` sort column → date helpers + mapper `dateTakenIso` + endpoint (Tasks 1, 2, 3). ✅
- Collapsed-by-default Advanced section inside the existing slideover → `UCollapsible` (Task 6). ✅
- Reuse existing PUT round-trip; one save action → Task 3 extends the same handler; Task 6 reuses `saveMetadataChanges`. ✅
- ColorSpace best-effort + authoritative DB overlay → `dbOverlay` merge in Task 3; `colorSpaceNote` in Task 4. ✅
- Clear semantics (empty → null/tag deletion) → `emptyToNull` in mapper + `setText`/`setNumber` null handling (Tasks 2, 6). ✅
- i18n across 5 locales; enum labels via existing `exif.values.*` → Task 4 + `localizeExif` in Task 5. ✅
- No vitest; types + lint + manual verification → testing approach section + Task 7. ✅

**Placeholder scan:** No TBD/TODO; every code step shows complete code. ✅

**Type consistency:** `ExifFormState` and `createEmptyExifFormState` defined in `app/utils/exifForm.ts` (Task 5 Step 1), imported by the component (Task 5 Step 2) and by Task 6. `EditableExif` defined in Task 1, used in Tasks 2, 3, 6. `EXIF_ENUM_OPTIONS`/`EXIF_ENUM_FIELD_CATEGORY`/`ExifEnumField` defined in Task 1, used in Tasks 3, 5. Date helpers defined in Task 1, used in Tasks 2 (`exifDateAndOffsetToIsoInstant`) and 6 (`isoInstantToWallClock`, `wallClockToExifDate`). `buildExifWriteTags`/`ExifWriteResult` defined in Task 2, used in Task 3. ✅
