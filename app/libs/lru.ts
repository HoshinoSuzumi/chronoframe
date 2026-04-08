/**
 * 最近最少使用 (LRU) 缓存实现
 * 提供高效的缓存管理，支持自动淘汰和资源清理
 */

type CleanupHandler<K, V> = (item: V, key: K, context: string) => void

export class LRUCache<K, V> {
  private readonly capacity: number
  private readonly storage = new Map<K, V>()
  private readonly onEvict?: CleanupHandler<K, V>

  constructor(maxSize = 10, cleanupFn?: CleanupHandler<K, V>) {
    this.capacity = Math.max(1, maxSize)
    this.onEvict = cleanupFn
  }

  get(key: K): V | undefined {
    const item = this.storage.get(key)
    if (item === undefined) {
      return undefined
    }

    // 重新插入以更新访问顺序
    this.storage.delete(key)
    this.storage.set(key, item)
    return item
  }

  set(key: K, value: V): void {
    // 处理已存在的键
    if (this.storage.has(key)) {
      const existingValue = this.storage.get(key)!
      this.executeCleanup(existingValue, key, `更新缓存项: ${String(key)}`)
      this.storage.delete(key)
    } else {
      // 检查容量限制
      this.ensureCapacity()
    }

    this.storage.set(key, value)
    this.logCacheOperation('添加', key)
  }

  delete(key: K): boolean {
    const item = this.storage.get(key)
    if (item === undefined) {
      return false
    }

    this.executeCleanup(item, key, `手动删除: ${String(key)}`)
    return this.storage.delete(key)
  }

  has(key: K): boolean {
    return this.storage.has(key)
  }

  clear(): void {
    const itemCount = this.storage.size

    for (const [key, item] of this.storage.entries()) {
      this.executeCleanup(item, key, `清空缓存: ${String(key)}`)
    }

    this.storage.clear()
    console.info(`缓存已清空，共释放 ${itemCount} 个项目`)
  }

  size(): number {
    return this.storage.size
  }

  getStats(): { size: number; maxSize: number; keys: K[] } {
    return {
      size: this.storage.size,
      maxSize: this.capacity,
      keys: [...this.storage.keys()],
    }
  }

  values(): IterableIterator<V> {
    return this.storage.values()
  }

  entries(): IterableIterator<[K, V]> {
    return this.storage.entries()
  }

  /**
   * 确保缓存容量不超限
   */
  private ensureCapacity(): void {
    while (this.storage.size >= this.capacity) {
      const oldestKey = this.storage.keys().next().value
      if (oldestKey !== undefined) {
        const oldestValue = this.storage.get(oldestKey)!
        this.executeCleanup(
          oldestValue,
          oldestKey,
          `容量限制淘汰: ${String(oldestKey)}`,
        )
        this.storage.delete(oldestKey)
      }
    }
  }

  /**
   * 安全执行清理回调
   */
  private executeCleanup(item: V, key: K, context: string): void {
    if (!this.onEvict) return

    try {
      this.onEvict(item, key, context)
    } catch (err) {
      console.warn(`缓存清理失败 (${context}):`, err)
    }
  }

  /**
   * 记录缓存操作日志
   */
  private logCacheOperation(action: string, key: K): void {
    console.info(
      `LRU 缓存: ${action} ${String(key)}，当前大小: ${this.storage.size}/${this.capacity}`,
    )
  }
}

/**
 * 创建专用于 Blob URL 管理的缓存实例
 * 在项目淘汰时自动释放 Object URL 资源
 */
export function createBlobUrlCache<T extends { url?: string }>(
  maxSize = 10,
): LRUCache<string, T> {
  const urlRevoker = (item: T, key: string, context: string) => {
    if (!item.url) return

    try {
      URL.revokeObjectURL(item.url)
      console.info(`已释放 Blob URL - ${context}`)
    } catch (err) {
      console.warn(`Blob URL 释放失败 (${context}):`, err)
    }
  }

  return new LRUCache<string, T>(maxSize, urlRevoker)
}

/**
 * Vue 组合式函数，用于在组件中管理 LRU 缓存生命周期
 * 组件卸载时自动执行缓存清理
 */
export function useLRUCache<K, V>(
  maxSize = 10,
  cleanupFn?: CleanupHandler<K, V>,
): LRUCache<K, V> {
  const cacheInstance = shallowRef<LRUCache<K, V> | null>(null)

  // 懒初始化缓存实例
  if (!cacheInstance.value) {
    cacheInstance.value = new LRUCache(maxSize, cleanupFn)
  }

  // 组件生命周期结束时清理资源
  onBeforeUnmount(() => {
    cacheInstance.value?.clear()
  })

  return cacheInstance.value
}
