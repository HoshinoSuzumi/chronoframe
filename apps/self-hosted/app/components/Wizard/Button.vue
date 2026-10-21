<script setup lang="ts">
defineOptions({
  inheritAttrs: false,
})
</script>

<template>
  <UButton
    v-bind="$attrs"
    :ui="{
      base: 'transition-all duration-300 font-medium',
      rounded: 'rounded-xl',
      variant: {
        solid:
          'bg-linear-to-r from-primary-600 to-primary-500 hover:from-primary-500 hover:to-primary-400 text-white shadow-lg shadow-primary-500/20 hover:shadow-primary-500/40 border border-white/10',
        outline:
          'bg-white/5 hover:bg-white/10 text-white border border-white/10 hover:border-white/20',
        ghost: 'text-neutral-400 hover:text-white hover:bg-white/5',
      },
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
  </UButton>
</template>
