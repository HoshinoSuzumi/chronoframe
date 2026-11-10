<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    steps: string[]
    reached: number
    disabled?: boolean
    label: string
  }>(),
  { disabled: false },
)
const step = defineModel<number>({ required: true })
const direction = ref('forward')
watch(step, (next, previous) => {
  direction.value = next < previous ? 'backward' : 'forward'
})
const pane = useTemplateRef<HTMLElement>('pane')
const height = ref<number>()
let observer: ResizeObserver | undefined
onMounted(() => {
  watch(
    pane,
    (element) => {
      observer?.disconnect()
      if (!element) return
      const measure = () => {
        height.value = element.getBoundingClientRect().height
      }
      observer = new ResizeObserver(measure)
      observer.observe(element)
      measure()
    },
    { immediate: true, flush: 'post' },
  )
})
onBeforeUnmount(() => observer?.disconnect())
</script>
<template>
  <div class="cf-stepper">
    <nav :aria-label="label">
      <ol class="cf-stepper-steps">
        <li
          v-for="(title, index) in steps"
          :key="index"
          :class="{ current: step === index + 1, complete: step > index + 1 }"
        >
          <CfButton
            type="button"
            variant="ghost"
            class="cf-stepper-indicator"
            :disabled="disabled || index + 1 > reached"
            :aria-label="title"
            :aria-current="step === index + 1 ? 'step' : undefined"
            @click="step = index + 1"
            ><UIcon
              v-if="step > index + 1"
              name="i-lucide-check"
              class="size-4"
            /><span v-else>{{ index + 1 }}</span></CfButton
          >
          <span class="cf-stepper-title">{{ title }}</span>
        </li>
      </ol>
    </nav>
    <div
      class="cf-stepper-viewport"
      :data-direction="direction"
      :style="height ? { height: height + 'px' } : undefined"
    >
      <Transition
        name="cf-step"
        mode="out-in"
        ><div
          ref="pane"
          :key="step"
          class="cf-stepper-pane"
        >
          <slot :step="step" /></div
      ></Transition>
    </div>
    <slot name="footer" />
  </div>
</template>
<style scoped>
.cf-stepper {
  display: grid;
  gap: 24px;
  min-width: 0;
}
.cf-stepper-steps {
  display: flex;
  list-style: none;
  padding: 0;
  margin: 0;
  gap: 12px;
}
.cf-stepper-steps li {
  flex: 1;
  display: grid;
  justify-items: center;
  gap: 8px;
  position: relative;
  min-width: 0;
}
.cf-stepper-steps li:not(:last-child)::after {
  content: '';
  position: absolute;
  top: 17px;
  left: calc(50% + 25px);
  width: calc(100% - 38px);
  height: 1px;
  background: var(--border);
}
.cf-stepper-steps li.complete::after {
  background: var(--foreground);
}
.cf-stepper-indicator {
  width: 36px;
  height: 36px;
  min-height: 36px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 50%;
  justify-content: center;
  background: var(--card);
  color: var(--muted-foreground);
  z-index: 1;
}
.current .cf-stepper-indicator,
.complete .cf-stepper-indicator {
  background: var(--foreground);
  color: var(--background);
  border-color: var(--foreground);
}
.current .cf-stepper-indicator {
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--foreground) 10%, transparent);
}
.cf-stepper-title {
  font-size: 12px;
  text-align: center;
  color: var(--muted-foreground);
}
.current .cf-stepper-title {
  color: var(--foreground);
  font-weight: 600;
}
.cf-stepper-viewport {
  position: relative;
  min-width: 0;
  transition: height 220ms ease;
  overflow-x: clip;
  padding: 6px;
  margin: -6px;
  box-sizing: content-box;
}
.cf-stepper-pane {
  min-width: 0;
}
.cf-step-enter-active,
.cf-step-leave-active {
  transition:
    transform 180ms ease,
    opacity 180ms ease;
}
[data-direction='forward'] > .cf-step-enter-from,
[data-direction='backward'] > .cf-step-leave-to {
  transform: translateX(20px);
  opacity: 0;
}
[data-direction='forward'] > .cf-step-leave-to,
[data-direction='backward'] > .cf-step-enter-from {
  transform: translateX(-20px);
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .cf-stepper-viewport,
  .cf-step-enter-active,
  .cf-step-leave-active {
    transition: none;
  }
  .cf-stepper-viewport > .cf-step-enter-from,
  .cf-stepper-viewport > .cf-step-leave-to {
    transform: none;
    opacity: 1;
  }
}
</style>
