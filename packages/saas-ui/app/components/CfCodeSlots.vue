<script setup lang="ts">
// Vue adaptation of the React Bits CodeSlots interaction: one accessible native
// input, with decorative animated slots. The native value remains available to
// password managers, mobile OTP autofill, keyboard selection and form validation.
defineOptions({ inheritAttrs: false })
const props = withDefaults(
  defineProps<{
    id?: string
    length?: number
    ariaLabel: string
    status?: 'idle' | 'error' | 'success'
    disabled?: boolean
    autofocus?: boolean
  }>(),
  { length: 6, status: 'idle', disabled: false, autofocus: false },
)
const model = defineModel<string>({ default: '' })
const emit = defineEmits<{ complete: [code: string]; edit: [] }>()
const input = useTemplateRef<{ inputRef: HTMLInputElement }>('input')
const nativeInput = computed(() => input.value?.inputRef)
const uid = useId()
const focused = ref(false)
const active = ref(0)
let drain: ReturnType<typeof setTimeout> | undefined
const digits = (value: string) =>
  value.replace(/\D/g, '').slice(0, props.length)
const slots = computed(() =>
  Array.from({ length: props.length }, (_, i) => digits(model.value)[i] ?? ''),
)
function stopDrain() {
  clearTimeout(drain)
}
function commit(value: string) {
  if (props.disabled || props.status === 'success') return
  stopDrain()
  const next = digits(value)
  const changed = next !== model.value
  emit('edit')
  model.value = next
  active.value = Math.min(next.length, props.length - 1)
  if (changed && next.length === props.length) emit('complete', next)
}
function onInput(event: Event) {
  const target = event.target as HTMLInputElement
  commit(target.value)
  target.value = model.value
  active.value = Math.min(
    target.selectionStart ?? model.value.length,
    props.length - 1,
  )
}
function onPaste(event: ClipboardEvent) {
  if (props.disabled || props.status === 'success') return
  event.preventDefault()
  const value = digits(event.clipboardData?.getData('text') ?? '')
  if (!value) return
  // Full pasted/autofilled codes replace the entire value, including formatting.
  const start = nativeInput.value?.selectionStart ?? model.value.length
  const end = nativeInput.value?.selectionEnd ?? start
  commit(
    value.length === props.length
      ? value
      : model.value.slice(0, start) + value + model.value.slice(end),
  )
  nextTick(() =>
    nativeInput.value?.setSelectionRange(active.value + 1, active.value + 1),
  )
}
function selectSlot(event: PointerEvent) {
  if (props.disabled || props.status === 'success') return
  const rect =
    event.currentTarget instanceof HTMLElement
      ? event.currentTarget.getBoundingClientRect()
      : null
  if (!rect) return
  event.preventDefault()
  const position = Math.min(
    model.value.length,
    props.length - 1,
    Math.max(
      0,
      Math.floor((event.clientX - rect.left) / (rect.width / props.length)),
    ),
  )
  nativeInput.value?.focus()
  nativeInput.value?.setSelectionRange(
    position,
    Math.min(position + 1, model.value.length),
  )
  active.value = position
}
function syncCaret() {
  active.value = Math.min(
    nativeInput.value?.selectionStart ?? 0,
    props.length - 1,
  )
}
watch(
  () => props.status,
  (status) => {
    stopDrain()
    if (status === 'error')
      drain = setTimeout(() => {
        model.value = ''
        active.value = 0
      }, 450)
  },
)
watch(model, (value) => {
  if (!value) active.value = 0
})
onBeforeUnmount(stopDrain)
onMounted(() => {
  if (props.autofocus) nativeInput.value?.focus()
})
defineExpose({ focus: () => nativeInput.value?.focus() })
</script>

<template>
  <div
    class="cf-code-slots"
    :data-status="status"
    :data-disabled="disabled || undefined"
    :style="{ '--code-length': length }"
    @pointerdown="selectSlot"
  >
    <UInput
      :id="id ?? uid"
      ref="input"
      v-bind="$attrs"
      class="cf-code-slots__input"
      type="text"
      inputmode="numeric"
      autocomplete="one-time-code"
      :pattern="`[0-9]{${length}}`"
      :maxlength="length"
      :model-value="model"
      :aria-label="ariaLabel"
      :aria-invalid="status === 'error'"
      :disabled="disabled"
      :readonly="status === 'success'"
      @input="onInput"
      @paste="onPaste"
      @focus="focused = true"
      @blur="focused = false"
      @keyup="syncCaret"
      @select="syncCaret"
    />
    <span
      v-for="(digit, index) in slots"
      :key="index"
      class="cf-code-slots__slot"
      :data-active="
        (focused && active === index && status === 'idle') || undefined
      "
      aria-hidden="true"
    >
      <span
        v-if="digit"
        :key="digit"
        class="cf-code-slots__fill"
        :style="{ '--code-delay': `${index * 20}ms` }"
      />
      <span
        v-if="digit"
        :key="`digit-${digit}`"
        class="cf-code-slots__digit"
        >{{ digit }}</span
      >
      <span
        v-if="focused && active === index && !digit"
        class="cf-code-slots__caret"
      />
    </span>
    <span
      class="cf-code-slots__wash"
      aria-hidden="true"
      ><svg
        viewBox="0 0 24 24"
        width="24"
        height="24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="m5 12 4 4L19 6" /></svg
    ></span>
  </div>
</template>

<style scoped>
.cf-code-slots {
  position: relative;
  display: grid;
  grid-template-columns: repeat(var(--code-length), minmax(0, 1fr));
  gap: clamp(5px, 1.5vw, 10px);
  width: 100%;
  max-width: 350px;
  isolation: isolate;
  direction: ltr;
}
.cf-code-slots__input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 3;
  opacity: 0;
  font-size: 16px;
  cursor: text;
}
.cf-code-slots__input :deep(input) {
  width: 100%;
  height: 100%;
  font-size: 16px;
}
.cf-code-slots__slot {
  position: relative;
  display: grid;
  place-items: center;
  aspect-ratio: 0.85;
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--input);
  border-radius: 10px;
  background: var(--card);
  transition:
    border-color 0.2s,
    background 0.2s,
    box-shadow 0.2s;
}
.cf-code-slots__slot[data-active] {
  border-color: var(--ring);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--ring) 18%, transparent);
}
.cf-code-slots__fill {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: var(--secondary);
  animation: code-land 0.3s cubic-bezier(0.2, 0.8, 0.3, 1.1) both;
  animation-delay: var(--code-delay);
}
.cf-code-slots__digit {
  position: relative;
  color: var(--foreground);
  font: 550 clamp(20px, 5vw, 26px)/1 var(--cf-font);
  font-variant-numeric: tabular-nums;
  animation: code-rise 0.25s ease-out both;
}
.cf-code-slots__caret {
  height: 25px;
  width: 2px;
  background: var(--accent);
  animation: code-blink 1s step-end infinite;
}
.cf-code-slots__wash {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: grid;
  place-items: center;
  background: var(--primary);
  color: var(--primary-foreground);
  border-radius: 10px;
  opacity: 0;
  transform: scaleX(0.7);
  pointer-events: none;
  transition:
    opacity 0.25s,
    transform 0.3s;
}
.cf-code-slots[data-status='success'] .cf-code-slots__wash {
  opacity: 1;
  transform: scaleX(1);
}
.cf-code-slots[data-status='error'] .cf-code-slots__slot {
  border-color: var(--destructive);
}
.cf-code-slots[data-status='error'] .cf-code-slots__fill {
  background: color-mix(in srgb, var(--destructive) 18%, var(--card));
  animation: code-drain 0.4s ease-in forwards;
  animation-delay: calc((var(--code-length) - 1) * 20ms - var(--code-delay));
}
.cf-code-slots[data-disabled] {
  opacity: 0.6;
}
@keyframes code-land {
  from {
    transform: scale(0.5);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}
@keyframes code-rise {
  from {
    transform: translateY(8px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}
@keyframes code-drain {
  to {
    transform: scale(0.6);
    opacity: 0;
  }
}
@keyframes code-blink {
  50% {
    opacity: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation: none !important;
    transition: none !important;
  }
}
</style>
