<script lang="ts" setup>
const props = withDefaults(
  defineProps<{ variant?: 'embedded' | 'fixedDesktop' }>(),
  { variant: 'embedded' },
)

const links = useSocialLinks()
</script>

<template>
  <nav
    v-if="links.length"
    :aria-label="$t('settings.app.socialLinks.title')"
    class="items-center justify-center"
    :class="{
      flex: props.variant === 'embedded',
      'hidden lg:flex': props.variant === 'fixedDesktop',
    }"
  >
    <div
      :class="
        props.variant === 'embedded'
          ? 'flex items-center justify-center gap-0.5'
          : 'flex items-center gap-0.5 rounded-2xl bg-neutral-900/[0.04] p-1 dark:bg-white/[0.06]'
      "
    >
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
          class="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-default transition-colors hover:bg-accented/75 active:bg-accented/75 focus-visible:outline-3 focus-visible:outline-inverted/25"
        >
          <Icon
            :name="link.icon"
            mode="svg"
            class="size-4"
            aria-hidden="true"
          />
        </a>
      </UTooltip>
    </div>
  </nav>
</template>
