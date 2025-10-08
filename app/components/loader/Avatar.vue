<script lang="ts" setup>
import TanmantangIcon from '~/components/icon/TanmantangIcon.vue'

const config = useRuntimeConfig()
</script>

<template>
  <div class="relative size-20">
    <div
      class="absolute inset-0 rounded-full border-3 border-transparent border-x-primary border-y-secondary animate-spin"
    ></div>

    <div class="absolute inset-1 rounded-full overflow-hidden">
      <img
        v-if="config.public.app.avatarUrl"
        class="w-full h-full object-cover"
        :src="config.public.app.avatarUrl"
        alt="Loading..."
      />
      <TanmantangIcon 
        v-else 
        class="w-full h-full object-cover" 
      />
    </div>
  </div>
</template>

<style scoped>
@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.animate-spin {
  animation: spin 0.8s linear infinite;
}
</style>
