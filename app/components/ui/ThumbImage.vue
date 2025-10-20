<script lang="ts" setup>
import { twMerge } from 'tailwind-merge'
import type { CSSProperties } from 'vue'

const props = withDefaults(
  defineProps<{
    src: string
    alt: string
    thumbhash?: string | null
    class?: string
    thumbhashClass?: string
    style?: CSSProperties
    threshold?: number | number[]
    rootMargin?: string
    imageContain?: boolean
    lazy?: boolean
  }>(),
  {
    thumbhash: null,
    class: '',
    thumbhashClass: '',
    style: undefined,
    threshold: 0.1,
    rootMargin: '50px',
    imageContain: false,
    lazy: true,
  },
)

const emit = defineEmits<{
  load: []
  error: []
}>()

const elemRef = useTemplateRef('elemRef')
const isElemVisible = ref(false)
const isLoaded = ref(false)
const isError = ref(false)

onMounted(() => {
  if (!props.lazy) {
    isElemVisible.value = true
  }
})

const { stop } = useIntersectionObserver(
  elemRef,
  ([entry], _observerElement) => {
    isElemVisible.value = entry?.isIntersecting || false
    if (isElemVisible.value) {
      stop()
    }
  },
  {
    threshold: props.threshold,
    rootMargin: props.rootMargin,
    immediate: props.lazy,
  },
)

const onLoaded = () => {
  isLoaded.value = true
  emit('load')
}

const onError = () => {
  isError.value = true
  emit('error')
}
</script>

<template>
  <div
    ref="elemRef"
    :class="twMerge('relative overflow-hidden', $props.class)"
    :style="style"
  >
    <ThumbHash
      v-if="thumbhash"
      :thumbhash="thumbhash"
      :class="twMerge('absolute inset-0 scale-110 blur-sm', thumbhashClass)"
    />

    <img
      v-if="isElemVisible"
      loading="lazy"
      :src="src"
      :alt="alt"
      :class="
        twMerge(
          'absolute inset-0 w-full h-full transition-opacity duration-300',
          imageContain ? 'object-contain' : 'object-cover',
          isLoaded ? 'opacity-100' : 'opacity-0',
        )
      "
      @load="onLoaded"
      @error="onError"
    />

    <div
      v-if="isError"
      class="absolute inset-0 flex justify-center items-center bg-neutral-200 dark:bg-neutral-800"
    >
      <Icon
        name="tabler:photo-off"
        class="size-6 text-neutral-400"
      />
      <p class="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
        加载图片失败
      </p>
    </div>
  </div>
</template>

<style scoped></style>
