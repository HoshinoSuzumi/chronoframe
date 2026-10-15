<script setup lang="ts">
defineProps<{ number: string; label: string }>()
</script>

<template>
  <section
    class="doc-step"
    :aria-label="label"
  >
    <span
      class="step-number"
      aria-hidden="true"
      >{{ number }}</span
    >
    <div class="step-body"><slot /></div>
  </section>
</template>

<style scoped>
.doc-step {
  position: relative;
  padding: 0 0 12px 44px;
  margin: 24px 0;
  border-left: 1px solid var(--vp-c-divider);
}
.step-number {
  position: absolute;
  left: -16px;
  top: 0;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--vp-c-brand-1);
  border-radius: 50%;
  color: var(--vp-c-brand-1);
  background: var(--vp-c-bg);
  font-size: 14px;
  font-weight: 600;
}
.step-body {
  min-width: 0;
  display: flow-root;
}
.step-body :deep(h2:first-child) {
  margin-top: 0;
  padding-top: 0;
  border-top: 0;
}
@media (max-width: 640px) {
  .doc-step {
    margin-left: 16px;
    padding-left: 28px;
  }
}
</style>
