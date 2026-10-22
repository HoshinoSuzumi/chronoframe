<script setup lang="ts">
useSeoMeta({ title: 'Sign in — ChronoFrame', robots: 'noindex' })
const { data: status } = await useFetch('/api/auth/status')
const email = ref('')
const code = ref('')
const challenge = ref<string>()
const busy = ref(false)
const error = ref('')
function resetChallenge() {
  challenge.value = undefined
  code.value = ''
  error.value = ''
}
async function submit() {
  if (busy.value || !status.value?.enabled) return
  busy.value = true
  error.value = ''
  try {
    if (!challenge.value) {
      const result = await $fetch('/api/auth/email/request', {
        method: 'POST',
        body: { email: email.value },
      })
      challenge.value = result.challengeId
    } else {
      await $fetch('/api/auth/email/verify', {
        method: 'POST',
        body: {
          email: email.value,
          code: code.value,
          challengeId: challenge.value,
        },
      })
      await navigateTo('/account')
    }
  } catch (cause) {
    const status = (cause as { statusCode?: number }).statusCode
    error.value =
      status === 429
        ? 'Please wait before requesting another code.'
        : status === 401
          ? 'The code is invalid or expired. Try again or request a new code.'
          : 'Sign-in could not be completed. Please try again later.'
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <main class="cloud-message">
    <NuxtLink
      to="/"
      class="brand"
      >ChronoFrame</NuxtLink
    >
    <h1>Sign in with your email.</h1>
    <template v-if="status?.enabled">
      <p>We will email you a six-digit code. It expires in 10 minutes.</p>
      <form
        @submit.prevent="submit"
        class="flex max-w-sm flex-col gap-4"
      >
        <label for="signin-email">Email address</label>
        <UInput
          id="signin-email"
          v-model="email"
          type="email"
          autocomplete="email"
          :disabled="!!challenge || busy"
          required
        />
        <template v-if="challenge">
          <label for="signin-code">Verification code</label>
          <UInput
            id="signin-code"
            v-model="code"
            inputmode="numeric"
            autocomplete="one-time-code"
            pattern="[0-9]{6}"
            maxlength="6"
            required
          />
        </template>
        <p
          v-if="error"
          role="alert"
        >
          {{ error }}
        </p>
        <UButton
          type="submit"
          :loading="busy"
          >{{ challenge ? 'Sign in' : 'Send code' }}</UButton
        >
        <UButton
          v-if="challenge"
          variant="ghost"
          :disabled="busy"
          @click="resetChallenge"
          >Use another email or request a new code</UButton
        >
      </form>
    </template>
    <template v-else>
      <p>
        Email sign-in is not available on this deployment yet. You can use
        ChronoFrame today by running the self-hosted edition.
      </p>
      <UButton to="https://github.com/HoshinoSuzumi/chronoframe"
        >Explore Self-hosted</UButton
      >
    </template>
  </main>
</template>
