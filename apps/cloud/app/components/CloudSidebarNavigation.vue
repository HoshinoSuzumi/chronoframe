<script setup lang="ts">
import {
  ArrowLeft,
  Images,
  LibraryBig,
  PanelsTopLeft,
  LayoutDashboard,
  Settings,
  Globe,
  HardDrive,
} from 'lucide-vue-next'
const route = useRoute(),
  context = useEntryContext()
const site = computed(() =>
  route.path.startsWith('/sites/') && context.value?.audience === 'portal'
    ? context.value
    : null,
)
const mode = computed(() => (site.value ? 'site' : 'workspace'))
const direction = ref('cf-nav-forward')
watch(mode, (next) => {
  direction.value = next === 'site' ? 'cf-nav-forward' : 'cf-nav-back'
})
</script>
<template>
  <div class="cf-sidebar-viewport">
    <Transition :name="direction"
      ><div
        :key="mode"
        class="cf-sidebar-panel"
      >
        <template v-if="site"
          ><NuxtLink
            to="/sites"
            class="cf-sidebar-back"
            ><ArrowLeft :size="15" />All sites</NuxtLink
          >
          <div class="cf-sidebar-site">
            <span class="cf-site-icon"><Images :size="18" /></span>
            <div>
              <strong>{{ site.name }}</strong
              ><span>{{
                site.published ? 'Published gallery' : 'Private draft'
              }}</span>
            </div>
          </div>
          <p class="cf-nav-label">MANAGE SITE</p>
          <nav aria-label="Site navigation">
            <NuxtLink
              :to="`/sites/${site.siteId}/overview`"
              :class="{ active: route.path.endsWith('/overview') }"
              :aria-current="
                route.path.endsWith('/overview') ? 'page' : undefined
              "
              ><LayoutDashboard :size="17" />Overview</NuxtLink
            >
            <NuxtLink
              :to="`/sites/${site.siteId}/photos`"
              :class="{ active: route.path.endsWith('/photos') }"
              :aria-current="
                route.path.endsWith('/photos') ? 'page' : undefined
              "
              ><Images :size="17" />Photo library</NuxtLink
            ><NuxtLink
              :to="`/sites/${site.siteId}/albums`"
              :class="{ active: route.path.endsWith('/albums') }"
              :aria-current="
                route.path.endsWith('/albums') ? 'page' : undefined
              "
              ><LibraryBig :size="17" />Albums</NuxtLink
            >
            <NuxtLink
              :to="`/sites/${site.siteId}/information`"
              :class="{ active: route.path.endsWith('/information') }"
              :aria-current="
                route.path.endsWith('/information') ? 'page' : undefined
              "
              ><Settings :size="17" />Site information</NuxtLink
            >
          </nav>
          <p class="cf-nav-label cf-nav-section">SITE RESOURCES</p>
          <nav aria-label="Site resources">
            <NuxtLink
              :to="`/sites/${site.siteId}/domains`"
              :class="{ active: route.path.endsWith('/domains') }"
              :aria-current="
                route.path.endsWith('/domains') ? 'page' : undefined
              "
              ><Globe :size="17" />Domains</NuxtLink
            ><NuxtLink
              :to="`/sites/${site.siteId}/storage`"
              :class="{ active: route.path.endsWith('/storage') }"
              :aria-current="
                route.path.endsWith('/storage') ? 'page' : undefined
              "
              ><HardDrive :size="17" />Storage</NuxtLink
            >
          </nav>
        </template>
        <template v-else
          ><p class="cf-nav-label">WORKSPACE</p>
          <nav aria-label="Portal navigation">
            <NuxtLink
              to="/sites"
              :class="{ active: route.path === '/sites' }"
              :aria-current="route.path === '/sites' ? 'page' : undefined"
              ><PanelsTopLeft :size="17" />Sites</NuxtLink
            >
          </nav></template
        >
      </div></Transition
    >
  </div>
</template>
