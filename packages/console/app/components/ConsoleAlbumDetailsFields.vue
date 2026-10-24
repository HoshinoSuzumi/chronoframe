<script setup lang="ts">
import { ALBUM_SLUG_MAX_LENGTH } from '@chronoframe/contracts/album-slug'

defineProps<{
  showSlug?: boolean
  currentSlug?: string
}>()

const title = defineModel<string>('title', { required: true })
const description = defineModel<string>('description', { required: true })
const slug = defineModel<string>('slug')
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

    <UFormField
      v-if="showSlug"
      :label="$t('dashboard.albums.form.slug')"
      :description="$t('dashboard.albums.form.slugHint')"
      name="slug"
    >
      <UInput
        v-model="slug"
        class="w-full"
        :maxlength="ALBUM_SLUG_MAX_LENGTH"
        :placeholder="$t('dashboard.albums.form.slugPlaceholder')"
      />
      <p
        v-if="currentSlug"
        class="mt-1 text-xs text-muted"
      >
        {{ $t('dashboard.albums.form.slugCurrent') }}: /albums/{{ currentSlug }}
      </p>
    </UFormField>
  </div>
</template>
