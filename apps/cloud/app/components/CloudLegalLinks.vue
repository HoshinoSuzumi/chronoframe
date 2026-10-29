<template>
  <nav
    class="cf-legal-links"
    :aria-label="$t('cloud.legal.navigation')"
  >
    <NuxtLink to="/legal/terms">{{ $t('cloud.legal.terms') }}</NuxtLink>
    <span aria-hidden="true">·</span>
    <NuxtLink to="/legal/privacy">{{ $t('cloud.legal.privacy') }}</NuxtLink>
  </nav>
</template>
