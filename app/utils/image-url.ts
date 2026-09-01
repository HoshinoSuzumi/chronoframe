/**
 * 将外部图片 URL 转换为同源代理地址，绕过浏览器 CORS 限制。
 * - 同源 / 相对路径（/storage、/thumb 等）原样返回
 * - blob: / data: 原样返回
 * - 外部 URL 转为 /proxy-image?url=...
 */
export const resolveImageUrl = (url: string): string => {
  if (!url) return url
  try {
    const parsed = new URL(url, window.location.origin)
    if (parsed.protocol === 'blob:' || parsed.protocol === 'data:') return url
    if (parsed.origin === window.location.origin) return url
    return `/proxy-image?url=${encodeURIComponent(url)}`
  } catch {
    return url
  }
}