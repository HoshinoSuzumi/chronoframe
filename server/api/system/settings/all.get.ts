import { useDB, tables, eq } from '~~/server/utils/db'

/**
 * 获取所有公开设置
 * 仅返回 isPublic=true 的设置，按命名空间分组
 */
export default eventHandler(async () => {
  const db = useDB()
  
  // 查询所有公开设置
  const allSettings = db
    .select()
    .from(tables.settings)
    .where(eq(tables.settings.isPublic, true))
    .all()
  
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
