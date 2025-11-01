<script lang="ts" setup></script>

<template>
  <div class="relative size-24">
    <div
      class="absolute inset-0 rounded-full border-2 border-transparent border-x-primary-600 border-y-secondary-600 dark:border-x-primary-400 dark:border-y-secondary-400 animate-spin drop-shadow-xl drop-shadow-primary/10"
    ></div>

    <div
      class="absolute inset-1 rounded-full overflow-hidden drop-shadow-xl drop-shadow-primary/10 bg-neutral-100 dark:bg-neutral-800"
    >
      <img
        v-if="getSetting('app:avatarUrl')"
        class="w-full h-full object-cover"
        :src="getSetting('app:avatarUrl')?.toString()"
        alt="Loading..."
      />
      <img
        v-else
        class="w-full h-full object-cover"
        src="/web-app-manifest-192x192.png"
        alt="Loading..."
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
