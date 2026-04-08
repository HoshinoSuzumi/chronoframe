/**
 * 重试配置选项
 */
export interface RetryOptions {
  /** 最大重试次数，默认 3 */
  maxAttempts?: number
  /** 基础延迟时间（毫秒），默认 1000ms */
  baseDelay?: number
  /** 最大延迟时间（毫秒），默认 30000ms */
  maxDelay?: number
  /** 操作超时时间（毫秒），默认 30000ms */
  timeout?: number
  /** 重试条件判断函数，返回 true 表示应该重试 */
  retryCondition?: (error: Error) => boolean
  /** 延迟策略：'exponential' 指数退避，'linear' 线性增长，'fixed' 固定延迟 */
  delayStrategy?: 'exponential' | 'linear' | 'fixed'
}

/**
 * 通用重试工具函数
 *
 * @param operation 要执行的异步操作
 * @param options 重试配置选项
 * @param logger 可选的日志记录器
 * @returns 操作结果
 *
 * @example
 * ```typescript
 * const result = await withRetry(
 *   () => fetchDataFromAPI(),
 *   {
 *     maxAttempts: 3,
 *     timeout: 5000,
 *     retryCondition: (error) => !error.message.includes('400')
 *   },
 *   logger.api
 * )
 * ```
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
  logger?: Logger[keyof Logger],
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelay = 1000,
    maxDelay = 30000,
    timeout = 30000,
    retryCondition = () => true,
    delayStrategy = 'exponential',
  } = options

  let lastError: Error

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      logger?.info(`Operation attempt ${attempt}/${maxAttempts}`)

      // 应用超时机制
      const result = await Promise.race([
        operation(),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`Operation timeout after ${timeout}ms`)),
            timeout,
          ),
        ),
      ])

      if (attempt > 1) {
        logger?.success(`Operation succeeded on attempt ${attempt}`)
      }
      return result
    } catch (error) {
      lastError = error as Error
      logger?.warn(`Attempt ${attempt} failed:`, error)

      const shouldRetry = attempt < maxAttempts && retryCondition(lastError)
      if (shouldRetry) {
        const delay = calculateDelay(
          attempt,
          baseDelay,
          maxDelay,
          delayStrategy,
        )
        logger?.info(`Retrying in ${delay}ms...`)
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }
  }

  logger?.error(`All ${maxAttempts} attempts failed`)
  throw lastError!
}

/**
 * 计算延迟时间
 */
function calculateDelay(
  attempt: number,
  baseDelay: number,
  maxDelay: number,
  strategy: 'exponential' | 'linear' | 'fixed',
): number {
  let delay: number

  switch (strategy) {
    case 'exponential':
      // 指数退避：1s, 2s, 4s, 8s...
      delay = baseDelay * Math.pow(2, attempt - 1)
      break
    case 'linear':
      // 线性增长：1s, 2s, 3s, 4s...
      delay = baseDelay * attempt
      break
    case 'fixed':
      // 固定延迟：1s, 1s, 1s, 1s...
      delay = baseDelay
      break
    default:
      delay = baseDelay
  }

  return Math.min(delay, maxDelay)
}

/**
 * 常见错误的重试条件预设
 */
export const RetryConditions = {
  /** 网络错误重试（排除 4xx 客户端错误） */
  networkErrors: (error: Error) => {
    const message = error.message.toLowerCase()
    // 不重试客户端错误 (4xx)
    if (
      message.includes('400') ||
      message.includes('401') ||
      message.includes('403') ||
      message.includes('404')
    ) {
      return false
    }
    // 重试网络相关错误
    return (
      message.includes('timeout') ||
      message.includes('network') ||
      message.includes('fetch') ||
      message.includes('econnreset') ||
      message.includes('enotfound') ||
      message.includes('502') ||
      message.includes('503') ||
      message.includes('504')
    )
  },

  /** 文件系统错误重试（排除权限和不存在错误） */
  fileSystemErrors: (error: Error) => {
    const message = error.message.toLowerCase()
    // 不重试权限和文件不存在错误
    if (
      message.includes('eacces') ||
      message.includes('enoent') ||
      message.includes('permission denied')
    ) {
      return false
    }
    // 重试临时性文件系统错误
    return (
      message.includes('ebusy') ||
      message.includes('emfile') ||
      message.includes('enfile') ||
      message.includes('eagain')
    )
  },

  /** 资源竞争错误重试 */
  resourceErrors: (error: Error) => {
    const message = error.message.toLowerCase()
    return (
      message.includes('busy') ||
      message.includes('locked') ||
      message.includes('resource') ||
      message.includes('memory') ||
      message.includes('cpu')
    )
  },

  /** 始终重试 */
  always: () => true,

  /** 从不重试 */
  never: () => false,
}

/**
 * 重试配置预设
 */
export const RetryPresets = {
  /** 快速重试：适用于轻量级操作 */
  fast: {
    maxAttempts: 3,
    baseDelay: 500,
    timeout: 5000,
    delayStrategy: 'exponential' as const,
  },

  /** 标准重试：适用于一般操作 */
  standard: {
    maxAttempts: 3,
    baseDelay: 1000,
    timeout: 10000,
    delayStrategy: 'exponential' as const,
  },

  /** 网络重试：适用于网络请求 */
  network: {
    maxAttempts: 3,
    baseDelay: 1000,
    timeout: 30000,
    delayStrategy: 'exponential' as const,
    retryCondition: RetryConditions.networkErrors,
  },

  /** 文件操作重试：适用于文件系统操作 */
  fileSystem: {
    maxAttempts: 5,
    baseDelay: 500,
    timeout: 15000,
    delayStrategy: 'linear' as const,
    retryCondition: RetryConditions.fileSystemErrors,
  },

  /** 慢速重试：适用于重量级操作 */
  slow: {
    maxAttempts: 3,
    baseDelay: 2000,
    timeout: 60000,
    delayStrategy: 'exponential' as const,
  },
}
