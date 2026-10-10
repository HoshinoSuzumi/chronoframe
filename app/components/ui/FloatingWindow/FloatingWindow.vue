<script setup lang="ts">
import {
  constrainFloatingRect,
  resizeFloatingRect,
} from '~/utils/floatingWindow'
import type { FloatingRect } from '~/utils/floatingWindow'
const props = withDefaults(
  defineProps<{
    id?: string
    title?: string
    allowOverflow?: boolean
    minWidth?: number
    minHeight?: number
    maxWidth?: number
    maxHeight?: number
    initialWidth?: number
    initialHeight?: number
    initialX?: number
    initialY?: number
  }>(),
  {
    allowOverflow: true,
    minWidth: 240,
    minHeight: 160,
    maxWidth: Infinity,
    maxHeight: Infinity,
    initialWidth: 420,
    initialHeight: 480,
    initialX: 24,
    initialY: 24,
  },
)
const open = defineModel<boolean>({ default: true })
const rect = ref<FloatingRect>({
  x: props.initialX,
  y: props.initialY,
  width: props.initialWidth,
  height: props.initialHeight,
})
const preferredRect = ref({ ...rect.value })
const ready = ref(false)
const interacting = ref(false)
const maximized = ref(false)
const viewport = ref({ width: 1, height: 1 })
const edges = ['n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw']
const style = computed(() => {
  const r = maximized.value
    ? { x: 0, y: 0, width: viewport.value.width, height: viewport.value.height }
    : rect.value
  return {
    left: `${r.x}px`,
    top: `${r.y}px`,
    width: `${r.width}px`,
    height: `${r.height}px`,
  }
})
function normalize() {
  rect.value = constrainFloatingRect(
    preferredRect.value,
    viewport.value,
    props.minWidth,
    props.minHeight,
    props.maxWidth,
    props.maxHeight,
    props.allowOverflow,
  )
}
function save() {
  if (!props.id) return
  try {
    localStorage.setItem(
      `chronoframe:window:${props.id}`,
      JSON.stringify({ rect: preferredRect.value, maximized: maximized.value }),
    )
  } catch {
    /* Optional persistence. */
  }
}
function resizeViewport() {
  viewport.value = { width: window.innerWidth, height: window.innerHeight }
  normalize()
}
function toggleMaximize() {
  maximized.value = !maximized.value
  save()
}
let stopGesture: (() => void) | undefined
function startGesture(event: PointerEvent, edge?: string) {
  if (
    event.button !== 0 ||
    maximized.value ||
    (!edge && (event.target as HTMLElement).closest('button,input,select,a'))
  )
    return
  event.preventDefault()
  stopGesture?.()
  interacting.value = true
  const target = event.currentTarget as HTMLElement
  target.setPointerCapture(event.pointerId)
  const initial = { ...rect.value },
    x = event.clientX,
    y = event.clientY
  const move = (e: PointerEvent) => {
    if (e.pointerId !== event.pointerId) return
    const dx = e.clientX - x,
      dy = e.clientY - y
    preferredRect.value = edge
      ? resizeFloatingRect(
          initial,
          edge,
          dx,
          dy,
          viewport.value,
          props.minWidth,
          props.minHeight,
          props.maxWidth,
          props.maxHeight,
          props.allowOverflow,
        )
      : { ...initial, x: initial.x + dx, y: initial.y + dy }
    normalize()
    preferredRect.value = { ...rect.value }
  }
  const stop = () => {
    target.removeEventListener('pointermove', move)
    target.removeEventListener('pointerup', stop)
    target.removeEventListener('pointercancel', stop)
    target.removeEventListener('lostpointercapture', stop)
    if (target.hasPointerCapture(event.pointerId))
      target.releasePointerCapture(event.pointerId)
    interacting.value = false
    stopGesture = undefined
    save()
  }
  target.addEventListener('pointermove', move)
  target.addEventListener('pointerup', stop)
  target.addEventListener('pointercancel', stop)
  target.addEventListener('lostpointercapture', stop)
  stopGesture = stop
}
function handleKey(event: KeyboardEvent) {
  if (open.value && event.key === 'Escape' && !event.defaultPrevented)
    open.value = false
}
onMounted(() => {
  viewport.value = { width: window.innerWidth, height: window.innerHeight }
  if (props.id) {
    try {
      const saved = JSON.parse(
        localStorage.getItem(`chronoframe:window:${props.id}`) || 'null',
      )
      if (
        saved?.rect &&
        ['x', 'y', 'width', 'height'].every((key) =>
          Number.isFinite(saved.rect[key]),
        )
      ) {
        preferredRect.value = saved.rect
        maximized.value = saved.maximized === true
      }
    } catch {
      /* Ignore invalid saved geometry. */
    }
  }
  normalize()
  ready.value = true
  window.addEventListener('resize', resizeViewport)
  window.addEventListener('keydown', handleKey)
})
watch(
  () => [
    props.allowOverflow,
    props.minWidth,
    props.minHeight,
    props.maxWidth,
    props.maxHeight,
  ],
  () => {
    normalize()
  },
)
watch(open, (value) => {
  if (!value) stopGesture?.()
})
onBeforeUnmount(() => {
  stopGesture?.()
  window.removeEventListener('resize', resizeViewport)
  window.removeEventListener('keydown', handleKey)
})
</script>

<template>
  <Teleport to="body">
    <Transition
      name="floating-window"
      appear
    >
      <section
        v-if="open && ready"
        role="dialog"
        tabindex="-1"
        :aria-label="title"
        class="floating-window fixed z-[10000] flex flex-col overflow-hidden border-default bg-default"
        :class="[
          maximized
            ? 'border-0 rounded-none shadow-none'
            : 'border rounded-xl shadow-2xl',
          { 'is-interacting': interacting },
        ]"
        :style="style"
      >
        <header
          class="flex h-11 shrink-0 touch-none select-none items-center gap-2 border-b border-default px-3"
          :class="maximized ? '' : 'cursor-move'"
          @pointerdown="startGesture($event)"
          @dblclick="toggleMaximize"
        >
          <div class="min-w-0 flex-1 truncate text-sm font-semibold">
            <slot name="title">{{ title }}</slot>
          </div>
          <slot name="actions" />
          <UButton
            :icon="
              maximized ? 'tabler:arrows-minimize' : 'tabler:arrows-maximize'
            "
            :aria-label="
              maximized
                ? $t('debug.window.restore')
                : $t('debug.window.maximize')
            "
            size="xs"
            variant="ghost"
            color="neutral"
            @dblclick.stop
            @click="toggleMaximize"
          />
          <UButton
            icon="tabler:x"
            :aria-label="$t('debug.window.close')"
            size="xs"
            variant="ghost"
            color="neutral"
            @dblclick.stop
            @click="open = false"
          />
        </header>
        <div class="min-h-0 flex-1 overflow-auto">
          <slot :maximized="maximized" />
        </div>
        <div
          v-if="$slots.footer"
          class="shrink-0 border-t border-default"
        >
          <slot name="footer" />
        </div>
        <template v-if="!maximized">
          <div
            v-for="edge in edges"
            :key="edge"
            class="resize-handle absolute touch-none"
            :class="'resize-' + edge"
            aria-hidden="true"
            @pointerdown.stop="startGesture($event, edge)"
          />
        </template>
      </section>
    </Transition>
  </Teleport>
</template>

<style scoped>
.floating-window {
  transition:
    left 220ms ease,
    top 220ms ease,
    width 220ms ease,
    height 220ms ease,
    border-radius 220ms ease,
    opacity 160ms ease,
    transform 160ms ease;
}
.floating-window.is-interacting {
  transition: none;
}
.floating-window-enter-from,
.floating-window-leave-to {
  opacity: 0;
  transform: translateY(8px) scale(0.97);
}
@media (prefers-reduced-motion: reduce) {
  .floating-window {
    transition: none;
  }
  .floating-window-enter-from,
  .floating-window-leave-to {
    transform: none;
  }
}

.resize-n,
.resize-s {
  height: 6px;
  left: 10px;
  right: 10px;
  cursor: ns-resize;
}
.resize-n {
  top: 0;
}
.resize-s {
  bottom: 0;
}
.resize-e,
.resize-w {
  width: 6px;
  top: 10px;
  bottom: 10px;
  cursor: ew-resize;
}
.resize-e {
  right: 0;
}
.resize-w {
  left: 0;
}
.resize-ne,
.resize-nw,
.resize-se,
.resize-sw {
  width: 12px;
  height: 12px;
}
.resize-ne {
  top: 0;
  right: 0;
  cursor: nesw-resize;
}
.resize-nw {
  top: 0;
  left: 0;
  cursor: nwse-resize;
}
.resize-se {
  bottom: 0;
  right: 0;
  cursor: nwse-resize;
}
.resize-sw {
  bottom: 0;
  left: 0;
  cursor: nesw-resize;
}
</style>
