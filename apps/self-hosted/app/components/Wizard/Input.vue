<script setup lang="ts">
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
      base: 'w-full bg-white/5 border border-white/10 text-white placeholder:text-neutral-500 focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all duration-200 rounded-lg',
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
