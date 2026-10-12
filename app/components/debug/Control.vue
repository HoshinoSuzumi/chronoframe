<script setup lang="ts">
import type { DebugControl, DebugValue } from '~/types/debug'
const props = defineProps<{ control: DebugControl }>()
const store = useDebugStore()
const value = computed(() =>
  store.get(props.control.key, props.control.default ?? ''),
)
function update(next: DebugValue) {
  store.set(props.control.key, next)
}
</script>
<template>
  <div class="flex min-h-8 min-w-0 items-center justify-between gap-3">
    <span class="text-xs text-muted">{{ control.label }}</span>
    <USwitch
      v-if="control.type === 'switch'"
      :model-value="Boolean(value)"
      :aria-label="control.label"
      :disabled="control.disabled"
      size="sm"
      @update:model-value="update"
    />
    <USelect
      v-else-if="control.type === 'select'"
      :model-value="value as string | number"
      :items="control.options"
      :ui="{ content: 'z-[10010]' }"
      :aria-label="control.label"
      :disabled="control.disabled"
      class="w-40"
      size="xs"
      @update:model-value="update"
    />
    <UInput
      v-else-if="control.type === 'number'"
      :model-value="value as number"
      type="number"
      :min="control.min"
      :max="control.max"
      :step="control.step"
      :aria-label="control.label"
      :disabled="control.disabled"
      class="w-28"
      size="xs"
      @update:model-value="
        (next) => {
          const n = Number(next)
          if (Number.isFinite(n))
            update(
              Math.max(
                control.min ?? -Infinity,
                Math.min(control.max ?? Infinity, n),
              ),
            )
        }
      "
    />
    <UInput
      v-else-if="control.type === 'text'"
      :model-value="String(value)"
      :aria-label="control.label"
      :disabled="control.disabled"
      class="w-40"
      size="xs"
      @update:model-value="update"
    />
    <UButton
      v-else-if="control.type === 'action'"
      :label="control.label"
      size="xs"
      variant="soft"
      :disabled="control.disabled"
      @click="control.action?.()"
    />
    <span
      v-else
      class="max-w-[60%] break-all text-xs font-mono"
      >{{ control.value ?? value }}</span
    >
  </div>
</template>
