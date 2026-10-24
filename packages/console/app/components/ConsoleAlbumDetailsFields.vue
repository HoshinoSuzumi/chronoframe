<script setup lang="ts">
const title = defineModel<string>('title', { required: true })
const description = defineModel<string>('description', { required: true })
</script>
<template>
  <div class="space-y-4">
    <UFormField
      :label="$t('dashboard.albums.form.title')"
      name="title"
      required
    >
      <UInput
        v-model="title"
        class="w-full"
        :placeholder="$t('dashboard.albums.form.titlePlaceholder')"
      />
    </UFormField>

    <UFormField
      :label="$t('dashboard.albums.form.description')"
      name="description"
    >
      <UTextarea
        v-model="description"
        class="w-full"
        :placeholder="$t('dashboard.albums.form.descriptionPlaceholder')"
        :rows="3"
      />
    </UFormField>
  </div>
</template>
