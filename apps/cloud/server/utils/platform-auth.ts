import { createEmailCodeSignIn } from '../../../../packages/core/src/email-auth'
import { createD1EmailCodeStore } from '../../../../packages/platform/src/index'
import {
  platformDatabase,
  platformPortalOrigin,
} from '../../../platform.runtime'
import { createEmailCodeCrypto } from '../../../platform-crypto'
import type { H3Event } from 'h3'

export async function emailSignIn(event: H3Event) {
  const config = useRuntimeConfig(event).platform
  platformPortalOrigin(event, config.portalOrigin, true)
  if (
    config.emailProvider !== 'resend' ||
    !config.emailApiKey ||
    !config.emailFrom ||
    config.secret.length < 32
  ) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Email sign-in is not configured',
    })
  }
  return createEmailCodeSignIn(
    createD1EmailCodeStore(platformDatabase(event)),
    await createEmailCodeCrypto(config.secret),
    {
      async send({ email, code, expiresInMinutes }) {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.emailApiKey}`,
            'Content-Type': 'application/json',
          },
          signal: AbortSignal.timeout(10_000),
          body: JSON.stringify({
            from: config.emailFrom,
            to: [email],
            subject: 'Your ChronoFrame sign-in code',
            text: `Your ChronoFrame sign-in code is ${code}. It expires in ${expiresInMinutes} minutes. If you did not request this code, you can ignore this email.`,
          }),
        })
        if (!response.ok) throw new Error('Email delivery failed')
      },
    },
  )
}
