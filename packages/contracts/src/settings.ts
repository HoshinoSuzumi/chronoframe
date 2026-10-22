import type { StorageConfig } from './storage.ts'
import type { SocialLinkErrorCode } from './social-links.ts'

export type SettingType = 'string' | 'number' | 'boolean' | 'json'
export type SettingValue =
  | string
  | number
  | boolean
  | Record<string, any>
  | null

export interface SettingConfig {
  namespace?: string
  key: string
  type: SettingType
  value?: SettingValue
  defaultValue: SettingValue
  label?: string | null
  description?: string | null
  isPublic?: boolean
  isReadonly?: boolean
  isSecret?: boolean
  enum?: ReadonlyArray<string>
  hidden?: boolean
}

/** Authenticated management response; not public site configuration. */
export interface SettingStorageProvider {
  id: number
  name: string
  provider: StorageConfig['provider']
  config: StorageConfig
  createdAt: string
  updatedAt: string
}

export interface StorageProviderInput {
  name: string
  provider: StorageConfig['provider']
  config: StorageConfig
}

/**
 * UI 字段类型枚举
 * 定义在 shared 中以便前端使用
 */
export type FieldUIType =
  | 'input' // 文本输入
  | 'password' // 密码输入
  | 'url' // URL 输入
  | 'textarea' // 文本域
  | 'select' // 下拉选择
  | 'radio' // 单选按钮
  | 'tabs' // 标签页选择
  | 'toggle' // 开关
  | 'number' // 数字输入
  | 'avatar' // 头像上传/外链
  | 'custom' // 自定义组件

/**
 * 字段 UI 配置
 * 定义前端如何展示和交互一个设置字段
 */
export interface FieldUIConfig {
  // 基础 UI 类型
  type: FieldUIType

  // 输入相关
  placeholder?: string
  help?: string

  // 条件展示 - 根据其他字段的值来决定是否显示这个字段
  visibleIf?: {
    fieldKey: string
    value: SettingValue
  }

  // 可选项（用于 select/radio/tabs）
  options?: ReadonlyArray<{
    label: string
    value: SettingValue
    icon?: string
    description?: string
  }>

  // 验证规则（前端 UX 提示）
  required?: boolean
  minLength?: number
  maxLength?: number
  min?: number // 最小值（用于 number 类型）
  max?: number // 最大值（用于 number 类型）
  pattern?: string // 正则表达式

  // 样式和尺寸
  size?: 'sm' | 'md' | 'lg'
  variant?: 'soft' | 'outline'
  icon?: string

  // 行数（仅用于 textarea 类型，可选）
  // SettingField.vue 默认值为 3
  rows?: number
}

/**
 * 完整的字段描述符
 * 包含后端配置和前端 UI 信息
 * 由 API 返回给前端，前端可直接渲染
 */
export interface FieldDescriptor extends SettingConfig {
  ui: FieldUIConfig
}

/**
 * Settings 字段获取响应
 */
export interface SettingsFieldsResponse {
  namespace: string
  fields: FieldDescriptor[]
}

export interface SettingsBatchFieldError {
  namespace: string
  key: string
  error: string
  code?: SocialLinkErrorCode
}

export type SettingsBatchResponse =
  | { success: true; updated: number }
  | { success: false; updated: number; errors: SettingsBatchFieldError[] }

/**
 * Settings 批量更新请求
 */
export interface SettingsBatchUpdateRequest {
  updates: Array<{
    namespace: string
    key: string
    value: SettingValue
  }>
}

/** Public, serialized site settings; secret fields are excluded by the server. */
export interface PublicSettingsResponse {
  timestamp: number
  data: Record<string, Record<string, SettingValue>>
}
