import type { PlatformD1 } from '@chronoframe/platform'
import type { MailBinding } from '../../../../packages/platform/src/mail'
import { deliverTrialMail } from '../../../../packages/platform/src/trial-mail'
export default defineNitroPlugin((app) => {
  app.hooks.hook('cloudflare:scheduled', async ({ env }) => {
    const db = env.DB as PlatformD1 | undefined
    if (db)
      await deliverTrialMail(
        db,
        env.EMAIL as MailBinding,
        String(
          env.NUXT_PLATFORM_PORTAL_ORIGIN || 'https://app.chronoframe.art',
        ),
      ).catch(() => console.error('trial_mail_delivery_failed'))
  })
})
