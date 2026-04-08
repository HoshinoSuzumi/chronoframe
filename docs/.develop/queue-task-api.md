# 队列任务管理 API 文档

本文档描述了ChronoFrame应用中新增的队列任务管理API端点。

## API 端点

### 1. GET `/api/queue/task/list` - 列出所有队列任务记录

获取队列中所有任务的列表

**响应示例：**

```json
[
  {
    "id": 123,
    "type": "photo",
    "storageKey": "uploads/2024/photo.jpg",
    "priority": 0,
    "attempts": 2,
    "maxAttempts": 3,
    "status": "failed",
    "statusStage": "exif",
    "errorMessage": "EXIF extraction failed",
    "createdAt": "2024-10-02T10:00:00Z",
    "completedAt": null
  }
]
```

### 2. POST `/api/queue/task/retry` - 重试失败任务

重试一个指定的失败状态任务。只有状态为 `failed` 的任务才能被重试。

**请求体：**

```json
{
  "taskId": 123
}
```

**响应示例：**

```json
{
  "success": true,
  "message": "Task 123 has been reset and will be retried",
  "taskId": 123,
  "payload": {
    "type": "photo",
    "storageKey": "uploads/2024/photo.jpg"
  }
}
```

**错误情况：**

- 404: 任务不存在
- 400: 任务不是失败状态

### 3. POST `/api/queue/task/retry-batch` - 批量重试任务

批量重试多个失败的任务，或重试所有失败的任务。

**请求体：**

```json
{
  "taskIds": [123, 124, 125], // 可选，指定任务ID列表
  "retryAll": false // 可选，是否重试所有失败任务
}
```

**注意：** `taskIds` 和 `retryAll` 必须提供其中一个。

**响应示例：**

```json
{
  "success": true,
  "message": "Successfully reset 2 failed tasks for retry",
  "retriedCount": 2,
  "skippedCount": 1,
  "retriedTasks": [
    {
      "id": 123,
      "type": "photo",
      "storageKey": "uploads/2024/photo1.jpg"
    },
    {
      "id": 124,
      "type": "live-photo-video",
      "storageKey": "uploads/2024/video.mov"
    }
  ],
  "skippedTasks": [
    {
      "id": 125,
      "status": "completed",
      "reason": "Task is not in failed status (current: completed)"
    }
  ]
}
```

### 4. DELETE `/api/queue/task/clear` - 清理非进行中任务

清理已完成和/或失败的任务，可选择性地按时间范围过滤。

**查询参数：**

- `includeCompleted` (可选): 是否包含已完成的任务，默认为 "true"
- `includeFailed` (可选): 是否包含失败的任务，默认为 "true"
- `olderThanDays` (可选): 只清理指定天数之前的任务

**响应示例：**

```json
{
  "success": true,
  "message": "Successfully cleared 45 non-active tasks",
  "deletedCount": 45,
  "breakdown": {
    "completed": 30,
    "failed": 15
  },
  "filter": {
    "olderThanDays": 7,
    "thresholdDate": "2024-09-25T10:00:00.000Z"
  }
}
```

## 安全性

所有API端点都需要用户会话验证（`requireUserSession`），确保只有已认证的用户才能访问。

## 错误处理

所有API都遵循统一的错误处理模式：

- 参数验证错误返回 400 状态码
- 资源不存在返回 404 状态码
- 服务器内部错误返回 500 状态码
- 错误响应包含 `statusMessage` 字段描述具体错误

## 使用场景

1. **任务监控**: 使用 `/task/list` 查看队列状态和任务进度
2. **故障恢复**: 使用 `/task/retry` 或 `/task/retry-batch` 重试失败的任务
3. **维护清理**: 使用 `/task/clear` 定期清理已完成的旧任务，保持队列整洁

这些API与现有的队列管理系统完全集成，遵循项目的架构设计原则和代码规范。
