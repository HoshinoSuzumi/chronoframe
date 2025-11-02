import { z } from 'zod'
import { settingsManager } from '~~/server/services/settings/settingsManager'
import { getSettingUIConfig } from '~~/server/services/settings/ui-config'
import type { SettingsFieldsResponse } from '~~/shared/types/settings'

/**
 * GET /api/system/settings/fields?namespace=app
 *
 * 获取指定命名空间的字段描述
 * 每个字段都包含当前值、默认值、UI 配置等完整信息
 * 前端可直接用来渲染表单
 *
 * @query namespace 设置命名空间（app, map, location, storage 等）
 * @returns SettingsFieldsResponse
 */
export default eventHandler(async (event) => {
  const query = await getValidatedQuery(
    event,
    z
      .object({
        namespace: z.string().min(1),
      })
      .parse,
  )

  const session = await requireUserSession(event)
  if (!session || !session.user.isAdmin) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Admin privileges required',
    })
  }

  try {
    // 获取该命名空间的所有设置
    const schema = await settingsManager.getSchema()
    const namespaceSettings = schema.filter(
      (s) => s.namespace === query.namespace,
    )

    if (namespaceSettings.length === 0) {
      throw createError({
        statusCode: 404,
        statusMessage: `Namespace ${query.namespace} not found`,
      })
    }

    // 为每个设置添加 UI 配置
    const fields = namespaceSettings.map((setting) => {
      const uiConfig = getSettingUIConfig(query.namespace, setting.key)
      return {
        ...setting,
        ui: uiConfig || {
          type: 'input' as const,
          required: false,
        },
      }
    })

    const response: SettingsFieldsResponse = {
      namespace: query.namespace,
      fields,
    }

    return response
  } catch (error) {
    if ((error as any).statusCode) {
      throw error
    }
    throw createError({
      statusCode: 500,
      statusMessage: (error as Error).message || 'Failed to fetch settings fields',
    })
  }
})
