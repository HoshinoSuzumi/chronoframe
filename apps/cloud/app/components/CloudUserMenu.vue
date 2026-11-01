<script setup lang="ts">
const { t } = useI18n()

import { ChevronsUpDown } from 'lucide-vue-next'

const user = usePortalIdentity(),
  { busy, error, signOut } = useCloudSignOut()
const label = computed(
  () =>
    user.value?.name || user.value?.email || t('cloud.messages.yourAccount'),
)
const initials = computed(() =>
  label.value
    .split(/[\s@]+/)
    .slice(0, 2)
    .map((v) => v[0])
    .join('')
    .toUpperCase(),
)
const menuItems = computed(() => [
  [{ type: 'label' as const, label: label.value }],
  [
    {
      label: t('cloud.messages.accountSecurity'),
      icon: 'i-lucide-user-round',
      to: '/account',
    },
    {
      label: t('cloud.billing.plan'),
      icon: 'i-lucide-credit-card',
      to: '/account/plan',
    },
    {
      label: t('cloud.billing.redeem'),
      icon: 'i-lucide-ticket',
      to: '/account/redeem',
    },
    {
      label: 'support@chronoframe.art',
      icon: 'i-lucide-mail',
      href: 'mailto:support@chronoframe.art',
    },
  ],
  [
    {
      label: busy.value
        ? t('cloud.messages.signingOut')
        : t('cloud.messages.signOut'),
      icon: 'i-lucide-log-out',
      disabled: busy.value,
      onSelect: () => signOut(),
    },
  ],
])
</script>
<template>
  <div class="cf-user-menu">
    <p
      v-if="error"
      class="cf-error-message"
      role="alert"
    >
      {{ error }}
    </p>
    <UDropdownMenu
      :items="menuItems"
      :content="{
        side: 'top',
        align: 'start',
        sideOffset: 8,
        collisionPadding: 12,
      }"
    >
      <UButton
        color="neutral"
        variant="ghost"
        class="cf-user-trigger"
        :aria-label="$t('cloud.messages.openUserMenu')"
      >
        <UAvatar
          :text="initials"
          :src="user?.image || undefined"
          size="sm"
        />
        <span class="cf-user-identity"
          ><strong>{{ label }}</strong
          ><span>{{
            user?.email || $t('cloud.messages.accountSettings')
          }}</span></span
        >
        <ChevronsUpDown :size="15" />
      </UButton>
    </UDropdownMenu>
  </div>
</template>
