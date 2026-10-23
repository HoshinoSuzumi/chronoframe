<script setup lang="ts">
import { motion } from 'motion-v'
import { ArrowUpRight, Images, Compass, ShieldCheck } from 'lucide-vue-next'
const entrance = useCloudMotion()
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
useSeoMeta({ title: 'Your sites — ChronoFrame Cloud', robots: 'noindex' })
const userId = useState<number | null>('platform-user-id', () => null)
const catalog = useState<EntrySiteCatalog | null>(
  'platform-site-catalog',
  () => null,
)
const sites = computed(() =>
  catalog.value?.userId === userId.value ? catalog.value.sites : [],
)
</script>
<template>
  <CloudPortalShell
    ><motion.div v-bind="entrance"
      ><div class="cf-page-heading">
        <div>
          <p class="cf-eyebrow">YOUR SPACE</p>
          <h1 class="cf-page-title">Your sites</h1>
          <p class="cf-page-description">
            A home for each of your perspectives. Your galleries, all in one
            place.
          </p>
        </div>
        <CloudBadge
          >{{ sites.length }}
          {{ sites.length === 1 ? 'site' : 'sites' }}</CloudBadge
        >
      </div>
      <p
        v-if="workspace"
        class="cf-section-label"
      >
        {{ workspace.name }}
      </p>
      <div
        v-if="workspaceError"
        class="cf-notice"
        role="alert"
      >
        Your workspace could not be opened.
        <CloudButton
          variant="ghost"
          @click="prepareWorkspace"
          >Try again</CloudButton
        >
      </div>
      <CloudSiteCreate v-if="workspace" />
      <div
        v-if="sites.length"
        class="cf-site-grid"
      >
        <NuxtLink
          v-for="site in sites"
          :key="site.siteId"
          :to="`/sites/${site.siteId}`"
          :aria-label="site.name"
          class="cf-site-link"
          ><div class="cf-site-top">
            <span class="cf-site-icon"><Images :size="20" /></span
            ><CloudBadge :tone="site.published ? 'success' : 'warning'">{{
              site.published ? 'Published' : 'Not published'
            }}</CloudBadge>
          </div>
          <h2>{{ site.name }}</h2>
          <div class="cf-site-meta">
            <span class="cf-capitalize">{{ site.role }}</span
            ><ArrowUpRight
              :size="18"
              aria-label="Open site"
            /></div
        ></NuxtLink>
      </div>
      <CloudCard
        v-else
        class="cf-empty"
        ><div class="cf-empty-icon">
          <Images
            :size="27"
            :stroke-width="1.4"
          />
        </div>
        <h2>Your next chapter starts here.</h2>
        <p>
          You have no sites yet. Create your first draft above to reserve an
          address and start shaping your gallery.
        </p>
        <CloudButton
          as-child
          variant="secondary"
          ><a href="https://docs.chronoframe.art/"
            >Explore the documentation
            <ArrowUpRight :size="15" /></a></CloudButton
      ></CloudCard>
      <div class="cf-section">
        <h2 class="cf-section-label">A few things to know</h2>
        <div class="cf-info-grid">
          <CloudCard class="cf-info-card"
            ><Compass :size="21" />
            <h2>One account. Your own perspective.</h2>
            <p>
              Sites are the home for your photographs. Each one has its own
              identity and access permissions.
            </p></CloudCard
          ><CloudCard class="cf-info-card"
            ><ShieldCheck :size="21" />
            <h2>A shared space, thoughtfully private.</h2>
            <p>
              You only see sites you belong to. Your account and each gallery
              have separate access boundaries.
            </p></CloudCard
          >
        </div>
      </div>
    </motion.div></CloudPortalShell
  >
</template>
