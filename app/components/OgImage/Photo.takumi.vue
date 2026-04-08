<script lang="ts" setup>
import { formatCameraInfo } from '~/utils/camera'

const {
  photo,
  title = '',
  description = '',
  headline = 'headline',
  thumbnailJpegUrl,
} = defineProps<{
  photo?: Photo
  title?: string
  description?: string
  headline?: string
  thumbnailJpegUrl?: string
}>()

const config = useRuntimeConfig()

// const description = computed(() => (props.description || '').slice(0, 200))
</script>

<!-- TODO: fix CJK font weight -->
<template>
  <div
    :class="'w-full h-full flex flex-col justify-center bg-neutral-950 relative'"
    style="font-family: 'Rubik', 'Noto Sans SC', sans-serif; font-weight: 700"
  >
    <img
      v-if="thumbnailJpegUrl"
      :src="thumbnailJpegUrl"
      class="absolute inset-y-0 right-0 object-cover"
      width="60%"
      height="100%"
    />
    <div
      v-if="thumbnailJpegUrl"
      class="absolute inset-y-0 right-0 w-[60%]"
      :style="{
        background:
          'linear-gradient(90deg, rgba(10,10,10,1) 0%, rgba(10,10,10,0.3) 35%, rgba(10,10,10,0.1) 100%)',
      }"
    />
    <div
      class="h-full flex flex-col justify-between pl-24 py-16 bg-neutral-950/10"
    >
      <div class="flex flex-col">
        <p
          v-if="headline"
          class="m-0 uppercase text-4xl text-rose-500 mb-2 font-semibold"
        >
          {{ headline }} · {{ config.public.app.title }}
        </p>
        <h1
          v-if="title"
          class="m-0 text-8xl font-bold mb-2 text-white max-w-4/5"
          style="display: block; line-clamp: 1; text-overflow: ellipsis"
        >
          {{ title }}
        </h1>
        <p
          v-if="description"
          class="m-0 text-3xl text-neutral-300 font-bold mb-2 max-w-2/3"
          style="display: block; line-clamp: 2; text-overflow: ellipsis"
        >
          {{ description }}
        </p>
        <div
          v-if="photo"
          class="flex flex-row items-center gap-3 text-neutral-300 text-3xl font-bold mt-6"
        >
          <div
            v-if="photo.city"
            class="flex flex-row items-center gap-1"
          >
            <Icon
              name="tabler:map-pin"
              class="size-10"
              mode="svg"
            />
            <span class="truncate"> {{ photo.city }} </span>
          </div>
          <div
            v-if="photo.exif?.Model"
            class="flex flex-row items-center gap-1"
          >
            <Icon
              name="tabler:camera"
              class="size-10"
              mode="svg"
            />
            <span class="truncate">
              {{ formatCameraInfo(photo.exif.Make, photo.exif.Model) }}
            </span>
          </div>
        </div>
      </div>
      <div
        v-if="photo"
        class="flex flex-row items-center flex-wrap gap-4 max-w-full text-neutral-300 text-4xl font-medium mt-8"
      >
        <div
          class="rounded-3xl border-4 border-neutral-300/30 bg-neutral-300/20 backdrop-blur-2xl px-6 py-4 flex items-center gap-3"
        >
          <Icon
            name="streamline:image-accessories-lenses-photos-camera-shutter-picture-photography-pictures-photo-lens"
            class="size-14 text-amber-400"
            mode="svg"
          />
          <span class="truncate">
            {{ photo.exif?.FocalLengthIn35mmFormat || '—' }}
          </span>
        </div>
        <div
          class="rounded-3xl border-4 border-neutral-300/30 bg-neutral-300/20 backdrop-blur-2xl px-6 py-4 flex items-center gap-3"
        >
          <Icon
            name="tabler:aperture"
            class="size-14 text-purple-400"
            mode="svg"
          />
          <span class="truncate"> f/{{ photo.exif?.FNumber || '—' }} </span>
        </div>
        <div
          class="rounded-3xl border-4 border-neutral-300/30 bg-neutral-300/20 backdrop-blur-2xl px-6 py-4 flex items-center gap-3"
        >
          <Icon
            name="material-symbols:shutter-speed"
            class="size-14 text-emerald-400"
            mode="svg"
          />
          <span class="truncate"> {{ photo.exif?.ExposureTime || '—' }}s </span>
        </div>
        <div
          class="rounded-3xl border-4 border-neutral-300/30 bg-neutral-300/20 backdrop-blur-2xl px-6 py-4 flex items-center gap-3"
        >
          <Icon
            name="carbon:iso-outline"
            class="size-14 text-sky-400"
            mode="svg"
          />
          <span class="truncate"> {{ photo.exif?.ISO || '—' }} </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped></style>
