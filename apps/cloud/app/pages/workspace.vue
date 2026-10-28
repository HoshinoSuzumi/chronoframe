<script setup lang="ts">
import { NuxtLink } from '#components'
import {
  ArrowUpRight,
  ChevronRight,
  Images,
  Settings,
  ShieldCheck,
  CreditCard,
} from 'lucide-vue-next'
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
  <div class="cf-dashboard">
    <CfPageHeader
      :title="$t('cloud.dashboard.workspaceOverview')"
      :description="$t('cloud.dashboard.workspaceHelp')"
    >
      <CfBadge v-if="data">{{ data.plan.name }}</CfBadge>
    </CfPageHeader>
    <CfAlert
      v-if="billing.error.value"
      tone="error"
      >{{ $t('cloud.dashboard.quotaUnavailable')
      }}<CfButton
        size="sm"
        variant="secondary"
        @click="billing.refresh()"
        >{{ $t('cloud.messages.retry') }}</CfButton
      ></CfAlert
    >
    <section
      class="cf-workspace-metrics"
      :aria-label="$t('cloud.dashboard.resources')"
    >
      <CfUsageMeter
        v-for="key in meters"
        :key="key"
        :label="$t('cloud.billing.' + key)"
        :loading="!data"
        :value="data ? allowance(key, data.usage[key], locale) : undefined"
        :limit="
          data ? allowance(key, data.plan.limits[key], locale) : undefined
        "
        :progress="data ? progress(key) : undefined"
      />
    </section>
    <section
      class="cf-workspace-sites"
      :aria-label="$t('cloud.dashboard.galleries')"
    >
      <div class="cf-dashboard-section-heading">
        <h2>{{ $t('cloud.dashboard.galleries') }}</h2>
        <CfButton
          v-if="sites.length > 1"
          as-child
          variant="ghost"
          size="sm"
          ><NuxtLink to="/sites"
            >{{ $t('cloud.messages.allSites')
            }}<ArrowUpRight :size="14" /></NuxtLink
        ></CfButton>
      </div>
      <ul
        v-if="sites.length"
        class="cf-workspace-site-list"
      >
        <li
          v-for="site in sites"
          :key="site.siteId"
        >
          <CfCard
            class="cf-workspace-site"
            :class="{ 'is-suspended': site.suspended }"
          >
            <div class="cf-workspace-site-heading">
              <span class="cf-site-icon"
                ><Images
                  :size="18"
                  aria-hidden="true"
              /></span>
              <div class="cf-workspace-site-identity">
                <strong>{{ site.name }}</strong
                ><small>{{
                  site.suspended
                    ? $t('cloud.enforcement.siteSuspended')
                    : site.published
                      ? $t('cloud.messages.publishedGallery')
                      : $t('cloud.messages.privateDraft')
                }}</small>
              </div>
              <CfButton
                v-if="!site.suspended"
                as-child
                variant="secondary"
                size="sm"
                ><NuxtLink :to="`/sites/${site.siteId}/overview`"
                  >{{ $t('cloud.dashboard.manageGallery')
                  }}<ChevronRight :size="14" /></NuxtLink
              ></CfButton>
            </div>
            <div
              v-if="!site.suspended"
              class="cf-workspace-site-links"
            >
              <NuxtLink :to="`/sites/${site.siteId}/information`"
                ><Settings
                  :size="15"
                  aria-hidden="true" />{{ $t('cloud.messages.siteInformation')
                }}<ChevronRight :size="12" /></NuxtLink
              ><NuxtLink :to="`/sites/${site.siteId}/photos`"
                ><Images
                  :size="15"
                  aria-hidden="true" />{{ $t('cloud.messages.photoLibrary')
                }}<ChevronRight :size="12"
              /></NuxtLink>
            </div>
          </CfCard>
        </li>
      </ul>
      <div
        v-else-if="data"
        class="cf-dashboard-empty"
      >
        <Images :size="22" />
        <h3>{{ $t('cloud.messages.noSitesYet') }}</h3>
        <p>{{ $t('cloud.dashboard.emptyHelp') }}</p>
      </div>
      <CfSkeleton
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
    </section>
    <section
      class="cf-workspace-tools"
      :aria-label="$t('cloud.dashboard.workspaceTools')"
    >
      <h2>{{ $t('cloud.dashboard.workspaceTools') }}</h2>
      <NuxtLink
        to="/account/plan"
        class="cf-dashboard-tool"
        ><CreditCard
          :size="16"
          aria-hidden="true" /><span
          ><strong>{{ $t('cloud.dashboard.planUsage') }}</strong
          ><small>{{ $t('cloud.dashboard.planHelp') }}</small></span
        ><ChevronRight :size="15"
      /></NuxtLink>
      <NuxtLink
        to="/account"
        class="cf-dashboard-tool"
        ><ShieldCheck
          :size="16"
          aria-hidden="true" /><span
          ><strong>{{ $t('cloud.dashboard.accountSecurity') }}</strong
          ><small>{{ $t('cloud.dashboard.accountHelp') }}</small></span
        ><ChevronRight :size="15"
      /></NuxtLink>
    </section>
  </div>
</template>
