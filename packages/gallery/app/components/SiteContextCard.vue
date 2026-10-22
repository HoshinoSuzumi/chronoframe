<script setup lang="ts">
const context = useEntryContext()
const capabilities = computed(() => context.value?.capabilities)
</script>
<template>
  <section
    v-if="context"
    aria-label="Site details"
    class="space-y-4"
  >
    <h1 class="text-3xl font-semibold">{{ context.name }}</h1>
    <p>{{ context.published ? 'Published' : 'Not published' }}</p>
    <p v-if="context.audience === 'portal'">Your role: {{ context.role }}</p>
    <p v-if="!capabilities?.mediaManagement">
      Photo management and publishing setup are coming in the next stage.
    </p>
  </section>
</template>
