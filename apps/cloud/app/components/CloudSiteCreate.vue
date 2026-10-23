<script setup lang="ts">
import { Plus, ArrowRight, Layers } from 'lucide-vue-next'
defineProps<{ workspaceName?: string }>()
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
async function cancel() {
  open.value = false
  await nextTick()
  document.getElementById('create-site-trigger')?.focus()
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
  <div class="cf-workspace-toolbar">
    <span><Layers :size="15" />{{ workspaceName || 'My workspace' }}</span
    ><CloudButton
      v-if="!open"
      id="create-site-trigger"
      size="sm"
      @click="show"
      ><Plus :size="15" />Create site</CloudButton
    >
  </div>
  <CloudCard
    v-if="open"
    class="cf-create-panel"
  >
    <div class="cf-panel-heading">
      <h2>Create a site</h2>
      <p>
        Start with a private draft. Your address is reserved until publishing is
        available.
      </p>
    </div>
    <form
      class="cf-form"
      @submit.prevent="create"
    >
      <div class="cf-create-fields">
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
            aria-describedby="site-address-help site-address-preview"
            :disabled="busy"
          />
        </div>
      </div>
      <p
        id="site-address-preview"
        class="cf-address-preview"
      >
        {{ slug || 'your-site' }}.site.chronoframe.art
      </p>
      <p
        id="site-address-help"
        class="cf-field-hint"
      >
        Use 3–40 lowercase letters, numbers or hyphens. Some addresses are
        reserved. The address cannot be changed here.
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
          }}<ArrowRight :size="14" /></CloudButton
        ><CloudButton
          type="button"
          variant="ghost"
          :disabled="busy"
          @click="cancel"
          >Cancel</CloudButton
        >
      </div>
    </form>
  </CloudCard>
</template>
