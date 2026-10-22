<script setup lang="ts">
useSeoMeta({ title: 'Your account — ChronoFrame', robots: 'noindex' })
const { data: session } = await useFetch('/api/auth/session')
if (!session.value?.authenticated) await navigateTo('/signin')
async function signOut() {
  await $fetch('/api/auth/logout', { method: 'POST' })
  clearNuxtData()
  useEntryContext().value = null
  useSettingsStore().$reset()
  await navigateTo('/signin')
}
</script>
<template>
  <main class="cloud-message">
    <NuxtLink
      to="/"
      class="brand"
      >ChronoFrame</NuxtLink
    >
    <h1>Your ChronoFrame account</h1>
    <p>
      Your email is verified. Workspace and site setup are coming in the next
      stage.
    </p>
    <NuxtLink to="/sites">Your sites</NuxtLink>
    <UButton @click="signOut">Sign out</UButton>
  </main>
</template>
