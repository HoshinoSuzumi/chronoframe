<script setup lang="ts">
import { SOCIAL_LOGIN_PROVIDERS } from '@chronoframe/contracts/social-login'
import { accountError } from '../utils/account-error'
const props = defineProps<{ providers: readonly string[] }>()
const busy = defineModel<boolean>('busy', { default: false })
const { t } = useI18n()
const { destination, authLink } = useCloudAuthDestination()
const available = computed(() =>
  SOCIAL_LOGIN_PROVIDERS.filter((provider) =>
    props.providers.includes(provider.id),
  ),
)
const selected = ref(''),
  error = ref('')
async function signIn(provider: string) {
  if (busy.value) return
  busy.value = true
  selected.value = provider
  error.value = ''
  try {
    const origin = useRequestURL().origin
    const failure = new URL('/signin', origin)
    failure.searchParams.set('oauthError', '1')
    const next = authLink('/signin').query.next
    if (next) failure.searchParams.set('next', next)
    const result = await $fetch<{ url: string }>('/api/auth/sign-in/social', {
      method: 'POST',
      body: {
        provider,
        callbackURL: new URL(destination.value, origin).toString(),
        errorCallbackURL: failure.toString(),
      },
    })
    await navigateTo(result.url, { external: true })
  } catch (cause) {
    error.value = accountError(cause, t)
  } finally {
    busy.value = false
    selected.value = ''
  }
}
</script>
<template>
  <div
    v-if="available.length"
    class="cf-social-login"
  >
    <div class="cf-social-login-grid">
      <CfButton
        v-for="provider in available"
        :key="provider.id"
        variant="outline"
        :disabled="busy"
        :loading="busy && selected === provider.id"
        :leading-icon="provider.icon"
        @click="signIn(provider.id)"
        >{{ provider.name }}</CfButton
      >
    </div>
    <p
      v-if="error"
      class="cf-error-message"
      role="alert"
    >
      {{ error }}
    </p>
  </div>
</template>
