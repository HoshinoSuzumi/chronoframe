<script setup lang="ts">
useSeoMeta({ title: 'Your account — ChronoFrame', robots: 'noindex' })
const { data: session } = await useFetch('/api/auth/session')
if (!session.value?.authenticated) await navigateTo('/signin')
async function signOut() {
  await $fetch('/api/auth/logout', { method: 'POST' })
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
    <UButton @click="signOut">Sign out</UButton>
  </main>
</template>
