import { open } from 'node:fs/promises'
import path from 'node:path'
import {
  LOG_PAGE_BYTES,
  logIdentity,
  readLogPage,
} from '../../utils/log-reader'

export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const file = path.join(process.cwd(), 'data', 'logs', 'app.log')
  const query = getQuery(event)
  const parseOffset = (value: unknown) => {
    if (value === undefined) return undefined
    const offset = Number(value)
    if (!Number.isSafeInteger(offset) || offset < 0) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid log cursor',
      })
    }
    return offset
  }
  const cursor = parseOffset(query.before)
  if (query.stream !== '1') {
    try {
      const page = await readLogPage(file, cursor)
      if (query.identity && query.identity !== page.identity) {
        throw createError({
          statusCode: 409,
          statusMessage: 'Log file changed; reload history',
        })
      }
      return page
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      return { lines: [], before: 0, offset: 0, identity: '' }
    }
  }

  const stream = createEventStream(event)
  let offset = parseOffset(query.offset) ?? 0
  let identity = String(query.identity || '')
  let closed = false
  let busy = false
  let ticks = 0
  let skippingOversized = false
  const flush = async () => {
    if (closed || busy) return
    busy = true
    let handle
    try {
      handle = await open(file, 'r')
      if (closed) return
      const stat = await handle.stat()
      const currentIdentity = logIdentity(stat)
      if ((identity && currentIdentity !== identity) || stat.size < offset) {
        offset = 0
        skippingOversized = false
        await stream.push({ event: 'reset', data: '{}' })
      }
      identity = currentIdentity
      if (stat.size > offset) {
        const buffer = Buffer.alloc(
          Math.min(LOG_PAGE_BYTES, stat.size - offset),
        )
        const { bytesRead } = await handle.read(
          buffer,
          0,
          buffer.length,
          offset,
        )
        const data = buffer.subarray(0, bytesRead)
        const first = skippingOversized ? data.indexOf(10) + 1 : 0
        const last = data.lastIndexOf(10)
        if (last >= 0) {
          offset += last + 1
          skippingOversized = false
          await stream.push({
            event: 'logs',
            id: String(offset),
            data: JSON.stringify({
              lines: data
                .subarray(first, last)
                .toString('utf8')
                .split('\n')
                .filter(Boolean),
              offset,
              identity,
            }),
          })
        } else if (bytesRead === LOG_PAGE_BYTES) {
          // Skip oversized records in bounded chunks instead of growing memory without limit.
          offset += bytesRead
          skippingOversized = true
        }
      }
      if (++ticks % 60 === 0)
        await stream.push({ event: 'heartbeat', data: '{}' })
    } catch (error) {
      if (!closed && (error as NodeJS.ErrnoException).code !== 'ENOENT') {
        await stream.push({ event: 'failure', data: '{}' }).catch(() => {})
      }
    } finally {
      await handle?.close()
      busy = false
    }
  }
  const timer = setInterval(() => {
    void flush()
  }, 250)
  stream.onClosed(() => {
    closed = true
    clearInterval(timer)
  })
  // Flush an initial event so quiet logs do not delay the browser's open event.
  void stream.push({ event: 'ready', data: '{}' }).catch(() => {})
  void flush()
  return stream.send()
})
