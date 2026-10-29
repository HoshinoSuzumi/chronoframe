<script setup lang="ts" generic="T">
import type { TableColumn } from '@nuxt/ui'
defineOptions({ inheritAttrs: false })
defineProps<{ data?: T[]; columns?: TableColumn<T>[] }>()
</script>
<template>
  <UTable
    v-if="data"
    v-bind="$attrs"
    :data="data"
    :columns="columns"
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
