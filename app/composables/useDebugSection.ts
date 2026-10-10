import type { DebugSection, DebugValue } from '~/types/debug'

/** Register route-specific controls; values survive navigation, controls do not. */
export function useDebugSection(section: MaybeRefOrGetter<DebugSection>) {
  if (!import.meta.dev) return
  const store = useDebugStore()
  const id = toValue(section).id
  let registered: DebugSection
  watch(
    () => toValue(section),
    (value) => {
      registered = value
      store.register(value)
    },
    { immediate: true, deep: true },
  )
  onScopeDispose(() => {
    if (store.sections[id] === registered) store.unregister(id)
  })
}

/** All debug features read and write through the same persistent store. */
export function useDebugValue<T extends DebugValue>(key: string, fallback: T) {
  if (!import.meta.dev)
    return computed({ get: () => fallback, set: (_value: T) => {} })
  const store = useDebugStore()
  return computed({
    get: () => store.get(key, fallback),
    set: (value) => store.set(key, value),
  })
}
