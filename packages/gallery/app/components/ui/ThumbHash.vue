<script lang="ts" setup>
import { twMerge } from 'tailwind-merge'
import { thumbHashToDataURL } from 'thumbhash'

const props = defineProps<{
  thumbhash: ArrayLike<number> | string
  class?: string
}>()

const dataUrl = computed(() => {
  if (typeof props.thumbhash === 'string') {
    return thumbHashToDataURL(decompressUint8Array(props.thumbhash))
  }

  return thumbHashToDataURL(props.thumbhash)
})
</script>

<template>
  <img
    :src="dataUrl"
    :class="twMerge('w-full h-full', props.class)"
  />
</template>

<style scoped></style>
