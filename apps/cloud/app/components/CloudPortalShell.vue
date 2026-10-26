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
const content = ref<HTMLElement>()
const reduced = usePreferredReducedMotion()
let entrance: Animation | undefined,
  lastPath = ''
function animatePage() {
  if (!content.value || route.path === lastPath) return
  lastPath = route.path
  entrance?.cancel()
  if (reduced.value !== 'reduce')
    entrance = content.value.animate(
      [
        { opacity: 0, transform: 'translateY(8px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      { duration: 220, easing: 'cubic-bezier(.2,.7,.2,1)' },
    )
}
const removeEntranceHook = useNuxtApp().hook('page:finish', animatePage)
onMounted(animatePage)
watch(reduced, () => {
  if (reduced.value === 'reduce') entrance?.cancel()
})
onBeforeUnmount(() => {
  removeEntranceHook()
  entrance?.cancel()
})
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
              :aria-label="$t('cloud.messages.openNavigation')"
              ><Menu :size="19" /></CloudButton></DialogTrigger
          ><DialogPortal
            ><DialogOverlay class="cf-sidebar-overlay" /><DialogContent
              class="cf-sidebar-drawer"
              ><DialogTitle class="sr-only">{{
                $t('cloud.messages.navigation')
              }}</DialogTitle
              ><DialogDescription class="sr-only">{{
                $t('cloud.messages.yourWorkspaceAndSiteNavigation')
              }}</DialogDescription>
              <div class="cf-drawer-heading">
                <span>ChronoFrame Cloud</span
                ><DialogClose as-child
                  ><CloudButton
                    variant="ghost"
                    size="icon"
                    :aria-label="$t('cloud.messages.closeNavigation')"
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
        <CloudBadge class="cf-preview-badge">{{
          $t('cloud.messages.cloudPreview')
        }}</CloudBadge
        ><CloudThemeToggle />
      </div>
    </header>
    <div class="cf-portal-grid">
      <aside
        class="cf-sidebar"
        :aria-label="$t('cloud.messages.workspace')"
      >
        <CloudSidebarNavigation />
        <div class="cf-sidebar-bottom"><CloudUserMenu /></div>
      </aside>
      <main
        id="main-content"
        class="cf-portal-main"
        tabindex="-1"
      >
        <div
          ref="content"
          class="cf-portal-content"
        >
          <slot />
        </div>
      </main>
    </div>
  </div>
</template>
