import { createEmailCodeSignIn } from '../../../../packages/core/src/email-auth'
import { createD1EmailCodeStore } from '../../../../packages/platform/src/index'
import {
  platformDatabase,
  platformPortalOrigin,
} from '../../../platform.runtime'
import { createEmailCodeCrypto } from '../../../platform-crypto'
import type { H3Event } from 'h3'
import {
  createCloudflareEmailSender,
  platformEmailReady,
} from '../../../platform-email'

export async function emailSignIn(event: H3Event) {
  const config = useRuntimeConfig(event).platform
  platformPortalOrigin(event, config.portalOrigin, true)
  const emailBinding = event.context.cloudflare?.env?.EMAIL
  if (
    !platformEmailReady(emailBinding, config.emailFrom) ||
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
    createCloudflareEmailSender(emailBinding, config.emailFrom),
  )
}
