<script setup lang="ts">
defineProps<{ light?: boolean; cloud?: boolean; compact?: boolean }>()
const links = useCloudLinks()
</script>
<template>
  <NuxtLink
    :to="links.website"
    external
    class="cf-brand"
    :class="{ 'cf-brand-light': light, 'cf-brand-compact': compact }"
    :aria-label="
      cloud
        ? $t('cloud.messages.chronoframeCloudHome')
        : $t('cloud.messages.chronoframeHome')
    "
    ><img
      v-if="!compact"
      src="/web-app-manifest-192x192.png"
      width="34"
      height="34"
      class="cf-brand-logo"
      alt=""
    /><span
      >ChronoFrame<span
        v-if="cloud"
        class="cf-brand-edition"
      >
        Cloud</span
      ><span
        v-else
        class="cf-brand-dot"
        >.</span
      ></span
    ></NuxtLink
  >
</template>
