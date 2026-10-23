<script setup lang="ts">
import { accountError } from '../../utils/account-error'
useSeoMeta({ title: 'Account security — ChronoFrame Cloud', robots: 'noindex' })
const { data: security, refresh } = await useFetch<{
  email: string
  hasPassword: boolean
  twoFactorEnabled: boolean
  hasAuthenticator: boolean
  passkeys: { id: number; name: string | null; createdAt: string }[]
}>('/api/auth/security')
const password = ref(''),
  newPassword = ref(''),
  code = ref(''),
  passkeyName = ref('')
const busy = ref(false),
  error = ref(''),
  notice = ref(''),
  qr = ref(''),
  totpURI = ref(''),
  backupCodes = ref<string[]>([])
async function run(action: () => Promise<void>) {
  if (busy.value) return
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    await action()
    await refresh()
  } catch (cause) {
    error.value = accountError(cause)
  } finally {
    busy.value = false
  }
}
async function changePassword() {
  await run(async () => {
    await $fetch('/api/auth/change-password', {
      method: 'POST',
      body: {
        currentPassword: password.value,
        newPassword: newPassword.value,
        revokeOtherSessions: true,
      },
    })
    newPassword.value = ''
    password.value = ''
    notice.value = 'Password updated. Other sessions have been signed out.'
  })
}
async function enable(method: 'otp' | 'totp') {
  await run(async () => {
    const result = await $fetch<{ totpURI?: string; backupCodes?: string[] }>(
      '/api/auth/two-factor/enable',
      { method: 'POST', body: { password: password.value, method } },
    )
    password.value = ''
    if (result.totpURI) {
      totpURI.value = result.totpURI
      backupCodes.value = result.backupCodes ?? []
      const QRCode = await import('qrcode')
      qr.value = await QRCode.toDataURL(result.totpURI, {
        width: 240,
        margin: 2,
      })
      notice.value =
        'Scan the QR code, save your recovery codes, and enter a code to finish setup.'
    } else notice.value = 'Email second-step verification is enabled.'
  })
}
async function confirmAuthenticator() {
  await run(async () => {
    await $fetch('/api/auth/two-factor/verify-totp', {
      method: 'POST',
      body: { code: code.value },
    })
    code.value = ''
    qr.value = ''
    totpURI.value = ''
    notice.value =
      'Authenticator verified and enabled. Keep your recovery codes somewhere safe.'
  })
}
async function disable() {
  await run(async () => {
    await $fetch('/api/auth/two-factor/disable', {
      method: 'POST',
      body: { password: password.value },
    })
    password.value = ''
    backupCodes.value = []
    qr.value = ''
    totpURI.value = ''
    notice.value = 'Two-step verification has been disabled.'
  })
}
async function regenerate() {
  await run(async () => {
    const result = await $fetch<{ backupCodes: string[] }>(
      '/api/auth/two-factor/generate-backup-codes',
      { method: 'POST', body: { password: password.value } },
    )
    backupCodes.value = result.backupCodes
    password.value = ''
    notice.value =
      'New recovery codes generated. Your previous codes no longer work.'
  })
}
async function addPasskey() {
  await run(async () => {
    const result = await useCloudAccount().passkey.addPasskey({
      name: passkeyName.value.trim() || 'My passkey',
    })
    if (result.error) throw result.error
    passkeyName.value = ''
    notice.value =
      'Passkey created. Its private key stays on your device or password manager.'
  })
}
async function deletePasskey(id: number) {
  await run(async () => {
    await $fetch('/api/auth/passkey/delete-passkey', {
      method: 'POST',
      body: { id: String(id) },
    })
    notice.value = 'Passkey removed.'
  })
}
</script>
<template>
  <CloudPortalShell
    ><div class="cf-page-heading">
      <div>
        <p class="cf-eyebrow">YOUR ACCOUNT</p>
        <h1 class="cf-page-title">Security</h1>
        <p class="cf-page-description">
          Keep your space yours. {{ security?.email }}
        </p>
      </div>
    </div>
    <p
      v-if="error"
      class="cf-error-message"
      role="alert"
    >
      {{ error }}
    </p>
    <p
      v-if="notice"
      class="cf-notice"
      role="status"
    >
      {{ notice }}
    </p>
    <CloudCard class="cf-security-card"
      ><h2>Password</h2>
      <p>Use a unique password with at least 12 characters.</p>
      <form
        v-if="security?.hasPassword"
        @submit.prevent="changePassword"
      >
        <label for="current-password">Current password</label
        ><CloudInput
          id="current-password"
          v-model="password"
          type="password"
          autocomplete="current-password"
          :disabled="busy"
          required
        /><label for="new-password">New password</label
        ><CloudInput
          id="new-password"
          v-model="newPassword"
          type="password"
          autocomplete="new-password"
          minlength="12"
          maxlength="128"
          :disabled="busy"
          required
        /><CloudButton
          type="submit"
          :loading="busy"
          >Update password</CloudButton
        >
      </form>
      <p v-else>
        You signed in with an email code.
        <NuxtLink
          class="cf-text-link"
          to="/forgot-password"
          >Email yourself a link to set a password</NuxtLink
        >
        before enabling two-step verification.
      </p></CloudCard
    >
    <CloudCard class="cf-security-card"
      ><div class="cf-setting-row">
        <div>
          <h2>Two-step verification</h2>
          <p>
            After password sign-in, verify an email or authenticator code. A
            connected authenticator also protects email-code sign-in. Passkeys
            already verify you on your device.
          </p>
        </div>
        <CloudBadge
          :tone="security?.twoFactorEnabled ? 'success' : 'neutral'"
          >{{ security?.twoFactorEnabled ? 'Enabled' : 'Off' }}</CloudBadge
        >
      </div>
      <template v-if="security?.hasPassword"
        ><label for="security-password"
          >Confirm your password to change security settings</label
        ><CloudInput
          id="security-password"
          v-model="password"
          type="password"
          autocomplete="current-password"
          :disabled="busy"
        />
        <div class="cf-security-actions">
          <CloudButton
            v-if="!security.twoFactorEnabled"
            :disabled="busy || !password"
            @click="enable('otp')"
            >Enable email verification</CloudButton
          ><CloudButton
            v-if="!security.hasAuthenticator"
            variant="secondary"
            :disabled="busy || !password"
            @click="enable('totp')"
            >Set up authenticator</CloudButton
          ><CloudButton
            v-if="security.twoFactorEnabled"
            variant="destructive"
            :disabled="busy || !password"
            @click="disable"
            >Disable two-step verification</CloudButton
          >
        </div>
        <div
          v-if="totpURI"
          class="cf-totp-setup"
        >
          <img
            v-if="qr"
            :src="qr"
            width="240"
            height="240"
            alt="Scan this private QR code with your authenticator app"
          />
          <details>
            <summary>Cannot scan the QR code?</summary>
            <p class="cf-secret-value">{{ totpURI }}</p>
          </details>
          <form @submit.prevent="confirmAuthenticator">
            <label for="totp-code">Authenticator code</label
            ><CloudInput
              id="totp-code"
              v-model="code"
              inputmode="numeric"
              autocomplete="one-time-code"
              pattern="[0-9]{6}"
              maxlength="6"
              required
              :disabled="busy"
            /><CloudButton
              type="submit"
              :loading="busy"
              >Verify and enable</CloudButton
            >
          </form>
        </div>
        <div v-if="security.hasAuthenticator">
          <p>
            Authenticator connected. Recovery codes are single use. Generating
            new codes replaces the old ones.
          </p>
          <CloudButton
            variant="secondary"
            :disabled="busy || !password"
            @click="regenerate"
            >Replace recovery codes</CloudButton
          >
        </div>
        <div
          v-if="backupCodes.length"
          class="cf-notice"
        >
          <strong>Save these recovery codes privately.</strong>
          <p>These are only shown here. Keep them outside this browser.</p>
          <ul class="cf-recovery-codes">
            <li
              v-for="item in backupCodes"
              :key="item"
            >
              <code>{{ item }}</code>
            </li>
          </ul>
          <CloudButton
            variant="secondary"
            @click="backupCodes = []"
            >I have saved my codes</CloudButton
          >
        </div></template
      ></CloudCard
    >
    <CloudCard class="cf-security-card"
      ><h2>Passkeys</h2>
      <p>
        Use your device lock, fingerprint or security key. Your device creates
        the keys automatically.
      </p>
      <form @submit.prevent="addPasskey">
        <label for="passkey-name">Passkey name</label
        ><CloudInput
          id="passkey-name"
          v-model="passkeyName"
          maxlength="80"
          autocomplete="off"
          placeholder="For example, my laptop"
          :disabled="busy"
        /><CloudButton
          type="submit"
          :loading="busy"
          >Create passkey</CloudButton
        >
      </form>
      <ul
        v-if="security?.passkeys.length"
        class="cf-passkey-list"
      >
        <li
          v-for="key in security.passkeys"
          :key="key.id"
        >
          <span>{{ key.name || 'Passkey' }}</span
          ><CloudButton
            variant="destructive"
            size="sm"
            :disabled="busy"
            :aria-label="`Remove ${key.name || 'passkey'}`"
            @click="deletePasskey(key.id)"
            >Remove</CloudButton
          >
        </li>
      </ul>
      <p
        v-else
        class="cf-auth-hint"
      >
        No passkeys yet.
      </p></CloudCard
    ></CloudPortalShell
  >
</template>
