import { Readable } from 'node:stream'

export default eventHandler(async (event) => {
  const { url } = getQuery(event)
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid url' })
  }

  // 只允许代理已配置存储提供方的主机，防止开放代理/SSRF
  const runtimeConfig = useRuntimeConfig()
  const hosts: string[] = []
  const openlist = runtimeConfig.provider?.openlist as
    | { baseUrl?: string; cdnUrl?: string }
    | undefined
  const s3 = runtimeConfig.provider?.s3 as { cdnUrl?: string } | undefined
  if (openlist?.baseUrl) hosts.push(new URL(openlist.baseUrl).hostname)
  if (openlist?.cdnUrl) hosts.push(new URL(openlist.cdnUrl).hostname)
  if (s3?.cdnUrl) hosts.push(new URL(s3.cdnUrl).hostname)

  let hostname = ''
  try {
    hostname = new URL(url).hostname
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid url' })
  }
  if (hosts.length > 0 && !hosts.includes(hostname)) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden host' })
  }

  // Node fetch 默认跟随 302 重定向（OpenList → 115 CDN）
  const upstream = await fetch(url, { redirect: 'follow' })
  if (!upstream.ok) {
    throw createError({
      statusCode: upstream.status,
      statusMessage: 'Upstream fetch failed',
    })
  }

  const contentType =
    upstream.headers.get('content-type') || 'application/octet-stream'
  const contentLength = upstream.headers.get('content-length')
  setHeader(event, 'Content-Type', contentType)
  setHeader(event, 'Cache-Control', 'public, max-age=86400')
  if (contentLength) {
    setHeader(event, 'Content-Length', contentLength)
  }

  // 流式转发，避免大图/视频占用内存
  return sendStream(event, Readable.fromWeb(upstream.body as any))
})