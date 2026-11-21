<script setup lang="ts">
import { wizardFieldBase } from './field-style'

defineOptions({
  inheritAttrs: false,
})

const props = defineProps<{
  modelValue?: string | number
}>()

const emit = defineEmits(['update:modelValue'])

const value = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
})
</script>

<template>
  <UInput
    v-bind="$attrs"
    v-model="value"
    :ui="{
      root: 'relative w-full',
      base: wizardFieldBase,
      padding: { sm: 'px-3 py-2.5', md: 'px-4 py-3', lg: 'px-5 py-4' },
      variant: {
        outline: 'shadow-sm',
      },
    }"
    variant="none"
  >
    <template
      v-for="(_, name) in $slots"
      #[name]="slotData"
    >
      <slot
        :name="name"
        v-bind="slotData"
      />
    </template>
  </UInput>
</template>
