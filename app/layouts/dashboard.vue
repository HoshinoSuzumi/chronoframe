<script lang="ts" setup>
import type { NavigationMenuItem } from '@nuxt/ui'

const route = useRoute()
const router = useRouter()
const { loggedIn, user } = useUserSession()

const navItems = computed<NavigationMenuItem[][]>(() => [
  [
    {
      label: $t('title.dashboard'),
      icon: 'tabler:dashboard',
      to: '/dashboard',
    },
    {
      label: $t('title.photos'),
      icon: 'tabler:photo-cog',
      to: '/dashboard/photos',
    },
    {
      label: $t('title.albums'),
      icon: 'tabler:album',
      to: '/dashboard/albums',
    },
    {
      label: $t('title.queue'),
      icon: 'tabler:list-check',
      to: '/dashboard/queue',
    },
    {
      label: $t('title.logs'),
      icon: 'tabler:file-text',
      to: '/dashboard/logs',
    },
    {
      label: $t('title.siteAdministration'),
      icon: 'tabler:settings',
      defaultOpen: route.path.startsWith('/dashboard/settings'),
      children: [
        {
          label: $t('title.generalSettings'),
          icon: 'tabler:settings-2',
          to: '/dashboard/settings/general',
        },
        {
          label: $t('title.storageSettings'),
          icon: 'tabler:database',
          to: '/dashboard/settings/storage',
        },
        {
          label: $t('title.mapAndLocation'),
          icon: 'tabler:map-pin',
          to: '/dashboard/settings/map',
        },
        {
          label: $t('title.systemSettings'),
          icon: 'tabler:cpu',
          to: '/dashboard/settings/system',
          disabled: true,
        },
      ],
    },
  ],
  [
    {
      label: 'GitHub',
      icon: 'tabler:brand-github',
      to: 'https://github.com/HoshinoSuzumi/chronoframe',
      target: '_blank',
    },
    {
      label: 'Documentation',
      icon: 'tabler:book',
      to: 'https://chronoframe.bh8.ga/',
      target: '_blank',
    },
    {
      label: 'Discord',
      icon: 'tabler:brand-discord',
      to: 'https://discord.gg/chronoframe',
      target: '_blank',
    },
  ],
])

useHead({
  title: $t('title.dashboard'),
  titleTemplate: (title) =>
    `${title ? title + ' | ' : ''}${getSetting('app:title')}`,
})

const handleLogin = () => {
  router.push({
    path: '/signin',
    query: { redirect: route.fullPath },
  })
}
</script>

<template>
  <!-- TODO: unified error page -->
  <div
    v-if="!loggedIn || !user?.isAdmin"
    class="h-svh flex flex-col gap-4 items-center justify-center px-4"
  >
    <Icon
      name="tabler:alert-triangle"
      class="size-12 text-primary"
    />
    <p class="text-gray-500 text-center">
      {{
        !user?.isAdmin
          ? 'Please login to view dashboard'
          : 'Sorry, you do not have access to this page.'
      }}
    </p>
    <UButton @click="handleLogin">Sign In</UButton>
  </div>
  <UDashboardGroup v-else>
    <UDashboardSidebar
      id="cframe-dashboard-sidebar"
      resizable
      collapsible
      mode="drawer"
      :min-size="8"
      :max-size="12"
      :ui="{ footer: 'border-t border-default' }"
      :toggle="{
        color: 'primary',
        variant: 'subtle',
        class: 'rounded-full',
      }"
    >
      <template #toggle>
        <UDashboardSidebarToggle variant="soft" />
      </template>

      <template #header="{ collapsed }">
        <div
          v-if="!collapsed"
          class="flex items-center gap-2"
        >
          <img
            src="/favicon.svg"
            class="h-8 w-auto shrink-0"
          />
          <div class="flex flex-col overflow-hidden">
            <NuxtLink
              to="/"
              class="text-lg font-medium line-clamp-1"
            >
              {{ getSetting('app:title') || $t('title.dashboard') }}
            </NuxtLink>
          </div>
        </div>
        <img
          v-else
          src="/favicon.svg"
          class="size-8 mx-auto"
        />
      </template>

      <template #default="{ collapsed }">
        <UNavigationMenu
          :collapsed="collapsed"
          :items="navItems[0]"
          orientation="vertical"
        />
        <UNavigationMenu
          :collapsed="collapsed"
          :items="navItems[1]"
          orientation="vertical"
          class="mt-auto"
        />
      </template>

      <template #footer="{ collapsed }">
        <UButton
          :avatar="{
            src: user?.avatar || '',
            alt: user?.username || user?.email || 'User Avatar',
            icon: 'tabler:user',
          }"
          :label="collapsed ? undefined : user?.username || 'User'"
          size="lg"
          color="neutral"
          variant="ghost"
          class="w-full"
          :block="collapsed"
        />
      </template>
    </UDashboardSidebar>

    <NuxtPage />
  </UDashboardGroup>
</template>

<style scoped></style>
