<script lang="ts" setup>
import type { AsyncDataRequestStatus } from '#app'

const props = defineProps<{
  photos: Photo[]
  refresh: () => Promise<void>
  status: AsyncDataRequestStatus
}>()

const photosRef = toRef(props, 'photos')
const status = toRef(props, 'status')
const refresh = props.refresh
providePhotos(photosRef, status, refresh)
</script>

<template>
  <slot />
</template>

<style scoped></style>
