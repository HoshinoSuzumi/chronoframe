<script setup lang="ts">
import { ArrowUpRight, ArrowRight, Menu } from 'lucide-vue-next'
const route = useRoute()
const { authenticated } = useCloudMarketingSession()
const mobileMenuOpen = ref(false),
  links = useCloudLinks()
</script>
<template>
  <header class="cf-marketing-header">
    <CloudBrand />
    <nav
      class="cf-marketing-nav"
      :aria-label="$t('cloud.messages.mainNavigation')"
    >
      <NuxtLink
        to="/pricing"
        :aria-current="route.path === '/pricing' ? 'page' : undefined"
        >{{ $t('cloud.billing.pricing') }}</NuxtLink
      ><a href="https://docs.chronoframe.art/">{{
        $t('cloud.messages.documentation')
      }}</a
      ><a href="https://github.com/HoshinoSuzumi/chronoframe"
        >GitHub
        <ArrowUpRight
          :size="12"
          aria-hidden="true"
          class="cf-inline-icon" /></a
      ><CloudThemeToggle />
      <CfButton
        v-if="authenticated"
        size="sm"
        :to="links.console"
        external
        >{{ $t('cloud.messages.visitConsole') }}<ArrowUpRight :size="14"
      /></CfButton>
      <template v-else>
        <CfButton
          variant="secondary"
          size="sm"
          :to="links.signin"
          external
          >{{ $t('cloud.messages.logIn') }}</CfButton
        ><CfButton
          size="sm"
          :to="links.signup"
          external
          >{{ $t('cloud.messages.getStarted') }}<ArrowUpRight :size="14"
        /></CfButton>
      </template>
    </nav>
    <div class="cf-mobile-header-actions">
      <CfButton
        size="sm"
        :to="authenticated ? links.console : links.signup"
        external
        >{{
          $t(
            authenticated
              ? 'cloud.messages.visitConsole'
              : 'cloud.messages.signUp',
          )
        }}</CfButton
      >
      <UPopover
        v-model:open="mobileMenuOpen"
        :content="{ align: 'end', sideOffset: 12, collisionPadding: 20 }"
        :ui="{ content: 'cf-mobile-menu' }"
      >
        <CfButton
          variant="ghost"
          size="icon"
          :aria-label="$t('cloud.messages.openNavigation')"
          ><Menu :size="20"
        /></CfButton>
        <template #content>
          <nav :aria-label="$t('cloud.messages.mobileNavigation')">
            <NuxtLink
              :to="authenticated ? links.console : links.signin"
              external
              >{{
                $t(
                  authenticated
                    ? 'cloud.messages.visitConsole'
                    : 'cloud.messages.logIn',
                )
              }}<ArrowRight :size="16"
            /></NuxtLink>
            <NuxtLink to="/pricing">{{ $t('cloud.billing.pricing') }}</NuxtLink
            ><a href="https://docs.chronoframe.art/"
              >{{ $t('cloud.messages.documentation') }}<ArrowUpRight :size="15"
            /></a>
            <a href="https://github.com/HoshinoSuzumi/chronoframe"
              >GitHub <ArrowUpRight :size="15"
            /></a>
          </nav>
          <div class="cf-mobile-menu-theme">
            <span>{{ $t('cloud.messages.appearance') }}</span
            ><CloudThemeToggle />
          </div>
        </template>
      </UPopover>
    </div>
  </header>
</template>
