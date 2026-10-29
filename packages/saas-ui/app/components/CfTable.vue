<script setup lang="ts" generic="T">
import type { TableColumn } from '@nuxt/ui'
import { computed } from 'vue'
defineOptions({ inheritAttrs: false })
const props = defineProps<{ data?: T[]; columns?: TableColumn<T>[] }>()
function actionClass<C>(
  value: string | ((cell: C) => string) | undefined,
  pinned: string,
) {
  return (cell: C) =>
    [typeof value === 'function' ? value(cell) : value, pinned]
      .filter(Boolean)
      .join(' ')
}
const renderedColumns = computed(() =>
  props.columns?.map((column) =>
    column.id === 'actions'
      ? {
          ...column,
          meta: {
            ...column.meta,
            class: {
              ...column.meta?.class,
              th: actionClass(
                column.meta?.class?.th,
                'cf-table-actions sticky right-0 z-20',
              ),
              td: actionClass(
                column.meta?.class?.td,
                'cf-table-actions sticky right-0 z-10',
              ),
            },
          },
        }
      : column,
  ),
)
</script>
<template>
  <UTable
    v-if="data"
    v-bind="$attrs"
    :data="data"
    :columns="renderedColumns"
    :ui="{
      root: 'cf-data-table',
      base: 'cf-table table-auto border-collapse',
      th: 'cf-table-heading bg-[var(--secondary)] text-[var(--muted-foreground)] text-xs font-medium px-4 py-3',
      td: 'cf-table-cell text-[var(--foreground)] text-[13px] px-4 py-3',
    }"
  >
    <template
      v-for="(_, name) in $slots"
      #[name]="slotData"
      ><slot
        :name="name"
        v-bind="slotData"
    /></template>
  </UTable>
  <table
    v-else
    v-bind="$attrs"
    class="cf-table"
  >
    <slot />
  </table>
</template>
