# 重试机制使用指南

## 核心特性

### 1. 统一的重试工具函数

使用 `withRetry` 函数包装任何需要重试的异步操作：

```typescript
import { withRetry, RetryPresets, RetryConditions } from '../utils/retry'

// 基本用法
const result = await withRetry(
  () => someAsyncOperation(),
  RetryPresets.standard,
  logger,
)
```

### 2. 灵活的配置选项

```typescript
const customOptions = {
  maxAttempts: 5, // 最大重试次数
  baseDelay: 1000, // 基础延迟时间
  maxDelay: 30000, // 最大延迟时间
  timeout: 15000, // 操作超时时间
  delayStrategy: 'exponential', // 延迟策略
  retryCondition: (error) => !error.message.includes('400'),
}
```

### 3. 预设配置

#### 重试预设 (RetryPresets)

- `fast`: 快速重试，适合轻量级操作
- `standard`: 标准重试，适合一般操作
- `network`: 网络重试，专门针对API调用
- `fileSystem`: 文件系统重试，处理文件操作
- `slow`: 慢速重试，适合重量级操作

#### 重试条件 (RetryConditions)

- `networkErrors`: 排除4xx错误的网络重试
- `fileSystemErrors`: 排除权限错误的文件系统重试
- `resourceErrors`: 资源竞争错误重试
- `always`: 始终重试
- `never`: 从不重试

## 实际应用示例

### 1. EXIF 数据提取

```typescript
export const extractExifData = async (
  imageBuffer: Buffer,
  rawImageBuffer?: Buffer,
  logger?: Logger[keyof Logger],
): Promise<NeededExif | null> => {
  try {
    return await withRetry(
      async () => {
        // 核心处理逻辑
        const metadata = await sharp(imageBuffer).metadata()
        // ... 其他处理
        return result
      },
      {
        ...RetryPresets.standard,
        timeout: 15000,
        retryCondition: (error) => {
          return (
            RetryConditions.fileSystemErrors(error) ||
            RetryConditions.resourceErrors(error) ||
            error.message.includes('timeout')
          )
        },
      },
      logger,
    )
  } catch (error) {
    logger?.error('EXIF extraction failed after all retries:', error)
    return null
  }
}
```

### 2. 地理编码 API 调用

```typescript
async reverseGeocode(lat: number, lon: number): Promise<LocationInfo | null> {
  try {
    return await withRetry(async () => {
      await this.applyRateLimit()

      const response = await fetch(url.toString())
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`)
      }

      return processResponse(response)
    }, {
      ...RetryPresets.network,
      timeout: 10000,
      delayStrategy: 'exponential'
    }, logger.location)
  } catch (error) {
    logger.location.error('Geocoding failed after retries:', error)
    return null
  }
}
```

### 3. 图像处理操作

```typescript
export const generateThumbnailAndHash = async (
  buffer: Buffer,
  logger?: Logger[keyof Logger],
) => {
  return await withRetry(
    async () => {
      const thumbnailBuffer = await sharp(buffer)
        .resize(600, null)
        .webp({ quality })
        .toBuffer()

      const thumbnailHash = await generateBlurHash(thumbnailBuffer, logger)

      return { thumbnailBuffer, thumbnailHash }
    },
    {
      ...RetryPresets.standard,
      timeout: 15000,
      delayStrategy: 'linear', // 图像处理适合线性退避
    },
    logger,
  )
}
```

## 延迟策略

### 指数退避 (Exponential)

适用于网络请求，避免对服务器造成冲击：

- 1s → 2s → 4s → 8s...

### 线性增长 (Linear)

适用于资源竞争场景，平缓增加等待时间：

- 1s → 2s → 3s → 4s...

### 固定延迟 (Fixed)

适用于已知的固定限制场景：

- 1s → 1s → 1s → 1s...

## 最佳实践

### 1. 选择合适的预设

```typescript
// ✅ 推荐：根据操作类型选择预设
await withRetry(fetchAPI, RetryPresets.network, logger)
await withRetry(fileOperation, RetryPresets.fileSystem, logger)
await withRetry(imageProcessing, RetryPresets.standard, logger)

// ❌ 避免：盲目使用默认配置
await withRetry(operation, {}, logger) // 配置不够明确
```

### 2. 自定义重试条件

```typescript
// ✅ 推荐：根据具体错误类型判断是否重试
retryCondition: (error) => {
  // 不重试客户端错误
  if (error.message.includes('400') || error.message.includes('401')) {
    return false
  }
  // 重试其他错误
  return true
}

// ❌ 避免：盲目重试所有错误
retryCondition: () => true // 可能导致无意义的重试
```

### 3. 合理设置超时时间

```typescript
// ✅ 推荐：根据操作复杂度设置超时
const options = {
  timeout: operation === 'thumbnail' ? 15000 : 5000,
}

// ❌ 避免：超时时间过短或过长
timeout: 1000 // 太短，可能导致正常操作超时
timeout: 300000 // 太长，用户体验差
```

### 4. 错误处理和日志记录

```typescript
// ✅ 推荐：适当的错误处理和日志
try {
  return await withRetry(operation, options, logger)
} catch (error) {
  logger?.error('Operation failed after all retries:', error)
  return null // 或抛出更友好的错误
}

// ❌ 避免：忽略错误或过度错误处理
await withRetry(operation, options, logger) // 没有错误处理
```

## 监控和调试

### 日志输出示例

```
[INFO] Operation attempt 1/3
[WARN] Attempt 1 failed: Network timeout
[INFO] Retrying in 1000ms...
[INFO] Operation attempt 2/3
[SUCCESS] Operation succeeded on attempt 2
```

### 性能监控

建议添加以下指标监控：

- 重试成功率
- 平均重试次数
- 重试操作的延迟分布
- 最终失败率

## 迁移指南

### 从旧的重试逻辑迁移

```typescript
// 旧的实现 ❌
const maxRetries = 3
for (let attempt = 1; attempt <= maxRetries; attempt++) {
  try {
    const result = await operation()
    return result
  } catch (error) {
    if (attempt < maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt))
    }
  }
}

// 新的实现 ✅
return await withRetry(() => operation(), RetryPresets.standard, logger)
```

这种统一的重试机制设计不仅提高了代码的可维护性，还通过智能的重试条件和延迟策略，显著提升了系统的稳定性和用户体验。
