import { STORAGE_CONNECTION_MESSAGES } from '@chronoframe/contracts/storage-diagnostics'
import type { Album, Photo } from '@chronoframe/contracts/resources'
export function useCloudMediaWorkspace(props: {
  siteId: number
  role?: string
}) {
  const entryContext = useEntryContext(),
    snapshot = entryContext.value?.scope
  const api = async <T = unknown>(
    path: string,
    options?: { method?: 'GET' | 'POST' | 'DELETE' | 'PATCH'; body?: unknown },
  ): Promise<T> => {
    if (entryContext.value?.scope !== snapshot)
      throw new Error('Site context changed')
    const result = await (
      $fetch as (
        path: string,
        options?: Record<string, unknown>,
      ) => Promise<unknown>
    )(path, options)
    if (entryContext.value?.scope !== snapshot)
      throw new Error('Site context changed')
    return result as T
  }
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
    albums = ref<(Album & { photoIds: string[] })[]>([])
  const usage = ref<{ photos: number; pending: number; bytes: number } | null>(
    null,
  )
  const rotation = reactive({ accessKeyId: '', secretAccessKey: '' })
  const editPhoto = reactive({
    id: '',
    title: '',
    description: '',
    tags: [] as string[],
    rating: null as number | null,
    revision: 0,
  })
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
  const admin = computed(() => props.role === 'admin')
  let timer: ReturnType<typeof setInterval> | undefined,
    controller: AbortController | undefined,
    activeUpload: string | undefined,
    activeResumeKey: string | undefined
  const canPoll = ref(true)
  const loading = ref(false),
    uploadOpen = ref(false)
  let reloadGeneration = 0
  async function reload() {
    const generation = ++reloadGeneration
    loading.value = true
    try {
      const [s, p, a, u] = await Promise.all([
        api<{ connections: typeof connections.value }>(base.value + '/storage'),
        api<{ photos: Photo[]; jobs: typeof jobs.value }>(
          base.value + '/photos',
        ),
        api<{ albums: typeof albums.value }>(base.value + '/albums'),
        api<{ usage: NonNullable<typeof usage.value> }>(base.value + '/usage'),
      ])
      if (
        generation !== reloadGeneration ||
        entryContext.value?.scope !== snapshot
      )
        return
      usage.value = u.usage
      connections.value = s.connections
      photos.value = p.photos
      jobs.value = p.jobs
      albums.value = a.albums
      if (!connectionId.value) connectionId.value = s.connections[0]?.id ?? ''
    } catch (error) {
      if (
        generation !== reloadGeneration ||
        entryContext.value?.scope !== snapshot
      )
        return
      failed.value = true
      message.value =
        (error as { statusCode?: number }).statusCode === 503
          ? 'Media services need deployment configuration. Your existing site settings are available.'
          : 'Could not refresh media. Check your access and retry.'
      canPoll.value = false
    } finally {
      if (generation === reloadGeneration) loading.value = false
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
      return !failed.value
    } catch (error) {
      failed.value = true
      const code = (error as { statusCode?: number }).statusCode
      const diagnostic = (error as { data?: { data?: { code?: string } } }).data
        ?.data?.code
      message.value =
        diagnostic && Object.hasOwn(STORAGE_CONNECTION_MESSAGES, diagnostic)
          ? STORAGE_CONNECTION_MESSAGES[
              diagnostic as keyof typeof STORAGE_CONNECTION_MESSAGES
            ]
          : code === 503
            ? 'Media services need deployment configuration. Check the selected environment settings.'
            : code === 409
              ? 'This item changed. Refresh and try again.'
              : code === 429
                ? 'The preview resource limit has been reached.'
                : code === 403
                  ? 'Administrator access is required.'
                  : 'The operation failed. Check the entered values and your connection, then retry.'
      return false
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
  const photoLoaded = ref('')
  let photoLoadGeneration = 0
  async function loadPhoto() {
    const id = editPhoto.id,
      generation = ++photoLoadGeneration
    photoLoaded.value = ''
    editPhoto.title = ''
    editPhoto.description = ''
    if (!id) return
    try {
      const data = await api<{ photo: Photo; revision: number }>(
        base.value + '/photos/' + id,
      )
      if (editPhoto.id !== id || generation !== photoLoadGeneration) return
      editPhoto.title = data.photo.title ?? 'Untitled photograph'
      editPhoto.description = data.photo.description ?? ''
      editPhoto.tags = data.photo.tags ?? []
      editPhoto.rating =
        typeof data.photo.exif?.Rating === 'number'
          ? data.photo.exif.Rating
          : null
      editPhoto.revision = data.revision
      photoLoaded.value = id
    } catch {
      if (editPhoto.id !== id || generation !== photoLoadGeneration) return
      failed.value = true
      message.value =
        'Could not load photograph settings. Select it again to retry.'
    }
  }
  async function savePhoto() {
    if (!editPhoto.id || photoLoaded.value !== editPhoto.id) return
    const saved = await action(
      () =>
        api(base.value + '/photos/' + editPhoto.id, {
          method: 'PATCH',
          body: {
            title: editPhoto.title,
            description: editPhoto.description || null,
            revision: editPhoto.revision,
            tags: editPhoto.tags,
            rating: editPhoto.rating,
          },
        }),
      'Photograph updated.',
    )
    if (saved) await loadPhoto()
    return saved
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
    } catch {
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
    reloadGeneration++
    if (timer) clearInterval(timer)
    controller?.abort()
  })

  return {
    photos,
    albums,
    jobs,
    connections,
    usage,
    rotation,
    editPhoto,
    connectionId,
    message,
    failed,
    busy,
    uploading,
    progress,
    currentFile,
    storage,
    admin,
    photoLoaded,
    action,
    reload,
    refreshMedia,
    saveStorage,
    rotateStorage,
    loadPhoto,
    savePhoto,
    upload,
    cancel,
    removePhoto,
    publish,
    base,
    api,
    loading,
    uploadOpen,
  }
}
const cloudMediaKey = Symbol('cloud-media-workspace')
export function provideCloudSiteMedia(props: {
  siteId: number
  role?: string
}) {
  const media = useCloudMediaWorkspace(props)
  provide(cloudMediaKey, media)
  return media
}
export function useCloudSiteMedia() {
  const media = inject<ReturnType<typeof useCloudMediaWorkspace>>(cloudMediaKey)
  if (!media) throw new Error('Site media workspace missing')
  return media
}
