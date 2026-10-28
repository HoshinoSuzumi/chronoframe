<script setup lang="ts">
const {
  connections,
  allowance,
  connectionId,
  storage,
  rotation,
  saveStorage,
  rotateStorage,
  busy,
  admin,
  failed,
  message,
  action,
  api,
  base,
} = useCloudSiteMedia()
const quota = useCloudQuota(useEntryContext().value?.workspaceId)
const { t } = useI18n()
const removal = ref<string | null>(null)
const rotationId = ref('')
watch(rotationId, () => {
  rotation.accessKeyId = ''
  rotation.secretAccessKey = ''
})
async function selectStorage(id: string) {
  const saved = await action(
    () =>
      api(base.value + '/storage/' + id + '/select', {
        method: 'POST',
        body: {},
      }),
    t('cloud.storageManager.switched'),
  )
  if (saved) connectionId.value = id
}
async function removeStorage() {
  if (!removal.value) return
  if (
    await action(
      () =>
        api(base.value + '/storage/' + removal.value + '/remove', {
          method: 'POST',
          body: {},
        }),
      t('cloud.storageManager.removed'),
    )
  )
    removal.value = null
}
const byosAdmission = computed(() => quota.gate('byos'))
</script>
<template>
  <CfCard
    ><div class="cf-panel-heading">
      <h2>{{ $t('cloud.messages.storage') }}</h2>
      <p>
        {{
          $t(
            allowance?.byosLimits.byos
              ? 'cloud.messages.connectAPrivateS3CompatibleBucketForYourPhotographs'
              : 'cloud.storageAllowance.managedHelp',
          )
        }}
      </p>
    </div>
    <div class="cf-panel-body cf-media-controls">
      <CloudQuotaNotice
        v-if="admin && (byosAdmission.reason || quota.error.value)"
        :reason="byosAdmission.reason"
        :error="!!quota.error.value"
        @retry="quota.refresh()"
      />
      <p class="cf-field-hint">{{ $t('cloud.storageManager.help') }}</p>
      <div class="cf-storage-options">
        <article
          v-for="connection in connections"
          :key="connection.id"
          class="cf-storage-option"
          :class="{
            'is-selected': connection.id === connectionId,
            'is-retired': connection.retired,
          }"
        >
          <div>
            <strong>{{
              connection.pool_id
                ? $t('cloud.messages.platformStorage')
                : connection.config.bucket
            }}</strong>
            <p class="cf-field-hint">
              {{
                connection.retired
                  ? $t('cloud.storageManager.archived')
                  : connection.id === connectionId
                    ? $t('cloud.storageManager.current')
                    : $t('cloud.storageManager.available')
              }}
            </p>
          </div>
          <div
            class="cf-storage-option-actions"
            v-if="admin"
          >
            <CfButton
              size="sm"
              variant="secondary"
              :disabled="
                busy ||
                connection.id === connectionId ||
                connection.uploads_enabled === 0 ||
                (!connection.pool_id && !allowance?.byosLimits.byos)
              "
              v-if="!connection.retired"
              @click="selectStorage(connection.id)"
              >{{ $t('cloud.storageManager.use') }}</CfButton
            >
            <CfButton
              v-if="!connection.pool_id"
              size="sm"
              variant="secondary"
              :disabled="busy"
              @click="rotationId = connection.id"
              >{{ $t('cloud.messages.rotateStorageCredentials') }}</CfButton
            >
            <CfButton
              v-if="!connection.pool_id && !connection.retired"
              size="sm"
              variant="ghost"
              :disabled="busy"
              @click="removal = connection.id"
              >{{ $t('cloud.messages.delete') }}</CfButton
            >
          </div>
        </article>
      </div>
      <UModal
        :open="!!removal"
        :title="$t('cloud.storageManager.removeTitle')"
        :description="$t('cloud.storageManager.removeHelp')"
        :dismissible="!busy"
        @update:open="
          (value) => {
            if (!value) removal = null
          }
        "
        ><template
          v-if="failed"
          #body
          ><CfAlert tone="error">{{ message }}</CfAlert></template
        ><template #footer
          ><CfButton
            variant="secondary"
            :disabled="busy"
            @click="removal = null"
            >{{ $t('cloud.messages.cancel') }}</CfButton
          ><CfButton
            variant="destructive"
            :loading="busy"
            @click="removeStorage"
            >{{ $t('cloud.messages.delete') }}</CfButton
          ></template
        ></UModal
      >
      <details
        v-if="admin && rotationId"
        open
        class="cf-storage-details"
      >
        <summary>{{ $t('cloud.messages.rotateStorageCredentials') }}</summary>
        <p class="cf-field-hint">
          {{ connections.find((c) => c.id === rotationId)?.config.bucket }}
        </p>
        <form
          class="cf-storage-grid"
          @submit.prevent="rotateStorage(rotationId)"
        >
          <label
            >{{ $t('cloud.messages.newAccessKeyId')
            }}<input
              v-model="rotation.accessKeyId"
              class="cf-input"
              autocomplete="off"
              required
          /></label>
          <label
            >{{ $t('cloud.messages.newSecretAccessKey')
            }}<input
              v-model="rotation.secretAccessKey"
              class="cf-input"
              type="password"
              autocomplete="new-password"
              required
          /></label>
          <CfButton
            type="submit"
            variant="secondary"
            :disabled="busy"
            >{{ $t('cloud.messages.testRotate') }}</CfButton
          >
        </form>
      </details>
      <details
        v-if="admin && byosAdmission.allowed && !quota.error.value"
        class="cf-storage-details"
      >
        <summary>{{ $t('cloud.messages.connectStorage') }}</summary>
        <form
          class="cf-storage-grid"
          @submit.prevent="saveStorage"
        >
          <label
            >{{ $t('cloud.messages.endpoint')
            }}<input
              v-model="storage.endpoint"
              class="cf-input"
              type="url"
              placeholder="https://s3.us-east-1.amazonaws.com"
              required
          /></label>
          <label
            >{{ $t('cloud.messages.region')
            }}<input
              v-model="storage.region"
              class="cf-input"
              required
          /></label>
          <label
            >{{ $t('cloud.messages.bucket')
            }}<input
              v-model="storage.bucket"
              class="cf-input"
              required
          /></label>
          <label
            >{{ $t('cloud.messages.accessKeyId')
            }}<input
              v-model="storage.accessKeyId"
              class="cf-input"
              autocomplete="off"
              required
          /></label>
          <label
            >{{ $t('cloud.messages.secretAccessKey')
            }}<input
              v-model="storage.secretAccessKey"
              class="cf-input"
              type="password"
              autocomplete="new-password"
              required
          /></label>
          <p>
            {{
              $t('cloud.messages.useADedicatedBucketWithPrivateAccessAllowThis')
            }}
          </p>
          <CfButton
            type="submit"
            :disabled="busy"
            >{{ $t('cloud.messages.testConnect') }}</CfButton
          >
        </form>
      </details>
    </div></CfCard
  >
</template>
