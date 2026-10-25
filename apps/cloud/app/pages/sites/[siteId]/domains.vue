<script setup lang="ts">
import { Copy } from 'lucide-vue-next'
definePageMeta({ layout: 'portal' })
useSeoMeta({ title: 'Domains — ChronoFrame Cloud', robots: 'noindex' })
const site = useEntryContext().value!
const { data, error, refresh } = await useFetch(
  `/api/sites/${site.siteId}/settings`,
)
const notice = ref('')
async function copy() {
  try {
    await navigator.clipboard.writeText(
      `https://${data.value!.site.slug}.site.chronoframe.art`,
    )
    notice.value = 'Address copied.'
  } catch {
    notice.value = 'Could not copy. Select and copy the address above.'
  }
}
</script>
<template>
  <div class="cf-site-settings-stack">
    <div class="cf-page-heading">
      <div>
        <h1 class="cf-page-title">Domains</h1>
        <p class="cf-page-description">
          Addresses visitors use to reach your gallery.
        </p>
      </div>
    </div>
    <CloudCard
      ><div class="cf-panel-heading">
        <h2>Default subdomain</h2>
        <p>Your reserved ChronoFrame address.</p>
      </div>
      <div class="cf-panel-body">
        <p
          v-if="error"
          role="alert"
        >
          Could not load the address.<CloudButton
            variant="ghost"
            @click="refresh()"
            >Retry</CloudButton
          >
        </p>
        <template v-else-if="data?.site.slug"
          ><p class="cf-address-preview">
            https://{{ data.site.slug }}.site.chronoframe.art
          </p>
          <CloudButton
            variant="secondary"
            size="sm"
            @click="copy"
            ><Copy :size="14" />Copy address</CloudButton
          >
          <p class="cf-field-hint">
            {{
              data.site.published
                ? 'Published. Hidden photographs and album passwords remain protected.'
                : 'Reserved for your draft. This address returns 404 until you publish from Overview.'
            }}
          </p>
          <p class="cf-field-hint">
            Changing the default subdomain is not available yet.
          </p></template
        >
        <p v-else>No default subdomain is assigned.</p>
        <p
          v-if="notice"
          role="status"
          class="cf-field-hint"
        >
          {{ notice }}
        </p>
      </div></CloudCard
    ><CloudCard
      ><div class="cf-panel-heading">
        <h2>Custom domains</h2>
        <CloudBadge>Coming later</CloudBadge>
        <p>
          Connect your own domain in a future update. Domain ownership, DNS and
          certificate verification will be required before activation.
        </p>
      </div></CloudCard
    >
  </div>
</template>
