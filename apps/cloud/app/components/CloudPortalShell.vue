<script setup lang="ts">
import { Menu, X } from 'lucide-vue-next'
import {
  DialogRoot,
  DialogTrigger,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from 'reka-ui'
const menuOpen = ref(false),
  route = useRoute()
watch(
  () => route.fullPath,
  () => {
    menuOpen.value = false
  },
)
useCloudSiteSubscription()
</script>
<template>
  <div class="cf-portal">
    <header class="cf-portal-header">
      <div class="cf-portal-brand">
        <DialogRoot v-model:open="menuOpen"
          ><DialogTrigger as-child
            ><CloudButton
              class="cf-sidebar-toggle"
              variant="ghost"
              size="icon"
              aria-label="Open navigation"
              ><Menu :size="19" /></CloudButton></DialogTrigger
          ><DialogPortal
            ><DialogOverlay class="cf-sidebar-overlay" /><DialogContent
              class="cf-sidebar-drawer"
              ><DialogTitle class="sr-only">Navigation</DialogTitle
              ><DialogDescription class="sr-only"
                >Your workspace and site navigation.</DialogDescription
              >
              <div class="cf-drawer-heading">
                <span>ChronoFrame Cloud</span
                ><DialogClose as-child
                  ><CloudButton
                    variant="ghost"
                    size="icon"
                    aria-label="Close navigation"
                    ><X :size="19" /></CloudButton
                ></DialogClose>
              </div>
              <CloudSidebarNavigation />
              <div class="cf-sidebar-bottom">
                <CloudUserMenu /></div></DialogContent></DialogPortal
        ></DialogRoot>
        <CloudBrand cloud />
      </div>
      <div class="cf-header-actions">
        <CloudBadge class="cf-preview-badge">Cloud preview</CloudBadge
        ><CloudThemeToggle />
      </div>
    </header>
    <div class="cf-portal-grid">
      <aside
        class="cf-sidebar"
        aria-label="Workspace"
      >
        <CloudSidebarNavigation />
        <div class="cf-sidebar-bottom"><CloudUserMenu /></div>
      </aside>
      <main
        id="main-content"
        class="cf-portal-main"
        tabindex="-1"
      >
        <div class="cf-portal-content">
          <slot />
        </div>
      </main>
    </div>
  </div>
</template>
