<script setup lang="ts">
import { accountError } from '../utils/account-error'
useSeoMeta({
  title: 'Set a new password — ChronoFrame Cloud',
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
    error.value = 'The passwords do not match.'
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
    error.value = accountError(cause)
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <CloudAuthLayout
    ><h1>Set a new password.</h1>
    <p
      v-if="done"
      class="cf-notice"
      role="status"
    >
      Your password has been updated. Sign in with your new password.
    </p>
    <form
      v-else-if="token"
      @submit.prevent="submit"
    >
      <label for="password">New password</label
      ><CloudInput
        id="password"
        v-model="password"
        type="password"
        autocomplete="new-password"
        minlength="12"
        maxlength="128"
        required
        :disabled="busy"
      /><label for="confirmation">Confirm password</label
      ><CloudInput
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
      <CloudButton
        type="submit"
        :loading="busy"
        >Save new password</CloudButton
      >
    </form>
    <p
      v-else
      class="cf-notice"
    >
      This reset link is invalid or expired.
      <NuxtLink to="/forgot-password">Request a new link</NuxtLink>.
    </p>
    <p class="cf-auth-hint">
      <NuxtLink
        to="/signin"
        class="cf-text-link"
        >Back to sign in</NuxtLink
      >
    </p></CloudAuthLayout
  >
</template>
