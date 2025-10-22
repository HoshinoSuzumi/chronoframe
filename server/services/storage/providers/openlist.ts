import type { Logger } from '../../../utils/logger'
import type { StorageProvider, StorageObject, OpenListStorageConfig } from '../interfaces'

/**
 * OpenListStorageProvider implements StorageProvider for OpenList API.
 * Since OpenList API endpoints may vary by deployment, we keep them configurable.
 */
export class OpenListStorageProvider implements StorageProvider {
  config: OpenListStorageConfig
  private logger?: Logger['storage']
  private token?: string

  constructor(config: OpenListStorageConfig, logger?: Logger['storage']) {
    this.config = config
    this.logger = logger
  }

  private get baseUrl() {
    return this.config.baseUrl.replace(/\/$/, '')
  }

  private get pathField(): string {
    return this.config.pathField || 'path'
  }

  private async ensureAuthToken(): Promise<string> {
    if (this.token) return this.token
    if (this.config.token) {
      this.token = this.config.token
      return this.token
    }
    
    throw new Error('OpenList auth requires a token. Please configure NUXT_PROVIDER_OPENLIST_TOKEN.')
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const token = await this.ensureAuthToken()
    const url = `${this.baseUrl}${path}`
    const headers: Record<string, string> = {
      ...(init.headers as Record<string, string> | undefined),
      Authorization: token,
    }
    return fetch(url, { ...init, headers })
  }

  private normalizedRoot(): string {
    return (this.config.rootPath || '').replace(/\/+$/g, '').replace(/^\/+/, '')
  }

  private withRoot(key: string): string {
    const root = this.normalizedRoot()
    const trimmedKey = key.replace(/^\/+/, '')
    if (!root) {
      return trimmedKey
    }
    if (trimmedKey === root || trimmedKey.startsWith(`${root}/`)) {
      return trimmedKey
    }
    return `${root}/${trimmedKey}`
  }

  private toAbsolutePath(key: string): string {
    if (!key || key === '/') {
      return '/'
    }
    return key.startsWith('/') ? key : `/${key}`
  }

  async create(key: string, fileBuffer: Buffer, contentType?: string): Promise<StorageObject> {
    const rootedKey = this.withRoot(key)
    const absoluteKey = this.toAbsolutePath(rootedKey)
    const uploadPath = this.config.endpoints.upload

    const resp = await this.request(uploadPath, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType || 'application/octet-stream',
        'Content-Length': String(fileBuffer.length),
        'File-Path': encodeURIComponent(absoluteKey),
      },
      body: new Uint8Array(fileBuffer),
    })

    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      this.logger?.error('OpenList upload failed', { status: resp.status, body: text })
      throw new Error(`OpenList upload failed: ${resp.status}`)
    }

    this.logger?.success(`Uploaded object: ${absoluteKey}`)
    this.logger?.debug?.('OpenList upload details', {
      originalKey: key,
      rootedKey,
      absoluteKey,
      rootPath: this.normalizedRoot(),
    })

    const meta = await this.getFileMeta(rootedKey)
    return (
      meta || {
        key: rootedKey,
        size: fileBuffer.length,
        lastModified: new Date(),
      }
    )
  }

  async delete(key: string): Promise<void> {
    const deletePath = this.config.endpoints.delete
    const urlPath = `${deletePath}`
    const rootedKey = this.withRoot(key)
    const normalized = rootedKey.replace(/^\/+/, '')
    const slashIdx = normalized.lastIndexOf('/')
    const dir = this.toAbsolutePath(slashIdx >= 0 ? normalized.slice(0, slashIdx) : this.normalizedRoot())
    const name = slashIdx >= 0 ? normalized.slice(slashIdx + 1) : normalized
    const body = { dir, names: [name] }

    const resp = await this.request(urlPath, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      this.logger?.error('OpenList delete failed', { status: resp.status, body: text })
      throw new Error(`OpenList delete failed: ${resp.status}`)
    }
    this.logger?.success(`Deleted object: ${key}`)
  }

  async get(key: string): Promise<Buffer | null> {
    // If download endpoint is empty string, try to resolve raw_url via meta and fetch it
    if (!this.config.endpoints.download || this.config.endpoints.download === '') {
      const info = await this.getFileMeta(this.withRoot(key))
      const rawUrl = (info as any)?.raw_url || undefined
      if (!rawUrl) return null
      const resp = await fetch(rawUrl)
      if (!resp.ok) return null
      const arrayBuffer = await resp.arrayBuffer().catch(() => null)
      if (!arrayBuffer) return null
      return Buffer.from(arrayBuffer)
    }

    const downloadPath = this.config.endpoints.download
    const rootedKey = this.withRoot(key)
    const urlPath = `${downloadPath}?${encodeURIComponent(this.pathField)}=${encodeURIComponent(rootedKey)}`
    const resp = await this.request(urlPath, { method: 'GET' })
    if (!resp.ok) return null
    const arrayBuffer = await resp.arrayBuffer().catch(() => null)
    if (!arrayBuffer) return null
    return Buffer.from(arrayBuffer)
  }

  getPublicUrl(key: string): string {
    const rootedKey = this.withRoot(key)
    const { cdnUrl, baseUrl } = this.config
    const base = cdnUrl || (baseUrl ? `${baseUrl.replace(/\/$/, '')}/d` : '')
    if (!base) {
      return ''
    }
    return `${base.replace(/\/$/, '')}/${rootedKey}`
  }

  async getFileMeta(key: string): Promise<StorageObject | null> {
    const metaPath = this.config.endpoints.meta || this.config.endpoints.download
    const rootedKey = this.withRoot(key)
    const urlPath = metaPath
    const payload: Record<string, any> = {
      [this.pathField]: this.toAbsolutePath(rootedKey),
      password: '',
      page: 1,
      per_page: 0,
      refresh: false,
    }
    const resp = await this.request(urlPath, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      this.logger?.error('OpenList get file meta failed', { status: resp.status, body: text })
      return null
    }

    const data = (await resp.json().catch(() => null)) as any
    if (!data) return { key }
    const node = data?.data || {}
    const size = node?.size
    const modified = node?.modified || node?.lastModified
    const etag = node?.etag
    const rawUrl = node?.raw_url
    const result: StorageObject = {
      key: rootedKey,
      size: typeof size === 'number' ? size : undefined,
      lastModified: modified ? new Date(modified) : undefined,
      etag: typeof etag === 'string' ? etag : undefined,
    }
    // Attach raw_url as non-standard property for internal usage
    ;(result as any).raw_url = typeof rawUrl === 'string' ? rawUrl : undefined
    return result
  }

  async listAll(): Promise<StorageObject[]> {
    // Listing API not provided explicitly; return empty array by default.
    // You can configure custom list endpoint and parsing later.
    if (!this.config.endpoints.list || this.config.endpoints.list === '') return []
    const listPath = this.config.endpoints.list
    const payload: Record<string, any> = {
      [this.pathField]: this.toAbsolutePath(this.normalizedRoot()),
      password: '',
      page: 1,
      per_page: 0,
      refresh: false,
    }
    const resp = await this.request(listPath, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!resp.ok) return []
    const data = (await resp.json().catch(() => null)) as any
    const items: any[] = data?.data || data || []
    return items
      .map((item) => {
        const rawKey = item?.path || item?.key || item?.name
        if (!rawKey) return null
        const rootedKey = this.withRoot(rawKey)
        const size = item?.size
        const lastModified = item?.modified || item?.lastModified || item?.mtime
        const etag = item?.etag
        return {
          key: rootedKey,
          size: typeof size === 'number' ? size : undefined,
          lastModified: lastModified ? new Date(lastModified) : undefined,
          etag: typeof etag === 'string' ? etag : undefined,
        } as StorageObject
      })
      .filter(Boolean) as StorageObject[]
  }

  async listImages(): Promise<StorageObject[]> {
    const all = await this.listAll()
    return all.filter((obj) => /\.(jpe?g|png|webp|gif|bmp|tiff?|heic|heif)$/i.test(obj.key))
  }
}
