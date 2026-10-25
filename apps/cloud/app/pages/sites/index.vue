<script setup lang="ts">
const { t } = useI18n()

import { motion } from 'motion-v'
import { ArrowUpRight, Images, ShieldCheck } from 'lucide-vue-next'
const entrance = useCloudMotion()
definePageMeta({ layout: 'portal' })
const workspace = ref<{ name: string } | null>(null)
const workspaceError = ref(false)
async function prepareWorkspace() {
  workspaceError.value = false
  try {
    workspace.value = (
      await $fetch<{ workspace: { name: string } }>('/api/workspaces/default', {
        method: 'POST',
      })
    ).workspace
  } catch {
    workspaceError.value = true
  }
}
onMounted(prepareWorkspace)

import type { EntrySiteCatalog } from '@chronoframe/contracts/entry'
useSeoMeta({
  title: t('cloud.messages.yourSitesChronoframeCloud'),
  robots: 'noindex',
})
const userId = useState<number | null>('platform-user-id', () => null)
const catalog = useState<EntrySiteCatalog | null>(
  'platform-site-catalog',
  () => null,
)
// This page owns its catalog until it unmounts; middleware prepares the next route.
const sites = ref(
  catalog.value?.userId === userId.value ? catalog.value.sites : [],
)
</script>
<template>
  <motion.div v-bind="entrance">
    <div class="cf-page-heading">
      <div>
        <h1 class="cf-page-title">{{ $t('cloud.messages.yourSites') }}</h1>
        <p class="cf-page-description">
          {{ $t('cloud.messages.manageYourGalleriesSettingsAndAccess') }}
        </p>
      </div>
      <CloudBadge>{{
        $t('cloud.ui.siteCount', { count: sites.length }, sites.length)
      }}</CloudBadge>
    </div>
    <div
      v-if="workspaceError"
      class="cf-notice"
      role="alert"
    >
      {{ $t('cloud.messages.yourWorkspaceCouldNotBeOpened')
      }}<CloudButton
        variant="ghost"
        @click="prepareWorkspace"
        >{{ $t('cloud.messages.tryAgain') }}</CloudButton
      >
    </div>
    <CloudSiteCreate
      v-if="workspace"
      :workspace-name="workspace.name"
    />
    <div
      v-if="sites.length"
      class="cf-sites-table"
    >
      <div
        class="cf-site-columns"
        aria-hidden="true"
      >
        <span>{{ $t('cloud.messages.site') }}</span
        ><span>{{ $t('cloud.messages.status') }}</span
        ><span>{{ $t('cloud.messages.role') }}</span
        ><span />
      </div>
      <ul class="cf-sites-list">
        <li
          v-for="site in sites"
          :key="site.siteId"
        >
          <NuxtLink
            :to="`/sites/${site.siteId}/overview`"
            :aria-label="site.name"
            :aria-describedby="`site-status-${site.siteId} site-role-${site.siteId}`"
            class="cf-site-row"
          >
            <span class="cf-site-identity"
              ><span class="cf-site-icon"><Images :size="17" /></span
              ><span
                class="cf-site-name"
                :title="site.name"
                >{{ site.name }}</span
              ></span
            >
            <span :id="`site-status-${site.siteId}`"
              ><CloudBadge :tone="site.published ? 'success' : 'neutral'">{{
                site.published
                  ? $t('cloud.messages.published')
                  : $t('cloud.messages.draft')
              }}</CloudBadge></span
            >
            <span
              :id="`site-role-${site.siteId}`"
              class="cf-site-role cf-capitalize"
              >{{
                $t(site.role === 'admin' ? 'cloud.ui.admin' : 'cloud.ui.member')
              }}</span
            ><ArrowUpRight
              :size="15"
              class="cf-row-arrow"
              aria-hidden="true"
            />
          </NuxtLink>
        </li>
      </ul>
    </div>
    <CloudCard
      v-else
      class="cf-portal-empty"
      ><span class="cf-site-icon"><Images :size="20" /></span>
      <div>
        <h2>{{ $t('cloud.messages.noSitesYet') }}</h2>
        <p>{{ $t('cloud.messages.createADraftAboveToReserveYourGalleryS') }}</p>
      </div></CloudCard
    >
    <p class="cf-catalog-note">
      <ShieldCheck :size="14" />{{
        $t('cloud.messages.onlySitesYouBelongToAppearHere')
      }}<a href="https://docs.chronoframe.art/"
        >{{ $t('cloud.messages.viewDocumentation') }}<ArrowUpRight :size="12"
      /></a>
    </p>
  </motion.div>
</template>
