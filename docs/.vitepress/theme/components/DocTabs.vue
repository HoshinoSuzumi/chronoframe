<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, useId } from 'vue'

const props = defineProps<{
  tabs: { id: string; label: string }[]
  label: string
}>()
const instanceId = useId()
const active = ref(props.tabs[0]?.id)
const root = ref<HTMLElement>()

async function navigate(event: KeyboardEvent, index: number) {
  let next = index
  if (event.key === 'ArrowRight') next = (index + 1) % props.tabs.length
  else if (event.key === 'ArrowLeft')
    next = (index - 1 + props.tabs.length) % props.tabs.length
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = props.tabs.length - 1
  else return
  event.preventDefault()
  active.value = props.tabs[next].id
  await nextTick()
  root.value?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus()
}

function revealHash() {
  let hash: string
  try {
    hash = decodeURIComponent(window.location.hash.slice(1))
  } catch {
    return
  }
  if (!hash) return
  const target = document.getElementById(hash)
  const panel = target?.closest<HTMLElement>('[data-doc-tab]')
  if (panel && root.value?.contains(panel)) {
    active.value = panel.dataset.docTab
    nextTick(() => target?.scrollIntoView())
  }
}
onMounted(() => {
  revealHash()
  window.addEventListener('hashchange', revealHash)
})
onBeforeUnmount(() => window.removeEventListener('hashchange', revealHash))
</script>

<template>
  <div
    ref="root"
    class="doc-tabs"
  >
    <div
      class="doc-tab-list"
      role="tablist"
      :aria-label="label"
    >
      <button
        v-for="(tab, index) in tabs"
        :id="`${instanceId}-tab-${tab.id}`"
        :key="tab.id"
        type="button"
        role="tab"
        :aria-selected="active === tab.id"
        :aria-controls="`${instanceId}-panel-${tab.id}`"
        :tabindex="active === tab.id ? 0 : -1"
        @click="active = tab.id"
        @keydown="navigate($event, index)"
      >
        {{ tab.label }}
      </button>
    </div>
    <div
      v-for="tab in tabs"
      v-show="active === tab.id"
      :id="`${instanceId}-panel-${tab.id}`"
      :key="tab.id"
      :data-doc-tab="tab.id"
      role="tabpanel"
      :aria-labelledby="`${instanceId}-tab-${tab.id}`"
      tabindex="0"
      class="doc-tab-panel"
    >
      <slot :name="tab.id" />
    </div>
  </div>
</template>

<style scoped>
.doc-tabs {
  margin: 20px 0 28px;
}
.doc-tab-list {
  display: flex;
  gap: 4px;
  overflow-x: auto;
  padding: 4px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  background: var(--vp-c-bg-soft);
}
.doc-tab-list button {
  flex: 0 0 auto;
  padding: 7px 14px;
  border-radius: 6px;
  color: var(--vp-c-text-2);
  font-size: 14px;
  font-weight: 500;
  line-height: 24px;
  cursor: pointer;
}
.doc-tab-list button:hover {
  color: var(--vp-c-brand-1);
}
.doc-tab-list button[aria-selected='true'] {
  color: var(--vp-c-brand-1);
  background: var(--vp-c-bg);
  box-shadow: 0 1px 4px rgb(0 0 0 / 8%);
}
.doc-tab-list button:focus-visible,
.doc-tab-panel:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}
.doc-tab-panel {
  padding-top: 4px;
}
</style>
