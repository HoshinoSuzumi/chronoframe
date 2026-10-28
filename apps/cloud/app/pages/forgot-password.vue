<script setup lang="ts">
const { t } = useI18n()

import { accountError } from '../utils/account-error'
useSeoMeta({
  title: t('cloud.messages.resetPasswordChronoframeCloud'),
  robots: 'noindex',
})
const email = ref(''),
  busy = ref(false),
  sent = ref(false),
  error = ref('')
async function submit() {
  busy.value = true
  error.value = ''
  try {
    await $fetch('/api/auth/request-password-reset', {
      method: 'POST',
      body: {
        email: email.value,
        redirectTo: `${useRequestURL().origin}/reset-password`,
      },
    })
    sent.value = true
  } catch (cause) {
    error.value = accountError(cause, t)
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <CloudAuthLayout
    ><h1>{{ $t('cloud.messages.aFreshStart') }}</h1>
    <p>{{ $t('cloud.messages.weWillEmailYouALinkToResetYour') }}</p>
    <p
      v-if="sent"
      class="cf-notice"
      role="status"
    >
      {{ $t('cloud.messages.ifThisAddressHasAnAccountAPasswordReset') }}
    </p>
    <form
      v-else
      @submit.prevent="submit"
    >
      <label for="email">{{ $t('cloud.messages.emailAddress') }}</label
      ><CfInput
        id="email"
        v-model="email"
        type="email"
        autocomplete="email"
        :disabled="busy"
        required
      />
      <p
        v-if="error"
        role="alert"
        class="cf-error-message"
      >
        {{ error }}
      </p>
      <CfButton
        type="submit"
        :loading="busy"
        >{{ $t('cloud.messages.sendResetLink') }}</CfButton
      >
    </form>
    <p class="cf-auth-hint">
      <NuxtLink
        to="/signin"
        class="cf-text-link"
        >{{ $t('cloud.messages.backToSignIn') }}</NuxtLink
      >
    </p></CloudAuthLayout
  >
</template>
