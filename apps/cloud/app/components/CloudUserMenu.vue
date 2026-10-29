<script setup lang="ts">
const { t } = useI18n()

import {
  ChevronsUpDown,
  UserRound,
  LogOut,
  CreditCard,
  Ticket,
} from 'lucide-vue-next'
import {
  DropdownMenuRoot,
  DropdownMenuTrigger,
  DropdownMenuPortal,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from 'reka-ui'
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
    <DropdownMenuRoot
      ><DropdownMenuTrigger as-child
        ><button
          class="cf-user-trigger"
          :aria-label="$t('cloud.messages.openUserMenu')"
        >
          <span class="cf-user-avatar">{{ initials }}</span
          ><span class="cf-user-identity"
            ><strong>{{ label }}</strong
            ><span>{{
              user?.email || $t('cloud.messages.accountSettings')
            }}</span></span
          ><ChevronsUpDown :size="15" /></button
      ></DropdownMenuTrigger>
      <DropdownMenuPortal
        ><DropdownMenuContent
          class="cf-account-menu"
          side="top"
          align="start"
          :side-offset="8"
          :collision-padding="12"
          :aria-label="$t('cloud.messages.userMenu')"
        >
          <div class="cf-account-menu-label">
            <strong>{{ label }}</strong
            ><span>{{ user?.email }}</span>
          </div>
          <DropdownMenuSeparator class="cf-menu-separator" />
          <DropdownMenuItem as-child
            ><NuxtLink to="/account"
              ><UserRound :size="16" />{{
                $t('cloud.messages.accountSecurity')
              }}</NuxtLink
            ></DropdownMenuItem
          >
          <DropdownMenuItem as-child
            ><NuxtLink to="/account/plan"
              ><CreditCard :size="16" />{{ $t('cloud.billing.plan') }}</NuxtLink
            ></DropdownMenuItem
          ><DropdownMenuItem as-child
            ><NuxtLink to="/account/redeem"
              ><Ticket :size="16" />{{ $t('cloud.billing.redeem') }}</NuxtLink
            ></DropdownMenuItem
          >
          <DropdownMenuItem as-child><CloudSupportLink /></DropdownMenuItem>
          <DropdownMenuSeparator class="cf-menu-separator" />
          <DropdownMenuItem
            :disabled="busy"
            @select="signOut"
            ><LogOut :size="16" />{{
              busy
                ? $t('cloud.messages.signingOut')
                : $t('cloud.messages.signOut')
            }}</DropdownMenuItem
          >
        </DropdownMenuContent></DropdownMenuPortal
      >
    </DropdownMenuRoot>
  </div>
</template>
