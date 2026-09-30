<script lang="ts" setup>
import { Icon as IconifyIcon, addIcon } from '@iconify/vue'
import { init as initIconBundle } from '#build/nuxt-icon-client-bundle'
import { formatCameraInfo } from '~/utils/camera'

initIconBundle(addIcon)

interface PhotoProps {
  photo?: Photo
}

const { photo } = defineProps<PhotoProps>()

const { $i18n } = useNuxtApp()
const config = useRuntimeConfig()

const headline = computed(() => (photo ? $i18n.t('title.fallback.photo') : 'ChronoFrame'))
const title = computed(() => (photo?.title || config.public.app.title).slice(0, 60))
const description = computed(() => (photo ? photo.description || '' : config.public.app.title).slice(0, 200))
const thumbnailUrl = computed(() => 
  photo?.thumbnailKey && photo.thumbnailUrl
  ? `/thumb/${encodeURIComponent(photo.thumbnailUrl)}`
  : undefined
)
</script>

<template>
  <div
    class="og-photo w-full h-full flex flex-col justify-center bg-neutral-950 relative"
  >
    <img
      v-if="thumbnailUrl"
      :src="thumbnailUrl"
      class="absolute inset-y-0 right-0 object-cover"
      width="60%"
      height="100%"
    />
    <div
      v-if="thumbnailUrl"
      class="og-photo__gradient absolute inset-y-0 right-0 w-[60%]"
    />
    <div
      class="h-full flex flex-col justify-between pl-24 py-16 bg-neutral-950/10"
    >
      <div class="flex flex-col">
        <p
          v-if="headline"
          class="m-0 mb-2 uppercase text-4xl font-semibold text-rose-500"
        >
          {{ headline }} · {{ config.public.app.title }}
        </p>
        <h1
          v-if="title"
          class="og-photo__title m-0 text-8xl font-bold mb-2 text-white max-w-4/5"
        >
          {{ title }}
        </h1>
        <p
          v-if="description"
          class="og-photo__description m-0 text-3xl text-neutral-300 font-bold mb-2 max-w-2/3"
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
            <span
              class="og-photo__icon og-photo__icon--meta text-neutral-300"
            >
              <IconifyIcon
                class="og-photo__svg og-photo__svg--meta"
                icon="tabler:map-pin"
                mode="svg"
                :ssr="true"
                width="40"
                height="40"
              />
            </span>
            <span class="truncate">
              {{ photo.city }}
            </span>
          </div>
          <div
            v-if="photo.exif?.Model"
            class="flex flex-row items-center gap-1"
          >
            <span
              class="og-photo__icon og-photo__icon--meta text-neutral-300"
            >
              <IconifyIcon
                class="og-photo__svg og-photo__svg--meta"
                icon="tabler:camera"
                mode="svg"
                :ssr="true"
                width="40"
                height="40"
              />
            </span>
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
          class="og-photo__exif-card rounded-3xl px-6 py-4 flex items-center gap-3"
        >
          <span
            class="og-photo__icon og-photo__icon--exif text-amber-400"
          >
            <IconifyIcon
              class="og-photo__svg og-photo__svg--exif"
              icon="streamline:image-accessories-lenses-photos-camera-shutter-picture-photography-pictures-photo-lens"
              mode="svg"
              :ssr="true"
              width="56"
              height="56"
            />
          </span>
          <span class="truncate">
            {{ photo.exif?.FocalLengthIn35mmFormat || '—' }}
          </span>
        </div>
        <div
          class="og-photo__exif-card rounded-3xl px-6 py-4 flex items-center gap-3"
        >
          <span
            class="og-photo__icon og-photo__icon--exif text-purple-400"
          >
            <IconifyIcon
              class="og-photo__svg og-photo__svg--exif"
              icon="tabler:aperture"
              mode="svg"
              :ssr="true"
              width="56"
              height="56"
            />
          </span>
          <span class="truncate"> f/{{ photo.exif?.FNumber || '—' }} </span>
        </div>
        <div
          class="og-photo__exif-card rounded-3xl px-6 py-4 flex items-center gap-3"
        >
          <span
            class="og-photo__icon og-photo__icon--exif text-emerald-400"
          >
            <IconifyIcon
              class="og-photo__svg og-photo__svg--exif"
              icon="material-symbols:shutter-speed"
              mode="svg"
              :ssr="true"
              width="56"
              height="56"
            />
          </span>
          <span class="truncate"> {{ photo.exif?.ExposureTime || '—' }}s </span>
        </div>
        <div
          class="og-photo__exif-card rounded-3xl px-6 py-4 flex items-center gap-3"
        >
          <span
            class="og-photo__icon og-photo__icon--exif text-sky-400"
          >
            <IconifyIcon
              class="og-photo__svg og-photo__svg--exif"
              icon="carbon:iso-outline"
              mode="svg"
              :ssr="true"
              width="56"
              height="56"
            />
          </span>
          <span class="truncate"> {{ photo.exif?.ISO || '—' }} </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.og-photo {
  font-family: "Rubik", "Noto Sans SC", sans-serif;
}

.og-photo__gradient {
  background: linear-gradient(
    90deg,
    rgb(10 10 10) 0%,
    rgb(10 10 10 / 30%) 35%,
    rgb(10 10 10 / 10%) 100%
  );
}

.og-photo__title {
  display: block;
  line-clamp: 1;
  text-overflow: ellipsis;
}

.og-photo__description {
  display: block;
  line-clamp: 2;
  text-overflow: ellipsis;
}

.og-photo__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  line-height: 1;
}

.og-photo__icon--meta {
  width: 40px;
  height: 40px;
  min-width: 40px;
  font-size: 40px;
}

.og-photo__icon--exif {
  width: 56px;
  height: 56px;
  min-width: 56px;
  font-size: 56px;
}

.og-photo__svg {
  display: block;
  flex-shrink: 0;
}

.og-photo__svg--meta {
  width: 40px;
  height: 40px;
  min-width: 40px;
}

.og-photo__svg--exif {
  width: 56px;
  height: 56px;
  min-width: 56px;
}

.og-photo__exif-card {
  background-color: rgb(212 212 212 / 20%);
  border: 4px solid rgb(212 212 212 / 30%);
}
</style>
