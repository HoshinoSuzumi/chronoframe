<script setup lang="ts">
import DashboardCaptureHeatmap from '#console/components/DashboardCaptureHeatmap.vue'
import {
  CheckCircle2,
  Images,
  ArrowUpRight,
  LibraryBig,
  Globe,
  HardDrive,
  Settings2,
  CircleAlert,
} from 'lucide-vue-next'
definePageMeta({ layout: 'portal' })
const { t } = useI18n()
useSeoMeta({
  title: () => t('cloud.messages.overviewChronoframeCloud'),
  robots: 'noindex',
})
const activeContext = useEntryContext(),
  site = shallowRef(activeContext.value!)
watch(activeContext, (next) => {
  if (next?.scope === site.value.scope) site.value = next
})
const { photos, albums, jobs, loading, ready, connections, loadError } =
  useCloudSiteMedia()
const processing = computed(
  () =>
    jobs.value.filter((job) =>
      ['queued', 'running', 'retry_wait'].includes(job.state),
    ).length,
)
const failed = computed(
  () => jobs.value.filter((job) => job.state === 'failed').length,
)
const connection = computed(
  () => connections.value.find((item) => item.pool_id) ?? connections.value[0],
)
const actions = computed(() => [
  {
    path: 'photos',
    icon: Images,
    title: t('cloud.messages.photoLibrary'),
    help: t('cloud.dashboard.libraryHelp'),
  },
  {
    path: 'albums',
    icon: LibraryBig,
    title: t('cloud.messages.albums'),
    help: t('cloud.dashboard.albumHelp'),
  },
  {
    path: 'information',
    icon: Settings2,
    title: t('cloud.messages.siteInformation'),
    help: t('cloud.dashboard.informationHelp'),
  },
  {
    path: 'domains',
    icon: Globe,
    title: t('cloud.messages.domains'),
    help: t('cloud.dashboard.domainsHelp'),
  },
  {
    path: 'storage',
    icon: HardDrive,
    title: t('cloud.messages.storage'),
    help: t('cloud.dashboard.storageHelp'),
  },
])
const { locale } = useI18n()
const zh = computed(() => locale.value.startsWith('zh'))
const billing = useWorkspaceBilling()
const analyticsEnabled = computed(
  () =>
    !!billing.data.value?.plan?.analytics &&
    billing.selected.value === site.value.workspaceId,
)
const requestFetch = useRequestFetch()
const {
  data: popular,
  status: popularStatus,
  error: popularError,
  refresh: refreshPopular,
} = useAsyncData(
  () => `site-popular-${site.value.siteId}-${analyticsEnabled.value}`,
  async () =>
    analyticsEnabled.value
      ? requestFetch<any>('/api/analytics/report', {
          query: {
            workspaceId: site.value.workspaceId,
            siteId: site.value.siteId,
            popular: '1',
          },
        })
      : null,
)
</script>
<template>
  <div class="cf-dashboard cf-site-dashboard">
    <CloudSitePublication />
    <section
      class="cf-dashboard-metrics"
      :aria-busy="loading"
      :aria-label="$t('cloud.dashboard.contentOverview')"
    >
      <CfStatCard
        :label="$t('cloud.messages.photographs')"
        :value="ready ? photos.length : undefined"
        :loading="!ready && !loadError"
        ><NuxtLink
          :to="`/sites/${site.siteId}/photos`"
          class="cf-text-link"
          >{{ $t('cloud.messages.openPhotoLibrary')
          }}<ArrowUpRight :size="12" /></NuxtLink
      ></CfStatCard>
      <CfStatCard
        :label="$t('cloud.messages.albums')"
        :value="ready ? albums.length : undefined"
        :loading="!ready && !loadError"
        ><NuxtLink
          :to="`/sites/${site.siteId}/albums`"
          class="cf-text-link"
          >{{ $t('cloud.messages.manageAlbums')
          }}<ArrowUpRight :size="12" /></NuxtLink
      ></CfStatCard>
      <CfStatCard
        :label="$t('cloud.messages.processing')"
        :value="ready ? processing : undefined"
        :loading="!ready && !loadError"
        :detail="
          failed
            ? $t('cloud.dashboard.failedJobs', { count: failed })
            : $t('cloud.dashboard.processingHelp')
        "
      />
    </section>
    <div class="cf-dashboard-columns">
      <div class="min-w-0 space-y-4">
        <CfCard class="cf-dashboard-panel min-w-0">
          <DashboardCaptureHeatmap :photos="photos" />
        </CfCard>
        <CfCard class="cf-dashboard-panel"
          ><div class="cf-dashboard-section-heading">
            <h2>{{ $t('cloud.dashboard.manageGallery') }}</h2>
            <span class="cf-field-hint">{{ site.name }}</span>
          </div>
          <div class="cf-site-actions-list">
            <NuxtLink
              v-for="action in actions"
              :key="action.path"
              :to="`/sites/${site.siteId}/${action.path}`"
              class="cf-dashboard-tool"
              ><component
                :is="action.icon"
                :size="18" /><span class="min-w-0 flex-1"
                ><strong>{{ action.title }}</strong
                ><small>{{ action.help }}</small></span
              ><ArrowUpRight :size="15"
            /></NuxtLink></div
        ></CfCard>
      </div>
      <div class="min-w-0 space-y-4">
        <CfCard
          v-if="analyticsEnabled"
          class="cf-dashboard-panel"
        >
          <div class="cf-dashboard-section-heading">
            <h2>{{ $t('cloud.dashboard.mostPopular') }}</h2>
            <span class="cf-field-hint">{{
              $t('cloud.dashboard.popularRange')
            }}</span>
          </div>
          <CfSkeleton
            v-if="popularStatus === 'pending'"
            class="h-32 w-full"
          />
          <div
            v-else-if="popularError"
            role="status"
          >
            <p class="cf-field-hint">
              {{ $t('cloud.dashboard.popularError') }}
            </p>
            <button
              type="button"
              class="cf-text-link"
              @click="refreshPopular()"
            >
              {{ $t('cloud.messages.retry') }}
            </button>
          </div>
          <ol
            v-else-if="popular?.pages?.length"
            class="cf-popular-photos"
          >
            <li
              v-for="(photo, index) in popular.pages"
              :key="photo.label"
            >
              <span class="cf-field-hint">{{ index + 1 }}</span
              ><CfAnalyticsPageLink
                :row="photo"
                :zh="zh"
              /><span class="cf-field-hint">{{
                photo.pv.toLocaleString()
              }}</span>
            </li>
          </ol>
          <p
            v-else
            class="cf-field-hint"
          >
            {{ $t('cloud.dashboard.popularEmpty') }}
          </p>
        </CfCard>
        <CfCard class="cf-dashboard-panel"
          ><h2>{{ $t('cloud.dashboard.siteHealth') }}</h2>
          <CfSkeleton
            v-if="!ready && !loadError"
            class="h-32 w-full"
          />
          <ul
            v-else-if="ready"
            class="cf-site-health-list"
          >
            <li>
              <component
                :is="failed ? CircleAlert : CheckCircle2"
                :size="17"
              />
              <div>
                <strong>{{
                  $t(
                    failed
                      ? 'cloud.dashboard.needsAttention'
                      : 'cloud.dashboard.processingHealthy',
                  )
                }}</strong>
                <p>
                  {{
                    failed
                      ? $t('cloud.dashboard.failedJobs', { count: failed })
                      : $t('cloud.dashboard.processingHelp')
                  }}
                </p>
              </div>
            </li>
            <li>
              <HardDrive :size="17" />
              <div>
                <strong>{{
                  $t(
                    connection?.pool_id
                      ? 'cloud.messages.platformStorage'
                      : connection
                        ? 'cloud.billing.byos'
                        : 'cloud.dashboard.storagePending',
                  )
                }}</strong>
                <p>{{ $t('cloud.dashboard.storageHelp') }}</p>
              </div>
            </li>
            <li>
              <Globe :size="17" />
              <div>
                <strong>{{
                  $t(
                    site.published
                      ? 'cloud.messages.publishedGallery'
                      : 'cloud.messages.privateDraft',
                  )
                }}</strong>
                <p>{{ $t('cloud.dashboard.publicationHelp') }}</p>
              </div>
            </li>
          </ul></CfCard
        >
      </div>
    </div>
  </div>
</template>

<style scoped>
.cf-popular-photos {
  display: grid;
  gap: 12px;
  margin-top: 16px;
}
.cf-popular-photos li {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: baseline;
  overflow-wrap: anywhere;
}
</style>
