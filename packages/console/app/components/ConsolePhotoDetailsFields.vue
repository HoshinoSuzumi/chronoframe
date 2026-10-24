<script setup lang="ts">
const title = defineModel<string>('title', { required: true })
const description = defineModel<string>('description', { required: true })
const tags = defineModel<string[]>('tags', { required: true })
const rating = defineModel<number | null>('rating', { required: true })
</script>
<template>
  <div class="space-y-5">
    <UFormField
      :label="$t('dashboard.photos.editModal.fields.title')"
      name="title"
    >
      <UInput
        v-model="title"
        class="w-full"
      />
    </UFormField>

    <UFormField
      :label="$t('dashboard.photos.editModal.fields.description')"
      name="description"
    >
      <UTextarea
        v-model="description"
        :rows="3"
        class="w-full"
      />
    </UFormField>

    <div class="space-y-2">
      <UFormField
        :label="$t('dashboard.photos.editModal.fields.tags')"
        name="tags"
      >
        <UInputTags
          v-model="tags"
          class="w-full"
        />
      </UFormField>
      <p class="text-xs text-neutral-500 dark:text-neutral-400">
        {{ $t('dashboard.photos.editModal.fields.tagsHint') }}
      </p>
    </div>

    <div class="flex items-center justify-between space-y-2">
      <label class="text-sm font-medium text-neutral-700 dark:text-neutral-200">
        {{ $t('dashboard.photos.editModal.fields.rating') }}
      </label>
      <div class="flex items-center gap-3">
        <span
          v-if="rating"
          class="text-sm text-neutral-600 dark:text-neutral-400"
        >
          {{ rating }} / 5
        </span>
        <span
          v-else
          class="text-sm text-neutral-500 dark:text-neutral-500"
        >
          {{ $t('dashboard.photos.editModal.fields.noRating') }}
        </span>
        <Rating
          :model-value="rating || 0"
          :allow-half="false"
          size="lg"
          @update:model-value="rating = $event || null"
        />
      </div>
    </div>
  </div>
</template>
