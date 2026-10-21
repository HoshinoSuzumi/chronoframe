import { open } from 'node:fs/promises'

// Bound work by bytes, regardless of the size of the log archive.
export const LOG_PAGE_BYTES = 64 * 1024
export const logIdentity = (stat: { dev: number; ino: number }) =>
  `${stat.dev}:${stat.ino}`

export async function readLogPage(file: string, before?: number) {
  const handle = await open(file, 'r')
  try {
    const stat = await handle.stat()
    const end = Math.min(before ?? stat.size, stat.size)
    const start = Math.max(0, end - LOG_PAGE_BYTES)
    const buffer = Buffer.alloc(end - start)
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, start)
    const data = buffer.subarray(0, bytesRead)
    // Only return complete records; an unfinished tail belongs to the live stream.
    const first = start === 0 ? 0 : data.indexOf(10) + 1
    const last = data.lastIndexOf(10)
    const boundary = last < first ? start : start + last + 1
    return {
      lines:
        last >= first
          ? data
              .subarray(first, last)
              .toString('utf8')
              .split('\n')
              .filter(Boolean)
          : [],
      before: start === 0 ? 0 : start + first,
      offset: boundary,
      identity: logIdentity(stat),
    }
  } finally {
    await handle.close()
  }
}
