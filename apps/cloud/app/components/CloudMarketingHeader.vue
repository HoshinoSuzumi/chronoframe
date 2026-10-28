<script setup lang="ts">
import { ArrowUpRight, ArrowRight, Menu } from 'lucide-vue-next'
import { PopoverRoot, PopoverTrigger, PopoverContent } from 'reka-ui'
const route = useRoute()
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
        as-child
        variant="secondary"
        size="sm"
        ><NuxtLink
          :to="links.signin"
          external
          >{{ $t('cloud.messages.logIn') }}</NuxtLink
        ></CfButton
      ><CfButton
        as-child
        size="sm"
        ><NuxtLink
          :to="links.signup"
          external
          >{{ $t('cloud.messages.getStarted')
          }}<ArrowUpRight :size="14" /></NuxtLink
      ></CfButton>
    </nav>
    <div class="cf-mobile-header-actions">
      <CfButton
        as-child
        size="sm"
        ><NuxtLink
          :to="links.signup"
          external
          >{{ $t('cloud.messages.signUp') }}</NuxtLink
        ></CfButton
      >
      <PopoverRoot v-model:open="mobileMenuOpen">
        <PopoverTrigger as-child
          ><CfButton
            variant="ghost"
            size="icon"
            :aria-label="$t('cloud.messages.openNavigation')"
            ><Menu :size="20" /></CfButton
        ></PopoverTrigger>
        <PopoverContent
          class="cf-mobile-menu"
          align="end"
          :side-offset="12"
          :collision-padding="20"
          :aria-label="$t('cloud.messages.navigation')"
        >
          <nav :aria-label="$t('cloud.messages.mobileNavigation')">
            <NuxtLink
              :to="links.signin"
              external
              >{{ $t('cloud.messages.logIn') }}<ArrowRight :size="16"
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
        </PopoverContent>
      </PopoverRoot>
    </div>
  </header>
</template>
