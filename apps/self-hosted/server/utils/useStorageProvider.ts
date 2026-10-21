import type { H3Event, EventHandlerRequest } from 'h3'
import type { StorageProvider } from '../services/storage'

export const useStorageProvider = (event: H3Event<EventHandlerRequest>) => {
  const storageProvider =
    event.context?.storage?.getProvider() as StorageProvider
  if (!storageProvider) {
    throw new Error('Storage provider not found')
  }
  return { storageProvider }
}
