<script lang="ts" setup>
import { motion } from 'motion-v'

const props = withDefaults(
  defineProps<{
    photo: Photo
    index: number
    hasAnimated: boolean
    firstScreenItems?: number
  }>(),
  {
    firstScreenItems: 300,
  },
)

const emit = defineEmits<{
  animationComplete: []
  'visibility-change': [
    { index: number; isVisible: boolean; date: string | Date },
  ]
  openViewer: [number, any?]
}>()

const itemKey = computed(() => {
  return props.photo.id
})

const shouldAnimate = computed(() => {
  return !props.hasAnimated && props.index < props.firstScreenItems
})

const animateDelay = computed(() => {
  return props.index * 0.02
})

const itemVariants = {
  hidden: {
    opacity: 0,
    y: 30,
    scale: 0.95,
    filter: 'blur(6px)',
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    filter: 'blur(0px)',
    transition: {
      type: 'spring' as const,
      duration: 0.3,
      bounce: 0,
      delay: animateDelay.value,
    },
  },
}
</script>

<template>
  <motion.div
    :key="itemKey"
    :variants="shouldAnimate ? itemVariants : undefined"
    :initial="shouldAnimate ? 'hidden' : 'visible'"
    :animate="'visible'"
    @animation-complete="
      () => {
        if (shouldAnimate) emit('animationComplete')
      }
    "
  >
    <MasonryPhotoItem
      :photo="photo"
      :index="index"
      @visibility-change="emit('visibility-change', $event)"
      @open-viewer="(index, transitionData) => emit('openViewer', index, transitionData)"
    />
  </motion.div>
</template>

<style scoped></style>
