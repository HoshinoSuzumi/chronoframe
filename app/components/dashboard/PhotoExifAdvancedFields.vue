<script setup lang="ts">
import {
  EXIF_ENUM_FIELD_CATEGORY,
  EXIF_ENUM_OPTIONS,
  type ExifEnumField,
} from '~~/shared/constants/exifOptions'
import type {
  ExifFormErrors,
  ExifFormKey,
  ExifFormState,
} from '~/utils/exifForm'

type FieldKind = 'text' | 'decimal' | 'integer' | 'enum' | 'datetime'

interface FieldConfig {
  key: ExifFormKey
  /** Suffix under `dashboard.photos.editModal.advanced.fields`. */
  label: string
  kind: FieldKind
  /** Suffix under `dashboard.photos.editModal.advanced.placeholders`. */
  placeholder?: string
  /** Span both columns on wide layouts. */
  wide?: boolean
}

interface GroupConfig {
  /** Suffix under `dashboard.photos.editModal.advanced.groups`. */
  key: string
  fields: FieldConfig[]
}

/** Owned by the parent; the component edits it in place through v-model. */
const model = defineModel<ExifFormState>({ required: true })

const props = defineProps<{
  /** Field-level error codes from `validateExifForm`. */
  errors?: ExifFormErrors
  /** Inferred from the ICC profile on every reprocess; displayed read-only. */
  colorSpace?: string
}>()

const { t } = useI18n()
const { localizeExif } = useExifLocalization()

const a = (key: string) => t(`dashboard.photos.editModal.advanced.${key}`)

const GROUPS: GroupConfig[] = [
  {
    key: 'cameraLens',
    fields: [
      { key: 'Make', label: 'make', kind: 'text' },
      { key: 'Model', label: 'model', kind: 'text' },
      { key: 'LensMake', label: 'lensMake', kind: 'text' },
      { key: 'LensModel', label: 'lensModel', kind: 'text' },
    ],
  },
  {
    key: 'exposure',
    fields: [
      { key: 'FNumber', label: 'fNumber', kind: 'decimal' },
      {
        key: 'ExposureTime',
        label: 'exposureTime',
        kind: 'text',
        placeholder: 'exposureTime',
      },
      { key: 'ISO', label: 'iso', kind: 'integer' },
      {
        key: 'FocalLength',
        label: 'focalLength',
        kind: 'text',
        placeholder: 'focalLength',
      },
      {
        key: 'FocalLengthIn35mmFormat',
        label: 'focalLength35',
        kind: 'text',
        placeholder: 'focalLength',
      },
    ],
  },
  {
    key: 'captureMode',
    fields: [
      { key: 'Flash', label: 'flash', kind: 'enum' },
      { key: 'SceneCaptureType', label: 'sceneCaptureType', kind: 'enum' },
      { key: 'WhiteBalance', label: 'whiteBalance', kind: 'enum' },
      { key: 'MeteringMode', label: 'meteringMode', kind: 'enum' },
      { key: 'ExposureProgram', label: 'exposureProgram', kind: 'enum' },
      { key: 'ExposureMode', label: 'exposureMode', kind: 'enum' },
    ],
  },
  {
    key: 'authorship',
    fields: [
      { key: 'Artist', label: 'artist', kind: 'text' },
      { key: 'Software', label: 'software', kind: 'text' },
      { key: 'Copyright', label: 'copyright', kind: 'text', wide: true },
    ],
  },
  {
    key: 'dateSensor',
    fields: [
      { key: 'dateTakenLocal', label: 'dateTaken', kind: 'datetime' },
      {
        key: 'utcOffset',
        label: 'utcOffset',
        kind: 'text',
        placeholder: 'utcOffset',
      },
      {
        key: 'FocalPlaneXResolution',
        label: 'focalPlaneXResolution',
        kind: 'decimal',
      },
      {
        key: 'FocalPlaneYResolution',
        label: 'focalPlaneYResolution',
        kind: 'decimal',
      },
    ],
  },
]

interface EnumItem {
  label: string
  value: string
}

/**
 * USelectMenu items per enum field. An "unset" entry is deliberately not part
 * of the list: Reka UI forbids an item whose value is an empty string, so the
 * empty state is shown through the placeholder and cleared with `clear`.
 */
const enumItems = computed(() => {
  const entries = (
    Object.keys(EXIF_ENUM_FIELD_CATEGORY) as ExifEnumField[]
  ).map((field) => {
    const category = EXIF_ENUM_FIELD_CATEGORY[field]
    const items: EnumItem[] = EXIF_ENUM_OPTIONS[category].map((value) => ({
      label: localizeExif(category, value) || value,
      value,
    }))
    return [field, items] as const
  })
  return Object.fromEntries(entries) as Record<ExifEnumField, EnumItem[]>
})

const errorMessage = (key: ExifFormKey): string | undefined => {
  const code = props.errors?.[key]
  return code ? a(`errors.${code}`) : undefined
}

const inputMode = (kind: FieldKind) => {
  if (kind === 'decimal') return 'decimal'
  if (kind === 'integer') return 'numeric'
  return undefined
}

const colorSpaceLabel = computed(() =>
  props.colorSpace
    ? localizeExif('colorSpace', props.colorSpace) || props.colorSpace
    : a('placeholders.none'),
)
</script>

<template>
  <div class="space-y-6">
    <section
      v-for="group in GROUPS"
      :key="group.key"
      class="space-y-3"
    >
      <h4
        class="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400"
      >
        {{ a(`groups.${group.key}`) }}
      </h4>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <UFormField
          v-for="field in group.fields"
          :key="field.key"
          :label="a(`fields.${field.label}`)"
          :name="`exif.${field.key}`"
          :error="errorMessage(field.key)"
          :class="{ 'sm:col-span-2': field.wide }"
        >
          <USelectMenu
            v-if="field.kind === 'enum'"
            :model-value="model[field.key]"
            :items="enumItems[field.key as ExifEnumField]"
            :placeholder="a('placeholders.none')"
            value-key="value"
            label-key="label"
            clear
            class="w-full"
            @update:model-value="(value) => (model[field.key] = value ?? '')"
          />
          <UInput
            v-else-if="field.kind === 'datetime'"
            v-model="model[field.key]"
            type="datetime-local"
            step="1"
            class="w-full"
          />
          <UInput
            v-else
            v-model="model[field.key]"
            type="text"
            :inputmode="inputMode(field.kind)"
            :placeholder="
              field.placeholder
                ? a(`placeholders.${field.placeholder}`)
                : undefined
            "
            class="w-full"
          />
        </UFormField>

        <UFormField
          v-if="group.key === 'dateSensor'"
          :label="a('fields.colorSpace')"
          :help="a('notes.colorSpace')"
          name="exif.ColorSpace"
          class="sm:col-span-2"
        >
          <UInput
            :model-value="colorSpaceLabel"
            disabled
            class="w-full"
          />
        </UFormField>
      </div>
    </section>
  </div>
</template>
