<script setup lang="ts">
import { ArrowUpRight, Images, SlidersHorizontal } from 'lucide-vue-next'
import type { EntrySiteCatalog } from '@chronoframe/contracts/entry'
import { allowance } from '../utils/billing-format'
import { quotaGate } from '../utils/quota-gate'
definePageMeta({ layout: 'portal' })
const { t, locale } = useI18n(),
  billing = useWorkspaceBilling()
await billing.ready
useIntervalFn(() => {
  if (
    document.visibilityState === 'visible' &&
    billing.status.value !== 'pending'
  )
    void billing.refresh()
}, 15000)
const catalog = useState<EntrySiteCatalog | null>(
  'platform-site-catalog',
  () => null,
)
const sites = computed(
  () =>
    catalog.value?.sites.filter(
      (site) => site.workspaceId === billing.selected.value,
    ) ?? [],
)
const active = computed(
  () => sites.value.filter((site) => site.published && !site.suspended).length,
)
const data = billing.data
const meters = ['storageBytes', 'photos', 'sites'] as const
const progress = (key: string) =>
  Math.min(
    100,
    (Number(data.value?.usage[key] ?? 0) /
      Math.max(1, Number(data.value?.plan.limits[key] ?? 0))) *
      100,
  )
useSeoMeta({
  title: () => t('cloud.dashboard.workspaceOverview') + ' — ChronoFrame Cloud',
  robots: 'noindex',
})
</script>
<template>
  <div class="cf-dashboard grid gap-6">
    <CloudPageHeader
      :title="$t('cloud.dashboard.workspaceOverview')"
      :description="$t('cloud.dashboard.workspaceHelp')"
      ><CloudBadge v-if="data">{{ data.plan.name }}</CloudBadge
      ><CloudButton
        as-child
        variant="secondary"
        size="sm"
        ><NuxtLink to="/account/plan"
          >{{ $t('cloud.dashboard.planUsage')
          }}<ArrowUpRight :size="14" /></NuxtLink></CloudButton
    ></CloudPageHeader>
    <CloudAlert
      v-if="billing.error.value"
      tone="error"
      >{{ $t('cloud.dashboard.quotaUnavailable')
      }}<CloudButton
        size="sm"
        variant="secondary"
        @click="billing.refresh()"
        >{{ $t('cloud.messages.retry') }}</CloudButton
      ></CloudAlert
    >
    <section
      class="cf-dashboard-metrics"
      :aria-label="$t('cloud.dashboard.resources')"
    >
      <CloudStatCard
        v-for="key in meters"
        :key="key"
        :label="$t('cloud.billing.' + key)"
        :loading="!data"
        :value="data ? allowance(key, data.usage[key], locale) : undefined"
        :detail="
          data
            ? $t('cloud.dashboard.ofLimit', {
                limit: allowance(key, data.plan.limits[key], locale),
              })
            : undefined
        "
        :progress="data ? progress(key) : undefined"
      />
    </section>
    <div class="cf-dashboard-columns">
      <CloudCard class="cf-dashboard-panel">
        <div class="cf-dashboard-section-heading">
          <div>
            <h2>{{ $t('cloud.dashboard.galleries') }}</h2>
            <p class="cf-field-hint">
              {{ $t('cloud.dashboard.liveGalleries', { count: active }) }}
            </p>
          </div>
          <CloudButton
            as-child
            variant="ghost"
            size="sm"
            ><NuxtLink to="/sites"
              >{{ $t('cloud.messages.allSites')
              }}<ArrowUpRight :size="14" /></NuxtLink
          ></CloudButton>
        </div>
        <ul
          v-if="sites.length"
          class="cf-dashboard-site-list"
        >
          <li
            v-for="site in sites.slice(0, 5)"
            :key="site.siteId"
          >
            <component
              :is="site.suspended ? 'div' : resolveComponent('NuxtLink')"
              :to="
                site.suspended ? undefined : `/sites/${site.siteId}/overview`
              "
              :aria-disabled="site.suspended || undefined"
              class="cf-dashboard-site"
              ><span class="cf-site-icon"><Images :size="18" /></span
              ><span class="min-w-0 flex-1"
                ><strong>{{ site.name }}</strong
                ><small>{{
                  site.suspended
                    ? $t('cloud.enforcement.siteSuspended')
                    : site.published
                      ? $t('cloud.messages.publishedGallery')
                      : $t('cloud.messages.privateDraft')
                }}</small></span
              ><ArrowUpRight
                v-if="!site.suspended"
                :size="15"
            /></component>
          </li>
        </ul>
        <div
          v-else-if="data"
          class="cf-dashboard-empty"
        >
          <Images :size="26" />
          <h3>{{ $t('cloud.messages.noSitesYet') }}</h3>
          <p>{{ $t('cloud.dashboard.emptyHelp') }}</p>
        </div>
        <CloudSkeleton
          v-else
          class="h-28 w-full"
        />
        <CloudSiteCreate
          v-if="
            data &&
            billing.workspaces.value[0]?.owned &&
            quotaGate(data, 'sites').allowed
          "
          :workspace-id="data.workspace.id"
          :workspace-name="data.workspace.name"
        />
      </CloudCard>
      <CloudCard class="cf-dashboard-panel"
        ><div class="cf-dashboard-section-heading">
          <h2>{{ $t('cloud.dashboard.workspaceTools') }}</h2>
          <SlidersHorizontal :size="17" />
        </div>
        <p class="cf-field-hint">{{ $t('cloud.dashboard.toolsHelp') }}</p>
        <NuxtLink
          to="/account/plan"
          class="cf-dashboard-tool"
          ><span
            ><strong>{{ $t('cloud.dashboard.planUsage') }}</strong
            ><small>{{ $t('cloud.dashboard.planHelp') }}</small></span
          ><ArrowUpRight :size="15" /></NuxtLink
        ><CloudSeparator /><NuxtLink
          to="/account"
          class="cf-dashboard-tool"
          ><span
            ><strong>{{ $t('cloud.dashboard.accountSecurity') }}</strong
            ><small>{{ $t('cloud.dashboard.accountHelp') }}</small></span
          ><ArrowUpRight :size="15" /></NuxtLink
      ></CloudCard>
    </div>
  </div>
</template>
