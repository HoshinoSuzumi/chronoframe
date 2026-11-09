import type { PlatformD1 } from '@chronoframe/platform'
import type { MailBinding } from '../../../../packages/platform/src/mail'
import { deliverTrialMail } from '../../../../packages/platform/src/trial-mail'
export default defineNitroPlugin((app) => {
  app.hooks.hook('cloudflare:scheduled', async ({ env }) => {
    const db = env.DB as PlatformD1 | undefined
    const binding = env.EMAIL as MailBinding | undefined
    if (db && typeof binding?.send !== 'function') {
      console.error('trial_mail_binding_unavailable')
      return
    }
    if (db)
      await deliverTrialMail(
        db,
        binding,
        String(
          env.NUXT_PLATFORM_PORTAL_ORIGIN || 'https://app.chronoframe.art',
        ),
      ).catch(() => console.error('trial_mail_delivery_failed'))
  })
})
