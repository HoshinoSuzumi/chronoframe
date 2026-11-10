<script setup lang="ts">
// Adapted from React Bits BorderGlow, copyright (c) 2026 David Haz.
// MIT + Commons Clause: see ../../third-party/react-bits-LICENSE.md.
// https://reactbits.dev/components/border-glow
const props = withDefaults(
  defineProps<{
    active?: boolean
    animated?: boolean
    edgeSensitivity?: number
    glowIntensity?: number
  }>(),
  { active: true, animated: false, edgeSensitivity: 30, glowIntensity: 0.65 },
)
const card = useTemplateRef<HTMLElement>('card')
let frame = 0
let motion: MediaQueryList | undefined
const variables = computed(() => ({
  '--glow-intensity': Math.max(0, Math.min(3, props.glowIntensity)),
}))
function reset() {
  cancelAnimationFrame(frame)
  card.value?.style.setProperty('--edge-opacity', '0')
}
function move(event: PointerEvent) {
  if (!props.active || event.pointerType === 'touch' || motion?.matches) return
  cancelAnimationFrame(frame)
  const element = card.value
  if (!element) return
  const rect = element.getBoundingClientRect()
  const dx = event.clientX - rect.left - rect.width / 2
  const dy = event.clientY - rect.top - rect.height / 2
  const proximity =
    Math.max(
      Math.abs(dx) / (rect.width / 2),
      Math.abs(dy) / (rect.height / 2),
    ) * 100
  const sensitivity = Math.max(0, Math.min(95, props.edgeSensitivity))
  element.style.setProperty(
    '--edge-opacity',
    String(
      Math.max(0, Math.min(1, (proximity - sensitivity) / (100 - sensitivity))),
    ),
  )
  element.style.setProperty(
    '--cursor-angle',
    `${(Math.atan2(dy, dx) * 180) / Math.PI + 90}deg`,
  )
}
onMounted(() => {
  motion = window.matchMedia('(prefers-reduced-motion: reduce)')
  motion.addEventListener('change', reset)
  if (!props.animated || !props.active || motion.matches) return
  const started = performance.now()
  function sweep(now: number) {
    const progress = Math.min(1, (now - started) / 1800)
    card.value?.style.setProperty(
      '--cursor-angle',
      `${110 + progress * 355}deg`,
    )
    card.value?.style.setProperty(
      '--edge-opacity',
      String(Math.sin(progress * Math.PI) * 0.8),
    )
    if (progress < 1) frame = requestAnimationFrame(sweep)
  }
  frame = requestAnimationFrame(sweep)
})
watch(
  () => props.active,
  (value) => {
    if (!value) reset()
  },
)
onBeforeUnmount(() => {
  cancelAnimationFrame(frame)
  motion?.removeEventListener('change', reset)
})
</script>
<template>
  <div
    ref="card"
    class="cf-card cf-border-glow"
    :class="{ 'cf-border-glow--active': active }"
    :style="variables"
    @pointermove="move"
    @pointerleave="reset"
  >
    <span
      class="cf-border-glow__edge"
      aria-hidden="true"
    />
    <div class="cf-border-glow__content"><slot /></div>
  </div>
</template>
<style scoped>
.cf-border-glow {
  --edge-opacity: 0;
  --cursor-angle: 45deg;
  --glow-mesh:
    radial-gradient(at 8% 6%, var(--accent), transparent 55%),
    radial-gradient(at 80% 55%, var(--cf-link), transparent 55%),
    radial-gradient(at 40% 90%, var(--success), transparent 55%);
  position: relative;
  isolation: isolate;
  min-width: 0;
  border: 1px solid var(--border);
  background: var(--card);
  color: var(--card-foreground);
  border-radius: 12px;
  overflow: visible;
}
.cf-border-glow::before,
.cf-border-glow::after,
.cf-border-glow__edge {
  content: '';
  position: absolute;
  inset: -1px;
  border-radius: inherit;
  pointer-events: none;
  opacity: 0;
  transition: opacity 400ms ease;
}
.cf-border-glow--active::before {
  padding: 1px;
  background: var(--glow-mesh), var(--accent);
  mask:
    linear-gradient(#fff 0 0) content-box,
    linear-gradient(#fff 0 0);
  mask-composite: exclude;
  opacity: var(--edge-opacity);
}
.cf-border-glow--active::after {
  background: var(--glow-mesh);
  opacity: calc(var(--edge-opacity) * 0.07);
}
.cf-border-glow--active .cf-border-glow__edge {
  inset: -12px;
  padding: 12px;
  mask-image: conic-gradient(
    from var(--cursor-angle),
    #000 2.5%,
    transparent 15%,
    transparent 85%,
    #000 97.5%
  );
  opacity: calc(var(--edge-opacity) * var(--glow-intensity));
}
.cf-border-glow__edge::before {
  content: '';
  position: absolute;
  inset: 12px;
  border-radius: inherit;
  box-shadow:
    inset 0 0 0 1px var(--accent),
    inset 0 0 8px color-mix(in srgb, var(--accent) 40%, transparent),
    0 0 18px color-mix(in srgb, var(--accent) 25%, transparent);
}
.cf-border-glow__content {
  position: relative;
  z-index: 1;
  min-width: 0;
}
.cf-border-glow--active:focus-within {
  --edge-opacity: 0.7 !important;
}
@media (prefers-reduced-motion: reduce) {
  .cf-border-glow::before,
  .cf-border-glow::after,
  .cf-border-glow__edge {
    transition: none;
  }
}
</style>
