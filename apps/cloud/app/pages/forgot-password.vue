<script setup lang="ts">
import { accountError } from '../utils/account-error'
useSeoMeta({ title: 'Reset password — ChronoFrame Cloud', robots: 'noindex' })
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
    error.value = accountError(cause)
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <CloudAuthLayout
    ><h1>A fresh start.</h1>
    <p>
      We will email you a link to reset your password. Existing email-code
      accounts can use this to set their first password.
    </p>
    <p
      v-if="sent"
      class="cf-notice"
      role="status"
    >
      If this address has an account, a password reset link is on its way. Check
      your inbox.
    </p>
    <form
      v-else
      @submit.prevent="submit"
    >
      <label for="email">Email address</label
      ><CloudInput
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
      <CloudButton
        type="submit"
        :loading="busy"
        >Send reset link</CloudButton
      >
    </form>
    <p class="cf-auth-hint">
      <NuxtLink
        to="/signin"
        class="cf-text-link"
        >Back to sign in</NuxtLink
      >
    </p></CloudAuthLayout
  >
</template>
