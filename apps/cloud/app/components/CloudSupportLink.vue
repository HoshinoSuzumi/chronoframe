<script setup lang="ts">
import { Mail } from 'lucide-vue-next'
</script>
<template>
  <a
    href="mailto:support@chronoframe.art"
    class="cf-support-link"
    :aria-label="
      $t('cloud.support.email', { email: 'support@chronoframe.art' })
    "
    ><Mail
      :size="14"
      aria-hidden="true"
    /><span>support@chronoframe.art</span></a
  >
</template>
