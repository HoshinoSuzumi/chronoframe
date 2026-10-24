<script setup lang="ts">
import type { Album, Photo } from '@chronoframe/contracts/resources'
const route = useRoute(),
  context = useEntryContext(),
  id = Number(route.params.albumId)
const password = ref(''),
  failed = ref(false),
  busy = ref(false)
const { data, error, refresh } = await useFetch<{
  album: Album & { photos: Photo[] }
}>(`/api/public/albums/${id}`, {
  key: `public-album-${context.value?.scope}-${id}`,
})
async function unlock() {
  busy.value = true
  failed.value = false
  try {
    await $fetch(`/api/public/albums/${id}/unlock`, {
      method: 'POST',
      body: { password: password.value },
    })
    password.value = ''
    await refresh()
  } catch {
    failed.value = true
  } finally {
    busy.value = false
  }
}
useSeoMeta({
  title: () => data.value?.album.title ?? 'Album',
  robots: 'noindex',
})
</script>
<template>
  <section>
    <h1>{{ data?.album.title || 'Album' }}</h1>
    <template v-if="error"
      ><form
        v-if="error.statusCode === 403"
        class="site-unlock"
        @submit.prevent="unlock"
      >
        <label
          >Album password
          <input
            v-model="password"
            type="password"
            required
            autocomplete="current-password" /></label
        ><button
          type="submit"
          :disabled="busy"
        >
          Unlock album
        </button>
      </form>
      <p
        v-else
        role="alert"
      >
        This album is unavailable.
      </p>
      <p
        v-if="failed"
        role="alert"
      >
        The password was not accepted. Please try again.
      </p></template
    ><GalleryGrid
      v-else-if="data"
      :photos="data.album.photos"
    />
  </section>
</template>
