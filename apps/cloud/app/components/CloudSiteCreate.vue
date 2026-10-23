<script setup lang="ts">
import { Plus, ArrowRight } from 'lucide-vue-next'
const open = ref(false)
const name = ref('')
const slug = ref('')
const busy = ref(false)
const error = ref('')
let requestId = ''
watch([name, slug], () => {
  requestId = ''
  error.value = ''
})
const validSlug = computed(() =>
  /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(slug.value),
)
async function show() {
  open.value = true
  await nextTick()
  document.getElementById('site-name')?.focus()
}
async function create() {
  if (busy.value) return
  busy.value = true
  error.value = ''
  requestId ||= crypto.randomUUID()
  try {
    const result = await $fetch<{ site: { siteId: number } }>('/api/sites', {
      method: 'POST',
      body: { name: name.value, slug: slug.value, requestId },
    })
    await navigateTo(`/sites/${result.site.siteId}`)
  } catch (cause) {
    const status = (cause as { statusCode?: number }).statusCode
    error.value =
      status === 409
        ? 'This address is already taken, or this request changed. Choose another address and try again.'
        : status === 400
          ? 'Check the site name and address. This address may be reserved.'
          : status === 403
            ? 'You cannot create another site in this workspace. The preview supports up to 10 sites.'
            : 'Your site could not be created. Please try again.'
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <CloudCard class="cf-settings-card cf-site-create">
    <div class="cf-setting-row">
      <div>
        <h2>Your next perspective</h2>
        <p>
          Create a private draft. You can add photographs and publish in a later
          stage.
        </p>
      </div>
      <CloudButton
        v-if="!open"
        @click="show"
        ><Plus :size="16" />Create site</CloudButton
      >
    </div>
    <form
      v-if="open"
      class="cf-form"
      @submit.prevent="create"
    >
      <div class="cf-field">
        <label for="site-name">Site name</label
        ><CloudInput
          id="site-name"
          v-model="name"
          required
          maxlength="80"
          autocomplete="off"
          :disabled="busy"
        />
      </div>
      <div class="cf-field">
        <label for="site-slug">Site address</label
        ><CloudInput
          id="site-slug"
          v-model="slug"
          required
          minlength="3"
          maxlength="40"
          pattern="[a-z0-9][a-z0-9-]{1,38}[a-z0-9]"
          autocomplete="off"
          autocapitalize="none"
          spellcheck="false"
          aria-describedby="site-address-help"
          :disabled="busy"
        />
        <p
          id="site-address-help"
          class="cf-page-description"
        >
          3–40 lowercase letters, numbers or hyphens; start and end with a
          letter or number. Some addresses are reserved.
        </p>
      </div>
      <p class="cf-site-address">
        {{ slug || 'your-site' }}.site.chronoframe.art
      </p>
      <p class="cf-page-description">
        This address is reserved for your draft. Public access is not enabled
        yet. The address cannot be changed here.
      </p>
      <p
        v-if="error"
        role="alert"
        class="cf-notice"
      >
        {{ error }}
      </p>
      <div class="cf-site-actions">
        <CloudButton
          type="submit"
          :disabled="busy || !name.trim() || !validSlug"
          >{{ busy ? 'Creating…' : 'Create draft'
          }}<ArrowRight :size="15" /></CloudButton
        ><CloudButton
          type="button"
          variant="ghost"
          :disabled="busy"
          @click="open = false"
          >Cancel</CloudButton
        >
      </div>
    </form>
  </CloudCard>
</template>
