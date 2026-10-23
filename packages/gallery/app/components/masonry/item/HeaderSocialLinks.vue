<script lang="ts" setup>
import {
  parseSocialLinks,
  resolveSocialPlatform,
} from '@chronoframe/contracts/social-links'
import { FIXED_HEADER_SOCIAL_ROW_HEIGHT_PX } from '#gallery/utils'

const props = withDefaults(
  defineProps<{ variant?: 'embedded' | 'fixedDesktop' | 'fixedMobile' }>(),
  { variant: 'embedded' },
)

const setting = useSettingRef('app:socialLinks')
const links = computed(() => {
  try {
    return parseSocialLinks(setting.value).map((href) => ({
      href,
      ...resolveSocialPlatform(href),
    }))
  } catch {
    return []
  }
})
</script>

<template>
  <nav
    v-if="links.length"
    :aria-label="$t('settings.app.socialLinks.title')"
    class="items-center justify-center gap-1"
    :class="{
      'flex flex-wrap': props.variant === 'embedded',
      'hidden lg:flex': props.variant === 'fixedDesktop',
      'flex flex-nowrap overflow-x-auto lg:hidden':
        props.variant === 'fixedMobile',
    }"
    :style="
      props.variant === 'fixedMobile'
        ? { height: `${FIXED_HEADER_SOCIAL_ROW_HEIGHT_PX}px` }
        : undefined
    "
  >
    <a
      v-for="link in links"
      :key="link.href"
      :href="link.href"
      :aria-label="
        $t('settings.app.socialLinks.visit', { platform: link.label })
      "
      :title="link.label"
      target="_blank"
      rel="noopener noreferrer"
      class="inline-flex size-10 items-center justify-center rounded-full text-neutral-600 transition-colors hover:bg-neutral-200/70 hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 dark:text-neutral-300 dark:hover:bg-neutral-700/70 dark:hover:text-white"
    >
      <Icon
        :name="link.icon"
        mode="svg"
        class="size-4"
        aria-hidden="true"
      />
    </a>
  </nav>
</template>
