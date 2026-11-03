<script lang="ts" setup>
const props = defineProps<{
  variant: 'embedded' | 'fixed'
  loggedIn: boolean
  visibleDateRange?: string
  visibleLocations?: string
  condensed?: boolean
}>()

const visitorIdentity = useEntryCapabilities().identity === 'visitor'
const isFixed = computed(() => props.variant === 'fixed')
const title = computed(() => getSetting('app:title'))
const slogan = computed(() => getSetting('app:slogan'))
const avatarUrl = computed(
  () =>
    (getSetting('app:avatarUrl') as string) || '/web-app-manifest-192x192.png',
)
</script>

<template>
  <div
    :class="
      isFixed
        ? 'flex min-w-0 flex-1 items-center gap-2 lg:flex-none lg:gap-2.5'
        : 'flex flex-col items-center gap-2'
    "
  >
    <div :class="isFixed ? 'relative shrink-0' : 'relative mx-auto'">
      <img
        :src="avatarUrl"
        :class="isFixed ? 'size-8' : 'size-16'"
        class="block rounded-full object-cover"
        data-tour="home-avatar"
        :alt="loggedIn ? $t('ui.photo.avatarAlt') : ''"
        @error="handleAvatarError"
      />
      <button
        v-if="!loggedIn"
        type="button"
        :aria-label="$t('auth.form.signin.title')"
        class="absolute inset-0 cursor-pointer rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-500"
        @click="
          navigateTo(
            visitorIdentity ? 'https://app.chronoframe.art/signin' : '/signin',
            { external: visitorIdentity },
          )
        "
      />
      <span
        v-if="loggedIn"
        aria-hidden="true"
        class="absolute -right-0.5 -bottom-0.5 flex items-center justify-center rounded-full bg-amber-500 text-white drop-shadow-lg drop-shadow-amber-500/30"
        :class="isFixed ? 'size-3.5 text-[8px]' : 'size-5 text-xs'"
      >
        <Icon name="tabler:star-filled" />
      </span>
    </div>
    <div
      :class="isFixed ? 'relative min-w-0 flex-1 lg:max-w-52 lg:flex-none' : ''"
    >
      <div
        class="transition-all duration-300 ease-out"
        :class="
          isFixed && condensed
            ? '-translate-y-2 opacity-0'
            : 'translate-y-0 opacity-100'
        "
      >
        <h1
          :class="
            isFixed
              ? 'truncate text-sm font-semibold leading-tight'
              : 'mb-2 text-2xl font-bold text-neutral-900 dark:text-white/90'
          "
        >
          {{ title }}
        </h1>
        <p
          v-if="isFixed && slogan"
          class="truncate font-[Pacifico] text-sm leading-5 text-neutral-600 dark:text-neutral-300"
          :title="slogan"
        >
          {{ slogan }}
        </p>
      </div>
      <div
        v-if="isFixed"
        class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center transition-all duration-300 ease-out"
        :class="
          condensed ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
        "
        :aria-hidden="condensed ? undefined : 'true'"
      >
        <span
          v-if="visibleDateRange"
          class="max-w-full truncate text-sm font-semibold leading-5"
        >
          {{ visibleDateRange }}
        </span>
        <span
          v-if="visibleLocations"
          class="max-w-full truncate text-xs leading-4 text-neutral-600 dark:text-neutral-300"
        >
          {{ visibleLocations }}
        </span>
      </div>
    </div>
  </div>
</template>
