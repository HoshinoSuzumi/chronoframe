<script setup lang="ts">
import { ArrowUpRight, Globe, Copy, Check } from 'lucide-vue-next'
const activeContext = useEntryContext()
const context = shallowRef(activeContext.value)
// Preserve the outgoing header, while accepting live updates for this Site only.
watch(activeContext, (next) => {
  if (next?.scope === context.value?.scope) context.value = next
})
const { admin, busy, photos, loading, failed, message, publish } =
  useCloudSiteMedia()
const { data, status, error, refresh } = useFetch<{
  site: { slug: string | null }
}>(`/api/sites/${context.value?.siteId}/settings`)
const host = computed(() =>
  data.value?.site.slug ? `${data.value.site.slug}.site.chronoframe.art` : '',
)
const address = computed(() => (host.value ? `https://${host.value}` : ''))
const copied = ref(false),
  copyError = ref(false),
  unpublishOpen = ref(false),
  unpublishError = ref('')
let copiedTimer: ReturnType<typeof setTimeout> | undefined
onBeforeUnmount(() => clearTimeout(copiedTimer))
async function copyAddress() {
  copied.value = false
  copyError.value = false
  try {
    await navigator.clipboard.writeText(address.value)
    copied.value = true
    clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => {
      copied.value = false
    }, 2500)
  } catch {
    copyError.value = true
  }
}
watch(unpublishOpen, () => {
  unpublishError.value = ''
})
async function unpublish() {
  unpublishError.value = ''
  await publish(false)
  if (failed.value) unpublishError.value = message.value
  if (!context.value?.published) unpublishOpen.value = false
}
</script>
<template>
  <div class="cf-site-page-header">
    <div class="cf-site-heading">
      <h1>Overview</h1>
      <div class="cf-site-publication">
        <CloudBadge :tone="context?.published ? 'success' : 'neutral'">{{
          context?.published ? 'Published' : 'Private draft'
        }}</CloudBadge>
        <span>{{
          context?.published
            ? 'Your gallery is live.'
            : 'Only your workspace can manage this gallery.'
        }}</span>
      </div>
    </div>
    <div class="cf-site-page-actions">
      <CloudButton
        v-if="context?.published && address"
        as-child
        variant="secondary"
        size="sm"
        ><a
          :href="address"
          target="_blank"
          rel="noopener noreferrer"
          >View site<ArrowUpRight :size="14" /></a
      ></CloudButton>
      <CloudButton
        v-if="admin"
        :variant="context?.published ? 'ghost' : 'default'"
        size="sm"
        :disabled="
          busy || loading || !host || (!photos.length && !context?.published)
        "
        :loading="busy"
        @click="context?.published ? (unpublishOpen = true) : publish(true)"
        ><Globe :size="14" />{{
          context?.published ? 'Unpublish' : 'Publish gallery'
        }}</CloudButton
      >
    </div>
    <div class="cf-site-address-block">
      <div
        v-if="address"
        class="cf-site-address-row"
      >
        <span class="cf-site-address-label">{{
          context?.published ? 'Public address' : 'Reserved address'
        }}</span>
        <span class="cf-site-address-value">{{ address }}</span>
        <CloudButton
          variant="ghost"
          size="sm"
          :aria-label="copied ? 'Address copied' : 'Copy site address'"
          @click="copyAddress"
          ><Check
            v-if="copied"
            :size="14"
          /><Copy
            v-else
            :size="14"
          />{{ copied ? 'Copied' : 'Copy link' }}</CloudButton
        >
      </div>
      <p
        v-else-if="status === 'pending'"
        class="cf-draft-hint"
      >
        Loading site address…
      </p>
      <p
        v-else-if="error"
        class="cf-draft-hint"
        role="alert"
      >
        Site address could not be loaded.<CloudButton
          variant="ghost"
          size="sm"
          @click="refresh()"
          >Retry</CloudButton
        >
      </p>
      <p
        v-else
        class="cf-draft-hint"
      >
        No default address is available for this site.
      </p>
      <p
        v-if="!context?.published"
        class="cf-draft-hint"
      >
        This address returns 404 until you publish your gallery.
        {{
          loading
            ? 'Checking photographs…'
            : !photos.length
              ? 'Upload a photograph and wait for processing to finish before publishing.'
              : admin
                ? 'Ready to share? Select Publish gallery above.'
                : 'Ask a workspace administrator to publish this gallery.'
        }}
      </p>
      <p
        v-else
        class="cf-draft-hint"
      >
        Hidden photographs stay hidden. Password-protected albums still require
        a password.
      </p>
      <p
        v-if="copied || copyError"
        class="cf-draft-hint"
        role="status"
      >
        {{
          copyError
            ? 'Could not copy the link. Select and copy the address above.'
            : 'Site address copied to clipboard.'
        }}
      </p>
    </div>
    <UModal
      v-model:open="unpublishOpen"
      title="Unpublish this gallery?"
      description="Your public address and shared links will return 404. Your photographs, albums and storage will remain in your workspace. You can publish again later."
      :dismissible="!busy"
    >
      <template
        v-if="unpublishError"
        #body
        ><p
          role="alert"
          class="cf-notice cf-notice-error"
        >
          {{ unpublishError }}
        </p></template
      >
      <template #footer>
        <CloudButton
          variant="secondary"
          :disabled="busy"
          @click="unpublishOpen = false"
          >Cancel</CloudButton
        >
        <CloudButton
          variant="destructive"
          :loading="busy"
          @click="unpublish"
          >Unpublish gallery</CloudButton
        >
      </template>
    </UModal>
  </div>
</template>
