<script setup lang="ts">
const props = defineProps<{ siteId: number }>()
const context = useEntryContext()
const {
  data,
  error: loadError,
  refresh,
} = await useFetch(`/api/sites/${props.siteId}/settings`, {
  key: `site-settings-${props.siteId}`,
})
const name = ref(data.value?.site.name ?? '')
const busy = ref(false)
const message = ref('')
const failed = ref(false)
async function reload() {
  await refresh()
  name.value = data.value?.site.name ?? ''
  message.value = ''
}
async function save(unpublish = false) {
  if (!data.value || busy.value) return
  busy.value = true
  message.value = ''
  failed.value = false
  try {
    const result = await $fetch(`/api/sites/${props.siteId}/settings`, {
      method: 'PATCH',
      body: {
        name: unpublish ? data.value.site.name : name.value,
        revision: data.value.site.revision,
        published: unpublish ? false : !!data.value.site.published,
      },
    })
    data.value = { site: { ...result.site, role: data.value.site.role } }
    if (context.value?.siteId === props.siteId)
      context.value = {
        ...context.value,
        name: result.site.name,
        published: !!result.site.published,
      }
    message.value = 'Site settings saved.'
  } catch (cause) {
    failed.value = true
    message.value =
      (cause as { statusCode?: number }).statusCode === 409
        ? 'This site changed in another session. Reload before saving again.'
        : 'Settings could not be saved. Check your access and try again.'
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <CloudCard class="cf-site-settings">
    <div class="cf-panel-heading">
      <h2>General settings</h2>
      <p>The essentials for your gallery.</p>
    </div>
    <div
      v-if="loadError"
      role="alert"
      class="cf-notice"
    >
      Settings could not be loaded.<CloudButton
        variant="ghost"
        @click="reload"
        >Reload settings</CloudButton
      >
    </div>
    <template v-else-if="data">
      <div class="cf-panel-body">
        <div class="cf-readonly-field">
          <span class="cf-field-label">Default address</span>
          <p
            v-if="data.site.slug"
            class="cf-address-preview"
          >
            {{ data.site.slug }}.site.chronoframe.art
          </p>
          <p
            v-else
            class="cf-field-hint"
          >
            This existing site keeps its current domain settings.
          </p>
          <p
            v-if="!data.site.published"
            class="cf-field-hint"
          >
            Reserved for your private draft. Public access is not enabled yet.
          </p>
        </div>
        <form
          v-if="data.site.role === 'admin'"
          class="cf-form"
          @submit.prevent="save()"
        >
          <div class="cf-field">
            <label for="settings-site-name">Site name</label
            ><CloudInput
              id="settings-site-name"
              v-model="name"
              required
              maxlength="80"
              :disabled="busy"
            />
          </div>
          <div class="cf-site-actions">
            <CloudButton
              type="submit"
              :disabled="busy || !name.trim()"
              >{{ busy ? 'Saving…' : 'Save changes' }}</CloudButton
            ><CloudButton
              type="button"
              variant="ghost"
              :disabled="busy"
              @click="reload"
              >Reload settings</CloudButton
            >
          </div>
        </form>
        <p
          v-else
          class="cf-field-hint"
        >
          Only workspace administrators can change these settings.
        </p>
        <p
          v-if="message"
          :role="failed ? 'alert' : 'status'"
          class="cf-notice"
        >
          {{ message }}
        </p>
      </div>
      <div
        v-if="data.site.role === 'admin' && data.site.published"
        class="cf-panel-footer"
      >
        <p>Take this gallery offline.</p>
        <CloudButton
          type="button"
          variant="destructive"
          :disabled="busy"
          @click="save(true)"
          >Unpublish site</CloudButton
        >
      </div>
    </template>
  </CloudCard>
</template>
