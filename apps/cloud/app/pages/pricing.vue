<script setup lang="ts">
const route = useRoute(),
  portal =
    useCloudRequestURL().hostname === 'app.chronoframe.art' ||
    route.query.portal === '1',
  { t } = useI18n()
definePageMeta({ layout: false })
useSeoMeta({
  title: t('cloud.billing.pricing') + ' — ChronoFrame Cloud',
  description: t('cloud.billing.pricingHelp'),
  ...(portal ? { robots: 'noindex' } : {}),
})
</script>
<template>
  <NuxtLayout
    v-if="portal"
    name="portal"
    ><CloudPricing portal
  /></NuxtLayout>
  <div
    v-else
    class="cf-marketing"
  >
    <CloudMarketingHeader />
    <main
      id="main-content"
      tabindex="-1"
    >
      <CloudPricing />
    </main>
  </div>
</template>
