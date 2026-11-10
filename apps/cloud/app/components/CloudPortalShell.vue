<script setup lang="ts">
import { ChevronRight } from 'lucide-vue-next'
const { t } = useI18n()
const route = useRoute()
const context = useEntryContext()
const site = computed(() =>
  route.path.startsWith('/sites/') && context.value?.audience === 'portal'
    ? context.value
    : null,
)
const location = computed(() =>
  site.value ? site.value.name : t('cloud.messages.workspace'),
)
const section = computed(() => {
  const leaf = route.path.split('/').filter(Boolean).at(-1) ?? ''
  const keys: Record<string, string> = {
    photos: 'cloud.messages.photoLibrary',
    albums: 'cloud.messages.albums',
    information: 'cloud.messages.siteInformation',
    domains: 'cloud.messages.domains',
    storage: 'cloud.messages.storage',
    sites: 'cloud.messages.sites',
    analytics: 'cloud.billing.analytics',
    plan: 'cloud.dashboard.planUsage',
    redeem: 'cloud.billing.redeem',
    account: 'cloud.messages.accountSecurity',
    security: 'cloud.messages.accountSecurity',
    settings: 'cloud.workspaceSettings.title',
  }
  return t(keys[leaf] ?? 'cloud.messages.overview')
})
useCloudSiteSubscription()
usePortalSessionSync()
</script>
<template>
  <CfAppShell
    :class="{
      'cf-photo-library-shell': /^\/sites\/\d+\/photos\/?$/.test(route.path),
    }"
    :navigation-label="$t('cloud.messages.navigation')"
    :navigation-description="
      $t('cloud.messages.yourWorkspaceAndSiteNavigation')
    "
    :open-label="$t('cloud.messages.openNavigation')"
    :close-label="$t('cloud.messages.closeNavigation')"
  >
    <template #brand
      ><CloudBrand
        cloud
        compact
    /></template>
    <template #location>
      <NuxtLink :to="site ? `/sites/${site.siteId}/overview` : '/workspace'">{{
        location
      }}</NuxtLink>
      <ChevronRight
        :size="12"
        aria-hidden="true"
      />
      <span class="cf-header-location">{{ section }}</span>
    </template>
    <template #actions><CloudThemeToggle /></template>
    <template #navigation><CloudSidebarNavigation /></template>
    <template #footer><CloudUserMenu /></template>
    <slot />
  </CfAppShell>
  <CloudAccountOnboarding />
</template>

<style scoped>
.cf-photo-library-shell {
  height: 100dvh;
  overflow: hidden;
}
.cf-photo-library-shell :deep(.cf-portal-main) {
  min-height: 0;
  padding: 0;
  overflow: hidden;
}
.cf-photo-library-shell :deep(.cf-portal-content) {
  max-width: none;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
</style>
