<script setup lang="ts" generic="T">
import type { TableColumn } from '@nuxt/ui'
defineOptions({ inheritAttrs: false })
defineProps<{ data: T[]; columns?: TableColumn<T>[] }>()
const table = ref()
defineExpose({
  get tableApi() {
    return table.value?.tableApi
  },
})
</script>
<template>
  <UTable
    ref="table"
    v-bind="$attrs"
    :data="data"
    :columns="columns"
    ><template
      v-for="(_, name) in $slots"
      #[name]="slotData"
      ><slot
        :name="name"
        v-bind="slotData" /></template
  ></UTable>
</template>
