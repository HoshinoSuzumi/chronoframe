<script lang="ts">
export interface ProviderOption {
  label: string
  value: string
  icon?: string
  description?: string
}
</script>

<script setup lang="ts">
defineProps<{
  modelValue: string
  options: ProviderOption[]
}>()

defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()
</script>

<template>
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
    <div
      v-for="option in options"
      :key="option.value"
      class="relative cursor-pointer group rounded-xl border p-4 transition-all duration-200"
      :class="[
        modelValue === option.value
          ? 'bg-primary-500/10 border-primary-500 ring-1 ring-primary-500/50'
          : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20',
      ]"
      @click="$emit('update:modelValue', option.value)"
    >
      <div class="flex items-start justify-between mb-3">
        <div
          v-if="option.icon"
          class="size-10 flex items-center justify-center rounded-lg transition-colors"
          :class="
            modelValue === option.value
              ? 'bg-primary-500 text-white'
              : 'bg-white/10 text-neutral-400 group-hover:text-white'
          "
        >
          <UIcon
            :name="option.icon"
            class="size-6"
          />
        </div>
        <div
          v-if="modelValue === option.value"
          class="text-primary-400"
        >
          <UIcon
            name="tabler:circle-check"
            class="size-6"
          />
        </div>
      </div>

      <h3 class="font-medium text-white mb-1">
        {{ $t(option.label) || option.label }}
      </h3>
      <p
        v-if="option.description"
        class="text-xs text-neutral-400 leading-relaxed"
      >
        {{ $t(option.description) || option.description }}
      </p>
    </div>
  </div>
</template>
