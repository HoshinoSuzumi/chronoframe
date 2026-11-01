<script setup lang="ts">
type PageLink = { title: string; href?: string; kind?: string }
type PageRow = {
  label: string
  page?: { site: PageLink; segments: PageLink[] }
}
const props = defineProps<{
  row: PageRow
  admin?: boolean
  zh?: boolean
}>()
const parts = computed(() =>
  props.row.page
    ? [
        ...(props.admin ? [props.row.page.site] : []),
        ...props.row.page.segments,
        ...(props.admin && !props.row.page.segments.length
          ? [
              {
                title: props.zh ? '首页' : 'Home',
                href: props.row.page.site.href,
              },
            ]
          : []),
      ]
    : [],
)
</script>
<template>
  <span
    v-if="row.page"
    class="cf-page-links"
  >
    <template v-if="!parts.length"
      ><a
        v-if="row.page.site.href"
        :href="row.page.site.href"
        target="_blank"
        rel="noopener noreferrer"
        >{{ zh ? '首页' : 'Home' }}</a
      ><span v-else>{{ zh ? '首页' : 'Home' }}</span></template
    >
    <template
      v-for="(part, index) in parts"
      :key="index"
    >
      <span v-if="!admin || index > 0">/</span>
      <a
        v-if="part.href"
        :href="part.href"
        target="_blank"
        rel="noopener noreferrer"
        >{{ part.kind === 'albums' && zh ? '相簿' : part.title }}</a
      >
      <span v-else>{{
        part.kind === 'albums' && zh ? '相簿' : part.title
      }}</span>
    </template>
  </span>
  <span v-else>{{
    row.label === '/' ? (zh ? '首页' : 'Home') : row.label
  }}</span>
</template>
<style scoped>
.cf-page-links a {
  color: var(--cf-link);
  font-weight: 500;
  text-decoration: none;
}
.cf-page-links a:hover {
  text-decoration: underline;
}
</style>
