<script setup lang="ts">
const { t } = useI18n()

import { accountError } from '../utils/account-error'
useSeoMeta({
  title: t('cloud.messages.setANewPasswordChronoframeCloud'),
  robots: 'noindex',
  referrer: 'no-referrer',
})
const route = useRoute(),
  password = ref(''),
  confirmation = ref(''),
  busy = ref(false),
  done = ref(false),
  error = ref('')
const token = typeof route.query.token === 'string' ? route.query.token : ''
async function submit() {
  if (password.value !== confirmation.value) {
    error.value = t('cloud.messages.thePasswordsDoNotMatch')
    return
  }
  busy.value = true
  error.value = ''
  try {
    await $fetch('/api/auth/reset-password', {
      method: 'POST',
      body: { token, newPassword: password.value },
    })
    password.value = ''
    confirmation.value = ''
    done.value = true
    await navigateTo('/reset-password', { replace: true })
  } catch (cause) {
    error.value = accountError(cause, t)
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <CloudAuthLayout
    ><h1>{{ $t('cloud.messages.setANewPassword') }}</h1>
    <p
      v-if="done"
      class="cf-notice"
      role="status"
    >
      {{ $t('cloud.messages.yourPasswordHasBeenUpdatedSignInWithYour') }}
    </p>
    <form
      v-else-if="token"
      @submit.prevent="submit"
    >
      <label for="password">{{ $t('cloud.messages.newPassword') }}</label
      ><CfInput
        id="password"
        v-model="password"
        type="password"
        autocomplete="new-password"
        minlength="12"
        maxlength="128"
        required
        :disabled="busy"
      /><label for="confirmation">{{
        $t('cloud.messages.confirmPassword')
      }}</label
      ><CfInput
        id="confirmation"
        v-model="confirmation"
        type="password"
        autocomplete="new-password"
        minlength="12"
        maxlength="128"
        required
        :disabled="busy"
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
        >{{ $t('cloud.messages.saveNewPassword') }}</CfButton
      >
    </form>
    <p
      v-else
      class="cf-notice"
    >
      {{ $t('cloud.messages.thisResetLinkIsInvalidOrExpired')
      }}<NuxtLink to="/forgot-password">{{
        $t('cloud.messages.requestANewLink')
      }}</NuxtLink
      >.
    </p>
    <p class="cf-auth-hint">
      <NuxtLink
        to="/signin"
        class="cf-text-link"
        >{{ $t('cloud.messages.backToSignIn') }}</NuxtLink
      >
    </p></CloudAuthLayout
  >
</template>
