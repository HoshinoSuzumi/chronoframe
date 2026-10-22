import { definePlatformHandler } from '../../../../../platform.runtime'
import { emailSignIn } from '../../../utils/platform-auth'
import { createD1Sessions } from '../../../../../../packages/platform/src/index'
import { createEmailCodeCrypto } from '../../../../../platform-crypto'
import {
  PLATFORM_COOKIE,
  platformDatabase,
} from '../../../../../platform.runtime'
export default definePlatformHandler(async (event) => {
  const body = await readBody(event)
  if (
    !body ||
    typeof body.email !== 'string' ||
    typeof body.challengeId !== 'string' ||
    typeof body.code !== 'string'
  ) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Email and code required',
    })
  }
  const result = await (
    await emailSignIn(event)
  ).verify(body.email, body.challengeId, body.code)
  const crypto = await createEmailCodeCrypto(
    useRuntimeConfig(event).platform.secret,
  )
  const token = crypto.randomId()
  const now = Date.now()
  const maxAge = 7 * 24 * 60 * 60
  await createD1Sessions(platformDatabase(event)).create(
    result.verifiedEmail,
    await crypto.mac(['platform-session', token]),
    now,
    now + maxAge * 1000,
  )
  setCookie(event, PLATFORM_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge,
  })
  return { authenticated: true }
})
