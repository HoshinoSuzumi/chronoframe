import type { IncomingHttpHeaders } from 'node:http'

type NodeHeaders = IncomingHttpHeaders
type HeaderAccessors = {
  get?: (name: string) => string | null
  has?: (name: string) => boolean
}

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', (event) => {
    const req = event.req as {
      headers?: NodeHeaders
      url?: string
      socket?: { encrypted?: boolean }
      connection?: { encrypted?: boolean }
    }
    const headers = req.headers

    const headerAccessors = headers as NodeHeaders & HeaderAccessors

    if (!headers || typeof headerAccessors.get === 'function') {
      return
    }

    // Bridge Node-style headers object for code paths expecting Fetch Headers API.
    const getHeader = (name: string) => {
      const key = name.toLowerCase()
      const value = headers[key]
      if (Array.isArray(value)) {
        return value.filter(Boolean).join(', ')
      }
      return value ?? null
    }

    Object.defineProperty(headerAccessors, 'get', {
      value: getHeader,
      configurable: true,
      enumerable: false,
    })

    Object.defineProperty(headerAccessors, 'has', {
      value: (name: string) => headers[name.toLowerCase()] !== undefined,
      configurable: true,
      enumerable: false,
    })

    const currentUrl = (event as { url?: string }).url
    if (!currentUrl && typeof req.url === 'string' && req.url.startsWith('/')) {
      const host = getHeader('host') || 'localhost'
      const proto = getHeader('x-forwarded-proto')
      const isHttps =
        proto === 'https' || req.socket?.encrypted || req.connection?.encrypted

      ;(event as { url?: URL }).url = new URL(
        `${isHttps ? 'https' : 'http'}://${host}${req.url}`,
      )
    }
  })
})
