<script setup lang="ts">
const {
  connections,
  connectionId,
  storage,
  rotation,
  saveStorage,
  rotateStorage,
  busy,
  admin,
} = useCloudSiteMedia()
</script>
<template>
  <CloudCard
    ><div class="cf-panel-heading">
      <h2>{{ $t('cloud.messages.storage') }}</h2>
      <p>
        {{
          $t(
            'cloud.messages.connectAPrivateS3CompatibleBucketForYourPhotographs',
          )
        }}
      </p>
    </div>
    <div class="cf-panel-body cf-media-controls">
      <label class="cf-field-label"
        >{{ $t('cloud.messages.storageConnection')
        }}<select
          v-model="connectionId"
          class="cf-input"
          :disabled="!admin"
        >
          <option value="">{{ $t('cloud.messages.chooseAConnection') }}</option>
          <option
            v-for="connection in connections"
            :key="connection.id"
            :value="connection.id"
          >
            {{
              $t('cloud.ui.connectionRevision', {
                bucket: connection.config.bucket,
                revision: connection.current_revision,
              })
            }}
          </option>
        </select></label
      >
      <details
        v-if="admin && connectionId"
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
        v-if="admin"
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
