import path from 'node:path'
import { createReadStream, promises as fs } from 'node:fs'
import { createError, getHeader, setHeader, sendStream, type H3Event } from 'h3'
import type { LocalStorageConfig } from '@chronoframe/contracts/storage'

const guessContentType = (filePath: string): string => {
  const ext = (filePath.split('.').pop() || '').toLowerCase()
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'png':
      return 'image/png'
    case 'webp':
      return 'image/webp'
    case 'gif':
      return 'image/gif'
    case 'bmp':
      return 'image/bmp'
    case 'tif':
    case 'tiff':
      return 'image/tiff'
    case 'mp4':
      return 'video/mp4'
    case 'mov':
      return 'video/quicktime'
    case 'json':
      return 'application/json'
    default:
      return 'application/octet-stream'
  }
}

/** Resolve a canonical key within the real storage root, rejecting symlink escapes. */
export async function resolveLocalMediaPath(
  config: LocalStorageConfig,
  key: string,
) {
  if (
    !key ||
    key.includes('\\') ||
    key.startsWith('/') ||
    key.split('/').some((part) => !part || part === '.' || part === '..')
  ) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid path' })
  }
  try {
    const base = await fs.realpath(config.basePath)
    const absolute = await fs.realpath(path.resolve(base, key))
    const relative = path.relative(base, absolute)
    if (
      !relative ||
      relative.startsWith('..' + path.sep) ||
      relative === '..' ||
      path.isAbsolute(relative)
    ) {
      throw createError({ statusCode: 404, statusMessage: 'Not Found' })
    }
    return absolute
  } catch {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }
}

/** Serve an already-authorized Local object without an HTTP request to this application. */
export async function serveLocalMedia(
  event: H3Event,
  config: LocalStorageConfig,
  key: string,
  restricted: boolean,
) {
  const absolute = await resolveLocalMediaPath(config, key)
  const stat = await fs.stat(absolute)
  if (!stat.isFile())
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  const etag = `W/"${stat.size}-${stat.mtimeMs}"`
  setHeader(event, 'ETag', etag)
  setHeader(event, 'Last-Modified', stat.mtime.toUTCString())
  setHeader(
    event,
    'Cache-Control',
    restricted ? 'private, no-store' : 'public, max-age=31536000, immutable',
  )
  setHeader(event, 'Content-Type', guessContentType(absolute))
  setHeader(event, 'Accept-Ranges', 'bytes')
  const inm = getHeader(event, 'if-none-match')
  const ims = getHeader(event, 'if-modified-since')
  if (
    (inm &&
      (inm === '*' ||
        inm
          .split(',')
          .map((value) => value.trim())
          .includes(etag))) ||
    (!inm &&
      ims &&
      new Date(ims).getTime() >= Math.floor(stat.mtimeMs / 1000) * 1000)
  ) {
    event.node.res.statusCode = 304
    return null
  }
  const range = getHeader(event, 'range')
  const ifRange = getHeader(event, 'if-range')
  // Weak validators cannot satisfy If-Range; a stale validator requests the full object.
  const allowRange =
    !ifRange ||
    (!ifRange.startsWith('W/') &&
      !ifRange.startsWith('"') &&
      new Date(ifRange).getTime() >= Math.floor(stat.mtimeMs / 1000) * 1000)
  if (range && allowRange) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range)
    if (match && (match[1] || match[2])) {
      const suffix = !match[1]
      const start = suffix
        ? Math.max(0, stat.size - Number(match[2]))
        : Number(match[1])
      const end =
        suffix || !match[2]
          ? stat.size - 1
          : Math.min(Number(match[2]), stat.size - 1)
      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start > end ||
        start >= stat.size
      ) {
        setHeader(event, 'Content-Range', `bytes */${stat.size}`)
        throw createError({
          statusCode: 416,
          statusMessage: 'Range Not Satisfiable',
        })
      }
      event.node.res.statusCode = 206
      setHeader(event, 'Content-Range', `bytes ${start}-${end}/${stat.size}`)
      setHeader(event, 'Content-Length', end - start + 1)
      return sendStream(event, createReadStream(absolute, { start, end }))
    }
  }
  setHeader(event, 'Content-Length', stat.size)
  return sendStream(event, createReadStream(absolute))
}
