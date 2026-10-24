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
      <h2>Storage</h2>
      <p>Connect a private S3-compatible bucket for your photographs.</p>
    </div>
    <div class="cf-panel-body cf-media-controls">
      <label class="cf-field-label"
        >Storage connection<select
          v-model="connectionId"
          class="cf-input"
          :disabled="!admin"
        >
          <option value="">Choose a connection</option>
          <option
            v-for="connection in connections"
            :key="connection.id"
            :value="connection.id"
          >
            {{ connection.config.bucket }} · revision
            {{ connection.current_revision }}
          </option>
        </select></label
      >
      <details
        v-if="admin && connectionId"
        class="cf-storage-details"
      >
        <summary>Rotate storage credentials</summary>
        <form
          class="cf-storage-grid"
          @submit.prevent="rotateStorage"
        >
          <label
            >New access key ID<input
              v-model="rotation.accessKeyId"
              class="cf-input"
              autocomplete="off"
              required
          /></label>
          <label
            >New secret access key<input
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
            >Test &amp; rotate</CloudButton
          >
        </form>
      </details>
      <details
        v-if="admin"
        class="cf-storage-details"
      >
        <summary>Connect storage</summary>
        <form
          class="cf-storage-grid"
          @submit.prevent="saveStorage"
        >
          <label
            >Endpoint<input
              v-model="storage.endpoint"
              class="cf-input"
              type="url"
              placeholder="https://s3.us-east-1.amazonaws.com"
              required
          /></label>
          <label
            >Region<input
              v-model="storage.region"
              class="cf-input"
              required
          /></label>
          <label
            >Bucket<input
              v-model="storage.bucket"
              class="cf-input"
              required
          /></label>
          <label
            >Access key ID<input
              v-model="storage.accessKeyId"
              class="cf-input"
              autocomplete="off"
              required
          /></label>
          <label
            >Secret access key<input
              v-model="storage.secretAccessKey"
              class="cf-input"
              type="password"
              autocomplete="new-password"
              required
          /></label>
          <p>
            Use a dedicated bucket with private access. Allow this portal origin
            in CORS for GET, PUT and HEAD; allow Content-Type and expose ETag.
            Other endpoint hosts require operator approval.
          </p>
          <CloudButton
            type="submit"
            :disabled="busy"
            >Test &amp; connect</CloudButton
          >
        </form>
      </details>
    </div></CloudCard
  >
</template>
