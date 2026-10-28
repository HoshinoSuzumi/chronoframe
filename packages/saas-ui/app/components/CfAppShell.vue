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

// The shell owns presentation and accessibility; consumers supply their own
// navigation, identity and permissions. Admin never imports Cloud's business UI.
defineProps<{
  navigationLabel: string
  navigationDescription: string
  openLabel: string
  closeLabel: string
}>()
const open = ref(false)
const route = useRoute()
watch(
  () => route.fullPath,
  () => {
    open.value = false
  },
)
</script>
<template>
  <div class="cf-portal">
    <div class="cf-shell-brand"><slot name="brand" /></div>
    <header class="cf-portal-header">
      <div class="cf-shell-location">
        <DialogRoot v-model:open="open">
          <DialogTrigger as-child>
            <CfButton
              class="cf-sidebar-toggle"
              variant="ghost"
              size="icon"
              :aria-label="openLabel"
              ><Menu :size="16"
            /></CfButton>
          </DialogTrigger>
          <DialogPortal>
            <DialogOverlay class="cf-sidebar-overlay" />
            <DialogContent class="cf-sidebar-drawer">
              <DialogTitle class="sr-only">{{ navigationLabel }}</DialogTitle>
              <DialogDescription class="sr-only">{{
                navigationDescription
              }}</DialogDescription>
              <div class="cf-drawer-heading">
                <slot name="brand" /><DialogClose as-child
                  ><CfButton
                    variant="ghost"
                    size="icon"
                    :aria-label="closeLabel"
                    ><X :size="16" /></CfButton
                ></DialogClose>
              </div>
              <slot name="navigation" />
              <div class="cf-sidebar-bottom"><slot name="footer" /></div>
            </DialogContent>
          </DialogPortal>
        </DialogRoot>
        <slot name="location" />
      </div>
      <div class="cf-header-actions"><slot name="actions" /></div>
    </header>
    <aside
      class="cf-sidebar"
      :aria-label="navigationLabel"
    >
      <slot name="navigation" />
      <div class="cf-sidebar-bottom"><slot name="footer" /></div>
    </aside>
    <main
      id="main-content"
      class="cf-portal-main"
      tabindex="-1"
    >
      <div class="cf-portal-content"><slot /></div>
    </main>
  </div>
</template>
