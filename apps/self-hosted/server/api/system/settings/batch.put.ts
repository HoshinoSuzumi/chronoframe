import { z } from 'zod'
import {
  getHiddenSettingKeys,
  settingKeys,
  settingNamespaces,
} from '~~/server/services/settings/contants'
import { settingsManager } from '~~/server/services/settings/settingsManager'
import { useDB, tables, eq } from '~~/server/utils/db'
import { applySettingsBatch } from '~~/server/utils/settings-batch-error'

/**
 * PUT /api/system/settings/batch
 *
 * 批量更新设置
 * 避免逐个更新产生多个 HTTP 请求
 *
 * @body {updates} 要更新的设置数组
 * @returns {success, updated} 成功标志和更新数量
 *
 * @example
 * PUT /api/system/settings/batch
 * {
 *   updates: [
 *     { namespace: 'app', key: 'title', value: 'ChronoFrame' },
 *     { namespace: 'app', key: 'slogan', value: 'A photo gallery' },
 *   ]
 * }
 */
export default eventHandler(async (event) => {
  const session = await requireUserSession(event)
  if (!session || !session.user.isAdmin) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Admin privileges required',
    })
  }

  const body = await readValidatedBody(
    event,
    z.object({
      updates: z.array(
        z.object({
          namespace: z.enum([...settingNamespaces]),
          key: z.enum([...settingKeys]),
          value: z.any(),
        }),
      ),
    }).parse,
  )

  try {
    // 获取当前用户ID，如果用户不存在于数据库则返回null
    const db = useDB()
    const currentUser = session.user.id
      ? db
          .select()
          .from(tables.users)
          .where(eq(tables.users.id, session.user.id))
          .get()
      : null
    const updatedBy = currentUser ? currentUser.id : undefined

    return applySettingsBatch(body.updates, {
      isHidden: (update) =>
        getHiddenSettingKeys(update.namespace).has(update.key),
      set: (update) =>
        settingsManager.set(
          update.namespace,
          update.key,
          update.value,
          updatedBy,
        ),
    })
  } catch (error) {
    throw createError({
      statusCode: 400,
      statusMessage: (error as Error).message || 'Failed to update settings',
    })
  }
})
