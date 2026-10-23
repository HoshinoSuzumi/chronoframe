<script setup lang="ts">
import type { Photo } from '@chronoframe/contracts/resources'
const api = $fetch as <T = unknown>(
  path: string,
  options?: { method?: 'GET' | 'POST' | 'DELETE' | 'PATCH'; body?: unknown },
) => Promise<T>
const props = defineProps<{ siteId: number; role?: string }>()
const context = useEntryContext(),
  base = computed(() => `/api/sites/${props.siteId}/media`)
const connections = ref<
    {
      id: string
      current_revision: number
      healthy: number
      config: { bucket: string }
    }[]
  >([]),
  photos = ref<Photo[]>([]),
  jobs = ref<
    {
      id: string
      photo_id: string
      state: string
      attempts: number
      error_code: string | null
    }[]
  >([]),
  albums = ref<
    { id: number; title: string; isHidden: boolean; hasPassword: boolean }[]
  >([])
const usage = ref<{ photos: number; pending: number; bytes: number } | null>(
  null,
)
const rotation = reactive({ accessKeyId: '', secretAccessKey: '' })
const editPhoto = reactive({ id: '', title: '', description: '', revision: 0 })
const renameAlbum = reactive({ title: '', revision: 0 })
const connectionId = ref(''),
  message = ref(''),
  failed = ref(false),
  busy = ref(false),
  uploading = ref(false),
  progress = ref(0),
  currentFile = ref('')
const storage = reactive({
  endpoint: '',
  region: 'auto',
  bucket: '',
  accessKeyId: '',
  secretAccessKey: '',
})
const albumTitle = ref(''),
  albumId = ref<number | ''>(''),
  albumPassword = ref(''),
  albumHidden = ref(false),
  photoId = ref('')
const admin = computed(() => props.role === 'admin')
let timer: ReturnType<typeof setInterval> | undefined,
  controller: AbortController | undefined,
  activeUpload: string | undefined,
  activeResumeKey: string | undefined
const canPoll = ref(true)
async function reload() {
  try {
    const [s, p, a, u] = await Promise.all([
      api<{ connections: typeof connections.value }>(base.value + '/storage'),
      api<{ photos: Photo[]; jobs: typeof jobs.value }>(base.value + '/photos'),
      api<{ albums: typeof albums.value }>(base.value + '/albums'),
      api<{ usage: NonNullable<typeof usage.value> }>(base.value + '/usage'),
    ])
    usage.value = u.usage
    connections.value = s.connections
    photos.value = p.photos
    jobs.value = p.jobs
    albums.value = a.albums
    if (!connectionId.value) connectionId.value = s.connections[0]?.id ?? ''
  } catch (error) {
    failed.value = true
    message.value =
      (error as { statusCode?: number }).statusCode === 503
        ? 'Media services need deployment configuration. Your existing site settings are available.'
        : 'Could not refresh media. Check your access and retry.'
    canPoll.value = false
  }
}
function refreshMedia() {
  canPoll.value = true
  void reload()
}
async function action(run: () => Promise<unknown>, success: string) {
  if (busy.value) return
  busy.value = true
  message.value = ''
  failed.value = false
  try {
    await run()
    message.value = success
    canPoll.value = true
    await reload()
  } catch (error) {
    failed.value = true
    const code = (error as { statusCode?: number }).statusCode
    message.value =
      code === 409
        ? 'This item changed. Refresh and try again.'
        : code === 429
          ? 'The preview resource limit has been reached.'
          : code === 403
            ? 'Administrator access is required.'
            : 'The operation failed. Check storage permissions and CORS, then retry.'
  } finally {
    busy.value = false
  }
}
async function saveStorage() {
  await action(async () => {
    await api(base.value + '/storage', { method: 'POST', body: storage })
    storage.accessKeyId = ''
    storage.secretAccessKey = ''
  }, 'Storage connected and verified.')
}
async function rotateStorage() {
  const selected = connections.value.find((c) => c.id === connectionId.value)
  if (!selected) return
  await action(async () => {
    await api(base.value + '/storage/' + selected.id + '/rotate', {
      method: 'POST',
      body: { revision: selected.current_revision, ...rotation },
    })
    rotation.accessKeyId = ''
    rotation.secretAccessKey = ''
  }, 'Credentials rotated. Existing media references remain available.')
}
async function loadPhoto() {
  if (!editPhoto.id) return
  const data = await api<{ photo: Photo; revision: number }>(
    base.value + '/photos/' + editPhoto.id,
  )
  editPhoto.title = data.photo.title ?? 'Untitled photograph'
  editPhoto.description = data.photo.description ?? ''
  editPhoto.revision = data.revision
}
async function savePhoto() {
  await action(
    () =>
      api(base.value + '/photos/' + editPhoto.id, {
        method: 'PATCH',
        body: {
          title: editPhoto.title,
          description: editPhoto.description || null,
          revision: editPhoto.revision,
        },
      }),
    'Photograph updated.',
  )
  await loadPhoto()
}
async function loadAlbum() {
  if (!albumId.value) return
  const data = await api<{
    album: { title: string; isHidden: boolean }
    revision: number
  }>(base.value + '/albums/' + albumId.value + '/settings')
  renameAlbum.title = data.album.title
  albumHidden.value = data.album.isHidden
  albumPassword.value = ''
  renameAlbum.revision = data.revision
}
async function saveAlbum() {
  await action(
    () =>
      api(base.value + '/albums/' + albumId.value + '/settings', {
        method: 'PATCH',
        body: renameAlbum,
      }),
    'Album renamed.',
  )
  await loadAlbum()
}
function resumeKey(file: File) {
  return [
    'chronoframe-upload',
    context.value?.scope,
    props.siteId,
    file.name,
    file.size,
    file.lastModified,
    connectionId.value,
  ].join(':')
}
async function sendFile(file: File, liveVideo?: File) {
  const cache = resumeKey(file),
    id = localStorage.getItem(cache) || crypto.randomUUID()
  await api(base.value + '/uploads', {
    method: 'POST',
    body: {
      requestId: id,
      connectionId: connectionId.value,
      fileName: file.name,
      bytes: file.size,
      ...(liveVideo
        ? { liveVideo: { fileName: liveVideo.name, bytes: liveVideo.size } }
        : {}),
    },
  })
  localStorage.setItem(cache, id)
  activeResumeKey = cache
  if (controller?.signal.aborted) {
    await api(base.value + '/uploads/' + id + '/cancel', {
      method: 'POST',
      body: {},
    }).catch(() => {})
    localStorage.removeItem(cache)
    throw new Error('cancelled')
  }
  activeUpload = id
  const plan = await api<{
    state: string
    mode?: string
    url?: string
    contentType?: string
    videoUrl?: string | null
    partBytes?: number
    parts?: { partNumber: number; bytes: number }[]
    urls?: string[]
  }>(base.value + '/uploads/' + id + '/plan', { method: 'POST', body: {} })
  if (plan.state === 'completed') {
    localStorage.removeItem(cache)
    return
  }
  if (plan.state !== 'pending' || !plan.mode) {
    localStorage.removeItem(cache)
    activeResumeKey = undefined
    activeUpload = undefined
    throw new Error('Upload unavailable')
  }
  async function put(url: string, body: Blob, type?: string) {
    for (let attempt = 0; attempt < 3; attempt++) {
      controller?.signal.throwIfAborted()
      const response = await fetch(url, {
        method: 'PUT',
        body,
        headers: type ? { 'Content-Type': type } : {},
        signal: controller?.signal,
        redirect: 'error',
      })
      if (response.ok) return
      if (attempt === 2) throw new Error('Upload failed')
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt))
    }
  }
  if (plan.mode === 'single') await put(plan.url!, file, plan.contentType)
  else {
    const partBytes = plan.partBytes!,
      count = plan.urls!.length
    for (let i = 0; i < count; i++) {
      const start = i * partBytes,
        end = Math.min(file.size, start + partBytes)
      if (
        !plan.parts?.some(
          (p) => p.partNumber === i + 1 && p.bytes === end - start,
        )
      )
        await put(plan.urls![i]!, file.slice(start, end))
      progress.value = Math.round((end / file.size) * 100)
    }
  }
  if (liveVideo && plan.videoUrl)
    await put(plan.videoUrl, liveVideo, 'video/quicktime')
  progress.value = 100
  await api(base.value + '/uploads/' + id + '/complete', {
    method: 'POST',
    body: {},
  })
  localStorage.removeItem(cache)
  activeUpload = undefined
}
async function upload(event: Event) {
  const input = event.target as HTMLInputElement,
    files = Array.from(input.files ?? [])
  if (!files.length || uploading.value || !connectionId.value) return
  if (
    files.some((f) => f.size > 100 * 1024 * 1024) ||
    files.every((f) => f.name.toLowerCase().endsWith('.mov'))
  ) {
    failed.value = true
    message.value =
      'Choose photographs under 100 MB. A Live Photo MOV must accompany a photograph with the same filename.'
    input.value = ''
    return
  }
  uploading.value = true
  failed.value = false
  message.value = ''
  controller = new AbortController()
  try {
    for (const file of files.filter(
      (f) => !f.name.toLowerCase().endsWith('.mov'),
    )) {
      const companion = files.find(
        (f) =>
          f.name.toLowerCase().endsWith('.mov') &&
          f.name.replace(/\.[^.]+$/, '').toLowerCase() ===
            file.name.replace(/\.[^.]+$/, '').toLowerCase(),
      )
      currentFile.value = file.name
      progress.value = 0
      await sendFile(file, companion)
    }
    message.value = 'Upload verified. Processing continues in the background.'
  } catch (error) {
    failed.value = true
    message.value = controller.signal.aborted
      ? 'Upload cancelled.'
      : 'Upload interrupted. Select the same file to resume its uploaded parts.'
  } finally {
    uploading.value = false
    input.value = ''
    currentFile.value = ''
    await reload()
  }
}
async function cancel() {
  controller?.abort()
  if (activeResumeKey) localStorage.removeItem(activeResumeKey)
  activeResumeKey = undefined
  if (activeUpload)
    await api(base.value + '/uploads/' + activeUpload + '/cancel', {
      method: 'POST',
      body: {},
    }).catch(() => {})
  activeUpload = undefined
}
async function removePhoto(id: string) {
  if (
    !window.confirm(
      'Delete this photograph and its managed original, thumbnail and Live Photo files from storage?',
    )
  )
    return
  await action(
    () =>
      api(base.value + '/photos/' + id + '/delete', {
        method: 'POST',
        body: {},
      }),
    'Photograph deleted. Managed storage files are queued for cleanup.',
  )
}
function createAlbum() {
  return action(
    () =>
      api(base.value + '/albums', {
        method: 'POST',
        body: {
          id: crypto.getRandomValues(new Uint32Array(1))[0] || 1,
          title: albumTitle.value,
        },
      }),
    'Album created.',
  )
}
async function removeAlbum() {
  if (
    !window.confirm(
      'Delete this album? Photographs remain in your library and may become public if no other protected album contains them.',
    )
  )
    return
  await action(
    () =>
      api(base.value + '/albums/' + albumId.value + '/delete', {
        method: 'POST',
        body: {},
      }),
    'Album deleted. Photographs remain in your library.',
  )
  albumId.value = ''
}
async function removeFromAlbum() {
  if (
    !window.confirm(
      'Remove this photograph from the album? It may become public if no other protected album contains it.',
    )
  )
    return
  await action(
    () =>
      api(base.value + '/albums/' + albumId.value + '/remove-photo', {
        method: 'POST',
        body: { photoId: photoId.value },
      }),
    'Photograph removed from album.',
  )
}
async function publish(value: boolean) {
  await action(
    async () => {
      const settings = await api<{ site: { revision: number } }>(
        `/api/sites/${props.siteId}/settings`,
      )
      const result = await api<{ published: boolean }>(
        base.value + '/publish',
        {
          method: 'POST',
          body: { revision: settings.site.revision, published: value },
        },
      )
      if (context.value?.siteId === props.siteId)
        context.value.published = result.published
    },
    value ? 'Gallery published.' : 'Gallery unpublished.',
  )
}
onMounted(() => {
  void reload()
  timer = setInterval(() => {
    if (canPoll.value && !busy.value && !uploading.value) void reload()
  }, 5000)
})
onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
  controller?.abort()
})
</script>
<template>
  <section
    class="cf-media-workbench"
    aria-label="Gallery media"
  >
    <p
      v-if="message"
      :role="failed ? 'alert' : 'status'"
      class="cf-notice"
    >
      {{ message }}
    </p>
    <CloudCard>
      <div class="cf-panel-heading">
        <h2>Storage &amp; uploads</h2>
        <p>Your files stay in your private S3-compatible bucket.</p>
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
              v-for="c in connections"
              :key="c.id"
              :value="c.id"
            >
              {{ c.config.bucket }} · revision {{ c.current_revision }}
            </option>
          </select></label
        >
        <label
          v-if="admin"
          class="cf-upload-control cf-button cf-button-primary"
          :aria-disabled="!connectionId || uploading"
          >Upload photographs<input
            type="file"
            multiple
            accept=".jpg,.jpeg,.png,.webp,.heic,.heif,.avif,.gif,.mov"
            :disabled="!connectionId || uploading"
            @change="upload"
        /></label>
        <CloudButton
          v-if="uploading"
          variant="secondary"
          @click="cancel"
          >Cancel upload</CloudButton
        >
        <div
          v-if="uploading"
          role="status"
          class="cf-upload-progress"
        >
          <span>{{ currentFile }}</span
          ><progress
            :value="progress"
            max="100"
            aria-label="Upload progress"
          />
        </div>
        <p
          v-if="usage"
          class="cf-muted"
        >
          {{ usage.photos }} / 1,000 photographs · {{ usage.pending }} pending ·
          {{ (usage.bytes / 1024 ** 3).toFixed(2) }} / 5 GiB uploaded in 30 days
        </p>
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
              Use a dedicated bucket with private access. Allow this portal
              origin in CORS for GET, PUT and HEAD; allow Content-Type and
              expose ETag. Other endpoint hosts require operator approval.
            </p>
            <CloudButton
              type="submit"
              :disabled="busy"
              >Test &amp; connect</CloudButton
            >
          </form>
        </details>
      </div>
    </CloudCard>
    <CloudCard>
      <div class="cf-panel-heading cf-media-heading">
        <div>
          <h2>Photographs</h2>
          <p>
            {{ photos.length }} ready ·
            {{
              jobs.filter((j) =>
                ['queued', 'running', 'retry_wait'].includes(j.state),
              ).length
            }}
            processing
          </p>
        </div>
        <CloudButton
          variant="secondary"
          @click="refreshMedia"
          >Refresh</CloudButton
        >
      </div>
      <div class="cf-panel-body">
        <GalleryGrid
          v-if="photos.length"
          :photos="photos"
        />
        <p
          v-else
          class="cf-empty-note"
        >
          Upload your first photograph to begin.
        </p>
        <ul
          v-if="jobs.some((j) => j.state !== 'succeeded')"
          class="cf-job-list"
        >
          <li
            v-for="job in jobs.filter((j) => j.state !== 'succeeded')"
            :key="job.id"
          >
            <code>{{ job.id.slice(0, 8) }}</code
            ><span>{{ job.state.replace('_', ' ') }}</span
            ><small
              >Attempt {{ job.attempts
              }}<template v-if="job.error_code">
                · {{ job.error_code.replaceAll('_', ' ') }}</template
              ></small
            >
            <CloudButton
              v-if="admin && job.state === 'failed'"
              size="sm"
              variant="secondary"
              :disabled="busy"
              @click="
                action(
                  () =>
                    api(base + '/jobs/' + job.id + '/retry', {
                      method: 'POST',
                      body: {},
                    }),
                  'Job queued again.',
                )
              "
              >Retry</CloudButton
            >
            <CloudButton
              v-if="admin && job.state !== 'cancelled'"
              size="sm"
              variant="ghost"
              :disabled="busy"
              @click="removePhoto(job.photo_id)"
              >Remove</CloudButton
            >
          </li>
        </ul>
        <details v-if="admin && photos.length">
          <summary>Edit a photograph</summary>
          <form
            class="cf-storage-grid"
            @submit.prevent="savePhoto"
          >
            <label
              >Photograph<select
                v-model="editPhoto.id"
                class="cf-input"
                required
                @change="loadPhoto"
              >
                <option value="">Choose a photograph</option>
                <option
                  v-for="p in photos"
                  :key="p.id"
                  :value="p.id"
                >
                  {{ p.title }}
                </option>
              </select></label
            >
            <label
              >Title<input
                v-model="editPhoto.title"
                class="cf-input"
                maxlength="255"
                required
            /></label>
            <label
              >Description<textarea
                v-model="editPhoto.description"
                class="cf-input"
                maxlength="2048"
              />
            </label>
            <CloudButton
              type="submit"
              variant="secondary"
              :disabled="busy || !editPhoto.id"
              >Save photograph</CloudButton
            >
          </form>
        </details>
        <details v-if="admin && photos.length">
          <summary>Remove a photograph</summary>
          <form
            class="cf-inline-controls"
            @submit.prevent="removePhoto(photoId)"
          >
            <label
              class="sr-only"
              for="cf-delete-photo"
              >Photograph</label
            ><select
              id="cf-delete-photo"
              v-model="photoId"
              class="cf-input"
              required
            >
              <option value="">Choose a photograph</option>
              <option
                v-for="p in photos"
                :key="p.id"
                :value="p.id"
              >
                {{ p.title }}
              </option></select
            ><CloudButton
              type="submit"
              variant="secondary"
              :disabled="busy"
              >Remove</CloudButton
            >
          </form>
        </details>
      </div>
    </CloudCard>
    <CloudCard>
      <div class="cf-panel-heading">
        <h2>Albums &amp; publication</h2>
        <p>
          Hidden and password-protected albums also protect every media variant.
        </p>
      </div>
      <div class="cf-panel-body cf-media-controls">
        <form
          v-if="admin"
          class="cf-inline-controls"
          @submit.prevent="createAlbum()"
        >
          <label
            class="sr-only"
            for="cf-album-name"
            >Album name</label
          ><input
            id="cf-album-name"
            v-model="albumTitle"
            class="cf-input"
            placeholder="Album name"
            maxlength="80"
            required
          /><CloudButton
            type="submit"
            variant="secondary"
            :disabled="busy"
            >Create album</CloudButton
          >
        </form>
        <label class="cf-field-label"
          >Album<select
            v-model="albumId"
            @change="loadAlbum"
            class="cf-input"
          >
            <option value="">Choose an album</option>
            <option
              v-for="a in albums"
              :key="a.id"
              :value="a.id"
            >
              {{ a.title }}{{ a.isHidden ? ' · hidden' : ''
              }}{{ a.hasPassword ? ' · protected' : '' }}
            </option>
          </select></label
        >
        <form
          v-if="admin && albumId"
          class="cf-inline-controls"
          @submit.prevent="saveAlbum"
        >
          <label
            >Album name<input
              v-model="renameAlbum.title"
              class="cf-input"
              maxlength="80"
              required /></label
          ><CloudButton
            type="submit"
            variant="secondary"
            :disabled="busy"
            >Rename album</CloudButton
          >
        </form>
        <form
          v-if="admin && albumId"
          class="cf-inline-controls"
          @submit.prevent="
            action(
              () =>
                api(base + '/albums/' + albumId + '/photos', {
                  method: 'POST',
                  body: { photoId },
                }),
              'Photograph added.',
            )
          "
        >
          <label
            class="sr-only"
            for="cf-add-photo"
            >Photograph</label
          ><select
            id="cf-add-photo"
            v-model="photoId"
            class="cf-input"
            required
          >
            <option value="">Choose a photograph</option>
            <option
              v-for="p in photos"
              :key="p.id"
              :value="p.id"
            >
              {{ p.title }}
            </option></select
          ><CloudButton
            type="submit"
            variant="secondary"
            :disabled="busy"
            >Add to album</CloudButton
          >
        </form>
        <form
          v-if="admin && albumId"
          class="cf-inline-controls"
          @submit.prevent="
            action(
              () =>
                api(base + '/albums/' + albumId + '/access', {
                  method: 'POST',
                  body: {
                    hidden: albumHidden,
                    password: albumPassword || null,
                  },
                }),
              'Album access updated.',
            )
          "
        >
          <label
            ><input
              v-model="albumHidden"
              type="checkbox"
            />
            Hidden</label
          ><label
            >Album password<input
              v-model="albumPassword"
              type="password"
              class="cf-input"
              minlength="8"
              autocomplete="new-password"
              placeholder="Empty removes protection" /></label
          ><CloudButton
            type="submit"
            variant="secondary"
            :disabled="busy"
            >Save access</CloudButton
          >
        </form>
        <div
          v-if="admin && albumId"
          class="cf-inline-controls"
        >
          <CloudButton
            variant="secondary"
            :disabled="busy || !photoId"
            @click="removeFromAlbum"
            >Remove selected photograph from album</CloudButton
          >
          <CloudButton
            variant="ghost"
            :disabled="busy"
            @click="removeAlbum"
            >Delete album</CloudButton
          >
        </div>
        <div
          v-if="admin"
          class="cf-inline-controls"
        >
          <CloudButton
            :disabled="busy || (!photos.length && !context?.published)"
            @click="publish(!context?.published)"
            >{{
              context?.published ? 'Unpublish gallery' : 'Publish gallery'
            }}</CloudButton
          ><span class="cf-muted"
            >Publishing makes unprotected photographs public at your reserved
            .site.chronoframe.art address.</span
          >
        </div>
      </div>
    </CloudCard>
  </section>
</template>
