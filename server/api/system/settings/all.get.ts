import { useDB, tables, eq, or, and } from '~~/server/utils/db'
import { getAll } from '~~/server/utils/db-query'
import { readBootstrapDbConfigSync } from '~~/server/utils/db-bootstrap'
import { existsSync } from 'node:fs'

/**
 * 获取所有公开设置
 * 仅返回 isPublic=true 的设置，按命名空间分组
 * 特例：始终返回 system:firstLaunch 以便前端判断是否需要初始化
 */
export default eventHandler(async () => {
  const hasDbBootstrapConfig = !!readBootstrapDbConfigSync()
  const hasLegacySqliteFile = existsSync('data/app.sqlite3')
  if (!hasDbBootstrapConfig && !hasLegacySqliteFile) {
    return {
      timestamp: Date.now(),
      data: {
        system: {
          firstLaunch: true,
        },
      },
    }
  }

  const db = useDB()

  // 查询所有公开设置
  const allSettings = await getAll(
    db
      .select()
      .from(tables.settings)
      .where(
        or(
          eq(tables.settings.isPublic, true),
          and(
            eq(tables.settings.namespace, 'system'),
            eq(tables.settings.key, 'firstLaunch'),
          ),
        ),
      ),
  )

  // 按命名空间分组
  const grouped: Record<string, Record<string, any>> = {}

  for (const setting of allSettings) {
    if (!grouped[setting.namespace]) {
      grouped[setting.namespace] = {}
    }

    // 解析值
    let value: any = setting.value
    try {
      if (setting.type === 'json') {
        value = setting.value ? JSON.parse(setting.value) : null
      } else if (setting.type === 'number') {
        value = setting.value ? Number(setting.value) : null
      } else if (setting.type === 'boolean') {
        value = setting.value === 'true' || setting.value === '1'
      }
    } catch {
      // 保持原始值
    }

    grouped[setting.namespace][setting.key] = value
  }

  return {
    timestamp: Date.now(),
    data: grouped,
  }
})
