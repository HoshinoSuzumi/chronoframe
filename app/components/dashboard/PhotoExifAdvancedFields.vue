<script setup lang="ts">
import {
  EXIF_ENUM_FIELD_CATEGORY,
  EXIF_ENUM_OPTIONS,
  type ExifEnumField,
} from '~~/shared/constants/exifOptions'
import type { ExifFormState } from '~/utils/exifForm'

defineProps<{
  state: ExifFormState
  /** Inferred from the ICC profile on every reprocess; displayed read-only. */
  colorSpace?: string
}>()

const { localizeExif } = useExifLocalization()

/** Build USelectMenu items for an enum field: '' (none) + localized values. */
const enumItems = (field: ExifEnumField) => {
  const category = EXIF_ENUM_FIELD_CATEGORY[field]
  return [
    {
      label: $t('dashboard.photos.editModal.advanced.placeholders.none'),
      value: '',
    },
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
      <h4
        class="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400"
      >
        {{ a('groups.cameraLens') }}
      </h4>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <UFormField
          :label="a('fields.make')"
          name="exifMake"
        >
          <UInput
            v-model="state.Make"
            class="w-full"
          />
        </UFormField>
        <UFormField
          :label="a('fields.model')"
          name="exifModel"
        >
          <UInput
            v-model="state.Model"
            class="w-full"
          />
        </UFormField>
        <UFormField
          :label="a('fields.lensMake')"
          name="exifLensMake"
        >
          <UInput
            v-model="state.LensMake"
            class="w-full"
          />
        </UFormField>
        <UFormField
          :label="a('fields.lensModel')"
          name="exifLensModel"
        >
          <UInput
            v-model="state.LensModel"
            class="w-full"
          />
        </UFormField>
      </div>
    </div>

    <!-- Exposure -->
    <div class="space-y-3">
      <h4
        class="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400"
      >
        {{ a('groups.exposure') }}
      </h4>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <UFormField
          :label="a('fields.fNumber')"
          name="exifFNumber"
        >
          <UInput
            v-model="state.FNumber"
            type="number"
            step="0.1"
            min="0"
            class="w-full"
          />
        </UFormField>
        <UFormField
          :label="a('fields.exposureTime')"
          name="exifExposureTime"
        >
          <UInput
            v-model="state.ExposureTime"
            :placeholder="a('placeholders.exposureTime')"
            class="w-full"
          />
        </UFormField>
        <UFormField
          :label="a('fields.iso')"
          name="exifIso"
        >
          <UInput
            v-model="state.ISO"
            type="number"
            step="1"
            min="0"
            class="w-full"
          />
        </UFormField>
        <UFormField
          :label="a('fields.focalLength')"
          name="exifFocalLength"
        >
          <UInput
            v-model="state.FocalLength"
            :placeholder="a('placeholders.focalLength')"
            class="w-full"
          />
        </UFormField>
        <UFormField
          :label="a('fields.focalLength35')"
          name="exifFocalLength35"
        >
          <UInput
            v-model="state.FocalLengthIn35mmFormat"
            class="w-full"
          />
        </UFormField>
      </div>
    </div>

    <!-- Capture mode (enums) -->
    <div class="space-y-3">
      <h4
        class="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400"
      >
        {{ a('groups.captureMode') }}
      </h4>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <UFormField
          :label="a('fields.flash')"
          name="exifFlash"
        >
          <USelectMenu
            v-model="state.Flash"
            :items="enumItems('Flash')"
            value-key="value"
            label-key="label"
            class="w-full"
          />
        </UFormField>
        <UFormField
          :label="a('fields.sceneCaptureType')"
          name="exifSceneCaptureType"
        >
          <USelectMenu
            v-model="state.SceneCaptureType"
            :items="enumItems('SceneCaptureType')"
            value-key="value"
            label-key="label"
            class="w-full"
          />
        </UFormField>
        <UFormField
          :label="a('fields.whiteBalance')"
          name="exifWhiteBalance"
        >
          <USelectMenu
            v-model="state.WhiteBalance"
            :items="enumItems('WhiteBalance')"
            value-key="value"
            label-key="label"
            class="w-full"
          />
        </UFormField>
        <UFormField
          :label="a('fields.meteringMode')"
          name="exifMeteringMode"
        >
          <USelectMenu
            v-model="state.MeteringMode"
            :items="enumItems('MeteringMode')"
            value-key="value"
            label-key="label"
            class="w-full"
          />
        </UFormField>
        <UFormField
          :label="a('fields.exposureProgram')"
          name="exifExposureProgram"
        >
          <USelectMenu
            v-model="state.ExposureProgram"
            :items="enumItems('ExposureProgram')"
            value-key="value"
            label-key="label"
            class="w-full"
          />
        </UFormField>
        <UFormField
          :label="a('fields.exposureMode')"
          name="exifExposureMode"
        >
          <USelectMenu
            v-model="state.ExposureMode"
            :items="enumItems('ExposureMode')"
            value-key="value"
            label-key="label"
            class="w-full"
          />
        </UFormField>
      </div>
    </div>

    <!-- Authorship -->
    <div class="space-y-3">
      <h4
        class="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400"
      >
        {{ a('groups.authorship') }}
      </h4>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <UFormField
          :label="a('fields.artist')"
          name="exifArtist"
        >
          <UInput
            v-model="state.Artist"
            class="w-full"
          />
        </UFormField>
        <UFormField
          :label="a('fields.software')"
          name="exifSoftware"
        >
          <UInput
            v-model="state.Software"
            class="w-full"
          />
        </UFormField>
        <UFormField
          :label="a('fields.copyright')"
          name="exifCopyright"
          class="sm:col-span-2"
        >
          <UInput
            v-model="state.Copyright"
            class="w-full"
          />
        </UFormField>
      </div>
    </div>

    <!-- Date & sensor -->
    <div class="space-y-3">
      <h4
        class="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400"
      >
        {{ a('groups.dateSensor') }}
      </h4>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <UFormField
          :label="a('fields.dateTaken')"
          name="exifDateTaken"
        >
          <UInput
            v-model="state.dateTakenLocal"
            type="datetime-local"
            step="1"
            class="w-full"
          />
        </UFormField>
        <UFormField
          :label="a('fields.utcOffset')"
          name="exifUtcOffset"
        >
          <UInput
            v-model="state.utcOffset"
            :placeholder="a('placeholders.utcOffset')"
            class="w-full"
          />
        </UFormField>
        <UFormField
          :label="a('fields.focalPlaneXResolution')"
          name="exifFpx"
        >
          <UInput
            v-model="state.FocalPlaneXResolution"
            type="number"
            step="0.01"
            min="0"
            class="w-full"
          />
        </UFormField>
        <UFormField
          :label="a('fields.focalPlaneYResolution')"
          name="exifFpy"
        >
          <UInput
            v-model="state.FocalPlaneYResolution"
            type="number"
            step="0.01"
            min="0"
            class="w-full"
          />
        </UFormField>
        <UFormField
          :label="a('fields.colorSpace')"
          :help="a('notes.colorSpace')"
          name="exifColorSpace"
          class="sm:col-span-2"
        >
          <UInput
            :model-value="
              colorSpace
                ? localizeExif('colorSpace', colorSpace) || colorSpace
                : a('placeholders.none')
            "
            disabled
            class="w-full"
          />
        </UFormField>
      </div>
    </div>
  </div>
</template>
