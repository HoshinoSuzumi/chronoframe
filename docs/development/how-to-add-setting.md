# 如何添加一个新的设置项

以在 `app` 命名空间中添加 `foo` 字段为例。

## 步骤 1：在 DEFAULT_SETTINGS 中添加字段定义

编辑 `server/services/settings/contants.ts`，在 `DEFAULT_SETTINGS` 中对应的命名空间部分添加：

```typescript
// NAMESPACE: app
{
  namespace: 'app',
  key: 'foo',
  type: 'string',
  defaultValue: 'bar',
  isPublic: true,
},
```

字段说明（必需）：

- `namespace`: 设置所属的命名空间 (app, map, location, storage, system 等)
- `key`: 字段的唯一键
- `type`: 类型 (string, number, boolean 等)
- `defaultValue`: 默认值

字段说明（可选）：

- `isPublic`: 是否公开
- `isReadonly`: 是否只读
- `isSecret`: 是否为机密字段（如密码）
- `enum`: 枚举值数组

> 💡 **注意**：不需要在 DEFAULT_SETTINGS 中添加 `label` 和 `description`。SettingField 组件会自动生成翻译键 `settings.${namespace}.${key}.label` 和 `settings.${namespace}.${key}.description`

## 步骤 2：添加 UI 配置

编辑 `server/services/settings/ui-config.ts`，在对应的 UI 配置对象中添加：

```typescript
export const APP_SETTINGS_UI: Record<string, FieldUIConfig> = {
  // ... 其他配置
  foo: {
    type: 'input', // 字段类型：input, password, url, textarea, select, radio, tabs, toggle, number
    placeholder: 'Enter foo value',
    help: 'settings.app.foo.help', // 翻译键，可选
    required: true, // 是否必需，可选
  },
}
```

## 步骤 3：添加翻译

编辑 `i18n/locales/` 中的翻译文件（例如 `en.json`）：

```json
{
  "settings": {
    "app": {
      "foo": {
        "label": "Foo",
        "description": "The foo setting",
        "help": "This is the help text for foo"
      }
    }
  }
}
```

## 步骤 4：在页面中使用

编辑 `app/pages/dashboard/settings/general.vue`，直接在模板中使用：

```vue
<template>
  <UDashboardPanel>
    <!-- ... -->
    <UForm class="space-y-4">
      <SettingField
        v-for="field in fields"
        :key="field.key"
        :field="field"
        :model-value="state[field.key]"
        @update:model-value="(val) => (state[field.key] = val)"
      />
    </UForm>
  </UDashboardPanel>
</template>
```

✅ 完成！`foo` 字段会自动被 `useSettingsForm('app')` 获取并渲染。

## 条件字段示例

如果需要根据其他字段来显示/隐藏某个字段，在 UI 配置中添加 `visibleIf`：

```typescript
foo: {
  type: 'input',
  placeholder: 'Only show when bar = "baz"',
  visibleIf: { fieldKey: 'bar', value: 'baz' },
}
```

## 其他命名空间

- `map`：地图相关设置
- `location`：位置相关设置
- `storage`：存储相关设置
- `system`：系统设置

流程相同，只需修改对应的 UI 配置对象（`MAP_SETTINGS_UI`、`LOCATION_SETTINGS_UI` 等）。
