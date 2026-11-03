import { STORAGE_CONNECTION_MESSAGES } from '@chronoframe/contracts/storage-diagnostics'
import type { Album, Photo } from '@chronoframe/contracts/resources'
import {
  cloudUploadResumeKey,
  useCloudUploads,
  type CloudUploadContext,
} from './useCloudUploads'
export function useCloudMediaWorkspace(props: {
  siteId: number
  role?: string
}) {
  const { t } = useI18n()
  const uploads = useCloudUploads()
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
  const uploadContext: CloudUploadContext = {
    siteId: props.siteId,
    scope: snapshot ?? '',
    userId: useState<number | null>('platform-user-id', () => null).value!,
    name: context.value?.name ?? '',
    admin: props.role === 'admin',
  }
  const connections = ref<
      {
        id: string
        current_revision: number
        healthy: number
        uploads_enabled?: number
        pool_id?: string | null
        retired?: number
        config: { bucket: string }
      }[]
    >([]),
    photos = ref<Photo[]>([]),
    jobs = ref<
      {
        id: string
        photo_id: string
        file_name?: string
        state: string
        attempts: number
        error_code: string | null
      }[]
    >([]),
    albums = ref<(Album & { photoIds: string[] })[]>([])
  const usage = ref<{ photos: number; pending: number; bytes: number } | null>(
    null,
  )
  const allowance = ref<{
    plan: { id: string; name: string }
    limits: Record<string, number>
    byosLimits: Record<string, number>
    storageBytes: number
  } | null>(null)
  const rotation = reactive({ accessKeyId: '', secretAccessKey: '' })
  const editPhoto = reactive({
    id: '',
    title: '',
    description: '',
    tags: [] as string[],
    rating: null as number | null,
    revision: 0,
  })
  const selectedAlbumIds = ref<number[]>([])
  const connectionId = ref(''),
    message = ref(''),
    failed = ref(false),
    busy = ref(false),
    preparingUpload = ref(false)
  const storage = reactive({
    endpoint: '',
    region: 'auto',
    bucket: '',
    accessKeyId: '',
    secretAccessKey: '',
  })
  const admin = computed(() => props.role === 'admin')
  const fileLimit = computed(
    () =>
      (connections.value.find((c) => c.id === connectionId.value)?.pool_id
        ? allowance.value?.limits
        : allowance.value?.byosLimits
      )?.fileBytes ?? 0,
  )
  let timer: ReturnType<typeof setInterval> | undefined
  const canPoll = ref(true)
  const ready = ref(false)
  const loadError = ref('')
  const loading = ref(true),
    uploadOpen = ref(false)
  let disposed = false
  let storageInitialized = false
  let reloadGeneration = 0
  async function reload() {
    const generation = ++reloadGeneration
    loading.value = true
    try {
      const [s, p, a, u] = await Promise.all([
        api<{
          connections: typeof connections.value
          preferredConnectionId?: string
        }>(base.value + '/storage'),
        api<{ photos: Photo[]; jobs: typeof jobs.value }>(
          base.value + '/photos',
        ),
        api<{ albums: typeof albums.value }>(base.value + '/albums'),
        api<{
          usage: NonNullable<typeof usage.value>
          plan: { id: string; name: string }
          limits: Record<string, number>
          byosLimits: Record<string, number>
          storageBytes: number
        }>(base.value + '/usage'),
      ])
      if (
        generation !== reloadGeneration ||
        entryContext.value?.scope !== snapshot
      )
        return
      usage.value = u.usage
      allowance.value = {
        plan: u.plan,
        limits: u.limits,
        byosLimits: u.byosLimits,
        storageBytes: u.storageBytes,
      }
      connections.value = s.connections
      photos.value = p.photos
      jobs.value = p.jobs
      albums.value = a.albums
      ready.value = true
      if (loadError.value && message.value === loadError.value) {
        failed.value = false
        message.value = ''
      }
      loadError.value = ''
      canPoll.value = true
      if (preparingUpload.value) return
      const uploadTargets = s.connections.filter(
        (c) => c.uploads_enabled !== 0 && (c.pool_id || u.byosLimits?.byos),
      )
      if (
        !storageInitialized &&
        s.preferredConnectionId &&
        uploadTargets.some((c) => c.id === s.preferredConnectionId)
      )
        connectionId.value = s.preferredConnectionId
      storageInitialized = true
      if (!uploadTargets.some((c) => c.id === connectionId.value))
        connectionId.value =
          uploadTargets.find((c) => c.pool_id)?.id ?? uploadTargets[0]?.id ?? ''
    } catch (error) {
      if (
        generation !== reloadGeneration ||
        entryContext.value?.scope !== snapshot
      )
        return
      failed.value = true
      message.value =
        (error as { statusCode?: number }).statusCode === 503
          ? t(
              'cloud.messages.mediaServicesNeedDeploymentConfigurationYourExistingSiteSettings',
            )
          : t('cloud.messages.couldNotRefreshMediaCheckYourAccessAndRetry')
      loadError.value = message.value
      canPoll.value = false
    } finally {
      if (generation === reloadGeneration) loading.value = false
    }
  }
  let pollingProcessing = false
  async function refreshProcessing() {
    if (pollingProcessing || loading.value || disposed) return
    pollingProcessing = true
    const generation = reloadGeneration
    try {
      const result = await api<{ photos: Photo[]; jobs: typeof jobs.value }>(
        base.value + '/photos',
      )
      if (generation !== reloadGeneration) return
      photos.value = result.photos
      jobs.value = result.jobs
    } catch {
      // Keep the last known task state and retry on the next poll.
    } finally {
      pollingProcessing = false
    }
  }
  function refreshMedia() {
    canPoll.value = true
    void reload()
  }
  watch(jobs, (items) => {
    if (import.meta.client) uploads.trackJobs(uploadContext, items)
  })
  watch(uploads.revision, () => {
    if (!disposed) void refreshProcessing()
  })
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
        diagnostic === 'album_slug_conflict'
          ? t('cloud.messages.thisAlbumUrlIsAlreadyUsedOrReservedBy')
          : diagnostic && Object.hasOwn(STORAGE_CONNECTION_MESSAGES, diagnostic)
            ? t('cloud.storageErrors.' + diagnostic)
            : code === 503
              ? t(
                  'cloud.messages.mediaServicesNeedDeploymentConfigurationCheckTheSelectedEnvironment',
                )
              : code === 409
                ? t('cloud.messages.thisItemChangedRefreshAndTryAgain')
                : code === 429
                  ? t('cloud.messages.thePreviewResourceLimitHasBeenReached')
                  : code === 403
                    ? t('cloud.messages.administratorAccessIsRequired')
                    : t(
                        'cloud.messages.theOperationFailedCheckTheEnteredValuesAndYour',
                      )
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
    }, t('cloud.messages.storageConnectedAndVerified'))
  }
  async function rotateStorage(targetId?: string) {
    const selected = connections.value.find(
      (c) => c.id === (targetId ?? connectionId.value),
    )
    if (!selected) return
    await action(async () => {
      await api(base.value + '/storage/' + selected.id + '/rotate', {
        method: 'POST',
        body: { revision: selected.current_revision, ...rotation },
      })
      rotation.accessKeyId = ''
      rotation.secretAccessKey = ''
    }, t('cloud.messages.credentialsRotatedExistingMediaReferencesRemainAvailable'))
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
      editPhoto.title =
        data.photo.title ?? t('cloud.messages.untitledPhotograph')
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
      message.value = t(
        'cloud.messages.couldNotLoadPhotographSettingsSelectItAgainTo',
      )
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
      t('cloud.messages.photographUpdated'),
    )
    if (saved) await loadPhoto()
    return saved
  }
  function resumeKey(file: File, albumIds: number[], connection: string) {
    return cloudUploadResumeKey(uploadContext, file, albumIds, connection)
  }
  async function upload(event: Event | File[]) {
    const input = Array.isArray(event)
        ? { files: event, value: '' }
        : (event.target as HTMLInputElement),
      files = Array.from(input.files ?? [])
    if (
      !files.length ||
      preparingUpload.value ||
      !connectionId.value ||
      !admin.value
    )
      return
    const batchConnection = connectionId.value
    const isVideo = (file: File) => file.name.toLowerCase().endsWith('.mov')
    const companionFor = (photo: File) =>
      files.find(
        (file) =>
          isVideo(file) &&
          file.name.replace(/\.[^.]+$/, '').toLowerCase() ===
            photo.name.replace(/\.[^.]+$/, '').toLowerCase(),
      )
    if (
      files.some((f) => f.size > fileLimit.value) ||
      files.some(
        (file) =>
          !isVideo(file) &&
          file.size + (companionFor(file)?.size ?? 0) > fileLimit.value,
      ) ||
      files.every(isVideo)
    ) {
      failed.value = true
      message.value = t(
        'cloud.messages.eachPhotographAndItsMatchingLivePhotoMovMust',
      )
      input.value = ''
      return
    }
    const chosenAlbums = [...selectedAlbumIds.value].sort((a, b) => a - b)
    preparingUpload.value = true
    try {
      if (chosenAlbums.length) {
        const result = await uploads.api<{ albums: typeof albums.value }>(
          uploadContext,
          '/albums',
        )
        if (!disposed) albums.value = result.albums
        const unavailable = chosenAlbums.some(
          (id) => !result.albums.some((album) => Number(album.id) === id),
        )
        // Existing reservations retain their original selection even if an album was removed.
        const hasNewFiles = files
          .filter((file) => !isVideo(file))
          .some(
            (file) =>
              !localStorage.getItem(
                resumeKey(file, chosenAlbums, batchConnection),
              ),
          )
        if (unavailable && hasNewFiles) {
          failed.value = true
          message.value = t('cloud.transfer.albumsUnavailable')
          input.value = ''
          return
        }
      }
    } catch {
      failed.value = true
      message.value = t('cloud.transfer.albumsCheckFailed')
      input.value = ''
      return
    } finally {
      preparingUpload.value = false
    }
    void uploads.enqueue(uploadContext, files, batchConnection, chosenAlbums)
    uploadOpen.value = false
    failed.value = false
    message.value = ''
    input.value = ''
    return { queued: true }
  }
  async function removePhoto(id: string) {
    if (
      !window.confirm(
        t(
          'cloud.messages.deleteThisPhotographAndItsManagedOriginalThumbnailAnd',
        ),
      )
    )
      return
    await action(
      () =>
        api(base.value + '/photos/' + id + '/delete', {
          method: 'POST',
          body: {},
        }),
      t(
        'cloud.messages.photographDeletedManagedStorageFilesAreQueuedForCleanup',
      ),
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
      value
        ? t('cloud.messages.galleryPublished')
        : t('cloud.messages.galleryUnpublished'),
    )
  }
  onMounted(() => {
    void reload()
    timer = setInterval(() => {
      if (
        document.visibilityState !== 'visible' ||
        !canPoll.value ||
        busy.value ||
        loading.value ||
        preparingUpload.value ||
        uploadOpen.value
      )
        return
      // Idle libraries stay still; only in-flight uploads and processing need polling.
      if (
        jobs.value.some((job) =>
          ['queued', 'running', 'retry_wait'].includes(job.state),
        )
      )
        void refreshProcessing()
    }, 5000)
  })
  onBeforeUnmount(() => {
    disposed = true
    reloadGeneration++
    if (timer) clearInterval(timer)
  })

  return {
    photos,
    albums,
    jobs,
    connections,
    usage,
    allowance,
    fileLimit,
    rotation,
    editPhoto,
    connectionId,
    message,
    failed,
    busy,
    preparingUpload,
    selectedAlbumIds,
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
    removePhoto,
    publish,
    base,
    api,
    loading,
    ready,
    loadError,
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
