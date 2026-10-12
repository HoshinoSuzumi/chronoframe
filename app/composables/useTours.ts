import {
  tourIds,
  type TourId,
  type TourRecords,
  type TourStatus,
} from '~~/shared/types/tours'
export function useTours() {
  const records = useState<TourRecords>(
    'tour-records',
    () =>
      Object.fromEntries(tourIds.map((id) => [id, 'pending'])) as TourRecords,
  )
  const ready = useState('tour-ready', () => false)
  const busy = useState('tour-busy', () => false)
  const revision = useState('tour-revision', () => 0)
  const toast = useToast()
  async function load() {
    ready.value = false
    try {
      records.value = await $fetch<TourRecords>('/api/system/tours')
      ready.value = true
    } catch {
      /* Require authoritative state. */
    }
  }
  async function update(
    id?: TourId,
    status: TourStatus = 'pending',
    options: { redirectTo?: string } = {},
  ) {
    if (busy.value) return false
    busy.value = true
    try {
      records.value = await $fetch<TourRecords>('/api/system/tours', {
        method: 'PUT',
        body: id ? { action: 'set', id, status } : { action: 'reset' },
      })
      ready.value = true
      revision.value++
      // Keep automatic tours suspended until the reset destination has loaded.
      if (options.redirectTo) await navigateTo(options.redirectTo)
      return true
    } catch {
      toast.add({ title: $t('tours.saveError'), color: 'error' })
      return false
    } finally {
      busy.value = false
    }
  }
  return { records, ready, busy, revision, load, update }
}
