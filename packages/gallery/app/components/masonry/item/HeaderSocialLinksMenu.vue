<script lang="ts" setup>
const links = useSocialLinks()
</script>

<template>
  <div
    v-if="links.length"
    class="border-t border-neutral-300/50 dark:border-neutral-500/50"
  >
    <div class="grid grid-cols-2 gap-1 py-2">
      <UTooltip
        v-for="link in links"
        :key="link.href"
        :text="link.href"
        :delay-duration="0"
      >
        <a
          :href="link.href"
          :aria-label="
            $t('settings.app.socialLinks.visit', { platform: link.label })
          "
          target="_blank"
          rel="noopener noreferrer"
          class="flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-accented/75 hover:text-neutral-900 active:bg-accented/75 focus-visible:outline-3 focus-visible:outline-inverted/25 dark:text-neutral-300 dark:hover:text-white"
        >
          <Icon
            :name="link.icon"
            mode="svg"
            class="size-4 shrink-0"
            aria-hidden="true"
          />
          <span class="truncate">{{ link.label }}</span>
        </a>
      </UTooltip>
    </div>
  </div>
</template>
