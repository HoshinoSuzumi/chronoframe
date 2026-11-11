<script setup lang="ts">
import { Mail, Smartphone, KeyRound, ShieldCheck } from 'lucide-vue-next'
import type {
  AccountSecurity,
  TwoFactorMethod,
} from '@chronoframe/contracts/account-security'
import { accountError } from '../utils/account-error'

const props = defineProps<{
  security: AccountSecurity | null
  refresh: () => Promise<unknown>
}>()
const { t } = useI18n()
const toast = useToast()
const busy = ref(false)
const password = ref('')
const code = ref('')
const error = ref('')
const authenticatorError = ref('')
const qr = ref('')
const totpURI = ref('')
const backupCodes = ref<string[]>([])
const modal = ref<'confirm' | 'setup' | 'recovery' | null>(null)
const action = ref<'enable' | 'remove' | 'primary' | 'recovery'>('enable')
const selected = ref<TwoFactorMethod | null>(null)
const methods: TwoFactorMethod[] = ['totp', 'otp']
const configured = (method: TwoFactorMethod) =>
  props.security?.methods.includes(method) ?? false
const methodName = (method: TwoFactorMethod | null) =>
  t(method === 'totp' ? 'cloud.security.authenticator' : 'cloud.security.email')
const title = computed(() =>
  modal.value === 'setup'
    ? t('cloud.messages.setUpAuthenticator')
    : modal.value === 'recovery'
      ? t('cloud.security.recoveryCodes')
      : action.value === 'primary'
        ? t('cloud.security.primaryTitle')
        : action.value === 'recovery'
          ? t('cloud.messages.replaceRecoveryCodes')
          : action.value === 'remove'
            ? t('cloud.security.removeTitle', {
                method: methodName(selected.value),
              })
            : t('cloud.security.configureTitle', {
                method: methodName(selected.value),
              }),
)
const description = computed(() =>
  modal.value === 'setup'
    ? t('cloud.security.scanHelp')
    : modal.value === 'recovery'
      ? t('cloud.security.recoveryHelp')
      : action.value === 'remove'
        ? t(
            props.security?.methods.length === 1
              ? 'cloud.security.removeLastHelp'
              : 'cloud.security.removeHelp',
          )
        : action.value === 'primary'
          ? t('cloud.security.primaryConfirm', {
              method: selected.value
                ? methodName(selected.value)
                : t('cloud.security.automatic'),
            })
          : action.value === 'recovery'
            ? t('cloud.security.replaceRecoveryHelp')
            : selected.value === 'otp'
              ? t('cloud.security.emailSetupHelp')
              : t('cloud.security.authenticatorSetupHelp'),
)

/** Open an explicit settings action without reusing a previous confirmation password. */
function requestAction(
  value: typeof action.value,
  method: TwoFactorMethod | null = null,
) {
  action.value = value
  selected.value = method
  password.value = ''
  error.value = ''
  modal.value = 'confirm'
}
/** Clear code feedback before allowing the next verification attempt. */
function editCode() {
  error.value = ''
  authenticatorError.value = ''
}
/** Configure, remove or prefer one method after server-side account reauthentication. */
async function submitAction() {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    const endpoint =
      action.value === 'primary'
        ? 'preferred'
        : action.value === 'remove'
          ? 'remove-method'
          : action.value === 'recovery'
            ? 'generate-backup-codes'
            : 'enable'
    const result = await $fetch<{
      totpURI?: string
      backupCodes?: string[]
      methods?: TwoFactorMethod[]
    }>(`/api/auth/two-factor/${endpoint}`, {
      method: 'POST',
      body: {
        password: password.value || undefined,
        ...(action.value === 'recovery' ? {} : { method: selected.value }),
        ...(action.value === 'remove'
          ? { confirmDisable: props.security?.methods.length === 1 }
          : {}),
      },
    })
    password.value = ''
    if (action.value === 'remove') {
      totpURI.value = ''
      qr.value = ''
      code.value = ''
      if (result.methods?.length === 0) backupCodes.value = []
    }
    if (result.backupCodes) backupCodes.value = result.backupCodes
    if (result.totpURI) {
      totpURI.value = result.totpURI
      code.value = ''
      const QRCode = await import('qrcode')
      qr.value = await QRCode.toDataURL(result.totpURI, {
        width: 240,
        margin: 2,
      })
      modal.value = 'setup'
    } else {
      modal.value = result.backupCodes ? 'recovery' : null
      toast.add({ title: t('cloud.security.saved'), color: 'success' })
    }
    await props.refresh()
  } catch (cause) {
    error.value = accountError(cause, t)
  } finally {
    busy.value = false
  }
}
/** Verify authenticator enrollment before marking the method as configured. */
async function confirmAuthenticator() {
  if (busy.value || !/^[0-9]{6}$/.test(code.value)) return
  busy.value = true
  error.value = ''
  authenticatorError.value = ''
  try {
    try {
      await $fetch('/api/auth/two-factor/verify-totp', {
        method: 'POST',
        body: { code: code.value },
      })
    } catch (cause) {
      authenticatorError.value = accountError(cause, t)
      throw cause
    }
    code.value = ''
    qr.value = ''
    totpURI.value = ''
    modal.value = backupCodes.value.length ? 'recovery' : null
    await props.refresh()
    toast.add({ title: t('cloud.security.saved'), color: 'success' })
  } catch (cause) {
    error.value = accountError(cause, t)
  } finally {
    busy.value = false
  }
}
/** Clear displayed recovery secrets once the user has saved them. */
function acknowledgeRecovery() {
  backupCodes.value = []
  close()
}
/** Dismiss the panel without retaining a reauthentication password. */
function close() {
  if (busy.value) return
  password.value = ''
  error.value = ''
  modal.value = null
}
</script>

<template>
  <section
    class="cf-two-factor"
    aria-labelledby="two-factor-title"
  >
    <div class="cf-two-factor-heading">
      <div>
        <h2 id="two-factor-title">
          {{ $t('cloud.messages.twoStepVerification') }}
        </h2>
        <p>{{ $t('cloud.security.help') }}</p>
      </div>
      <CfBadge :tone="security?.twoFactorEnabled ? 'success' : 'neutral'">
        <ShieldCheck
          v-if="security?.twoFactorEnabled"
          :size="12"
        />
        {{
          $t(
            security?.twoFactorEnabled
              ? 'cloud.messages.enabled'
              : 'cloud.messages.off',
          )
        }}
      </CfBadge>
    </div>
    <CfCard
      v-if="security?.methods.length"
      class="cf-factor-primary"
    >
      <div>
        <h3>{{ $t('cloud.security.primaryTitle') }}</h3>
        <p>{{ $t('cloud.security.primaryHelp') }}</p>
      </div>
      <CfSelect
        :model-value="security.preferredMethod ?? 'auto'"
        :disabled="busy"
        :aria-label="$t('cloud.security.primaryTitle')"
        @update:model-value="
          requestAction(
            'primary',
            $event === 'auto' ? null : ($event as TwoFactorMethod),
          )
        "
      >
        <option value="auto">{{ $t('cloud.security.automatic') }}</option>
        <option
          v-for="method in security.methods"
          :key="method"
          :value="method"
        >
          {{ methodName(method) }}
        </option>
      </CfSelect>
    </CfCard>
    <CfCard class="cf-factor-list">
      <div class="cf-factor-list-heading">
        {{ $t('cloud.security.methods') }}
      </div>
      <div
        v-for="method in methods"
        :key="method"
        class="cf-factor-row"
      >
        <component
          :is="method === 'totp' ? Smartphone : Mail"
          :size="20"
          aria-hidden="true"
        />
        <div class="cf-factor-detail">
          <div class="cf-factor-title">
            <h3>{{ methodName(method) }}</h3>
            <CfBadge
              v-if="configured(method)"
              tone="success"
              >{{ $t('cloud.security.configured') }}</CfBadge
            >
            <CfBadge
              v-if="configured(method) && security?.defaultMethod === method"
              >{{ $t('cloud.security.primary') }}</CfBadge
            >
          </div>
          <p>
            {{
              $t(
                method === 'totp'
                  ? 'cloud.security.authenticatorHelp'
                  : 'cloud.security.emailHelp',
              )
            }}
          </p>
        </div>
        <CfButton
          v-if="configured(method)"
          variant="outline"
          size="sm"
          :disabled="busy"
          @click="requestAction('remove', method)"
        >
          {{ $t('cloud.messages.remove') }}
        </CfButton>
        <CfButton
          v-else
          variant="outline"
          size="sm"
          :disabled="busy"
          @click="
            method === 'totp' && totpURI
              ? (modal = 'setup')
              : requestAction('enable', method)
          "
        >
          {{
            $t(
              method === 'totp' && totpURI
                ? 'cloud.security.continueSetup'
                : 'cloud.security.configure',
            )
          }}
        </CfButton>
      </div>
      <template v-if="security?.twoFactorEnabled">
        <div class="cf-factor-list-heading">
          {{ $t('cloud.security.recoveryOptions') }}
        </div>
        <div class="cf-factor-row">
          <KeyRound
            :size="20"
            aria-hidden="true"
          />
          <div class="cf-factor-detail">
            <h3>{{ $t('cloud.security.recoveryCodes') }}</h3>
            <p>{{ $t('cloud.security.recoveryHelp') }}</p>
          </div>
          <CfButton
            variant="outline"
            size="sm"
            :disabled="busy"
            @click="
              backupCodes.length
                ? (modal = 'recovery')
                : requestAction('recovery')
            "
          >
            {{
              $t(
                backupCodes.length
                  ? 'cloud.security.viewCodes'
                  : 'cloud.messages.replaceRecoveryCodes',
              )
            }}
          </CfButton>
        </div>
      </template>
    </CfCard>
    <UModal
      :open="!!modal"
      :title="title"
      :description="description"
      @update:open="!$event && close()"
    >
      <template #body>
        <form
          v-if="modal === 'confirm'"
          id="factor-action"
          class="cf-factor-form"
          @submit.prevent="submitAction"
        >
          <template v-if="security?.hasPassword">
            <label for="factor-password">{{
              $t('cloud.messages.currentPassword')
            }}</label>
            <CfInput
              id="factor-password"
              v-model="password"
              type="password"
              autocomplete="current-password"
              required
              :disabled="busy"
              autofocus
            />
          </template>
          <p
            v-else
            class="cf-field-hint"
          >
            {{ $t('cloud.security.recentSignIn') }}
          </p>
        </form>
        <form
          v-else-if="modal === 'setup'"
          id="factor-setup"
          class="cf-factor-form cf-factor-setup"
          @submit.prevent="confirmAuthenticator"
        >
          <img
            v-if="qr"
            :src="qr"
            width="240"
            height="240"
            :alt="
              $t('cloud.messages.scanThisPrivateQrCodeWithYourAuthenticatorApp')
            "
          />
          <details>
            <summary>{{ $t('cloud.messages.cannotScanTheQrCode') }}</summary>
            <p class="cf-secret-value">{{ totpURI }}</p>
          </details>
          <label for="totp-code">{{
            $t('cloud.messages.authenticatorCode')
          }}</label>
          <CfCodeSlots
            id="totp-code"
            v-model="code"
            :aria-label="$t('cloud.messages.authenticatorCode')"
            :status="authenticatorError ? 'error' : 'idle'"
            :disabled="busy"
            @edit="editCode"
            @complete="confirmAuthenticator"
            required
          />
          <p
            v-if="backupCodes.length"
            class="cf-field-hint"
          >
            {{ $t('cloud.security.newRecoveryWarning') }}
          </p>
        </form>
        <div
          v-else-if="modal === 'recovery'"
          class="cf-factor-form"
        >
          <p>
            {{ $t('cloud.messages.theseAreOnlyShownHereKeepThemOutsideThis') }}
          </p>
          <ul class="cf-recovery-codes">
            <li
              v-for="item in backupCodes"
              :key="item"
            >
              <code>{{ item }}</code>
            </li>
          </ul>
        </div>
        <p
          v-if="error"
          class="cf-error-message"
          role="alert"
        >
          {{ error }}
        </p>
      </template>
      <template #footer>
        <div class="cf-factor-footer">
          <CfButton
            v-if="modal !== 'recovery'"
            variant="outline"
            :disabled="busy"
            @click="close"
            >{{ $t('cloud.messages.cancel') }}</CfButton
          >
          <CfButton
            v-if="modal === 'confirm'"
            type="submit"
            form="factor-action"
            :variant="action === 'remove' ? 'destructive' : 'default'"
            :loading="busy"
            :disabled="security?.hasPassword && !password"
          >
            {{
              $t(
                action === 'remove'
                  ? 'cloud.messages.remove'
                  : 'cloud.security.confirm',
              )
            }}
          </CfButton>
          <CfButton
            v-else-if="modal === 'setup'"
            type="submit"
            form="factor-setup"
            :loading="busy"
            :disabled="code.length !== 6"
            >{{ $t('cloud.messages.verifyAndEnable') }}</CfButton
          >
          <CfButton
            v-else
            @click="acknowledgeRecovery"
            >{{ $t('cloud.messages.iHaveSavedMyCodes') }}</CfButton
          >
        </div>
      </template>
    </UModal>
  </section>
</template>

<style scoped>
.cf-two-factor {
  display: grid;
  gap: 16px;
  margin-block: 28px;
}
.cf-two-factor-heading,
.cf-factor-primary,
.cf-factor-row {
  display: flex;
  align-items: center;
  gap: 16px;
}
.cf-two-factor-heading {
  justify-content: space-between;
}
.cf-two-factor h2 {
  font-size: 18px;
  font-weight: 600;
}
.cf-two-factor h3 {
  font-size: 14px;
  font-weight: 600;
}
.cf-two-factor p {
  color: var(--muted-foreground);
  font-size: 13px;
  line-height: 1.6;
  margin-top: 4px;
}
.cf-factor-primary {
  display: grid;
  gap: 12px;
  padding: 16px;
}
.cf-factor-primary :deep(.cf-select) {
  width: min(100%, 320px);
}
.cf-factor-list {
  overflow: hidden;
}
.cf-factor-list-heading {
  padding: 12px 18px;
  background: var(--muted);
  font-size: 13px;
  font-weight: 600;
}
.cf-factor-row {
  padding: 18px;
}
.cf-factor-row + .cf-factor-row {
  border-top: 1px solid var(--border);
}
.cf-factor-row > svg {
  flex-shrink: 0;
  color: var(--muted-foreground);
}
.cf-factor-detail {
  flex: 1;
  min-width: 0;
}
.cf-factor-title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.cf-factor-form {
  display: grid;
  gap: 12px;
}
.cf-factor-setup img {
  margin-inline: auto;
}
.cf-factor-setup :deep(.cf-code-slots) {
  max-width: none;
}
.cf-factor-footer {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
  width: 100%;
}
@media (max-width: 600px) {
  .cf-factor-row {
    flex-wrap: wrap;
    gap: 12px;
    padding: 16px;
  }
  .cf-factor-detail {
    flex-basis: calc(100% - 32px);
  }
  .cf-factor-row > button {
    margin-left: 32px;
  }
}
</style>
