import { promises as fs } from 'node:fs'
import path from 'node:path'
import type {
  LocalStorageConfig,
  StorageObject,
  StorageProvider,
} from '../interfaces'

const ensureDir = async (dirPath: string) => {
  await fs.mkdir(dirPath, { recursive: true })
}

const sanitizeKey = (key: string) =>
  key.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/+/, '')

const combinePrefixAndKey = (prefix: string | undefined, key: string) => {
  const cleanPrefix = (prefix || '').replace(/\/+$/, '')
  const cleanKey = key.replace(/^\/+/, '')
  if (!cleanPrefix) return cleanKey
  return cleanKey.startsWith(cleanPrefix + '/')
    ? cleanKey
    : `${cleanPrefix}/${cleanKey}`
}

export class LocalStorageProvider implements StorageProvider {
  config: LocalStorageConfig
  private logger?: Logger['storage']

  constructor(config: LocalStorageConfig, logger?: Logger['storage']) {
    this.config = config
    this.logger = logger
  }

  private resolveAbsoluteKey(key: string): { absFile: string; relKey: string } {
    const relKey = sanitizeKey(combinePrefixAndKey(this.config.prefix, key))
    const absFile = path.resolve(this.config.basePath, relKey)
    return { absFile, relKey }
  }

  async create(key: string, fileBuffer: Buffer): Promise<StorageObject> {
    const { absFile, relKey } = this.resolveAbsoluteKey(key)
    await ensureDir(path.dirname(absFile))
    // 原子写入：写到临时文件再重命名
    const tempFile = `${absFile}.tmp-${Date.now()}`
    await fs.writeFile(tempFile, fileBuffer)
    await fs.rename(tempFile, absFile)
    const stat = await fs.stat(absFile)
    this.logger?.success?.(`Saved file: ${absFile}`)
    return {
      key: relKey,
      size: stat.size,
      lastModified: stat.mtime,
    }
  }

  async delete(key: string): Promise<void> {
    const { absFile } = this.resolveAbsoluteKey(key)
    try {
      await fs.unlink(absFile)
      this.logger?.success?.(`Deleted file: ${absFile}`)
    } catch (err) {
      // ignore if not exists
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    }
  }

  async get(key: string): Promise<Buffer | null> {
    const { absFile } = this.resolveAbsoluteKey(key)
    try {
      return await fs.readFile(absFile)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw err
    }
  }

  getPublicUrl(key: string): string {
    const relKey = sanitizeKey(combinePrefixAndKey(this.config.prefix, key))
    const base = (this.config.baseUrl || '/storage').replace(/\/+$/, '')
    return `${base}/${relKey}`
  }

  async listAll(): Promise<StorageObject[]> {
    const results: StorageObject[] = []
    const baseDir = this.config.prefix
      ? path.resolve(this.config.basePath, this.config.prefix)
      : this.config.basePath

    const walk = async (dir: string, relBase: string) => {
      const entries = await fs.readdir(dir, { withFileTypes: true })
      for (const entry of entries) {
        const abs = path.join(dir, entry.name)
        const rel = sanitizeKey(path.join(relBase, entry.name))
        if (entry.isDirectory()) {
          await walk(abs, rel)
        } else if (entry.isFile()) {
          const stat = await fs.stat(abs)
          results.push({ key: rel, size: stat.size, lastModified: stat.mtime })
        }
      }
    }

    await ensureDir(baseDir)
    await walk(baseDir, this.config.prefix || '')
    return results
  }

  async listImages(): Promise<StorageObject[]> {
    const all = await this.listAll()
    return all.filter((o) => /\.(png|jpe?g|webp|gif|bmp|tiff?)$/i.test(o.key))
  }

  async getFileMeta(key: string): Promise<StorageObject | null> {
    // First try with combined prefix
    const { absFile, relKey } = this.resolveAbsoluteKey(key)
    try {
      const stat = await fs.stat(absFile)
      if (!stat.isFile()) return null
      return { key: relKey, size: stat.size, lastModified: stat.mtime }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    }

    // Fallback: try without adding prefix (in case key already contains it or was stored raw)
    const rawRel = sanitizeKey(key)
    const rawAbs = path.resolve(this.config.basePath, rawRel)
    try {
      const stat = await fs.stat(rawAbs)
      if (!stat.isFile()) return null
      return { key: rawRel, size: stat.size, lastModified: stat.mtime }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw err
    }
  }
}
