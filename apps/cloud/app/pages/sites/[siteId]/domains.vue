<script setup lang="ts">
const { t } = useI18n()

import { Copy } from 'lucide-vue-next'
definePageMeta({ layout: 'portal' })
useSeoMeta({
  title: t('cloud.messages.domainsChronoframeCloud'),
  robots: 'noindex',
})
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
    notice.value = t('cloud.messages.addressCopied')
  } catch {
    notice.value = t('cloud.messages.couldNotCopySelectAndCopyTheAddressAbove')
  }
}
</script>
<template>
  <div class="cf-site-settings-stack">
    <div class="cf-page-heading">
      <div>
        <h1 class="cf-page-title">{{ $t('cloud.messages.domains') }}</h1>
        <p class="cf-page-description">
          {{ $t('cloud.messages.addressesVisitorsUseToReachYourGallery') }}
        </p>
      </div>
    </div>
    <CloudCard
      ><div class="cf-panel-heading">
        <h2>{{ $t('cloud.messages.defaultSubdomain') }}</h2>
        <p>{{ $t('cloud.messages.yourReservedChronoframeAddress') }}</p>
      </div>
      <div class="cf-panel-body">
        <p
          v-if="error"
          role="alert"
        >
          {{ $t('cloud.messages.couldNotLoadTheAddress')
          }}<CloudButton
            variant="ghost"
            @click="refresh()"
            >{{ $t('cloud.messages.retry') }}</CloudButton
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
            ><Copy :size="14" />{{
              $t('cloud.messages.copyAddress')
            }}</CloudButton
          >
          <p class="cf-field-hint">
            {{
              data.site.published
                ? $t(
                    'cloud.messages.publishedHiddenPhotographsAndAlbumPasswordsRemainProtected',
                  )
                : $t(
                    'cloud.messages.reservedForYourDraftThisAddressReturns404Until',
                  )
            }}
          </p>
          <p class="cf-field-hint">
            {{
              $t('cloud.messages.changingTheDefaultSubdomainIsNotAvailableYet')
            }}
          </p></template
        >
        <p v-else>{{ $t('cloud.messages.noDefaultSubdomainIsAssigned') }}</p>
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
        <h2>{{ $t('cloud.messages.customDomains') }}</h2>
        <CloudBadge>{{ $t('cloud.messages.comingLater') }}</CloudBadge>
        <p>
          {{ $t('cloud.messages.connectYourOwnDomainInAFutureUpdateDomain') }}
        </p>
      </div></CloudCard
    >
  </div>
</template>
