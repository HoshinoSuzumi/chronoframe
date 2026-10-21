<script setup lang="ts">
defineOptions({
  inheritAttrs: false,
})

const props = defineProps<{
  modelValue?: boolean
}>()

const emit = defineEmits(['update:modelValue'])

const value = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
})
</script>

<template>
  <UCheckbox
    v-bind="$attrs"
    v-model="value"
    :ui="{
      base: 'border-white/10 bg-white/5 data-[state=checked]:bg-primary-500 data-[state=checked]:border-primary-500 text-white',
      label: 'text-neutral-300 font-medium',
    }"
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
  </UCheckbox>
</template>
