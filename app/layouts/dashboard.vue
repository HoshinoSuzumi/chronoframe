<script lang="ts" setup>
import type { NavigationMenuItem } from '@nuxt/ui'
import { motion } from 'motion-v'

const items = ref<NavigationMenuItem[]>([
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
])

const route = useRoute()
const router = useRouter()
const config = useRuntimeConfig()
const { loggedIn, user } = useUserSession()

useHead({
  title: $t('title.dashboard'),
  titleTemplate: (title) =>
    `${title ? title + ' | ' : ''}${config.public.app.title}`,
})

const isMobileMenuOpen = ref(false)

const isRouteActive = (itemPath: string) => {
  if (itemPath === '/dashboard') {
    return route.path === '/dashboard'
  }
  return route.path.startsWith(itemPath)
}

const handleLogin = () => {
  router.push({
    path: '/signin',
    query: { redirect: route.fullPath },
  })
}

const toggleMobileMenu = () => {
  isMobileMenuOpen.value = !isMobileMenuOpen.value
}

const closeMobileMenu = () => {
  isMobileMenuOpen.value = false
}
</script>

<template>
  <div class="container mx-auto">
    <header
      v-if="loggedIn"
      class="w-full px-4 border-b border-default"
    >
      <!-- 桌面端导航 -->
      <div class="hidden md:flex items-center gap-4">
        <div class="flex items-center gap-2">
          <Icon
            name="tabler:photo-circle"
            class="size-6 text-primary"
          />
          <NuxtLink
            to="/"
            class="text-lg font-medium text-nowrap"
          >
            {{ config.public.app.title || $t('title.dashboard') }}
          </NuxtLink>
        </div>
        <UNavigationMenu
          variant="pill"
          :items="items"
          :ui="{
            viewportWrapper: 'max-w-5xl',
          }"
          class="w-full"
        />
      </div>

      <!-- 移动端导航 -->
      <div class="md:hidden">
        <!-- 移动端顶部栏 -->
        <div class="flex items-center justify-between py-3">
          <div class="flex items-center gap-2">
            <Icon
              name="tabler:photo-circle"
              class="size-6 text-primary"
            />
            <NuxtLink
              to="/"
              class="text-lg font-medium"
            >
              {{ config.public.app.title || $t('title.dashboard') }}
            </NuxtLink>
          </div>
          <UButton
            variant="ghost"
            size="sm"
            :icon="isMobileMenuOpen ? 'tabler:x' : 'tabler:menu-2'"
            @click="toggleMobileMenu"
          />
        </div>

        <!-- 移动端下拉菜单 -->
        <AnimatePresence>
          <motion.div
            v-if="isMobileMenuOpen"
            :initial="{ opacity: 0, y: -10, height: 0 }"
            :animate="{ opacity: 1, y: 0, height: 'auto' }"
            :exit="{ opacity: 0, y: -10, height: 0 }"
            :transition="{
              duration: 0.3,
              ease: 'easeOut',
              height: { duration: 0.2 },
            }"
            class="border-t border-default bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60 overflow-hidden"
          >
            <nav class="py-2">
              <motion.div
                v-for="(item, index) in items"
                :key="index"
                :initial="{ opacity: 0, x: -20 }"
                :animate="{ opacity: 1, x: 0 }"
                :transition="{
                  duration: 0.2,
                  delay: index * 0.06,
                  ease: 'easeOut',
                }"
              >
                <NuxtLink
                  :to="item.to"
                  :class="[
                    'flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors',
                    isRouteActive(item.to as string)
                      ? 'bg-primary/10 text-primary border-r-2 border-primary'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300',
                  ]"
                  @click="closeMobileMenu"
                >
                  <Icon
                    :name="item.icon! as string"
                    :class="[
                      'size-5',
                      isRouteActive(item.to as string)
                        ? 'text-primary'
                        : 'text-gray-500',
                    ]"
                  />
                  <span>{{ item.label }}</span>
                </NuxtLink>
              </motion.div>
            </nav>
          </motion.div>
        </AnimatePresence>
      </div>
    </header>
    <main v-if="loggedIn && user?.isAdmin">
      <NuxtPage />
    </main>
    <div
      v-else
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
  </div>
</template>

<style scoped></style>
