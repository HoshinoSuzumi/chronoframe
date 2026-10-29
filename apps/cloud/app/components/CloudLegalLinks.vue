<template>
  <nav
    class="cf-legal-links"
    :aria-label="$t('cloud.legal.navigation')"
  >
    <NuxtLink to="/legal/terms">{{ $t('cloud.legal.terms') }}</NuxtLink>
    <NuxtLink to="/legal/privacy">{{ $t('cloud.legal.privacy') }}</NuxtLink>
  </nav>
</template>
