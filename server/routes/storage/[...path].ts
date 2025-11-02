import path from 'node:path'
import { createReadStream, promises as fs } from 'node:fs'
import { getStorageManager } from '../../plugins/3.storage'
// lightweight: avoid TS type dep; fallback when not resolvable
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

export default defineEventHandler(async (event) => {
  const manager = getStorageManager()
  const provider = manager.getProvider()

  if ((provider as any).config?.provider !== 'local') {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }

  const p = getRouterParam(event, 'path') || ''
  const relPathRaw = Array.isArray(p) ? p.join('/') : p
  // handle CJK characters in URL
  const decodedPath = decodeURIComponent(relPathRaw)
  const relPath = decodedPath.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/+/, '')

  // 阻止路径穿越
  if (relPath.includes('..')) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid path' })
  }

  const basePath = (provider as any).config.basePath as string
  const absolute = path.resolve(basePath, relPath)

  // 再次确认目标仍在 basePath 内
  if (!absolute.startsWith(path.resolve(basePath) + path.sep)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid path' })
  }

  try {
    const stat = await fs.stat(absolute)
    if (!stat.isFile()) {
      throw createError({ statusCode: 404, statusMessage: 'Not Found' })
    }

    // 设置缓存头
    const etag = `W/"${stat.size}-${stat.mtimeMs}"`
    setHeader(event, 'ETag', etag)
    setHeader(event, 'Last-Modified', stat.mtime.toUTCString())
    setHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')

    // Content-Type
    const contentType = guessContentType(absolute)
    setHeader(event, 'Content-Type', contentType)

    // 条件请求
    const inm = getHeader(event, 'if-none-match')
    const ims = getHeader(event, 'if-modified-since')
    if (inm === etag || (ims && new Date(ims).getTime() >= stat.mtime.getTime())) {
      event.node.res.statusCode = 304
      return null
    }

    // Range 支持
    const range = getHeader(event, 'range')
    if (range) {
      const matches = /^bytes=(\d*)-(\d*)$/.exec(range)
      if (matches) {
        const start = matches[1] ? parseInt(matches[1], 10) : 0
        const end = matches[2] ? parseInt(matches[2], 10) : stat.size - 1
        if (start <= end && end < stat.size) {
          event.node.res.statusCode = 206
          setHeader(event, 'Content-Range', `bytes ${start}-${end}/${stat.size}`)
          setHeader(event, 'Accept-Ranges', 'bytes')
          event.node.res.setHeader('Content-Length', String(end - start + 1))
          const stream = createReadStream(absolute, { start, end })
          return sendStream(event, stream)
        }
      }
    }
  } catch {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }

  const stream = createReadStream(absolute)
  return sendStream(event, stream)
})
