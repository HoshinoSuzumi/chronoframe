<script setup lang="ts">
const props = defineProps<{ siteId: number }>()
const context = useEntryContext()
const {
  data,
  error: loadError,
  refresh,
} = await useFetch(`/api/sites/${props.siteId}/settings`, {
  key: `site-settings-${props.siteId}`,
})
const name = ref(data.value?.site.name ?? '')
const profile = reactive({
  title: data.value?.site.title ?? '',
  slogan: data.value?.site.slogan ?? '',
  author: data.value?.site.author ?? '',
  avatarUrl: data.value?.site.avatarUrl ?? '',
})
const iconError = ref(''),
  iconBusy = ref(false)
async function chooseIcon(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  iconError.value = ''
  if (!file) return
  if (
    !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
    file.size > 2 * 1024 * 1024
  ) {
    iconError.value = 'Choose a PNG, JPEG or WebP image up to 2 MiB.'
    input.value = ''
    return
  }
  iconBusy.value = true
  try {
    const image = await createImageBitmap(file)
    try {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 128
      const drawing = canvas.getContext('2d')!
      const size = Math.min(image.width, image.height)
      drawing.drawImage(
        image,
        (image.width - size) / 2,
        (image.height - size) / 2,
        size,
        size,
        0,
        0,
        128,
        128,
      )
      const value = canvas.toDataURL('image/webp', 0.85)
      if (value.length > 65536) throw new Error('Icon too large')
      profile.avatarUrl = value
    } finally {
      image.close()
    }
  } catch {
    iconError.value = 'This image could not be used. Try another image.'
  } finally {
    iconBusy.value = false
    input.value = ''
  }
}
const busy = ref(false)
const message = ref('')
const failed = ref(false)
async function reload() {
  await refresh()
  name.value = data.value?.site.name ?? ''
  Object.assign(profile, {
    title: data.value?.site.title ?? '',
    slogan: data.value?.site.slogan ?? '',
    author: data.value?.site.author ?? '',
    avatarUrl: data.value?.site.avatarUrl ?? '',
  })
  message.value = ''
}
async function save() {
  if (!data.value || busy.value || iconBusy.value) return
  busy.value = true
  message.value = ''
  failed.value = false
  try {
    const result = await $fetch(`/api/sites/${props.siteId}/settings`, {
      method: 'PATCH',
      body: {
        name: name.value,
        revision: data.value.site.revision,
        published: !!data.value.site.published,
        profile: { ...profile },
      },
    })
    data.value = { site: { ...result.site, role: data.value.site.role } }
    if (context.value?.siteId === props.siteId)
      context.value = {
        ...context.value,
        name: result.site.name,
        published: !!result.site.published,
      }
    message.value = 'Site settings saved.'
  } catch (cause) {
    failed.value = true
    message.value =
      (cause as { statusCode?: number }).statusCode === 409
        ? 'This site changed in another session. Reload before saving again.'
        : 'Settings could not be saved. Check your access and try again.'
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <CloudCard class="cf-site-settings">
    <div class="cf-panel-heading">
      <h2>Gallery identity</h2>
      <p>Use the same title, author and icon shown in your public gallery.</p>
    </div>
    <div
      v-if="loadError"
      role="alert"
      class="cf-notice"
    >
      Settings could not be loaded.<CloudButton
        variant="ghost"
        @click="reload"
        >Reload settings</CloudButton
      >
    </div>
    <template v-else-if="data">
      <div class="cf-panel-body">
        <form
          v-if="data.site.role === 'admin'"
          class="cf-form"
          @submit.prevent="save()"
        >
          <div class="cf-field">
            <label for="settings-site-name">Workspace site name</label
            ><CloudInput
              id="settings-site-name"
              v-model="name"
              required
              maxlength="80"
              :disabled="busy"
            />
          </div>
          <p class="cf-field-hint">
            The workspace name identifies this site in your console. Leave the
            public title blank to use this name.
          </p>
          <div class="cf-field">
            <label for="gallery-title">Public title</label
            ><CloudInput
              id="gallery-title"
              v-model="profile.title"
              maxlength="80"
              :disabled="busy"
              :placeholder="name"
            />
          </div>
          <div class="cf-field">
            <label for="gallery-slogan">Slogan</label
            ><CloudInput
              id="gallery-slogan"
              v-model="profile.slogan"
              maxlength="200"
              :disabled="busy"
            />
          </div>
          <div class="cf-field">
            <label for="gallery-author">Author</label
            ><CloudInput
              id="gallery-author"
              v-model="profile.author"
              maxlength="80"
              :disabled="busy"
            />
          </div>
          <div class="cf-field">
            <label for="gallery-icon">Gallery icon</label
            ><img
              v-if="profile.avatarUrl"
              :src="profile.avatarUrl"
              alt="Gallery icon preview"
              width="64"
              height="64"
              class="cf-gallery-icon"
            /><input
              id="gallery-icon"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              :disabled="busy || iconBusy"
              @change="chooseIcon"
            />
            <p class="cf-field-hint">
              PNG, JPEG or WebP, up to 2 MiB. Cropped to a square and optimized
              automatically.
            </p>
            <CloudButton
              v-if="profile.avatarUrl"
              variant="ghost"
              :disabled="busy || iconBusy"
              @click="profile.avatarUrl = ''"
              >Remove icon</CloudButton
            >
            <p
              v-if="iconError"
              class="cf-error-message"
              role="alert"
            >
              {{ iconError }}
            </p>
          </div>
          <div class="cf-site-actions">
            <CloudButton
              type="submit"
              :disabled="busy || iconBusy || !name.trim()"
              >{{ busy ? 'Saving…' : 'Save changes' }}</CloudButton
            ><CloudButton
              type="button"
              variant="ghost"
              :disabled="busy"
              @click="reload"
              >Reload settings</CloudButton
            >
          </div>
        </form>
        <p
          v-else
          class="cf-field-hint"
        >
          Only workspace administrators can change these settings.
        </p>
        <p
          v-if="message"
          :role="failed ? 'alert' : 'status'"
          class="cf-notice"
        >
          {{ message }}
        </p>
      </div>
    </template>
  </CloudCard>
</template>
