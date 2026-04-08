# 升级指南

本文档将指导您如何安全地更新和升级 ChronoFrame 到最新版本。

## 版本检查

### 查看当前版本

#### 通过 Web 界面

1. 登录 ChronoFrame 管理后台
2. 进入「仪表板」页面
3. 查看「运行信息」面板中的版本号

## 更新流程

### 准备工作

#### 1. 数据备份

```bash
# 停止服务
docker-compose down

# 创建完整备份
ts=$(date +%Y%m%d-%H%M%S) && mkdir -p backups/$ts && cp -r data/ .env docker-compose.yml backups/$ts/
```

#### 2. 检查兼容性

查看 [发布说明](https://github.com/HoshinoSuzumi/chronoframe/releases) 了解：

- 破坏性变更
- 新增环境变量
- 功能弃用通知

### Docker Compose 更新（推荐）

#### 标准更新流程

```bash
# 1. 进入项目目录
cd /path/to/chronoframe

# 2. 备份当前配置
cp docker-compose.yml docker-compose.yml.backup

# 3. 停止当前服务
docker-compose down

# 4. 拉取最新镜像
docker-compose pull

# 5. 启动新版本
docker-compose up -d

# 6. 查看启动日志
docker-compose logs -f chronoframe
```

#### 指定版本更新

如果需要更新到特定版本：

```yaml
# docker-compose.yml
services:
  chronoframe:
    image: ghcr.io/hoshinosuzumi/chronoframe:v1.2.3 # 指定版本
    # ... 其他配置
```

```bash
docker-compose up -d
```

### 单容器更新

```bash
# 停止现有容器
docker stop chronoframe
docker rm chronoframe

# 拉取最新镜像
docker pull ghcr.io/hoshinosuzumi/chronoframe:latest

# 使用相同配置启动新容器
docker run -d \
  --name chronoframe \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  --env-file .env \
  ghcr.io/hoshinosuzumi/chronoframe:latest
```

## 数据库迁移

### 自动迁移

ChronoFrame 在启动时会自动执行数据库迁移：

```bash
# 查看迁移日志
docker logs chronoframe | grep -i migration
```

### 手动迁移（高级）

在特殊情况下，您可能需要手动执行迁移：

```bash
# 进入容器
docker exec -it chronoframe sh

# 执行迁移
npx drizzle-kit migrate
```
