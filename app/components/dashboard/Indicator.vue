<script lang="ts" setup>
import { isNil } from 'es-toolkit'

const props = withDefaults(
  defineProps<{
    title?: string
    value?: string | number
    icon?: string
    color?: keyof typeof colorSchemes
    clickable?: boolean
  }>(),
  {
    title: undefined,
    value: undefined,
    icon: undefined,
    color: 'blue',
    clickable: false,
  },
)

const emit = defineEmits<{
  click: []
}>()

const colorSchemes = {
  blue: {
    background:
      'bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-950/70 dark:to-cyan-950/70',
    border: 'border-cyan-100 dark:border-cyan-900',
    text: 'text-blue-400 dark:text-white',
  },
  green: {
    background:
      'bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/70 dark:to-emerald-950/70',
    border: 'border-emerald-100 dark:border-emerald-900',
    text: 'text-green-400 dark:text-white',
  },
  purple: {
    background:
      'bg-gradient-to-r from-purple-50 to-violet-50 dark:from-purple-950/70 dark:to-violet-950/70',
    border: 'border-violet-100 dark:border-violet-900',
    text: 'text-purple-400 dark:text-white',
  },
  orange: {
    background:
      'bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-950/70 dark:to-amber-950/70',
    border: 'border-amber-100 dark:border-amber-900',
    text: 'text-orange-400 dark:text-white',
  },
  red: {
    background:
      'bg-gradient-to-r from-red-50 to-rose-50 dark:from-red-950/70 dark:to-rose-950/70',
    border: 'border-rose-100 dark:border-rose-900',
    text: 'text-red-400 dark:text-white',
  },
  gray: {
    background:
      'bg-gradient-to-r from-gray-50 to-slate-50 dark:from-gray-950/70 dark:to-slate-950/70',
    border: 'border-slate-100 dark:border-slate-900',
    text: 'text-gray-400 dark:text-white',
  },
  pink: {
    background:
      'bg-gradient-to-r from-pink-50 to-rose-50 dark:from-pink-950/70 dark:to-rose-950/70',
    border: 'border-rose-100 dark:border-rose-900',
    text: 'text-pink-400 dark:text-white',
  },
  yellow: {
    background:
      'bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-950/70 dark:to-amber-950/70',
    border: 'border-amber-100 dark:border-amber-900',
    text: 'text-yellow-400 dark:text-white',
  },
}

const currentScheme = computed(() => colorSchemes[props.color])
</script>

<template>
  <div
    :class="[
      'flex justify-center border rounded-lg p-4',
      currentScheme.background,
      currentScheme.border,
      currentScheme.text,
      clickable
        ? 'cursor-pointer hover:scale-[1.01] transition-transform duration-200'
        : '',
    ]"
    @click="clickable ? emit('click') : undefined"
  >
    <div class="flex-1 flex items-center justify-between gap-4 overflow-hidden">
      <div class="flex-1 overflow-hidden">
        <p
          v-if="title"
          class="text-lg opacity-90 font-medium max-w-48 truncate"
        >
          {{ title }}
        </p>
        <p
          v-if="!isNil(value)"
          class="text-2xl font-bold max-w-full sm:max-w-1/2 truncate"
        >
          {{ value }}
        </p>
      </div>
      <UIcon
        v-if="icon"
        :name="icon"
        class="size-8 opacity-80"
      />
    </div>
  </div>
</template>

<style scoped></style>
