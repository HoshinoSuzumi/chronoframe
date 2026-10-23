<script setup lang="ts">
import {
  Images,
  UserRound,
  ArrowUpRight,
  BookOpen,
  ShieldCheck,
  LogOut,
} from 'lucide-vue-next'
const route = useRoute()
const { busy, error, signOut } = useCloudSignOut()
</script>
<template>
  <div class="cf-portal">
    <header class="cf-portal-header">
      <CloudBrand cloud />
      <div class="cf-header-actions">
        <CloudBadge>Cloud preview</CloudBadge
        ><CloudButton
          variant="ghost"
          size="sm"
          :loading="busy"
          @click="signOut"
          ><LogOut :size="15" />Sign out</CloudButton
        ><CloudThemeToggle />
      </div>
    </header>
    <div class="cf-portal-grid">
      <aside class="cf-sidebar">
        <p class="cf-nav-label">YOUR SPACE</p>
        <nav aria-label="Portal navigation">
          <NuxtLink
            to="/sites"
            :class="{ active: route.path.startsWith('/sites') }"
            :aria-current="route.path.startsWith('/sites') ? 'page' : undefined"
            ><Images :size="18" />Sites</NuxtLink
          ><NuxtLink
            to="/account"
            :class="{ active: route.path === '/account' }"
            :aria-current="route.path === '/account' ? 'page' : undefined"
            ><UserRound :size="18" />Account</NuxtLink
          >
          <NuxtLink
            to="/account/security"
            :class="{ active: route.path === '/account/security' }"
            :aria-current="
              route.path === '/account/security' ? 'page' : undefined
            "
            ><ShieldCheck :size="18" />Security</NuxtLink
          >
        </nav>
        <p
          v-if="error"
          role="alert"
          class="cf-error-message"
        >
          {{ error }}
        </p>
        <div class="cf-sidebar-bottom">
          <p>A little guidance?</p>
          <a
            href="https://docs.chronoframe.art/"
            target="_blank"
            rel="noopener noreferrer"
            ><BookOpen :size="16" />Read the documentation<ArrowUpRight
              :size="14"
          /></a>
        </div>
      </aside>
      <main
        id="main-content"
        class="cf-portal-main"
        tabindex="-1"
      >
        <slot />
      </main>
    </div>
    <footer class="cf-portal-footer">
      <span>Made for the way you see.</span
      ><a href="https://github.com/HoshinoSuzumi/chronoframe"
        >Built in the open <ArrowUpRight :size="12"
      /></a>
    </footer>
  </div>
</template>
