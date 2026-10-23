import assert from 'node:assert/strict'
import test from 'node:test'
import { reactive, readonly, ref } from 'vue'
import {
  MAX_SOCIAL_LINKS,
  SocialLinkError,
} from '@chronoframe/contracts/social-links'
import {
  applySettingsBatch,
  toSettingsBatchError,
} from '../apps/self-hosted/server/utils/settings-batch-error.ts'
import { useSettingsForm } from '../packages/console/app/composables/useSettingsForm.ts'

test('batch errors preserve social validation codes without coding unrelated failures', () => {
  assert.deepEqual(
    toSettingsBatchError(
      'app',
      'socialLinks',
      new SocialLinkError(
        'limit',
        `Use at most ${MAX_SOCIAL_LINKS} social links`,
      ),
    ),
    {
      namespace: 'app',
      key: 'socialLinks',
      error: `Use at most ${MAX_SOCIAL_LINKS} social links`,
      code: 'limit',
    },
  )
  assert.deepEqual(
    toSettingsBatchError('app', 'title', new Error('Write failed')),
    { namespace: 'app', key: 'title', error: 'Write failed' },
  )
})

test('batch response retains a social error code alongside successful updates', async () => {
  const result = await applySettingsBatch(
    [
      { namespace: 'app', key: 'title', value: 'Saved name' },
      { namespace: 'app', key: 'socialLinks', value: { links: [] } },
    ],
    {
      isHidden: () => false,
      set: async (update) => {
        if (update.key === 'socialLinks') {
          throw new SocialLinkError('duplicate', 'Duplicate social link')
        }
      },
    },
  )

  assert.deepEqual(result, {
    success: false,
    updated: 1,
    errors: [
      {
        namespace: 'app',
        key: 'socialLinks',
        error: 'Duplicate social link',
        code: 'duplicate',
      },
    ],
  })
})

test('social validation errors from batch save use localized inline and toast messages', async () => {
  const globals = globalThis as unknown as Record<string, unknown>
  const toasts: Array<{ description?: string }> = []
  let errorCode = 'limit'
  const overrides = {
    ref,
    reactive,
    readonly,
    onMounted: () => {},
    useConsoleApi: () => async (path: string) =>
      path.endsWith('/fields')
        ? { fields: [] }
        : {
            success: false,
            updated: 0,
            errors: [
              {
                namespace: 'app',
                key: 'socialLinks',
                error: `Use at most ${MAX_SOCIAL_LINKS} social links`,
                code: errorCode,
              },
            ],
          },
    useI18n: () => ({
      t: (key: string, values?: { max?: number }) =>
        key === 'settings.app.socialLinks.limit'
          ? `Add no more than ${values?.max} links`
          : key === 'settings.form.saveFailed'
            ? 'Could not save settings'
            : key,
    }),
    useToast: () => ({
      add: (toast: { description?: string }) => toasts.push(toast),
    }),
    refreshSettings: async () => {},
  }
  const previous = Object.fromEntries(
    Object.keys(overrides).map((key) => [key, globals[key]]),
  )
  Object.assign(globals, overrides)
  try {
    const form = useSettingsForm('app')
    await assert.rejects(
      form.submit({ socialLinks: { links: [] } }),
      (error: unknown) =>
        error instanceof SocialLinkError &&
        error.code === 'limit' &&
        error.message === `Add no more than ${MAX_SOCIAL_LINKS} links`,
    )
    assert.equal(
      toasts.at(-1)?.description,
      `Add no more than ${MAX_SOCIAL_LINKS} links`,
    )

    errorCode = 'new-server-code'
    await assert.rejects(form.submit({ socialLinks: { links: [] } }), {
      message: 'Could not save settings',
    })
    assert.equal(toasts.at(-1)?.description, 'Could not save settings')
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globals[key]
      else globals[key] = value
    }
  }
})
