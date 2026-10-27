import {
  receivePaymentEvent,
  processPaymentEvents,
} from '../../../../../packages/platform/src/payments'
import {
  definePlatformHandler,
  platformDatabase,
} from '../../../../shared/platform/runtime'
import { getHeader, getRequestWebStream, createError } from 'h3'
export default definePlatformHandler(async (event) => {
  const stream = getRequestWebStream(event)
  if (!stream) throw createError({ statusCode: 400 })
  const reader = stream.getReader(),
    chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > 65536) {
        await reader.cancel()
        throw createError({ statusCode: 413 })
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const body = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  const db = platformDatabase(event),
    key = useRuntimeConfig(event).platform.storageSecret
  const result = await receivePaymentEvent(
    db,
    key,
    body,
    getHeader(event, 'creem-signature') || '',
  )
  // Durable acceptance precedes processing; failures remain in the scheduled retry inbox.
  await processPaymentEvents(db, key, fetch, Date.now(), 1).catch(
    () => undefined,
  )
  return result
})
