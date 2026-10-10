# Adding a Setting

Settings live in the database and are described by `DEFAULT_SETTINGS` in `server/services/settings/contants.ts`. Dashboard forms combine these definitions with UI configuration and translations.

## Define the setting

Add a definition under the appropriate namespace:

```typescript
{
  namespace: 'app',
  key: 'foo',
  type: 'string',
  defaultValue: 'bar',
  isPublic: true,
},
```

Use `isPublic` only for values visitors may read. Use `isSecret` for credentials and `isReadonly` for values that normal setting updates must not change. An `enum` limits available string values.

## Describe the form field

In `server/services/settings/ui-config.ts`, add the field to the namespace's UI configuration:

```typescript
export const APP_SETTINGS_UI: Record<string, FieldUIConfig> = {
  foo: {
    type: 'input',
    help: 'settings.app.foo.help',
    required: true,
  },
}
```

Field types include input, password, URL, textarea, select, radio, tabs, toggle and number. Use `visibleIf: { fieldKey: 'bar', value: 'baz' }` when a field depends on another field's value.

## Add translations and use the field

Add `settings.app.foo.label`, `settings.app.foo.description` and any help text to the locale files under `i18n/locales/`.

Existing forms use `useSettingsForm('app')` and render their descriptors through `SettingField`. For another namespace, use its corresponding UI configuration and form namespace. Server code reads and writes values through `settingsManager`.

Check that the field renders, saves and survives a restart. If it is private or secret, also check that it is absent from public settings responses. Database-backed settings do not normally require a new environment variable.
