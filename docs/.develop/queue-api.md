# 队列系统 API 使用指南

支持多个并发消费者的队列处理系统。以下是通过 API 创建和管理任务的方法：

## API 概览

### 1. 添加单个任务

**POST** `/api/queue/add-task`

### 2. 批量添加任务

**POST** `/api/queue/add-tasks`

### 3. 查看队列状态

**GET** `/api/queue/status`

## 使用示例

### 1. 添加单个任务

```javascript
// 添加单个照片处理任务
const response = await fetch('/api/queue/add-task', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    payload: {
      storageKey: 'photos/2024/IMG_1234.HEIC',
    },
    priority: 5, // 可选，优先级 0-10，默认 0
    maxAttempts: 3, // 可选，最大重试次数 1-5，默认 3
  }),
})

const result = await response.json()
console.log('任务已添加:', result)
// 输出:
// {
//   "success": true,
//   "taskId": 123,
//   "message": "Task added to queue successfully",
//   "payload": {
//     "storageKey": "photos/2024/IMG_1234.HEIC",
//     "priority": 5,
//     "maxAttempts": 3
//   }
// }
```

### 2. 批量添加任务

```javascript
// 批量添加多个照片处理任务
const response = await fetch('/api/queue/add-tasks', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    tasks: [
      {
        payload: { storageKey: 'photos/2024/IMG_1234.HEIC' },
        priority: 8,
      },
      {
        payload: { storageKey: 'photos/2024/IMG_1235.HEIC' },
        priority: 5,
      },
      {
        payload: { storageKey: 'photos/2024/IMG_1236.HEIC' },
        // 使用默认优先级和重试次数
      },
    ],
    defaultPriority: 3, // 可选，默认优先级
    defaultMaxAttempts: 3, // 可选，默认最大重试次数
  }),
})

const result = await response.json()
console.log('批量任务结果:', result)
// 输出:
// {
//   "success": true,
//   "totalTasks": 3,
//   "successCount": 3,
//   "errorCount": 0,
//   "results": [
//     { "index": 0, "taskId": 124, "storageKey": "photos/2024/IMG_1234.HEIC", "success": true },
//     { "index": 1, "taskId": 125, "storageKey": "photos/2024/IMG_1235.HEIC", "success": true },
//     { "index": 2, "taskId": 126, "storageKey": "photos/2024/IMG_1236.HEIC", "success": true }
//   ],
//   "message": "Processed 3 tasks: 3 successful, 0 failed"
// }
```

### 3. 查看队列状态

```javascript
// 获取实时队列和工作器状态
const response = await fetch('/api/queue/status')
const status = await response.json()

console.log('队列状态:', status)
// 输出:
// {
//   "timestamp": "2024-09-24T10:30:00.000Z",
//   "pool": {
//     "isActive": true,
//     "workerCount": 3,
//     "totalWorkers": 3,
//     "activeWorkers": 2,
//     "totalProcessed": 45,
//     "totalErrors": 2,
//     "averageSuccessRate": 95.74,
//     "workers": [
//       {
//         "workerId": "worker-1",
//         "isProcessing": true,
//         "processedCount": 15,
//         "errorCount": 1,
//         "uptime": 3600,
//         "successRate": 93.75
//       },
//       {
//         "workerId": "worker-2",
//         "isProcessing": true,
//         "processedCount": 18,
//         "errorCount": 0,
//         "uptime": 3600,
//         "successRate": 100
//       },
//       {
//         "workerId": "worker-3",
//         "isProcessing": false,
//         "processedCount": 12,
//         "errorCount": 1,
//         "uptime": 3600,
//         "successRate": 92.31
//       }
//     ]
//   },
//   "queue": {
//     "pending": 8,
//     "in-stages": 2,
//     "completed": 45,
//     "failed": 2
//   }
// }
```

## 系统特性

### 多消费者并发处理

- **3个工作器**：同时处理不同的任务
- **错开轮询**：工作器使用不同的轮询间隔，减少数据库竞争
- **负载均衡**：自动检测和重启有问题的工作器

### 任务优先级

- 优先级范围：0-9（9为最高优先级）
- 高优先级任务会被优先处理
- 相同优先级按照创建时间排序

### 错误处理和重试

- 自动重试机制：任务失败时会自动重试
- 可配置重试次数：1-5次
- 渐进式退避：重试间隔逐渐增加

### 实时监控

- **工作器状态**：查看每个工作器的处理统计
- **队列统计**：查看待处理、处理中、已完成、失败的任务数量
- **性能指标**：成功率、处理速度、运行时间等

## 在现有代码中集成

### 在照片上传时自动添加任务

```typescript
// 在 server/api/photos/process.post.ts 中
export default defineEventHandler(async (event) => {
  const { storageKey } = await readBody(event)

  // 获取工作器池并添加任务
  const workerPool = (globalThis as any).__workerPool
  if (workerPool) {
    const taskId = await workerPool.addTask(
      { storageKey },
      { priority: 5 }, // 用户上传的照片给予中等优先级
    )

    return {
      message: 'Photo processing started',
      taskId,
    }
  }
})
```

### 程序内部直接使用

```typescript
import { QueueManager } from '~~/server/services/pipeline-queue'

// 获取特定工作器实例
const worker = QueueManager.getInstance('worker-1')

// 添加任务
const taskId = await worker.addTask(
  {
    storageKey: 'photos/example.jpg',
  },
  {
    priority: 8,
    maxAttempts: 5,
  },
)
```

## 配置说明

工作器池在 `server/plugins/pipeline-queue.ts` 中配置：

```typescript
const workerPoolConfig = {
  workerCount: 3, // 消费者数量
  intervalMs: 2000, // 基础轮询间隔
  intervalOffset: 667, // 错开时间
  enableLoadBalancing: true, // 启用负载均衡
  statsReportInterval: 60000, // 统计报告间隔
}
```
