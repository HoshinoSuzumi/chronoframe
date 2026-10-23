<script setup lang="ts">
import { motion } from 'motion-v'
import { ArrowLeft, ArrowRight, Mail, ShieldCheck } from 'lucide-vue-next'
const entrance = useCloudMotion()
const codeInput = ref<{ $el: HTMLInputElement }>()
const emailInput = ref<{ $el: HTMLInputElement }>()

useSeoMeta({ title: 'Sign in — ChronoFrame', robots: 'noindex' })
const { data: status } = await useFetch('/api/auth/status')
const email = ref('')
const code = ref('')
const challenge = ref<string>()
const busy = ref(false)
const error = ref('')
async function resetChallenge() {
  challenge.value = undefined
  code.value = ''
  error.value = ''
  await nextTick()
  emailInput.value?.$el?.focus()
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
      await nextTick()
      codeInput.value?.$el?.focus()
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
  <div class="cf-auth">
    <aside
      class="cf-auth-visual"
      aria-label="About ChronoFrame"
    >
      <CloudBrand light />
      <div>
        <div class="cf-auth-quote">
          <h2>A little space.<br />A different perspective.</h2>
          <p>Your photographs deserve a home that feels like you.</p>
        </div>
        <p class="cf-auth-caption">CHRONOFRAME · MADE FOR THE WAY YOU SEE</p>
      </div>
    </aside>
    <main
      id="main-content"
      class="cf-auth-main"
      tabindex="-1"
    >
      <div class="cf-auth-top">
        <NuxtLink
          to="/"
          class="cf-back-link"
          ><ArrowLeft :size="15" />Back to home</NuxtLink
        ><CloudThemeToggle />
      </div>
      <motion.div
        v-bind="entrance"
        class="cf-auth-form"
        ><CloudBadge>Cloud preview</CloudBadge>
        <h1>
          {{ challenge ? 'Check your inbox.' : 'Welcome to your space.' }}
        </h1>
        <template v-if="status?.enabled">
          <p
            v-if="challenge"
            role="status"
          >
            We sent a six-digit code to <strong>{{ email }}</strong
            >. It expires in 10 minutes.
          </p>
          <p v-else>Sign in with your email. No password to remember.</p>
          <form
            @submit.prevent="submit"
            :aria-busy="busy"
          >
            <label for="signin-email">Email address</label
            ><CloudInput
              id="signin-email"
              ref="emailInput"
              v-model="email"
              type="email"
              autocomplete="email"
              placeholder="you@example.com"
              :disabled="!!challenge || busy"
              required
            />
            <template v-if="challenge"
              ><label for="signin-code">Verification code</label
              ><CloudInput
                id="signin-code"
                ref="codeInput"
                v-model="code"
                class="cf-code-input"
                inputmode="numeric"
                autocomplete="one-time-code"
                pattern="[0-9]{6}"
                maxlength="6"
                :disabled="busy"
                :aria-invalid="!!error"
                :aria-describedby="error ? 'signin-error' : 'code-hint'"
                required
              />
              <p
                id="code-hint"
                class="cf-auth-hint"
              >
                Enter the six digits from your email.
              </p></template
            >
            <p
              v-if="error"
              id="signin-error"
              class="cf-error-message"
              role="alert"
            >
              {{ error }}
            </p>
            <CloudButton
              type="submit"
              :loading="busy"
              >{{
                busy
                  ? challenge
                    ? 'Signing in…'
                    : 'Sending code…'
                  : challenge
                    ? 'Sign in'
                    : 'Continue with email'
              }}<ArrowRight
                v-if="!busy"
                :size="16"
            /></CloudButton>
            <CloudButton
              v-if="challenge"
              variant="ghost"
              :disabled="busy"
              @click="resetChallenge"
              >Use another email or request a new code</CloudButton
            >
            <p
              v-else
              class="cf-auth-hint"
            >
              <ShieldCheck
                :size="13"
                style="
                  display: inline;
                  vertical-align: middle;
                  margin-right: 4px;
                "
              />We only use your email to help you sign in.
            </p>
          </form>
        </template>
        <template v-else
          ><div
            class="cf-notice"
            role="status"
          >
            <Mail
              :size="20"
              class="cf-notice-icon"
            /><strong
              >Email sign-in is not available on this deployment yet.</strong
            >Cloud access is still in preview. You can start your own gallery
            with the self-hosted edition today.
          </div>
          <CloudButton
            as-child
            variant="secondary"
            class="cf-action-spaced"
            ><a href="https://docs.chronoframe.art/guide/getting-started.html"
              >Explore Self-hosted<ArrowRight :size="16" /></a></CloudButton
        ></template>
      </motion.div>
      <p class="cf-auth-bottom">
        A home for your photographs.
        <a
          class="cf-text-link"
          href="https://docs.chronoframe.art/"
          >A little guidance, if you need it.</a
        >
      </p>
    </main>
  </div>
</template>
