<script setup lang="ts">
const { t } = useI18n()
const user = usePortalIdentity()
const name = ref(user.value?.name ?? '')
const image = ref(user.value?.image ?? '')
const upload = useTemplateRef<{ inputRef: HTMLInputElement }>('upload')
const busy = ref(false),
  processing = ref(false),
  error = ref(''),
  notice = ref('')
async function chooseImage(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  error.value = ''
  notice.value = ''
  if (!file) return
  if (
    !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
    file.size > 2 * 1024 * 1024
  ) {
    error.value = t('cloud.messages.chooseAPngJpegOrWebpImageUpTo')
    input.value = ''
    return
  }
  processing.value = true
  try {
    const bitmap = await createImageBitmap(file)
    try {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 128
      const size = Math.min(bitmap.width, bitmap.height)
      const drawing = canvas.getContext('2d')!
      drawing.drawImage(
        bitmap,
        (bitmap.width - size) / 2,
        (bitmap.height - size) / 2,
        size,
        size,
        0,
        0,
        128,
        128,
      )
      let result = canvas.toDataURL('image/webp', 0.85)
      if (!result.startsWith('data:image/webp;')) {
        drawing.globalCompositeOperation = 'destination-over'
        drawing.fillStyle = '#ffffff'
        drawing.fillRect(0, 0, 128, 128)
        result = canvas.toDataURL('image/jpeg', 0.85)
      }
      if (result.length > 65536) throw new Error('Image too large')
      image.value = result
    } finally {
      bitmap.close()
    }
  } catch {
    error.value = t('cloud.messages.thisImageCouldNotBeUsedTryAnotherImage')
  } finally {
    processing.value = false
    input.value = ''
  }
}
async function save() {
  if (busy.value || processing.value) return
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    const result = await $fetch<{ user: NonNullable<typeof user.value> }>(
      '/api/account/profile',
      { method: 'PUT', body: { name: name.value, image: image.value || null } },
    )
    user.value = result.user
    name.value = result.user.name ?? ''
    image.value = result.user.image ?? ''
    notice.value = t('cloud.account.profileSaved')
  } catch {
    error.value = t('cloud.account.profileFailed')
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <form
    class="cf-profile-form"
    @submit.prevent="save"
  >
    <UFormField
      :label="$t('cloud.account.nickname')"
      name="nickname"
    >
      <CfInput
        v-model="name"
        :placeholder="$t('cloud.account.nicknamePlaceholder')"
        autocomplete="nickname"
        maxlength="80"
        required
        :disabled="busy"
      />
    </UFormField>
    <UFormField
      :label="$t('cloud.account.avatar')"
      :help="$t('cloud.account.avatarHelp')"
    >
      <div class="flex flex-wrap items-center gap-4">
        <UAvatar
          :src="image || undefined"
          :alt="name"
          size="3xl"
        />
        <div class="flex flex-wrap gap-2">
          <CfButton
            variant="outline"
            :disabled="busy || processing"
            :loading="processing"
            @click="upload?.inputRef?.click()"
            >{{ $t('cloud.account.chooseAvatar') }}</CfButton
          >
          <CfButton
            v-if="image"
            variant="ghost"
            :disabled="busy || processing"
            @click="image = ''"
            >{{ $t('cloud.account.removeAvatar') }}</CfButton
          >
        </div>
      </div>
      <UInput
        ref="upload"
        type="file"
        class="hidden"
        accept="image/png,image/jpeg,image/webp"
        :disabled="busy || processing"
        :aria-label="$t('cloud.account.chooseAvatar')"
        @change="chooseImage"
      />
    </UFormField>
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
    <div>
      <CfButton
        type="submit"
        :disabled="!name.trim() || processing"
        :loading="busy"
        >{{ $t('cloud.messages.saveChanges') }}</CfButton
      >
    </div>
  </form>
</template>
<style scoped>
.cf-profile-form {
  display: grid;
  gap: 20px;
  padding: 20px;
  max-width: 560px;
}
</style>
