<script setup lang="ts" generic="T">
import type { TableColumn } from '@nuxt/ui'
defineOptions({ inheritAttrs: false })
defineProps<{ data: T[]; columns: TableColumn<T>[] }>()
const table = ref()
defineExpose({
  get tableApi() {
    return table.value?.tableApi
  },
})
</script>
<template>
  <ConsoleMediaTable
    ref="table"
    v-bind="$attrs"
    :data="data"
    :columns="columns"
    sticky
    :column-pinning="{ right: ['actions'] }"
    class="h-full flex-1"
    :ui="{
      root: 'font-sans relative scroll-smooth h-full overflow-auto min-w-0',
      base: 'min-w-full table-fixed',
      thead:
        'bg-neutral-50/80 dark:bg-neutral-900/80 backdrop-blur-md sticky top-0 z-10 whitespace-nowrap',
      tbody:
        'divide-y divide-neutral-200/80 dark:divide-neutral-800/80 bg-white dark:bg-neutral-900',
      tr: 'hover:bg-neutral-50/50 dark:hover:bg-neutral-800/50 transition-colors data-[selected=true]:bg-primary-50/50 dark:data-[selected=true]:bg-primary-900/20',
      th: 'px-4 py-3.5 text-left rtl:text-right text-neutral-500 dark:text-neutral-400 font-medium text-sm whitespace-nowrap',
      td: 'px-4 py-4 text-neutral-700 dark:text-neutral-300 text-sm whitespace-nowrap',
      separator: 'bg-neutral-200/80 dark:bg-neutral-800/80',
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
  </ConsoleMediaTable>
</template>
