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
} = useCloudSiteMedia()
const quota = useCloudQuota(useEntryContext().value?.workspaceId)
const byosAdmission = computed(() => quota.gate('byos'))
</script>
<template>
  <CloudCard
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
      <label class="cf-field-label"
        >{{ $t('cloud.messages.storageConnection')
        }}<CloudSelect
          v-model="connectionId"
          class="cf-input"
          :disabled="!admin"
        >
          <option value="">{{ $t('cloud.messages.chooseAConnection') }}</option>
          <option
            v-for="connection in connections"
            :key="connection.id"
            :value="connection.id"
            :disabled="
              connection.uploads_enabled === 0 ||
              (!connection.pool_id && !allowance?.byosLimits.byos)
            "
          >
            {{
              connection.pool_id
                ? $t('cloud.messages.platformStorage')
                : $t('cloud.ui.connectionRevision', {
                    bucket: connection.config.bucket,
                    revision: connection.current_revision,
                  })
            }}
          </option>
        </CloudSelect></label
      >
      <details
        v-if="
          admin &&
          connectionId &&
          !connections.find((c) => c.id === connectionId)?.pool_id
        "
        class="cf-storage-details"
      >
        <summary>{{ $t('cloud.messages.rotateStorageCredentials') }}</summary>
        <form
          class="cf-storage-grid"
          @submit.prevent="rotateStorage"
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
          <CloudButton
            type="submit"
            variant="secondary"
            :disabled="busy"
            >{{ $t('cloud.messages.testRotate') }}</CloudButton
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
          <CloudButton
            type="submit"
            :disabled="busy"
            >{{ $t('cloud.messages.testConnect') }}</CloudButton
          >
        </form>
      </details>
    </div></CloudCard
  >
</template>
