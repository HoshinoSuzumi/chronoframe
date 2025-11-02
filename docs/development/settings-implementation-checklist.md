# Settings 系统改进 - 实施清单

## 阶段 1: 基础设施建设（已完成 ✅）

### 1.1 类型定义
- [x] 扩展 `shared/types/settings.ts`
  - [x] 添加 `FieldUIType` 类型
  - [x] 添加 `FieldUIConfig` 接口
  - [x] 添加 `FieldDescriptor` 接口
  - [x] 添加 `SettingsFieldsResponse` 接口
  - [x] 添加 `SettingsBatchUpdateRequest` 接口

### 1.2 Composable
- [x] 创建 `app/composables/useSettingsForm.ts`
  - [x] 实现 `fetchFields()` - 获取字段描述
  - [x] 实现 `submit()` - 批量更新设置
  - [x] 实现 `reset()` - 重置表单
  - [x] 实现 `updateField()` - 更新单个字段
  - [x] 实现状态管理和加载状态
  - [x] 自动挂载时获取字段

### 1.3 组件
- [x] 创建 `app/components/setting/SettingSection.vue`
  - [x] 包装 UCard + 表单 + 提交按钮
  - [x] 处理状态同步
  - [x] 显示加载状态
  - [x] 处理表单提交事件

- [x] 创建 `app/components/setting/SettingField.vue`
  - [x] 根据 UI 类型动态选择组件
  - [x] 处理 input/password/url/textarea
  - [x] 处理 select/radio/tabs
  - [x] 处理 toggle/number
  - [x] 正确传递 props 到不同组件
  - [x] 使用 `resolveComponent()` 正确渲染 Nuxt UI 组件
  - [x] 修复输入控件显示问题

### 1.4 Server 配置
- [x] 创建 `server/services/settings/ui-config.ts`
  - [x] 定义 `APP_SETTINGS_UI`
  - [x] 定义 `MAP_SETTINGS_UI`
  - [x] 定义 `LOCATION_SETTINGS_UI`
  - [x] 定义 `STORAGE_SETTINGS_UI`
  - [x] 实现 `getSettingUIConfig()` 函数
  - [x] 包含条件字段配置（visibleIf）

### 1.5 API 端点
- [x] 创建 `server/api/system/settings/fields.get.ts`
  - [x] 获取指定命名空间的字段
  - [x] 返回完整的 FieldDescriptor
  - [x] 包含当前值和默认值
  - [x] 包含 UI 配置
  - [x] 权限验证

- [x] 创建 `server/api/system/settings/batch.put.ts`
  - [x] 支持批量更新
  - [x] 部分失败处理
  - [x] 返回成功数量和错误列表
  - [x] 权限验证

## 阶段 2: 文档完成（已完成 ✅）

- [x] 创建 `docs/development/settings-refactor-audit.md`
  - [x] 现状分析
  - [x] 问题识别
  - [x] 改进方案设计
  - [x] 收益总结

- [x] 创建 `docs/development/settings-migration-guide.md`
  - [x] API 文档
  - [x] 组件使用指南
  - [x] 迁移示例（general.vue）
  - [x] 条件字段处理
  - [x] 扩展指南

- [x] 创建 `docs/development/settings-improvement-comparison.md`
  - [x] 代码行数对比
  - [x] 具体代码对比（4 个阶段）
  - [x] 条件字段处理对比
  - [x] 存储配置冗余问题
  - [x] 性能对比分析
  - [x] 可维护性对比

## 阶段 3: 页面迁移（已完成 ✅）

### 已完成的迁移总结
- [x] **general.vue**: 150 行 → 66 行（56% 减少）
- [x] **map.vue**: 200 行 → 58 行（71% 减少）  
- [x] **storage.vue**: 保持不变（538 行，独立系统）

**总体成果：**
- 迁移的代码行数：350 → 124（65% 减少）
- 迁移的 API 请求总数：6 → 2（67% 减少）
- 类型定义：集中在 ui-config.ts（单一来源）
- 条件字段：由 visibleIf 声明式管理（不再需要手动 v-if）
- 页面架构：标准设置页面已完全迁移到新系统
**难度：** ⭐ 最简单 - 无特殊逻辑

- [x] 删除 schema/constants 获取逻辑
- [x] 删除 Zod schema 定义
- [x] 删除 reactive state 初始化
- [x] 删除 watch 监听逻辑
- [x] 替换为 `useSettingsForm('app')`
- [x] 用 `<SettingField />` 替换 UFormField + UInput
- [x] 删除 `onAppSettingsSubmit` 函数
- [x] 删除 `onAppearanceSettingsSubmit` 函数
- [x] 简化模板代码
- [x] 修复类型兼容性（readonly 数组）
- [x] 修复 composable 中的类型定义

**完成情况：**
- 代码行数：150 → 66（56% 减少）  
- API 请求：从多次变为 2 次（初始加载 + 批量提交）
- 提交请求：从 4 次变为 1 次

**验收标准：** ✅ 已通过
- [x] 通用设置能正常保存
- [x] 外观主题设置能正常保存
- [x] 加载和保存状态显示正确
- [x] 错误提示正常显示
- [x] TypeScript 类型检查通过

### 3.2 map.vue - 地图和位置 ✅
**难度：** ⭐⭐ 中等 - 有条件字段

- [x] 删除复杂的 provider 检测逻辑
- [x] 删除 computed schema 和默认值提取
- [x] 删除条件渲染逻辑（两个 namespace）
- [x] 替换为 `useSettingsForm('map')` 和 `useSettingsForm('location')`
- [x] 用 computed 过滤 visibleFields（基于 provider 的 visibleIf 条件）
- [x] 用 `<SettingField />` 替换所有手工字段
- [x] 简化 API 调用

**完成情况：**
- 代码行数：200 → 58（71% 减少）
- API 请求：从 4 次变为 2 次（初始加载）
- 提交请求：从 5 次变为 2 次（每个 namespace 一个批量请求）

**验收标准：** ✅ 已通过
- [x] 地图 Provider 切换时字段正确显示/隐藏
- [x] Mapbox 配置能正常保存
- [x] MapLibre 配置能正常保存
- [x] 位置设置能正常保存
- [x] TypeScript 类型检查通过

### 3.3 storage.vue - 存储配置 ⏭️
**难度：** ⭐⭐⭐ 最复杂 - 多个 Provider + 配置管理

**实施策略：** 保持原样 - 不迁移

**原因：**
1. 这个页面并不使用新的 SettingField 组件系统
2. 存储方案选择是独立的 API（不在 settings namespace 中）
3. 存储配置管理需要复杂的 AutoForm + Zod schema 验证
4. 这部分代码已经足够简洁和清晰

**现状：**
- 代码行数：538 行（保持不变）
- 使用 AutoForm + Zod schema 进行存储配置表单
- 核心功能完整（创建、删除、选择存储方案）
- TypeScript 类型检查：✅ 无错误

**验收标准：** ✅ 已通过
- [x] 存储提供商能正确列表显示
- [x] 能创建新的存储配置
- [x] 能删除存储配置
- [x] 能切换活跃存储提供商
- [x] TypeScript 类型检查通过

## 阶段 4: 清理和优化（待实施）

- [ ] 删除旧的 API 端点（保留向后兼容性）
  - [ ] 可选：添加 deprecation 警告

- [ ] 更新相关页面的 import
  - [ ] 删除不再需要的 useFetch 调用
  - [ ] 删除不再需要的 Zod 导入

- [ ] 更新类型导出
  - [ ] 确保 FieldDescriptor 类型正确导出
  - [ ] 确保 UI 配置在需要的地方可用

- [ ] 优化 UI 配置
  - [ ] 为更多字段补充完整的 UI 配置
  - [ ] 添加更多条件字段支持
  - [ ] 支持字段分组显示

## 阶段 5: 高级特性（可选）

- [ ] 字段依赖关系处理
  - [ ] 当 field A 变化时，更新 field B 的选项
  - [ ] 示例：Provider 变化后，重置对应的配置

- [ ] 复杂验证规则的前端展示
  - [ ] 在字段之间添加验证规则指示
  - [ ] 显示验证错误提示

- [ ] 字段分组显示
  - [ ] 支持多个 Section 的字段组织
  - [ ] 支持折叠/展开分组

- [ ] 自定义字段组件
  - [ ] 创建 StorageProviderSelector 组件
  - [ ] 创建 MapProviderSelector 组件
  - [ ] 创建其他特殊字段组件

- [ ] 本地化支持改进
  - [ ] 支持更复杂的翻译键模式
  - [ ] 支持条件翻译

## 验收测试清单

### 功能测试
- [ ] 通用设置页面能正常加载
- [ ] 地图设置页面能正常加载
- [ ] 存储设置页面能正常加载
- [ ] 所有设置能正常保存
- [ ] 错误提示能正常显示
- [ ] 加载状态能正常显示
- [ ] 条件字段显示/隐藏正确

### 性能测试
- [ ] 初始加载时间 < 200ms
- [ ] 保存操作时间 < 100ms
- [ ] 网络请求数量符合预期
- [ ] 页面文件大小符合预期

### 兼容性测试
- [ ] Chrome/Firefox/Safari 正常显示
- [ ] 移动设备正常显示
- [ ] 暗色模式正常显示
- [ ] 国际化正常显示

### 边界情况
- [ ] 网络错误时提示正确
- [ ] 权限不足时提示正确
- [ ] 字段验证失败时提示正确
- [ ] 并发更新正确处理

## 时间估算

| 阶段 | 任务 | 估计时间 | 实际时间 |
|------|------|---------|---------|
| 1 | 基础设施建设 | ~4 小时 | ✅ 完成 |
| 2 | 文档完成 | ~3 小时 | ✅ 完成 |
| 3.1 | general.vue 迁移 | ~1 小时 | ✅ 完成 |
| 3.2 | map.vue 迁移 | ~1.5 小时 | ✅ 完成 |
| 3.3 | storage.vue 评估 | ~0.5 小时 | ✅ 完成 |
| 4 | 清理优化 | ~1 小时 | 待实施 |
| 5 | 高级特性 | ~4 小时 | 可选 |
| **总计** | | ~14.5 小时 | **~9.5 小时已用** |

## 风险和缓解措施

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| API 变更影响既有代码 | 中 | 保留旧 API，逐步迁移 |
| 前端组件不适配某些字段类型 | 中 | 在高级特性阶段添加自定义支持 |
| UI 配置遗漏某些字段 | 低 | 逐步补充，有默认值保底 |
| 条件字段复杂情况 | 低 | 文档中有详细示例 |

## 提交和审查

- [ ] 提交 PR 包含：
  - [ ] 基础设施代码（Composable、组件、API）
  - [ ] 文档（审计、迁移指南、对比）
  - [ ] 单元测试（可选）

- [ ] 代码审查关注点：
  - [ ] Composable 逻辑正确性
  - [ ] 组件 Props/Events 清晰
  - [ ] API 安全性和错误处理
  - [ ] 文档完整性

- [ ] 测试审查关注点：
  - [ ] 功能完整性
  - [ ] 性能符合预期
  - [ ] 边界情况处理

## 后续维护

- [ ] 定期检查 UI 配置是否完整
- [ ] 收集用户反馈关于新 Settings UI
- [ ] 根据需要扩展条件字段支持
- [ ] 优化性能和加载时间
- [ ] 文档更新（如添加新设置）
