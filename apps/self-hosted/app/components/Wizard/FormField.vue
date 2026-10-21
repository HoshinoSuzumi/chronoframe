<script setup lang="ts">
defineOptions({
  inheritAttrs: false,
})
</script>

<template>
  <UFormField
    v-bind="$attrs"
    :ui="{
      label: 'text-neutral-300 font-medium mb-1.5',
      description: 'text-neutral-500 text-xs mt-1',
      error: 'text-red-400 text-xs mt-1',
      hint: 'text-neutral-500 text-xs',
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
  </UFormField>
</template>
