<script lang="ts" setup>
const props = defineProps<{
  variant: 'embedded' | 'fixed'
  loggedIn: boolean
}>()

const visitorIdentity = useEntryCapabilities().identity === 'visitor'
const isFixed = computed(() => props.variant === 'fixed')
const title = computed(() => getSetting('app:title'))
const author = computed(() => getSetting('app:author'))
const avatarUrl = computed(
  () =>
    (getSetting('app:avatarUrl') as string) || '/web-app-manifest-192x192.png',
)
</script>

<template>
  <div
    :class="
      isFixed
        ? 'flex min-w-0 flex-1 items-center gap-2 lg:flex-none lg:gap-3'
        : 'flex flex-col items-center gap-2'
    "
  >
    <div :class="isFixed ? 'relative shrink-0' : 'relative mx-auto'">
      <img
        :src="avatarUrl"
        :class="isFixed ? 'size-11' : 'size-16'"
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
        class="absolute -right-0.5 -bottom-0.5 flex size-5 items-center justify-center rounded-full bg-amber-500 text-xs text-white drop-shadow-lg drop-shadow-amber-500/30"
      >
        <Icon name="tabler:star-filled" />
      </span>
    </div>
    <div :class="isFixed ? 'min-w-0 max-w-56' : ''">
      <h1
        :class="
          isFixed
            ? 'truncate text-base font-semibold leading-tight sm:text-lg'
            : 'mb-2 text-2xl font-bold text-neutral-900 dark:text-white/90'
        "
      >
        {{ title }}
      </h1>
      <p
        v-if="isFixed && author && author !== title"
        class="truncate text-xs text-neutral-500 dark:text-neutral-400"
      >
        {{ author }}
      </p>
    </div>
  </div>
</template>
