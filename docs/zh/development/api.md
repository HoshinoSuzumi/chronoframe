# API 概览

API 与网页使用同一套会话认证。需要登录的请求携带登录后获得的 Cookie；后台设置和管理操作还会检查管理员权限。

下面列出常用入口，完整参数、响应和访问规则以 `server/api/` 的路由及其 Zod 校验为准。这不是一份固定版本的外部 API 合约。

| 方法 | 路径                                        | 用途                                     |
| ---- | ------------------------------------------- | ---------------------------------------- |
| POST | `/api/login`                                | 邮箱密码登录，设置会话 Cookie            |
| GET  | `/api/auth/github`                          | GitHub OAuth 登录回调                    |
| GET  | `/api/photos`                               | 登录用户读取照片列表                     |
| GET  | `/api/photos/visible`                       | 公开可见照片，排除隐藏和密码相册中的照片 |
| GET  | `/api/albums`                               | 读取可访问的相册                         |
| POST | `/api/albums/:albumId/unlock`               | 使用密码解锁相册                         |
| GET  | `/api/system/settings/fields?namespace=app` | 读取设置表单字段（管理员）               |
| PUT  | `/api/system/settings/batch`                | 批量保存设置（管理员）                   |
| GET  | `/api/queue/recent`                         | 后台最近任务                             |
| GET  | `/api/system/logs`                          | 后台日志                                 |

## 批量修改设置

管理员会话下向 `/api/system/settings/batch` 发送 PUT 请求：

```json
{
  "updates": [
    { "namespace": "app", "key": "title", "value": "My Gallery" },
    { "namespace": "app", "key": "slogan", "value": "Photos from my travels" }
  ]
}
```

新增设置或修改设置表单，请阅读[设置开发指南](/zh/development/how-to-add-setting)。照片读取需要遵守相册可见性和密码访问规则，不要将后台照片列表当作公开接口使用。
