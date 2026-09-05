<script lang="ts" setup>
useHead({
  title: () => $t('auth.form.signin.title'),
})

const { fetch: fetchUserSession } = useUserSession()
const config = useRuntimeConfig()
const settingsStore = useSettingsStore()
const toast = useToast()
const route = useRoute()
const router = useRouter()

const appTitle = computed(() => settingsStore.getSetting('app:title') || config.public.app.title)

const isLoading = ref(false)

const githubOauthEnabled = computed(() => {
  const settingsValue = settingsStore.getSetting('system:auth.github.enabled')
  if (typeof settingsValue === 'boolean') {
    return settingsValue
  }

  return Boolean(config.public.oauth.github.enabled)
})

const onAuthSubmit = async (event: any) => {
  isLoading.value = true
  await $fetch('/api/login', {
    method: 'POST',
    body: event.data,
  })
    .then(async () => {
      await fetchUserSession()
      router.push(route.query.redirect?.toString() || '/')
    })
    .catch((error) => {
      console.error('Login error:', error)
      toast.add({
        color: 'error',
        title: $t('auth.messages.loginFailed.title'),
        description: error?.data?.message || $t('auth.messages.loginFailed.description'),
      })
    })
    .finally(() => {
      isLoading.value = false
    })
}
</script>

<template>
  <div
    class="w-full min-h-svh flex flex-col items-center justify-center p-4 pb-12"
  >
    <AuthForm
      :title="$t('auth.form.signin.title')"
      :subtitle="$t('auth.form.signin.subtitle', [appTitle])"
      :loading="isLoading"
      :providers="[
        githubOauthEnabled && {
          icon: 'tabler:brand-github',
          size: 'lg',
          color: 'neutral',
          variant: 'subtle',
          block: true,
          label: 'GitHub',
          to: '/api/auth/github',
          external: true,
        },
      ]"
      @submit="onAuthSubmit"
    />
  </div>
</template>

<style scoped></style>
